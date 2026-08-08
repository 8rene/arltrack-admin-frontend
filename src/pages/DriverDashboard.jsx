import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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

const IconDoc = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
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
  const { user } = useAuth();
  const token = localStorage.getItem("token");

  const [liveTrips, setLiveTrips]   = useState([]);   // upcoming + ongoing
  const [pastTrips, setPastTrips]   = useState([]);   // completed/cancelled/stolen
  const [loading, setLoading]       = useState(true);

  const authedFetch = useCallback((path) =>
    fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } }),
  [token]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [liveRes, pastRes] = await Promise.all([
        authedFetch("/api/driver-dispatch/my-trips"),
        authedFetch("/api/driver-dispatch/my-trips/history"),
      ]);
      const [liveJson, pastJson] = await Promise.all([liveRes.json(), pastRes.json()]);
      setLiveTrips(liveRes.ok ? liveJson.data : []);
      setPastTrips(pastRes.ok ? pastJson.data : []);
    } catch {
      setLiveTrips([]);
      setPastTrips([]);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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

      {/* QUICK LINKS */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate("/my-trips")}
          className="bg-white rounded-2xl shadow-soft p-4 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors">
          <IconSteering className="w-5 h-5 text-arl-primary" />
          <span className="text-xs font-semibold text-arl-dark">My Trips</span>
        </button>
        <button onClick={() => navigate("/vehicle-documentation")}
          className="bg-white rounded-2xl shadow-soft p-4 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors">
          <IconDoc className="w-5 h-5 text-arl-primary" />
          <span className="text-xs font-semibold text-arl-dark">Vehicle Documentation</span>
        </button>
      </div>
    </div>
  );
}