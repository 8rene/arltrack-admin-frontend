import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.REACT_APP_API_URL;

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// Reviews — live customer star-ratings/comments, grouped by vehicle.
// Mirrors the Inventory.jsx layout (car cards → selected car's detail panel)
// since both pages answer "pick a car, see/manage what's tied to it."
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
  const [groups, setGroups]           = useState([]);   // [{ carID, carLabel, plateNumber, reviews }]
  const [loading, setLoading]         = useState(true);
  const [selectedCarID, setSelectedCarID] = useState(null);
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

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/reviews");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load reviews.");
      setGroups(json.data || []);
    } catch (e) {
      console.error(e);
      showToast("Failed to load reviews.", "error");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const selectedGroup = groups.find(g => g.carID === selectedCarID) || null;

  const removeReview = async (review) => {
    if (!window.confirm(`Delete this review by ${review.reviewerName}? It will be moved to Reviews Archive and can be restored from there.`)) return;
    setDeletingID(review.reviewID);
    try {
      const res = await authedFetch(`/api/reviews/${review.reviewID}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to delete review.");
      setGroups(prev =>
        prev
          .map(g => g.carID === selectedCarID
            ? { ...g, reviews: g.reviews.filter(r => r.reviewID !== review.reviewID) }
            : g)
          .filter(g => g.reviews.length > 0)
      );
      if (selectedGroup && selectedGroup.reviews.length === 1) setSelectedCarID(null);
      showToast("Review deleted and archived.");
    } catch (e) {
      console.error(e);
      showToast("Failed to delete review: " + e.message, "error");
    } finally {
      setDeletingID(null);
    }
  };

  const avgRating = (reviews) =>
    reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : "—";

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
        {/* Car list (only cars that have at least one review) */}
        <div className={`${selectedGroup ? "w-72 shrink-0" : "flex-1"} transition-all duration-300`}>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className={`grid gap-3 ${selectedGroup ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
              {groups.length === 0 && (
                <p className="text-gray-400 text-sm col-span-full text-center py-8">No reviews yet.</p>
              )}
              {groups.map(group => {
                const isSelected = selectedCarID === group.carID;
                return (
                  <button
                    key={group.carID}
                    onClick={() => setSelectedCarID(isSelected ? null : group.carID)}
                    className={`w-full text-left bg-white rounded-2xl border transition-all duration-200 shadow-soft p-4 hover:shadow-md ${
                      isSelected ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"
                    }`}
                  >
                    <p className="font-semibold text-gray-800 text-sm truncate">{group.carLabel}</p>
                    <p className="text-xs text-gray-400 truncate">{group.plateNumber || "—"}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <StarRating value={Math.round(avgRating(group.reviews))} />
                      <span className="text-xs text-gray-400">
                        {avgRating(group.reviews)} · {group.reviews.length} review{group.reviews.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Reviews panel */}
        {selectedGroup && (
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{selectedGroup.carLabel}</h3>
                <p className="text-xs text-gray-400">
                  {selectedGroup.reviews.length} review{selectedGroup.reviews.length !== 1 ? "s" : ""} · avg {avgRating(selectedGroup.reviews)}
                </p>
              </div>
              <button onClick={() => setSelectedCarID(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <div className="space-y-2">
              {selectedGroup.reviews.map(review => (
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
                      <p className="text-[11px] text-gray-300 mt-1">{timeAgo(review.createdAt)}</p>
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
          </div>
        )}
      </div>
    </div>
  );
}