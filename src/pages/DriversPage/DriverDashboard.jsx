import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import usePolling from "../../hooks/usePolling";
import { useAuth } from "../../context/AuthContext";

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

const IconCar = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 17h8M3 11l2-5h14l2 5M5 11h14M5 17v2m14-2v2" />
  </svg>
);

const IconTimer = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h10M7 21h10M8 3v3a4 4 0 001.2 2.8L12 12l2.8-3.2A4 4 0 0016 6V3M8 21v-3a4 4 0 011.2-2.8L12 12l2.8 3.2A4 4 0 0116 18v3" />
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

const IconFileText = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M9 13h6M9 17h6" />
  </svg>
);

const fmtDateTime = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const fmtDay = (val) => {
  const d = new Date(val);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
};
const fmtDayOnly = (val) => {
  const d = new Date(val);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
const fmtClock = (val) => {
  const d = new Date(val);
  return isNaN(d) ? "" : d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};

// "7 days 22 hrs" / "3 days" / "6 hrs" — whole hours are plenty for a rental
// window; under an hour falls back to minutes.
const fmtDuration = (start, end) => {
  const ms = new Date(end) - new Date(start);
  if (!start || !end || isNaN(ms) || ms <= 0) return "—";
  const totalHrs = Math.round(ms / 3_600_000);
  if (totalHrs < 1) return `${Math.max(1, Math.round(ms / 60_000))} mins`;
  const days = Math.floor(totalHrs / 24);
  const hrs  = totalHrs % 24;
  const d = days ? `${days} ${days === 1 ? "day" : "days"}` : "";
  const h = hrs  ? `${hrs} ${hrs === 1 ? "hr" : "hrs"}`     : "";
  return [d, h].filter(Boolean).join(" ");
};

const STATUS_PILL = {
  upcoming:  { dot: "bg-yellow-500", bg: "bg-yellow-50 border border-yellow-200", label: "Upcoming" },
  ongoing:   { dot: "bg-green-500",  bg: "bg-green-50 border border-green-200",   label: "Ongoing" },
  completed: { dot: "bg-blue-500",   bg: "bg-blue-50 border border-blue-200",     label: "Completed" },
  cancelled: { dot: "bg-red-500",    bg: "bg-red-50 border border-red-200",       label: "Cancelled" },
  stolen:    { dot: "bg-red-900",    bg: "bg-red-100 border border-red-300",      label: "Stolen" },
};
function StatusPill({ status }) {
  const b = STATUS_PILL[status] || { dot: "bg-gray-400", bg: "bg-gray-50 border border-gray-200", label: (status || "—").replace("_", " ") };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-black ${b.bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${b.dot}`} />{b.label}
    </span>
  );
}

// Stat card — same design as the admin Dashboard.jsx cards (p-5, border, uppercase label, 2xl value).
function StatCard({ icon, label, value, tint }) {
  return (
    <div className="bg-white p-5 rounded-2xl border shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-bold text-gray-800 mt-0.5">{value}</div>
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
  // CHANGED: was onSnapshot(collection(db, "bookings")) — a full-collection read
  // per open tab. A driver waiting for an assignment still gets updates, every
  // 30s while the tab is visible.
  usePolling(() => fetchAll(true), 30_000, { immediate: false });

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

  // Latest finished trips (completed/cancelled/stolen), newest first — shown as a table at the bottom.
  const recentTrips = [...pastTrips]
    .sort((a, b) => new Date(b.startDateTime) - new Date(a.startDateTime))
    .slice(0, 5);

  // "Next up" = the ongoing trip if there is one (needs attention now),
  // otherwise the soonest upcoming booking.
  const nextTrip = ongoing[0] || upcoming[0] || null;

  const firstName = user?.username?.split(" ")[0] || "there";

  return (
    <div className="w-full px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-arl-dark">Hi, {firstName} 👋</h1>
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
          icon={<IconCalendar className="w-6 h-6 text-indigo-600" />}
          tint="bg-indigo-50"
          label="Upcoming Bookings"
          value={loading ? "…" : upcoming.length}
        />
        <StatCard
          icon={<IconSteering className="w-6 h-6 text-amber-600" />}
          tint="bg-amber-50"
          label="Ongoing Now"
          value={loading ? "…" : ongoing.length}
        />
        <StatCard
          icon={<IconCheck className="w-6 h-6 text-green-600" />}
          tint="bg-green-50"
          label="Bookings Accomplished"
          value={loading ? "…" : completedCount}
        />
      </div>

      {/* NEXT UP */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">Next Up</h2>
        {loading ? (
          <div className="bg-white rounded-2xl border shadow-sm p-6 h-28 animate-pulse" />
        ) : !nextTrip ? (
          <div className="bg-white rounded-2xl border shadow-sm p-8 text-center">
            <IconSteering className="w-7 h-7 mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-arl-dark">Nothing on your plate right now</p>
            <p className="text-xs text-gray-400 mt-1">New bookings assigned to you will show up here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
            {/* When is the whole point of this card, so it gets the big type.
                Customer, pickup address etc. live behind the button. */}
            <span className={`inline-block text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-lg ${
              nextTrip.status === "ongoing" ? "bg-green-50 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"
            }`}>{nextTrip.status}</span>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <p className="text-base font-bold text-arl-dark leading-tight">
                  {fmtDay(nextTrip.startDateTime)} <span className="text-arl-primary">· {fmtClock(nextTrip.startDateTime)}</span>
                </p>
                <p className="text-xs text-gray-500">
                  until <span className="font-semibold text-arl-dark">{fmtDay(nextTrip.endDateTime)}, {fmtClock(nextTrip.endDateTime)}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="flex items-center gap-1"><IconTimer /> {fmtDuration(nextTrip.startDateTime, nextTrip.endDateTime)}</span>
                <span className="flex items-center gap-1"><IconCar /> {nextTrip.vehicleName}</span>
              </div>
            </div>
            <button onClick={() => navigate("/my-trips")}
              className="w-full py-2 rounded-xl text-sm font-semibold bg-teal-700 text-white hover:bg-teal-800 active:scale-[0.99] transition-all">
              {nextTrip.status === "ongoing" ? "Manage This Trip" : "Go to My Trips →"}
            </button>
          </div>
        )}
      </div>

      {/* UPCOMING BOOKINGS LIST — so a driver can see what's coming, not just what's active now */}
      {upcoming.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800">Upcoming Bookings</h2>
            <button onClick={() => navigate("/my-trips")} className="text-xs text-arl-primary font-medium hover:underline">
              View all →
            </button>
          </div>
          <div className="space-y-2">
            {upcoming.slice(0, 4).map((trip) => (
              <div key={trip.id} className="bg-white rounded-2xl border shadow-sm p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-arl-dark truncate">{trip.vehicleName}</p>
                  <p className="text-xs text-gray-400 truncate">{fmtDuration(trip.startDateTime, trip.endDateTime)}</p>
                </div>
                <span className="text-sm font-bold text-arl-dark shrink-0 flex items-center gap-1">
                  <IconClock /> {fmtDateTime(trip.startDateTime)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MOST RECENT TRIPS — same card layout as "Recent Bookings" on the staff Dashboard */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <IconFileText className="w-4 h-4 text-gray-600" />
            Most Recent Trips
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Trip Start</th>
                <th className="px-4 py-3 font-medium">Trip End</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : recentTrips.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-400 py-10">No recent trips yet</td></tr>
              ) : (
                recentTrips.map((trip) => (
                  <tr key={trip.id} onClick={() => navigate("/my-trips?tab=history")}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDayOnly(trip.startDateTime)} | {fmtClock(trip.startDateTime)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDayOnly(trip.endDateTime)} | {fmtClock(trip.endDateTime)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{trip.customerName || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.vehicleName || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[14rem] truncate" title={trip.location}>{trip.location || "—"}</td>
                    <td className="px-4 py-3"><StatusPill status={trip.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && recentTrips.length > 0 && (
          <div className="flex justify-center py-4 border-t border-gray-100">
            <button onClick={() => navigate("/my-trips?tab=history")}
              className="px-5 py-2 rounded-xl text-sm font-medium border text-teal-700 border-teal-200 bg-teal-50 hover:bg-teal-100 transition-colors">
              See More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}