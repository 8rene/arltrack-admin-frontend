import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL;

// ─── ICONS ───────────────────────────────────────────────────────────────

const IconSteering = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.5" />
    <path strokeLinecap="round" d="M12 3v6.5M12 14.5V21M4.2 7.5l5.6 3.2M14.2 13.3l5.6 3.2M19.8 7.5l-5.6 3.2M9.8 13.3l-5.6 3.2" />
  </svg>
);

const IconClock = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
  </svg>
);

const IconPin = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-7.75 7-13a7 7 0 10-14 0c0 5.25 7 13 7 13z" />
    <circle cx="12" cy="8" r="2.5" />
  </svg>
);

const IconFlag = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" strokeLinecap="round" />
  </svg>
);

const IconHistory = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 109-9 9 9 0 00-6.36 2.64L3 8" />
    <path strokeLinecap="round" d="M3 3v5h5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
  </svg>
);

const fmtDateTime = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const fmtDateTimeLong = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const fmtTime = (val) => {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d)) return null;
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};

const STATUS_STYLE = {
  completed: "bg-blue-50 text-blue-700 border border-blue-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
  stolen:    "bg-red-900 text-white",
};

// ─── ACTIVE TRIPS TAB (upcoming + ongoing, with pickup/dropoff/return actions) ──
function ActiveTripsTab() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [trips, setTrips]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState(null);
  const [busyID, setBusyID]   = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

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

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await authedFetch("/api/driver-dispatch/my-trips");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load your trips.");
      setTrips(json.data);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  const handlePickup = (trip) => {
    // Same rule as staff: pickup goes through Vehicle Documentation first,
    // not straight to "ongoing". The before-trip photos are required
    // there (server-enforced), and that page is what actually flips the
    // booking to "ongoing" once they're saved.
    navigate(`/vehicle-documentation?carID=${trip.carID}&action=pickup`);
  };

  const handleDropoff = async (trip) => {
    setBusyID(trip.id);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${trip.id}/dropoff`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to mark dropped off.");
      showToast("Marked dropped off.");
      fetchTrips();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusyID(null);
    }
  };

  const handleReturn = async (trip) => {
    setBusyID(trip.id);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${trip.id}/return`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to mark returned.");
      showToast("Trip completed — nice work!");
      fetchTrips();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusyID(null);
    }
  };

  return (
    <div className="space-y-3">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      <div className="flex justify-end">
        <button onClick={fetchTrips} disabled={loading}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          ↺ Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-16 text-center">Loading…</p>
      ) : trips.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
          <IconSteering className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-arl-dark">No trips assigned right now</p>
          <p className="text-xs text-gray-400 mt-1">Today's and upcoming trips will show here once dispatched.</p>
        </div>
      ) : (
        trips.map((trip) => {
          const isOngoing   = trip.status === "ongoing";
          const droppedOff  = fmtTime(trip.customerDroppedOffAt);
          return (
            <div key={trip.id} className="bg-white rounded-2xl shadow-soft p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-arl-dark">{trip.customerName}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg ${
                      isOngoing ? "bg-green-50 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                    }`}>{trip.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{trip.vehicleName}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="flex items-center gap-1"><IconClock /> {fmtDateTime(trip.startDateTime)} → {fmtDateTime(trip.endDateTime)}</span>
                <span className="flex items-center gap-1"><IconPin /> {trip.location}</span>
              </div>

              {isOngoing && (
                <div className="flex items-center gap-4 text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-500">Picked up: <span className="font-semibold text-arl-dark">{fmtTime(trip.pickupTime) || "—"}</span></span>
                  <span className="text-gray-500">
                    Dropped off: <span className="font-semibold text-arl-dark">{droppedOff || "Not recorded"}</span>
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                {!isOngoing ? (
                  <button onClick={() => handlePickup(trip)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.99] transition-all">
                    ▶ Start Pickup
                  </button>
                ) : (
                  <>
                    {!droppedOff && (
                      <button onClick={() => handleDropoff(trip)} disabled={busyID === trip.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 active:scale-[0.99] transition-all disabled:opacity-50">
                        <IconPin className="w-3.5 h-3.5" /> Mark Dropped Off
                      </button>
                    )}
                    <button onClick={() => handleReturn(trip)} disabled={busyID === trip.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 active:scale-[0.99] transition-all disabled:opacity-50">
                      <IconFlag className="w-3.5 h-3.5" /> {busyID === trip.id ? "…" : "Return"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── HISTORY TAB (completed/cancelled/stolen) ─────────────────────────────
function HistoryTab() {
  const token = localStorage.getItem("token");

  const [trips, setTrips]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_URL}/api/driver-dispatch/my-trips/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load trip history.");
      setTrips(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={fetchHistory} disabled={loading}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          ↺ Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-16 text-center">Loading…</p>
      ) : trips.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
          <IconHistory className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-arl-dark">No completed trips yet</p>
          <p className="text-xs text-gray-400 mt-1">Trips you've finished, cancelled, or flagged will show here.</p>
        </div>
      ) : (
        trips.map((trip) => (
          <div key={trip.id} className="bg-white rounded-2xl shadow-soft p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-arl-dark">{trip.customerName}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg ${STATUS_STYLE[trip.status] || "bg-gray-100 text-gray-500"}`}>
                    {trip.status?.replace("_", " ")}
                  </span>
                  {trip.modeOfDriving === "With Chauffeur" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg bg-indigo-600 text-white">
                      Chauffeur
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{trip.vehicleName}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="flex items-center gap-1"><IconClock /> {fmtDateTimeLong(trip.startDateTime)} → {fmtDateTimeLong(trip.endDateTime)}</span>
              <span className="flex items-center gap-1"><IconPin /> {trip.location}</span>
            </div>

            {trip.status === "completed" && (trip.pickupTime || trip.customerDroppedOffAt || trip.returnTime) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5">
                <span>Picked up: <span className="font-semibold text-gray-600">{fmtDateTimeLong(trip.pickupTime)}</span></span>
                {trip.modeOfDriving === "With Chauffeur" && (
                  <span>Dropped off: <span className="font-semibold text-gray-600">{trip.customerDroppedOffAt ? fmtDateTimeLong(trip.customerDroppedOffAt) : "Not recorded"}</span></span>
                )}
                <span>Returned: <span className="font-semibold text-gray-600">{fmtDateTimeLong(trip.returnTime)}</span></span>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── MAIN: My Trips (Active | History tabs) ───────────────────────────────
// /my-trips/history used to be its own page — now it's just this page with
// ?tab=history, see the redirect in App.jsx for old links/bookmarks.
export default function MyTrips() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "history" ? "history" : "active";

  const setTab = (t) => setSearchParams(t === "active" ? {} : { tab: t }, { replace: true });

  return (
    <div className="w-full px-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-arl-dark">My Trips</h1>
        <p className="text-xs text-gray-400 mt-0.5">Your assigned trips and trip history</p>
      </div>

      <div className="flex gap-2 border-b border-gray-100">
        <button onClick={() => setTab("active")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "active" ? "border-arl-primary text-arl-primary" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}>
          Trips
        </button>
        <button onClick={() => setTab("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "history" ? "border-arl-primary text-arl-primary" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}>
          History
        </button>
      </div>

      {tab === "active" ? <ActiveTripsTab /> : <HistoryTab />}
    </div>
  );
}