import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../fireabase";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconCar = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 11l2.5-4h9L19 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2" y="11" width="20" height="6" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="6.5" cy="17.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="17.5" cy="17.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 11h10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

const IconCheck = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconClock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconKey = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 12h8M18 12v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconBell = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBellOff = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.73 21a2 2 0 01-3.46 0M18.63 13A17.9 17.9 0 0118 8a6 6 0 00-9.33-5M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 2l20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconWarning = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconWrench = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconRefresh = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconFileText = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const dotMap = {
    approved:             "bg-green-500",
    pending:              "bg-yellow-400",
    completed:            "bg-blue-500",
    cancelled:            "bg-red-500",
    cancellation_request: "bg-orange-500",
  };
  const bgMap = {
    approved:             "bg-green-50 border border-green-200",
    pending:              "bg-yellow-50 border border-yellow-200",
    completed:            "bg-blue-50 border border-blue-200",
    cancelled:            "bg-red-50 border border-red-200",
    cancellation_request: "bg-orange-50 border border-orange-200",
  };
  const s   = (status || "").toLowerCase();
  const dot = dotMap[s] || "bg-gray-400";
  const bg  = bgMap[s]  || "bg-gray-50 border border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {status?.replace("_", " ")}
    </span>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────

function StatCard({ title, value, icon, color, loading, onClick }) {
  const clickable = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`bg-white p-5 rounded-2xl border shadow-sm flex items-center gap-4 transition-all ${
        clickable ? "cursor-pointer hover:shadow-md hover:border-teal-200" : ""
      }`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{title}</div>
        {loading ? (
          <div className="h-7 w-20 bg-gray-200 rounded animate-pulse mt-1" />
        ) : (
          <div className="text-2xl font-bold text-gray-800 mt-0.5">{value}</div>
        )}
      </div>
    </div>
  );
}

// ─── SKELETON ROW ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${50 + i * 8}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics]                 = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);
  const [cancelBookings, setCancelBookings]    = useState([]);
  const [damagedParts, setDamagedParts]        = useState([]);
  const [upcomingBookings, setUpcomingBookings]       = useState([]);
  const [upcomingMaintenance, setUpcomingMaintenance] = useState([]);

  // "pending" was retired as a booking status — bookings land straight in
  // "upcoming" now, which isn't alert-worthy (every normal booking passes
  // through it). The only booking-side alert left is a cancellation
  // request, already covered by cancelBookings below.

  // REAL-TIME — cancellation_request bookings
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "bookings"), where("status", "==", "cancellation_request")),
      (snap) => setCancelBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // REAL-TIME — damaged/stolen carParts
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "carParts"), where("status", "in", ["Damaged", "Stolen"])),
      async (snap) => {
        const parts = snap.docs.map((d) => ({ id: d.id, ...d.data(), _type: "damaged_part" }));
        const carIDs = [...new Set(parts.map(p => p.carID).filter(Boolean))];
        let carNameMap = {};
        if (carIDs.length > 0) {
          try {
            const [carsSnap, brandsSnap, modelsSnap] = await Promise.all([
              getDocs(query(collection(db, "cars"), where("__name__", "in", carIDs))),
              getDocs(collection(db, "brand")),
              getDocs(collection(db, "model")),
            ]);
            const brandMap = Object.fromEntries(brandsSnap.docs.map(d => [d.id, d.data().brandName || ""]));
            const modelMap = Object.fromEntries(modelsSnap.docs.map(d => [d.id, { modelName: d.data().modelName || "", brandID: d.data().brandID }]));
            carsSnap.docs.forEach(d => {
              const model = modelMap[d.data().modelID] || {};
              carNameMap[d.id] = `${brandMap[model.brandID] || ""} ${model.modelName || ""}`.trim() || d.id;
            });
          } catch {}
        }
        setDamagedParts(parts.map(p => ({ ...p, carName: carNameMap[p.carID] || p.carID || "—" })));
      }
    );
    return () => unsub();
  }, []);

  // REAL-TIME — bookings not yet started (pickup coming up)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "bookings"), where("status", "==", "upcoming")),
      (snap) => setUpcomingBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // REAL-TIME — maintenance not yet done (still Scheduled or In Progress)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "carMaintenance"), where("status", "in", ["Scheduled", "In Progress"])),
      (snap) => setUpcomingMaintenance(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // How far ahead each type counts as "coming up" — tune these as needed.
  // Bookings get a tighter window since a pickup is a handoff someone has
  // to physically be there for; maintenance gets more lead time since it's
  // usually pre-plannable.
  const BOOKING_WARNING_HOURS     = 6;
  const MAINTENANCE_WARNING_HOURS = 24;

  const toJsDate = (val) => {
    if (!val) return null;
    if (typeof val?.toDate === "function") return val.toDate();
    if (val?._seconds !== undefined) return new Date(val._seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const withinHours = (date, hours) => {
    if (!date) return false;
    const diffMs = date.getTime() - Date.now();
    return diffMs >= 0 && diffMs <= hours * 60 * 60 * 1000;
  };

  const timeUntilLabel = (date) => {
    const diffMs = date.getTime() - Date.now();
    if (diffMs <= 0) return "due now";
    const totalMin = Math.round(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `in ${m}m`;
    if (m === 0) return `in ${h}h`;
    return `in ${h}h ${m}m`;
  };

  const [licenseWarnings, setLicenseWarnings] = useState([]); // expiring soon, not yet expired
  const [licenseAlerts, setLicenseAlerts]     = useState([]); // already expired — needs action now, not a countdown

  // Driver's-license expiry — computed on load, same pattern as the
  // booking/maintenance "coming up" warnings below (pure date math, no
  // write event needed to trigger it — see the earlier discussion on why
  // this is fine for display even though enforcement needs the cron job).
  // Not onSnapshot like the others: userDocument doesn't change often
  // enough to need a live listener, and this needs a join against `user`
  // for role + name anyway, which onSnapshot alone won't give cheaply.
  //
  // Expired goes to Alerts (already happened, needs action now — same
  // tier as a cancellation request or a stolen part), close-to-expiry
  // stays in Warning (a countdown, not yet urgent).
  const fetchLicenseWarnings = useCallback(async () => {
    try {
      const [docSnap, userSnap, detailsSnap] = await Promise.all([
        getDocs(collection(db, "userDocument")),
        getDocs(collection(db, "user")),
        getDocs(collection(db, "userDetails")),
      ]);
      const userMap = Object.fromEntries(userSnap.docs.map(d => [d.id, d.data()]));
      const detailsMap = Object.fromEntries(detailsSnap.docs.map(d => [d.data().userID || d.id, d.data()]));

      const toJs = (val) => {
        if (!val) return null;
        if (typeof val === "string") { const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
        if (typeof val?.toDate === "function") return val.toDate();
        if (val?._seconds !== undefined) return new Date(val._seconds * 1000);
        return null;
      };

      const now = Date.now();
      const LICENSE_WARNING_DAYS = 14; // kept in sync by hand with Profile.jsx / admin-backend's cron threshold
      // Firestore `user` docs store roleID (see backend/models/user/user.model.js),
      // not a human-readable role name — these two IDs are copied by hand from
      // backend/utils/roles/role.util.js's ROLE_IDS. No shared config between
      // the two codebases currently, same duplication risk already flagged
      // elsewhere in this file (pagePermissions.js's own comment about this).
      const DRIVER_ROLE_ID     = "Na0Jpt86nldSO5SjfcLa";
      const SUPERVISOR_ROLE_ID = "fFA8G2R2ANLbVsH00jlv";

      const warningResults = [];
      const alertResults = [];
      docSnap.docs.forEach((d) => {
        const data = d.data();
        const expiry = toJs(data.driverLicenseExpiry);
        const u = userMap[data.userID];
        if (!expiry || !u) return;
        // Driver/Supervisor only — matches the cron job's scope.
        if (u.roleID !== DRIVER_ROLE_ID && u.roleID !== SUPERVISOR_ROLE_ID) return;

        const daysLeft = Math.ceil((expiry.getTime() - now) / (24 * 60 * 60 * 1000));
        if (daysLeft > LICENSE_WARNING_DAYS) return; // not close enough yet

        const det = detailsMap[data.userID] || {};
        const name = `${det.firstName || ""} ${det.lastName || ""}`.trim() || u.username || u.email || data.userID;
        const entry = {
          id: data.userID,
          userID: data.userID,
          name,
          daysLeft,
          isExpired: daysLeft < 0,
          _due: expiry,
          // Lowercase to match Users.jsx's ROLE_TABS key ("driver"/"supervisor"),
          // not the capitalized ROLES.DRIVER/"Driver" string.
          role: u.roleID === DRIVER_ROLE_ID ? "driver" : "supervisor",
        };
        if (entry.isExpired) alertResults.push(entry);
        else warningResults.push(entry);
      });

      setLicenseWarnings(warningResults.sort((a, b) => a._due - b._due));
      setLicenseAlerts(alertResults.sort((a, b) => a._due - b._due));
    } catch (e) {
      console.error("License warning fetch error:", e);
    }
  }, []);

  useEffect(() => { fetchLicenseWarnings(); }, [fetchLicenseWarnings]);

  const alerts = [
    ...cancelBookings,
    ...damagedParts,
    ...licenseAlerts.map((l) => ({ ...l, _type: "license" })),
  ].sort((a, b) => {
    const ta = a._due?.getTime?.() ?? a.createdAt?._seconds * 1000 ?? a.updatedAt?._seconds * 1000 ?? 0;
    const tb = b._due?.getTime?.() ?? b.createdAt?._seconds * 1000 ?? b.updatedAt?._seconds * 1000 ?? 0;
    return tb - ta;
  });

  // Pending edit / ID-resubmit requests — surfaced in Warning as soon as
  // submitted, same "needs admin attention" reasoning as an upcoming
  // booking, just not time-bound. onSnapshot since these are quick, low-
  // volume writes and benefit from showing up live without a page reload.
  const [pendingRequestWarnings, setPendingRequestWarnings] = useState([]);
  useEffect(() => {
    const userMapRef = { current: {} };
    getDocs(collection(db, "user")).then((snap) => {
      userMapRef.current = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
    }).catch(() => {});

    const unsubEdit = onSnapshot(
      query(collection(db, "editRequests"), where("status", "==", "pending")),
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data();
          const u = userMapRef.current[data.userID] || {};
          return {
            id: d.id,
            userID: data.userID,
            name: u.username || u.email || data.userID,
            kind: "editRequest",
            role: (data.role || "driver").toLowerCase(),
            _due: toJsDate(data.createdAt) || new Date(),
          };
        });
        setPendingRequestWarnings((prev) => [...prev.filter((r) => r.kind !== "editRequest"), ...rows]);
      }
    );
    const unsubId = onSnapshot(
      query(collection(db, "idResubmitRequests"), where("status", "==", "pending")),
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data();
          const u = userMapRef.current[data.userID] || {};
          return {
            id: d.id,
            userID: data.userID,
            name: u.username || u.email || data.userID,
            kind: "idResubmit",
            role: (data.role || "driver").toLowerCase(),
            _due: toJsDate(data.createdAt) || new Date(),
          };
        });
        setPendingRequestWarnings((prev) => [...prev.filter((r) => r.kind !== "idResubmit"), ...rows]);
      }
    );
    return () => { unsubEdit(); unsubId(); };
  }, []);

  const warnings = [
    ...upcomingBookings
      .map((b) => ({ ...b, _type: "booking", _due: toJsDate(b.startDateTime) }))
      .filter((b) => withinHours(b._due, BOOKING_WARNING_HOURS)),
    ...upcomingMaintenance
      .map((m) => ({ ...m, _type: "maintenance", _due: toJsDate(m.maintenanceDate) }))
      .filter((m) => withinHours(m._due, MAINTENANCE_WARNING_HOURS)),
    ...licenseWarnings.map((l) => ({ ...l, _type: "license" })),
    ...pendingRequestWarnings.map((r) => ({ ...r, _type: "request" })),
  ].sort((a, b) => a._due - b._due); // soonest first — this list is a countdown, not a feed

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/dashboard/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load metrics");
      setMetrics(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const fmtDate = (val) => {
    if (!val) return "—";
    try {
      let d;
      if (typeof val?.toDate === "function") d = val.toDate();
      else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
      else d = new Date(val);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("en-PH");
    } catch { return "—"; }
  };

  return (
    <div className="p-4 space-y-6">

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <IconWarning className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={fetchMetrics} className="text-red-600 font-semibold underline text-xs ml-4">Retry</button>
        </div>
      )}

      {/* STATS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Vehicles"       value={metrics?.totalVehicles ?? "—"}   icon={<IconCar className="w-6 h-6" />}      color="bg-blue-50 text-blue-600"    loading={loading}
          onClick={() => navigate("/fleet")} />
        <StatCard title="Upcoming Bookings"    value={metrics?.activeBookings ?? "—"}  icon={<IconCheck className="w-6 h-6" />}    color="bg-green-50 text-green-600"  loading={loading}
          onClick={() => navigate("/bookings?tab=Upcoming")} />
        <StatCard title="Cancellation Requests" value={metrics?.pendingBookings ?? "—"} icon={<IconClock className="w-6 h-6" />}    color="bg-yellow-50 text-yellow-600" loading={loading}
          onClick={() => navigate("/bookings?tab=All")} />
        <StatCard title="Vehicles In Use"      value={metrics?.vehiclesInUse ?? "—"}   icon={<IconKey className="w-6 h-6" />}      color="bg-purple-50 text-purple-600" loading={loading}
          onClick={() => navigate("/car-tracking")} />
      </div>

      {/* BOTTOM: ALERTS + WARNING */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* ALERTS */}
        <div className="bg-white p-5 rounded-2xl border shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <IconBell className="w-4 h-4 text-gray-600" />
            Alerts
            {alerts.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
          </h2>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-gray-400 text-sm gap-2">
                <IconBellOff className="w-8 h-8 text-gray-300" />
                No alerts at this time
              </div>
            ) : (
              alerts.map((a) => {
                const isDamaged = a._type === "damaged_part";
                const isLicense = a._type === "license";
                const isCancel  = a.status === "cancellation_request";
                const goTo = () => {
                  if (isDamaged) navigate("/maintenance");
                  else if (isLicense) navigate(`/users?role=${a.role}&tab=directory&open=${a.userID}`);
                  else navigate(`/bookings?open=${a.bookingID || a.id}`);
                };

                if (isLicense) {
                  return (
                    <div
                      key={`license-alert-${a.id}`}
                      onClick={goTo}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goTo(); } }}
                      className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors bg-red-50 border-red-100 hover:bg-red-100"
                    >
                      <span className="shrink-0 mt-0.5 text-red-500">
                        <IconWarning className="w-5 h-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-snug">Driver's License Expired</p>
                        <p className="text-xs text-gray-500 mt-0.5 font-medium">{a.name}</p>
                        <p className="text-xs text-gray-400">Account auto-locked</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={a.id}
                    onClick={goTo}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goTo(); } }}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      isDamaged
                        ? "bg-red-50 border-red-100 hover:bg-red-100"
                        : isCancel
                        ? "bg-orange-50 border-orange-100 hover:bg-orange-100"
                        : "bg-yellow-50 border-yellow-100 hover:bg-yellow-100"
                    }`}
                  >
                    <span className={`shrink-0 mt-0.5 ${isDamaged ? "text-red-500" : isCancel ? "text-orange-500" : "text-yellow-500"}`}>
                      {isDamaged
                        ? <IconWrench className="w-5 h-5" />
                        : isCancel
                        ? <IconWarning className="w-5 h-5" />
                        : <IconBell className="w-5 h-5" />
                      }
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 leading-snug">
                        {isDamaged
                          ? `${a.status === "Stolen" ? "Stolen" : "Damaged"} Part Detected`
                          : isCancel ? "Cancellation Request" : "New Booking Request"}
                      </p>
                      {isDamaged ? (
                        <>
                          <p className="text-xs text-gray-500 mt-0.5 font-medium">{a.carPartName || "Unknown Part"}</p>
                          <p className="text-xs text-gray-400">{a.carName || a.carID || "—"}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 mt-0.5">Booking ID: {a.bookingID || a.id}</p>
                          <p className="text-xs text-gray-400">User ID: {a.userID || "—"}</p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* WARNING — things coming up soon, not wrong yet */}
        <div className="bg-white p-5 rounded-2xl border shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <IconClock className="w-4 h-4 text-gray-600" />
            Warning
            {warnings.length > 0 && (
              <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {warnings.length}
              </span>
            )}
          </h2>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {warnings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-gray-400 text-sm gap-2">
                <IconClock className="w-8 h-8 text-gray-300" />
                Nothing coming up soon
              </div>
            ) : (
              warnings.map((w) => {
                const isMaint   = w._type === "maintenance";
                const isLicense = w._type === "license";
                const isRequest = w._type === "request";
                const goTo = () => {
                  if (isMaint) navigate("/maintenance");
                  else if (isLicense) navigate(`/users?role=${w.role}&tab=directory&open=${w.userID}`);
                  else if (isRequest) navigate(`/users?role=${w.role}&tab=editRequests&open=${w.userID}`);
                  else navigate(`/bookings?open=${w.bookingID || w.id}`);
                };
                if (isLicense) {
                  return (
                    <div
                      key={`license-${w.id}`}
                      onClick={goTo}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goTo(); } }}
                      className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors bg-amber-50 border-amber-100 hover:bg-amber-100"
                    >
                      <span className="shrink-0 mt-0.5 text-amber-600">
                        <IconWarning className="w-5 h-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-snug">Driver's License Expiring Soon</p>
                        <p className="text-xs text-gray-500 mt-0.5">{w.name}</p>
                        <p className="text-xs text-gray-400">Expires in {w.daysLeft} day(s)</p>
                      </div>
                    </div>
                  );
                }
                if (isRequest) {
                  const isIdReq = w.kind === "idResubmit";
                  return (
                    <div
                      key={`request-${w.id}`}
                      onClick={goTo}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goTo(); } }}
                      className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors bg-blue-50 border-blue-100 hover:bg-blue-100"
                    >
                      <span className="shrink-0 mt-0.5 text-blue-500">
                        <IconBell className="w-5 h-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-snug">
                          {isIdReq ? "ID Resubmit Request" : "Profile Edit Request"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{w.name}</p>
                        <p className="text-xs text-gray-400">Awaiting review</p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={`${w._type}-${w.id}`}
                    onClick={goTo}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goTo(); } }}
                    className="flex items-start gap-3 p-3 rounded-xl border bg-yellow-50 border-yellow-100 hover:bg-yellow-100 cursor-pointer transition-colors"
                  >
                    <span className="shrink-0 mt-0.5 text-yellow-600">
                      {isMaint ? <IconWrench className="w-5 h-5" /> : <IconClock className="w-5 h-5" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 leading-snug">
                        {isMaint ? "Pending Maintenance" : "Pending Booking"} · {timeUntilLabel(w._due)}
                      </p>
                      {isMaint ? (
                        <>
                          <p className="text-xs text-gray-500 mt-0.5 font-medium">{w.carID || "—"}</p>
                          <p className="text-xs text-gray-400">{w.description || "Scheduled service"}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 mt-0.5">Booking ID: {w.bookingID || w.id}</p>
                          <p className="text-xs text-gray-400">
                            Pickup: {w._due.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* FULL BOOKINGS TABLE */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <IconFileText className="w-4 h-4 text-gray-600" />
            All Bookings
          </h2>
          <button onClick={fetchMetrics} className="text-xs text-teal-600 font-medium hover:underline flex items-center gap-1">
            <IconRefresh className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Booking ID</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Car ID</th>
                <th className="px-4 py-3 font-medium">Rental Period</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : metrics?.recentBookings?.length === 0
                ? (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-400 py-10">No bookings found</td>
                  </tr>
                )
                : metrics?.recentBookings?.slice(0, 8).map((b) => (
                  <tr key={b.id} onClick={() => navigate(`/bookings?open=${b.bookingID || b.id}`)}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-gray-600">{b.bookingID || b.id}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{b.customerName || b.userName || b.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{b.carID || b.carId || b.car || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(b.startDateTime)} – {fmtDate(b.endDateTime)}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        {!loading && (metrics?.recentBookings?.length ?? 0) > 0 && (
          <div className="flex justify-center py-4 border-t border-gray-100">
            <button onClick={() => navigate("/bookings")}
              className="px-5 py-2 rounded-xl text-sm font-medium border text-teal-700 border-teal-200 bg-teal-50 hover:bg-teal-100 transition-colors">
              See More
            </button>
          </div>
        )}
      </div>

    </div>
  );
}