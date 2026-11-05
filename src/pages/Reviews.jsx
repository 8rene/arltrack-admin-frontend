import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../fireabase";

const API_URL = process.env.REACT_APP_API_URL;

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// Reviews — live customer star-ratings/comments, grouped by vehicle.
// Mirrors Inventory.jsx's fetching strategy, not just its layout: cars are
// fetched directly from Firestore up front (so every car shows as a card,
// even ones with zero reviews so far), and a car's reviews are only loaded
// from the backend once that car is selected — avoids reading the whole
// reviews/user collections on every page load the way a single grouped
// endpoint would.
//
// Each review links to its booking via the same `?open=<bookingID>` deep
// link Header.jsx's notifications already use to jump into Bookings.jsx
// and auto-open that booking's detail modal — so "View booking" here
// behaves exactly like clicking a booking notification does elsewhere.
//
// Deleting a review here archives it first (reviewsArchives collection) via
// the backend, same pattern as every other delete in this app — nothing is
// hard-deleted. Restoring a mistakenly-removed review is done from the
// existing Reviews Archive page (/archives/reviews), not from here.

function StarRating({ value }) {
  return (
    <span className="text-amber-400 text-sm leading-none" aria-label={`${value} out of 5 stars`}>
      {"★".repeat(value)}
      <span className="text-gray-200">{"★".repeat(Math.max(0, 5 - value))}</span>
    </span>
  );
}

const PAGE_SIZE = 10;

// One-line preview of a comment for the table: cut at a whole word and end with "…" (the full text is in the View window).
function previewComment(text, max = 50) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 15 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!?-]+$/, "") + "…";
}

// Date and time as separate pieces, like the Bookings table ("Oct 26, 2026 | 12:39 PM").
const toDateObj = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d.getTime()) ? null : d; };
const fmtDate = (iso) => { const d = toDateObj(iso); return d ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"; };
const fmtTime = (iso) => { const d = toDateObj(iso); return d ? d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "—"; };
function DateTime({ value }) {
  if (!toDateObj(value)) return <span className="text-gray-300">—</span>;
  return (
    <>
      <span className="text-gray-700">{fmtDate(value)}</span>
      <span className="mx-1.5 text-gray-300">|</span>
      <span className="text-gray-500">{fmtTime(value)}</span>
    </>
  );
}

// Same as Bookings.jsx.
function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);   // clamp if the list shrinks
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { page: safePage, setPage, totalPages, pageItems, start, count: items.length };
}

function Pagination({ page, totalPages, onChange, start, pageSize, count }) {
  if (count === 0) return null;
  const nums = [1];
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) nums.push(n);
  if (totalPages > 1) nums.push(totalPages);
  const dedup = [...new Set(nums)].sort((a, b) => a - b);
  const rangeEnd = Math.min(start + pageSize, count);
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50/50">
      <p className="text-xs text-gray-400">Showing {start + 1}–{rangeEnd} of {count}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Prev
        </button>
        {dedup.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - dedup[i - 1] > 1 && <span className="px-1.5 text-gray-300 text-xs">…</span>}
            <button onClick={() => onChange(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${n === page ? "bg-teal-600 text-white shadow" : "border text-gray-600 hover:bg-white"}`}>
              {n}
            </button>
          </span>
        ))}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Next
        </button>
      </div>
    </div>
  );
}

// Sortable header: same look as Bookings.jsx.
const IconChevronsUpDown = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconSortArrow = ({ dir }) => (
  <svg className={`w-3.5 h-3.5 transition-transform ${dir === "desc" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
function SortableTh({ label, sortKey, activeKey, dir, onSort, className = "" }) {
  const active = activeKey === sortKey;
  return (
    <th className={`px-4 py-3 text-left select-none ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={dir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

// Card + label-over-value cell, same look as the Bookings view window.
function InfoSection({ title, aside, children, cols = 2 }) {
  return (
    <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
        {aside}
      </div>
      <div className={`p-4 grid ${cols === 3 ? "grid-cols-3" : "grid-cols-2"} gap-x-6 gap-y-4`}>{children}</div>
    </section>
  );
}
function InfoField({ label, value, wide }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className="text-sm font-medium text-gray-800 mt-0.5 break-words">{value || "—"}</div>
    </div>
  );
}

// "View" window: the full comment and the actions, kept out of the table so the rows stay light.
function ReviewModal({ review, onClose, onViewBooking, onDelete, deleting }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-gray-800">Review</h2>

        <InfoSection
          title="Review Information"
          aside={review.bookingID ? (
            <button
              type="button"
              onClick={onViewBooking}
              title="Open this booking on the Bookings page"
              className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg px-2.5 py-1 transition-colors"
            >
              View booking →
            </button>
          ) : null}
        >
          <InfoField label="Reviewer" value={review.reviewerName} />
          <InfoField
            label="Rating"
            value={<span className="inline-flex items-center gap-2"><StarRating value={review.rating} /><span className="text-gray-500 font-normal">{review.rating} / 5</span></span>}
          />
          <InfoField wide label="Posted" value={<DateTime value={review.createdAt} />} />
        </InfoSection>

        <InfoSection title="Comment">
          <div className="col-span-2 min-w-0 text-sm break-words whitespace-pre-wrap">
            {review.comment
              ? <span className="text-gray-700">{review.comment}</span>
              : <span className="text-gray-400 italic">No comment left.</span>}
          </div>
        </InfoSection>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Close</button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-red-600 border border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Reviews() {
  const navigate = useNavigate();

  const [cars, setCars]               = useState([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState(null);
  const [reviewCounts, setReviewCounts] = useState({}); // { carID: count } — badge on each card, fetched via count() aggregation so it doesn't pull full review content

  const [reviews, setReviews]         = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const [deletingID, setDeletingID]   = useState(null);
  const [toast, setToast]             = useState(null);
  const [sortKey, setSortKey]         = useState("date");
  const [sortDir, setSortDir]         = useState("desc");   // newest first, like the API returns
  const [viewReview, setViewReview]   = useState(null);     // review whose "View" window is open

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const token = localStorage.getItem("token");
  const authedFetch = useCallback((path, options = {}) => {
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  }, [token]);

  // Fetch every car up front — same read Inventory.jsx does — so all
  // vehicles show as cards regardless of whether they have reviews yet.
  useEffect(() => {
    setCarsLoading(true);
    Promise.all([
      getDocs(collection(db, "cars")),
      getDocs(collection(db, "brand")),
      getDocs(collection(db, "model")),
      getDocs(collection(db, "carImages")),
    ])
      .then(([carsSnap, brandsSnap, modelsSnap, imgsSnap]) => {
        const bMap = Object.fromEntries(brandsSnap.docs.map(d => [d.id, d.data()]));
        const mMap = Object.fromEntries(modelsSnap.docs.map(d => [d.id, d.data()]));
        const iMap = {};
        imgsSnap.docs.forEach(d => {
          if (d.data().carID) iMap[d.data().carID] = d.data().imageURL;
        });
        setCars(
          carsSnap.docs.map(d => {
            const c     = { id: d.id, ...d.data() };
            const model = mMap[c.modelID] || {};
            const brand = bMap[model.brandID] || {};
            return {
              ...c,
              label: `${brand.brandName || ""} ${model.modelName || ""}`.trim() || d.id,
              imageURL: iMap[d.id] || null,
            };
          })
        );

        // Fire off the count badge fetch once we know which cars exist —
        // separate lean request (counts only, see reviews.service.js's
        // getReviewCountsForCars), doesn't block the cards from rendering.
        const carIDs = carsSnap.docs.map(d => d.id);
        authedFetch("/api/reviews/counts", {
          method: "POST",
          body: JSON.stringify({ carIDs }),
        })
          .then(res => res.json())
          .then(data => { if (data.success) setReviewCounts(data.data || {}); })
          .catch(e => console.error("Failed to load review counts:", e));
      })
      .catch((e) => { console.error(e); showToast("Failed to load vehicles.", "error"); })
      .finally(() => setCarsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadReviews = useCallback(async (carID) => {
    setReviewsLoading(true);
    try {
      const res = await authedFetch(`/api/reviews/car/${carID}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load reviews.");
      setReviews(json.data || []);
    } catch (e) {
      console.error(e);
      showToast("Failed to load reviews.", "error");
    } finally {
      setReviewsLoading(false);
    }
  }, [authedFetch]);

  const openCar = (car) => {
    setSelectedCar(car);
    loadReviews(car.id);
  };

  // A car is always open — default to the first one once the list loads.
  useEffect(() => {
    if (!selectedCar && cars.length) openCar(cars[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars]);

  const removeReview = async (review) => {
    if (!window.confirm(`Delete this review by ${review.reviewerName}? It will be moved to Reviews Archive and can be restored from there.`)) return;
    setDeletingID(review.reviewID);
    try {
      const res = await authedFetch(`/api/reviews/${review.reviewID}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to delete review.");
      setReviews(prev => prev.filter(r => r.reviewID !== review.reviewID));
      setReviewCounts(prev => ({
        ...prev,
        [selectedCar.id]: Math.max(0, (prev[selectedCar.id] || 0) - 1),
      }));
      showToast("Review deleted and archived.");
    } catch (e) {
      console.error(e);
      showToast("Failed to delete review: " + e.message, "error");
    } finally {
      setDeletingID(null);
    }
  };

  // Same deep link Header.jsx's booking notifications use — lands on
  // Bookings.jsx, which auto-opens this exact booking's detail modal then
  // strips the param (see the `?open=` effect in Bookings.jsx).
  const goToBooking = (bookingID) => navigate(`/bookings?open=${encodeURIComponent(bookingID)}`);

  const avgRating = (list) =>
    list.length ? (list.reduce((sum, r) => sum + r.rating, 0) / list.length).toFixed(1) : null;

  function handleSort(key) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const rows = useMemo(() => {
    const val = (r) => {
      if (sortKey === "reviewer") return (r.reviewerName || "").toLowerCase();
      if (sortKey === "rating")   return r.rating || 0;
      return toDateObj(r.createdAt)?.getTime() ?? 0;
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...reviews].sort((x, y) => { const a = val(x), b = val(y); return a < b ? -dir : a > b ? dir : 0; });
  }, [reviews, sortKey, sortDir]);

  const { page, setPage, totalPages, pageItems, start, count } = usePagination(rows);
  useEffect(() => { setPage(1); setViewReview(null); }, [selectedCar, setPage]);   // new car: back to page 1

  return (
    <div className="p-4 bg-gray-50">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "error"
            ? "bg-red-50 text-red-700 border border-red-200"
            : "bg-green-50 text-green-700 border border-green-200"
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-arl-dark">Reviews</h1>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Car list — every vehicle, not just ones with existing reviews */}
        <div className="w-72 shrink-0">
          {carsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1">
              {cars.length === 0 && (
                <p className="text-gray-400 text-sm col-span-full text-center py-8">No vehicles found.</p>
              )}
              {cars.map(car => {
                const isSelected = selectedCar?.id === car.id;
                return (
                  <button
                    key={car.id}
                    onClick={() => { if (!isSelected) openCar(car); }}
                    className={`w-full text-left bg-white rounded-2xl border transition-all duration-200 shadow-soft p-4 hover:shadow-md ${
                      isSelected ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {car.imageURL ? (
                        <img src={car.imageURL} alt="car"
                          className="rounded-xl object-cover w-10 h-10" />
                      ) : (
                        <div className="rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 w-10 h-10">
                          🚗
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{car.label}</p>
                        <p className="text-xs text-gray-400 truncate">{car.plateNumber || "—"}</p>
                      </div>
                      {reviewCounts[car.id] > 0 && (
                        <span
                          className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold"
                          title={`${reviewCounts[car.id]} review${reviewCounts[car.id] !== 1 ? "s" : ""}`}
                        >
                          {reviewCounts[car.id]}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Reviews panel — loaded on demand for the selected car */}
        {selectedCar && (
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-soft">
            <div className="px-4 pt-4 pb-3">
              <h3 className="font-bold text-gray-800 text-sm">{selectedCar.label}</h3>
              <p className="text-xs text-gray-400">
                {reviewsLoading
                  ? "Loading…"
                  : `${reviews.length} review${reviews.length !== 1 ? "s" : ""}${avgRating(reviews) ? ` · avg ${avgRating(reviews)}` : ""}`}
              </p>
            </div>

            {!reviewsLoading && reviews.length === 0 ? (
              <p className="text-sm text-center py-10 text-gray-400">No reviews for this vehicle yet.</p>
            ) : (
              <div className="mx-4 mb-4 rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] table-fixed text-sm">
                    <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                      <tr>
                        <SortableTh label="Reviewer" sortKey="reviewer" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-[19%]" />
                        <SortableTh label="Rating" sortKey="rating" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-[13%]" />
                        <th className="px-4 py-3 text-left w-[28%]">Comment</th>
                        <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-[26%]" />
                        <th className="pl-4 pr-8 py-3 text-right w-[14%]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewsLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i} className="border-t">
                            {Array.from({ length: 5 }).map((__, j) => (
                              <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        pageItems.map(review => (
                          <tr key={review.reviewID} className="border-t hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-gray-800 truncate" title={review.reviewerName}>{review.reviewerName}</td>
                            <td className="px-4 py-3 whitespace-nowrap"><StarRating value={review.rating} /></td>
                            <td className="px-4 py-3 text-gray-500">
                              {review.comment
                                ? <p className="break-words" title={review.comment}>{previewComment(review.comment)}</p>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap"><DateTime value={review.createdAt} /></td>
                            <td className="pl-4 pr-8 py-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => setViewReview(review)}
                                className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                      {/* Same as Bookings: pad a short page with empty rows so the table always keeps its 10-row height. */}
                      {!reviewsLoading && pageItems.length > 0 && Array.from({ length: Math.max(0, PAGE_SIZE - pageItems.length) }).map((_, i) => (
                        <tr key={`filler-${i}`} aria-hidden="true" className="border-t">
                          <td colSpan={5} className="h-[53px]">&nbsp;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Closes by itself once the review is gone from the list (deleted); cancelling the confirm keeps it open. */}
      {viewReview && reviews.some(r => r.reviewID === viewReview.reviewID) && (
        <ReviewModal
          review={viewReview}
          onClose={() => setViewReview(null)}
          onViewBooking={() => goToBooking(viewReview.bookingID)}
          onDelete={() => removeReview(viewReview)}
          deleting={deletingID === viewReview.reviewID}
        />
      )}
    </div>
  );
}