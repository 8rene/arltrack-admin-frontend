import { useState, useEffect, useCallback, useRef } from "react";
import TracebackPanel from "./TracebackPanel";

const API = process.env.REACT_APP_API_URL;

function fmtDateTime(val) {
  if (!val) return "—";
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

const STATUS_STYLES = {
  ended:     "bg-teal-50 text-teal-700",
  stolen:    "bg-red-50 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  active:    "bg-blue-50 text-blue-700",
};

/**
 * Car Tracking's History tab. Left column: pick a car. Right column: every
 * archived (Firebase-Storage-flushed) trip for that car, newest first, with
 * a "No GPS record" fallback when the list comes back empty. "Review" loads
 * that trip's archive JSON and hands off to TracebackPanel in review mode.
 */
export default function HistoryPanel({ cars, token, refreshTick = 0, autoOpen = null }) {
  const [selectedCar, setSelectedCar] = useState(null);
  const [history, setHistory]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [reviewData, setReviewData]   = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [deepLinkNotice, setDeepLinkNotice] = useState(null);

  // Deep-link from Bookings' "Trip History" button: select the car once —
  // guarded so it doesn't fight the user if they click a different car
  // afterward (only runs while nothing else is selected yet).
  useEffect(() => {
    if (autoOpen?.carID && !selectedCar) {
      setSelectedCar(autoOpen.carID);
    }
  }, [autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoOpenedRef = useRef(false);
  // Once that car's history has actually loaded, auto-open the matching
  // trip's Review — one-shot only, so switching tabs away and back doesn't
  // keep re-opening the same trip.
  useEffect(() => {
    if (!autoOpen?.bookingID || autoOpenedRef.current) return;
    if (loading || selectedCar !== autoOpen.carID) return;
    autoOpenedRef.current = true;
    const match = history.find(h => h.bookingID === autoOpen.bookingID);
    if (match) {
      handleReview(match);
    } else {
      setDeepLinkNotice("Couldn't find that trip's archived record for this car.");
    }
  }, [history, loading, selectedCar, autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchHistory = useCallback(async (carId) => {
    setLoading(true);
    setError(null);
    if (!API) {
      setError("REACT_APP_API_URL is not set — check your .env and restart the dev server.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/api/gps/${carId}/history`, { headers: { Authorization: `Bearer ${token}` } });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Backend returned ${res.status} (non-JSON) — is REACT_APP_API_URL correct and is the backend deployed with the history route?`);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load history.");
      setHistory(json.data || []);
    } catch (e) {
      setError(e.message);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (selectedCar) fetchHistory(selectedCar);
  }, [selectedCar, fetchHistory, refreshTick]);

  async function handleReview(item) {
    const car = cars.find(c => c.id === selectedCar);
    setReviewLoading(true);
    try {
      const res = await fetch(item.archiveUrl);
      if (!res.ok) throw new Error("Could not load this trip's archive file.");
      const parsed = await res.json();
      // New archives are { points, geofenceZones, geofenceAlerts, codingAlerts };
      // older archives already sitting in Storage are still a bare array of
      // { lat, lng, at } with no zone/alert data — handle both.
      const isLegacyArray = Array.isArray(parsed);
      const points = isLegacyArray ? parsed : (parsed.points || []);
      setReviewData({
        label: `${car?.name || selectedCar} · ${fmtDateTime(item.pickupTime)} → ${fmtDateTime(item.returnTime)}`,
        cars: [{ id: selectedCar, name: car?.name || selectedCar }],
        records: { [selectedCar]: points },
        zonesAlerts: isLegacyArray ? undefined : {
          [selectedCar]: {
            geofenceZones:  parsed.geofenceZones  || [],
            geofenceAlerts: parsed.geofenceAlerts || [],
            codingAlerts:   parsed.codingAlerts   || [],
          },
        },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setReviewLoading(false);
    }
  }

  // ── Review mode: hand off entirely to TracebackPanel ─────────────────────
  if (reviewData) {
    return <TracebackPanel cars={cars} token={token} reviewData={reviewData} onExitReview={() => setReviewData(null)} />;
  }

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* ── Sidebar: car list ──────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col gap-2 overflow-y-auto scrollbar-hide">
        {cars.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6 text-center">
            <p className="text-sm text-gray-500 font-semibold">No cars in database</p>
          </div>
        ) : (
          cars.map(car => (
            <button
              key={car.id}
              onClick={() => setSelectedCar(car.id)}
              className={`text-left bg-white rounded-2xl border-2 shadow-soft p-3 transition-all ${
                selectedCar === car.id ? "border-teal-500 ring-1 ring-teal-200" : "border-gray-100 hover:border-teal-300"
              }`}
            >
              <p className="font-bold text-gray-800 text-sm truncate">{car.name}</p>
            </button>
          ))
        )}
      </div>

      {/* ── History list for the selected car ────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {!selectedCar ? (
          <div className="flex-1 flex items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-soft">
            <p className="text-sm text-gray-400">Select a car to see its trip history.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-soft p-4 overflow-y-auto scrollbar-hide">
            <p className="font-bold text-arl-dark text-sm mb-3">
              {cars.find(c => c.id === selectedCar)?.name} — Trip History
            </p>

            {deepLinkNotice && (
              <div className="mb-3 bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                {deepLinkNotice}
              </div>
            )}

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <p className="text-xs text-red-500">{error}</p>
            ) : history.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm font-semibold text-gray-400 italic">No GPS record</p>
                <p className="text-xs text-gray-300 mt-1">This car has no archived trips yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map(item => (
                  <div key={item.bookingSessionID} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-gray-700">
                          {fmtDateTime(item.pickupTime)} → {fmtDateTime(item.returnTime)}
                        </p>
                        {item.status && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status] || "bg-gray-100 text-gray-500"}`}>
                            {item.status}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Archived {fmtDateTime(item.lastArchivedAt)}</p>
                    </div>
                    <button
                      onClick={() => handleReview(item)}
                      disabled={reviewLoading}
                      className="shrink-0 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {reviewLoading ? "…" : "Review"}
                    </button>
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