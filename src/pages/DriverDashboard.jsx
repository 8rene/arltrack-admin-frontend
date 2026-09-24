import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../fireabase";
import { useAuth } from "../context/AuthContext";

const API_URL = process.env.REACT_APP_API_URL;

// ─── ICONS ───────────────────────────────────────────────────────────────
const IconSteering = ({ className = "w-5 h-5" }) => (
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

const IconCheck = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
  </svg>
);

const IconCalendar = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path strokeLinecap="round" d="M16 3v4M8 3v4M3 10h18" />
  </svg>
);

const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a1.5 1.5 0 001.29 2.25h17.78A1.5 1.5 0 0022.18 18L13.71 3.86a1.5 1.5 0 00-2.42 0z" />
  </svg>
);

const IconInfo = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
  </svg>
);

const fmtDateTime = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// Small stat card, matching Dashboard.jsx's card conventions (rounded-2xl, shadow-soft).
function StatCard({ icon, label, value, tint }) {
  return (
    <div className="bg-white rounded-2xl shadow-soft p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-arl-dark leading-tight">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}

export default function DriverDashboard() {
  const navigate = useNavigate();
  const { user, previewRole } = useAuth();
  const token = localStorage.getItem("token");

  const [liveTrips, setLiveTrips]   = useState([]);   // upcoming + ongoing
  const [pastTrips, setPastTrips]   = useState([]);   // completed/cancelled/stolen
  const [loading, setLoading]       = useState(true);
  // Distinguishes "confirmed empty" from "failed to load" — previously both
  // looked identical ("Nothing on your plate"), which meant a driver had no
  // way to tell a real day off from a broken fetch.
  const [error, setError]           = useState(null);

  const authedFetch = useCallback((path) =>
    fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } }),
  [token]);

  // `silent` skips the loading spinner — used by the live-refresh listener
  // below so a newly-assigned trip doesn't blank the screen while it reloads.
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const [liveRes, pastRes] = await Promise.all([
        authedFetch("/api/driver-dispatch/my-trips"),
        authedFetch("/api/driver-dispatch/my-trips/history"),
      ]);
      const [liveJson, pastJson] = await Promise.all([liveRes.json(), pastRes.json()]);
      if (!liveRes.ok) throw new Error(liveJson.message || "Failed to load your trips");
      if (!pastRes.ok) throw new Error(pastJson.message || "Failed to load your trip history");
      setLiveTrips(liveJson.data);
      setPastTrips(pastJson.data);
    } catch (e) {
      if (!silent) setError(e.message || "Couldn't load your trips. Check your connection and try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Live refresh ────────────────────────────────────────────────────────────
  // Same reasoning as Bookings.jsx/Payments.jsx: the REST endpoint does the
  // real filtering (which trips belong to this driver), so we just listen for
  // any change to `bookings` and re-run the existing fetch, debounced. This
  // is the one dashboard where staleness matters most — a driver waiting on
  // this screen for their next assignment has no reason to think to refresh.
  const refetchTimer = useRef(null);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), () => {
      clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => fetchAll(true), 400);
    });
    return () => { unsub(); clearTimeout(refetchTimer.current); };
  }, [fetchAll]);

  // An Admin/Owner/Supervisor using "preview as Driver" hits this same
  // component, but the API call above is still scoped to their own real
  // JWT — there's no backend support for "show me driver X's trips" — so
  // what they see here is their own (almost always empty) trip list, not a
  // representative sample. Surfacing that plainly beats letting it look
  // like a real (very boring) driver day.
  const isPreviewingAsDriver = previewRole === "Driver" && user?.role !== "Driver";

  const ongoing        = liveTrips.filter(t => t.status === "ongoing");
  const upcoming        = liveTrips.filter(t => t.status === "upcoming")
    .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));
  const completedCount = pastTrips.filter(t => t.status === "completed").length;

  // "Next up" = the ongoing trip if there is one (needs attention now),
  // otherwise the soonest upcoming booking.
  const nextTrip = ongoing[0] || upcoming[0] || null;

  const firstName = user?.username?.split(" ")[0] || "there";

  return (
    <div className="w-full px-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-arl-dark">Hi, {firstName} 👋</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {isPreviewingAsDriver && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
          <IconInfo className="w-4 h-4 shrink-0" />
          Preview mode: this shows your own account's trips, not a real driver's schedule — there's no assigned trips to preview here.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <IconWarning className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={() => fetchAll()} className="text-red-600 font-semibold underline text-xs ml-4 shrink-0">Retry</button>
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<IconCalendar className="w-5 h-5 text-indigo-600" />}
          tint="bg-indigo-50"
          label="Upcoming Bookings"
          value={loading ? "…" : upcoming.length}
        />
        <StatCard
          icon={<IconSteering className="w-5 h-5 text-amber-600" />}
          tint="bg-amber-50"
          label="Ongoing Now"
          value={loading ? "…" : ongoing.length}
        />
        <StatCard
          icon={<IconCheck className="w-5 h-5 text-green-600" />}
          tint="bg-green-50"
          label="Bookings Accomplished"
          value={loading ? "…" : completedCount}
        />
      </div>

      {/* NEXT UP */}
      <div>
        <h2 className="text-sm font-bold text-arl-dark mb-2">Next Up</h2>
        {loading ? (
          <div className="bg-white rounded-2xl shadow-soft p-6 h-28 animate-pulse" />
        ) : !nextTrip ? (
          <div className="bg-white rounded-2xl shadow-soft p-8 text-center">
            <IconSteering className="w-7 h-7 mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-arl-dark">Nothing on your plate right now</p>
            <p className="text-xs text-gray-400 mt-1">New bookings assigned to you will show up here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-soft p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-arl-dark">{nextTrip.customerName}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg ${
                    nextTrip.status === "ongoing" ? "bg-green-50 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                  }`}>{nextTrip.status}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{nextTrip.vehicleName}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="flex items-center gap-1"><IconClock /> {fmtDateTime(nextTrip.startDateTime)} → {fmtDateTime(nextTrip.endDateTime)}</span>
              <span className="flex items-center gap-1"><IconPin /> {nextTrip.location}</span>
            </div>
            <button onClick={() => navigate("/my-trips")}
              className="w-full py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.99] transition-all">
              {nextTrip.status === "ongoing" ? "Manage This Trip" : "Go to My Trips →"}
            </button>
          </div>
        )}
      </div>

      {/* UPCOMING BOOKINGS LIST — so a driver can see what's coming, not just what's active now */}
      {upcoming.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-arl-dark">Upcoming Bookings</h2>
            <button onClick={() => navigate("/my-trips")} className="text-xs text-arl-primary font-medium hover:underline">
              View all →
            </button>
          </div>
          <div className="space-y-2">
            {upcoming.slice(0, 4).map((trip) => (
              <div key={trip.id} className="bg-white rounded-xl shadow-soft p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-arl-dark truncate">{trip.customerName}</p>
                  <p className="text-xs text-gray-400 truncate">{trip.vehicleName} • {trip.location}</p>
                </div>
                <span className="text-xs text-gray-500 shrink-0 flex items-center gap-1">
                  <IconClock /> {fmtDateTime(trip.startDateTime)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QUICK LINKS — Vehicle Inspections is staff-only now (a supervisor
          completes it; the driver's pickup/return waits on it in My Trips). */}
      <div className="grid grid-cols-1 gap-3">
        <button onClick={() => navigate("/my-trips")}
          className="bg-white rounded-2xl shadow-soft p-4 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors">
          <IconSteering className="w-5 h-5 text-arl-primary" />
          <span className="text-xs font-semibold text-arl-dark">My Trips</span>
        </button>
      </div>
    </div>
  );
}