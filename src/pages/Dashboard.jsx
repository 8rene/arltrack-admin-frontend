import { useCurrency } from "../context/CurrencyContext";
import { useEffect, useState, useCallback } from "react";
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

const IconMoney = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="12" cy="12.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 6V5M18 6V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconCalendar = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconBarChart = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 20h18M7 20V10M12 20V4M17 20v-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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

const IconClipboard = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.75" />
    <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function StatCard({ title, value, icon, color, loading }) {
  return (
    <div className="bg-white p-5 rounded-2xl border shadow-sm flex items-center gap-4">
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
  const { fmt } = useCurrency();
  const { getToken } = useAuth();
  const [metrics, setMetrics]                 = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);
  const [pendingBookings, setPendingBookings]  = useState([]);
  const [cancelBookings, setCancelBookings]    = useState([]);
  const [damagedParts, setDamagedParts]        = useState([]);

  // REAL-TIME — pending bookings
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "bookings"), where("status", "==", "pending")),
      (snap) => setPendingBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

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

  const alerts = [...pendingBookings, ...cancelBookings, ...damagedParts].sort((a, b) => {
    const ta = a.createdAt?._seconds ?? a.updatedAt?._seconds ?? 0;
    const tb = b.createdAt?._seconds ?? b.updatedAt?._seconds ?? 0;
    return tb - ta;
  });

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
        <StatCard title="Total Vehicles"   value={metrics?.totalVehicles ?? "—"}   icon={<IconCar className="w-6 h-6" />}      color="bg-blue-50 text-blue-600"    loading={loading} />
        <StatCard title="Active Bookings"  value={metrics?.activeBookings ?? "—"}  icon={<IconCheck className="w-6 h-6" />}    color="bg-green-50 text-green-600"  loading={loading} />
        <StatCard title="Pending Bookings" value={metrics?.pendingBookings ?? "—"} icon={<IconClock className="w-6 h-6" />}    color="bg-yellow-50 text-yellow-600" loading={loading} />
        <StatCard title="Vehicles In Use"  value={metrics?.vehiclesInUse ?? "—"}   icon={<IconKey className="w-6 h-6" />}      color="bg-purple-50 text-purple-600" loading={loading} />
      </div>

      {/* REVENUE ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Revenue Today"   value={loading ? "—" : fmt(metrics?.revenueToday)}   icon={<IconMoney className="w-6 h-6" />}    color="bg-teal-50 text-teal-600"    loading={loading} />
        <StatCard title="Monthly Revenue" value={loading ? "—" : fmt(metrics?.monthlyRevenue)} icon={<IconCalendar className="w-6 h-6" />} color="bg-orange-50 text-orange-600" loading={loading} />
        <StatCard title="Yearly Revenue"  value={loading ? "—" : fmt(metrics?.yearlyRevenue)}  icon={<IconBarChart className="w-6 h-6" />} color="bg-indigo-50 text-indigo-600" loading={loading} />
      </div>

      {/* BOTTOM: ALERTS + RECENT BOOKINGS */}
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
                const isCancel  = a.status === "cancellation_request";
                return (
                  <div
                    key={a.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border ${
                      isDamaged
                        ? "bg-red-50 border-red-100"
                        : isCancel
                        ? "bg-orange-50 border-orange-100"
                        : "bg-yellow-50 border-yellow-100"
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

        {/* RECENT BOOKINGS PREVIEW */}
        <div className="bg-white p-5 rounded-2xl border shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <IconClipboard className="w-4 h-4 text-gray-600" />
            Recent Bookings
            {!loading && (
              <span className="text-xs font-normal bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full ml-auto">
                {metrics?.recentBookings?.length ?? 0} entries
              </span>
            )}
          </h2>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50">
                    <div className="space-y-1">
                      <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                      <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                    </div>
                    <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
                  </div>
                ))
              : metrics?.recentBookings?.length === 0
              ? <div className="text-center text-gray-400 text-sm py-8">No recent bookings found</div>
              : metrics?.recentBookings?.slice(0, 6).map((b) => (
                  <div key={b.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="font-medium text-sm text-gray-800">
                        {b.customerName || b.userName || b.name || "—"}
                      </div>
                      <div className="text-xs text-gray-400">
                        {b.carID || b.carId || b.car || "—"} · {fmtDate(b.createdAt)}
                      </div>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                ))
            }
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
                : metrics?.recentBookings?.map((b) => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
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
      </div>

    </div>
  );
}