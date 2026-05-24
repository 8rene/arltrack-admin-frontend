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

function StatusBadge({ status }) {
  const map = {
    approved:             "bg-green-100 text-green-700 border border-green-200",
    pending:              "bg-yellow-100 text-yellow-700 border border-yellow-200",
    completed:            "bg-blue-100 text-blue-700 border border-blue-200",
    cancelled:            "bg-red-100 text-red-700 border border-red-200",
    cancellation_request: "bg-orange-100 text-orange-700 border border-orange-200",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${map[status] || "bg-gray-100 text-gray-600"}`}>
      {status?.replace("_", " ")}
    </span>
  );
}

function StatCard({ title, value, icon, color, loading }) {
  return (
    <div className="bg-white p-5 rounded-2xl border shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${color}`}>
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

export default function Dashboard() {
  const { fmt } = useCurrency();
  const { getToken } = useAuth();
  const [metrics, setMetrics]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [cancelBookings, setCancelBookings]   = useState([]);
  const [damagedParts, setDamagedParts]       = useState([]);

  // 🔔 REAL-TIME — read directly from bookings collection
  // pending bookings
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "bookings"), where("status", "==", "pending")),
      (snap) => setPendingBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // cancellation_request bookings
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "bookings"), where("status", "==", "cancellation_request")),
      (snap) => setCancelBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // 🔧 REAL-TIME — damaged/stolen carParts
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "carParts"), where("status", "in", ["Damaged", "Stolen"])),
      async (snap) => {
        const parts = snap.docs.map((d) => ({ id: d.id, ...d.data(), _type: "damaged_part" }));
        // Enrich with car name
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

  // Combine + sort by latest first
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
          <span>⚠️ {error}</span>
          <button onClick={fetchMetrics} className="text-red-600 font-semibold underline text-xs ml-4">Retry</button>
        </div>
      )}

      {/* STATS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Vehicles"   value={metrics?.totalVehicles ?? "—"}  icon="🚗" color="bg-blue-50 text-blue-600"   loading={loading} />
        <StatCard title="Active Bookings"  value={metrics?.activeBookings ?? "—"} icon="✅" color="bg-green-50 text-green-600"  loading={loading} />
        <StatCard title="Pending Bookings" value={metrics?.pendingBookings ?? "—"} icon="⏳" color="bg-yellow-50 text-yellow-600" loading={loading} />
        <StatCard title="Vehicles In Use"  value={metrics?.vehiclesInUse ?? "—"}  icon="🔑" color="bg-purple-50 text-purple-600" loading={loading} />
      </div>

      {/* REVENUE ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Revenue Today"   value={loading ? "—" : fmt(metrics?.revenueToday)}   icon="💰" color="bg-teal-50 text-teal-600"   loading={loading} />
        <StatCard title="Monthly Revenue" value={loading ? "—" : fmt(metrics?.monthlyRevenue)} icon="📅" color="bg-orange-50 text-orange-600" loading={loading} />
        <StatCard title="Yearly Revenue"  value={loading ? "—" : fmt(metrics?.yearlyRevenue)}  icon="📊" color="bg-indigo-50 text-indigo-600" loading={loading} />
      </div>

      {/* BOTTOM: ALERTS + RECENT BOOKINGS */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* ALERTS — live from bookings collection */}
        <div className="bg-white p-5 rounded-2xl border shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            🔔 Alerts
            {alerts.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
          </h2>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-gray-400 text-sm">
                <span className="text-3xl mb-2">🔕</span>
                No alerts at this time
              </div>
            ) : (
              alerts.map((a) => {
                const isDamaged = a._type === "damaged_part";
                return (
                <div
                  key={a.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${
                    isDamaged
                      ? "bg-red-50 border-red-100"
                      : a.status === "cancellation_request"
                      ? "bg-orange-50 border-orange-100"
                      : "bg-yellow-50 border-yellow-100"
                  }`}
                >
                  <span className="text-xl shrink-0">
                    {isDamaged ? "🔧" : a.status === "cancellation_request" ? "⚠️" : "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-snug">
                      {isDamaged
                        ? `${a.status === "Stolen" ? "Stolen" : "Damaged"} Part Detected`
                        : a.status === "cancellation_request" ? "Cancellation Request" : "New Booking Request"}
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
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center">
            📋 Recent Bookings
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
          <h2 className="font-semibold text-gray-800">📄 All Bookings</h2>
          <button onClick={fetchMetrics} className="text-xs text-teal-600 font-medium hover:underline">
            🔄 Refresh
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
