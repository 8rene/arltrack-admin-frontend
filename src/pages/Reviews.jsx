import { useState, useEffect, useCallback } from "react";
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

function timeAgo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-arl-dark">Reviews</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Customer ratings and comments, grouped by vehicle. Deleting a review moves it to{" "}
          <span className="font-medium text-gray-500">Reviews Archive</span>, where it can be restored.
        </p>
      </div>

      <div className="flex gap-4">
        {/* Car list — every vehicle, not just ones with existing reviews */}
        <div className={`${selectedCar ? "w-72 shrink-0" : "flex-1"} transition-all duration-300`}>
          {carsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className={`grid gap-3 ${selectedCar ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
              {cars.length === 0 && (
                <p className="text-gray-400 text-sm col-span-full text-center py-8">No vehicles found.</p>
              )}
              {cars.map(car => {
                const isSelected = selectedCar?.id === car.id;
                return (
                  <button
                    key={car.id}
                    onClick={() => isSelected ? setSelectedCar(null) : openCar(car)}
                    className={`w-full text-left bg-white rounded-2xl border transition-all duration-200 shadow-soft p-4 hover:shadow-md ${
                      isSelected ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {car.imageURL ? (
                        <img src={car.imageURL} alt="car"
                          className={`rounded-xl object-cover ${selectedCar ? "w-10 h-10" : "w-14 h-14"}`} />
                      ) : (
                        <div className={`rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 ${selectedCar ? "w-10 h-10" : "w-14 h-14"}`}>
                          🚗
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{car.label}</p>
                        <p className="text-xs text-gray-400 truncate">{car.plateNumber || car.platenumber || "—"}</p>
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
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{selectedCar.label}</h3>
                <p className="text-xs text-gray-400">
                  {reviewsLoading
                    ? "Loading…"
                    : `${reviews.length} review${reviews.length !== 1 ? "s" : ""}${avgRating(reviews) ? ` · avg ${avgRating(reviews)}` : ""}`}
                </p>
              </div>
              <button onClick={() => setSelectedCar(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            {reviewsLoading ? (
              <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
            ) : (
              <div className="space-y-2">
                {reviews.length === 0 && (
                  <p className="text-sm text-center py-8 text-gray-400">No reviews for this vehicle yet.</p>
                )}
                {reviews.map(review => (
                  <div key={review.reviewID} className="rounded-xl border border-gray-100 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate text-gray-800">{review.reviewerName}</p>
                          <StarRating value={review.rating} />
                        </div>
                        {review.comment && (
                          <p className="text-xs text-gray-500 mt-1 break-words">{review.comment}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[11px] text-gray-300">{timeAgo(review.createdAt)}</p>
                          {review.bookingID && (
                            <>
                              <span className="text-[11px] text-gray-200">·</span>
                              <button
                                onClick={() => goToBooking(review.bookingID)}
                                className="text-[11px] font-semibold text-teal-600 hover:text-teal-700"
                              >
                                View booking
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeReview(review)}
                        disabled={deletingID === review.reviewID}
                        className="text-xs font-semibold text-red-500 hover:text-red-600 shrink-0 disabled:opacity-50"
                      >
                        {deletingID === review.reviewID ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}