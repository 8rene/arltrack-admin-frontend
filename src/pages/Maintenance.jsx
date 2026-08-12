import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../fireabase";

const API_URL = process.env.REACT_APP_API_URL;

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconAlertCircle = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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

const IconCheck = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconClipboard = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.75" />
    <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconCalendar = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconKey = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 12h8M18 12v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconSiren = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2v2M4.22 4.22l1.42 1.42M2 12h2M20 12h2M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M7 13a5 5 0 0110 0v1H7v-1z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    <rect x="5" y="14" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const toDate = (val) => {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val?._seconds) return new Date(val._seconds * 1000);
  return new Date(val);
};
const fmtDate = (val) => {
  const d = toDate(val);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
const isoDate = (val) => {
  const d = toDate(val);
  if (!d || isNaN(d)) return "";
  return d.toISOString().split("T")[0];
};
const isPast = (val) => { const d = toDate(val); return d && d < new Date(); };
const isSoon = (val) => {
  const d = toDate(val);
  if (!d) return false;
  const diff = (d - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
};
const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;

const STATUS_DOT = {
  Completed:    "bg-green-500",
  Scheduled:    "bg-blue-500",
  "In Progress":"bg-yellow-400",
  Cancelled:    "bg-gray-400",
  Overdue:      "bg-red-500",
};
const STATUS_BG = {
  Completed:    "bg-green-50 border border-green-200",
  Scheduled:    "bg-blue-50 border border-blue-200",
  "In Progress":"bg-yellow-50 border border-yellow-200",
  Cancelled:    "bg-gray-100 border border-gray-200",
  Overdue:      "bg-red-50 border border-red-200",
};

function MainStatusBadge({ status }) {
  const dot = STATUS_DOT[status] || "bg-gray-400";
  const bg  = STATUS_BG[status]  || "bg-gray-50 border border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-black ${bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {status}
    </span>
  );
}

// Emoji shown next to each basis option — purely cosmetic, not stored.
const BASIS_ICON = {
  "Post-Rental":      "🔄",
  "Monthly":          "📅",
  "Mileage-based":    "📍",
  "Annual":           "📆",
  "Repair/Unplanned": "🔧",
};

// Fallbacks used only if /api/maintenance/config hasn't loaded yet —
// the real source of truth is always the backend response.
const FALLBACK_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled", "Overdue"];
const FALLBACK_BASIS    = ["Post-Rental", "Monthly", "Mileage-based", "Annual", "Repair/Unplanned"];

const EMPTY_FORM = {
  carID: "", basis: "",
  services: [],        // [{ serviceID, serviceName, price }] — from the catalog
  customServices: [],  // [{ name, price }] — free-text "Other" entries
  useManualTotal: false, // false = auto-compute from itemized services; true = use overrideTotal
  overrideTotal: "",
  description: "",
  maintenanceDate: "", nextMaintenanceDate: "", status: "Scheduled",
  useToday: false,      // true = maintenanceDate always mirrors today's date
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Maintenance() {
  const token = localStorage.getItem("token");
  const [searchParams] = useSearchParams();

  const [records, setRecords]             = useState([]);
  const [cars, setCars]                   = useState([]);
  const [config, setConfig]               = useState({ basisOptions: FALLBACK_BASIS, statusOptions: FALLBACK_STATUSES, serviceCatalog: [] });
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState("All");
  const [editRecord, setEditRecord]       = useState(null);
  const [showAdd, setShowAdd]             = useState(false);
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState(null);
  const [view, setView]                   = useState("table");
  const [calMonth, setCalMonth]           = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [damagedParts, setDamagedParts]   = useState([]);
  const [replacedParts, setReplacedParts] = useState([]);
  const [customName, setCustomName]       = useState("");
  const [customPrice, setCustomPrice]     = useState("");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
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

  // Damaged/stolen part tracking still reads Firestore directly — this
  // belongs to the inventory/carParts domain, not maintenance, so it's
  // left as-is here.
  const markAsReplaced = async (part) => {
    try {
      await updateDoc(doc(db, "carParts", part.carPartID), {
        status: "Replaced",
        replacedAt: serverTimestamp(),
        replacedType: part.status,
      });
      setDamagedParts(prev => prev.filter(p => p.id !== part.id));
      setReplacedParts(prev => {
        if (prev.find(p => p.id === part.id)) return prev;
        return [...prev, { ...part, replacedAt: new Date() }];
      });
      showToast(`${part.carPartName} marked as replaced.`);
    } catch (e) {
      showToast("Failed to mark as replaced: " + e.message, "error");
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [maintRes, carsRes, configRes, beforeSnap, afterSnap, partsSnap] = await Promise.all([
        authedFetch("/api/maintenance"),
        authedFetch("/api/fleet/cars"),
        authedFetch("/api/maintenance/config"),
        getDocs(collection(db, "inventoryBeforeTrip")),
        getDocs(collection(db, "inventoryAfterTrip")),
        getDocs(collection(db, "carParts")),
      ]);

      const maintJson = await maintRes.json();
      if (!maintRes.ok) throw new Error(maintJson.message || "Failed to load maintenance records.");
      setRecords((maintJson.data || []).map(r => ({
        ...r,
        carLabel: [r.brandName, r.modelName].filter(Boolean).join(" ") || "—",
      })));

      const carsJson = await carsRes.json();
      if (!carsRes.ok) throw new Error(carsJson.message || "Failed to load vehicles.");
      const carList = (carsJson.data || []).map(c => ({
        ...c,
        label: [c.brandName, c.modelName].filter(Boolean).join(" ") || c.id,
      }));
      setCars(carList);
      const carMap = Object.fromEntries(carList.map(c => [c.id, c]));

      const configJson = await configRes.json();
      if (configRes.ok) setConfig(configJson.data);

      const partsMap = Object.fromEntries(partsSnap.docs.map(d => [d.id, d.data()]));
      const pickLatestByCarID = (snap) => {
        const byCarID = {};
        snap.docs.forEach(d => {
          const data = { id: d.id, ...d.data() };
          const cid  = data.carID;
          if (!cid) return;
          const existing = byCarID[cid];
          const ts  = data.recordedAt?._seconds ?? 0;
          const ets = existing?.recordedAt?._seconds ?? -1;
          if (!existing || ts > ets) byCarID[cid] = data;
        });
        return Object.values(byCarID);
      };

      const latestBefore = pickLatestByCarID(beforeSnap);
      const latestAfter  = pickLatestByCarID(afterSnap);
      const carIDsWithRecords = new Set([
        ...latestBefore.map(r => r.carID),
        ...latestAfter.map(r => r.carID),
      ]);
      const beforeByCarID = Object.fromEntries(latestBefore.map(r => [r.carID, r]));
      const afterByCarID  = Object.fromEntries(latestAfter.map(r => [r.carID, r]));

      const damaged = [];
      carIDsWithRecords.forEach(carID => {
        const afterRec  = afterByCarID[carID];
        const beforeRec = beforeByCarID[carID];
        const record    = afterRec || beforeRec;
        if (!record) return;
        const carLabel = carMap[carID]?.label || "Unknown Car";
        const source   = afterRec ? "after_trip" : "before_trip";
        (record.damageParts || []).forEach(p => {
          if (!["Damaged", "Stolen", "Missing"].includes(p.status)) return;
          const partName = p.carPartName || partsMap[p.carPartID]?.carPartName || "Unknown Part";
          damaged.push({
            id:          `${carID}_${p.carPartID}`,
            carPartID:   p.carPartID,
            carPartName: partName,
            status:      p.status,
            carID,
            carLabel,
            source,
            bookingID:   record.bookingID,
          });
        });
      });

      setDamagedParts(damaged);
    } catch (e) { console.error(e); showToast(e.message || "Failed to load data.", "error"); }
    finally { setLoading(false); }
  }, [authedFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Arrived via a "View Maintenance" / status-switch link from Fleet.jsx
  // (?carID=...) — open the add-record form pre-filled to that car instead
  // of leaving staff to find and select it themselves.
  useEffect(() => {
    const carID = searchParams.get("carID");
    if (carID) {
      setForm((f) => ({ ...f, carID }));
      setShowAdd(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overdue   = records.filter(r => r.status === "Overdue" || (r.status !== "Completed" && r.status !== "Cancelled" && isPast(r.nextMaintenanceDate))).length;
  const dueSoon   = records.filter(r => isSoon(r.nextMaintenanceDate) && r.status !== "Completed" && r.status !== "Cancelled").length;
  const inService = records.filter(r => r.status === "In Progress").length;
  const completed = records.filter(r => r.status === "Completed").length;

  const computedTotal = useMemo(() => {
    const catalogSum = form.services.reduce((s, x) => s + (Number(x.price) || 0), 0);
    const customSum  = form.customServices.reduce((s, x) => s + (Number(x.price) || 0), 0);
    return catalogSum + customSum;
  }, [form.services, form.customServices]);

  const handleSave = async () => {
    if (!form.carID || !form.basis || !form.maintenanceDate) {
      showToast("Vehicle, basis, and maintenance date are required.", "error"); return;
    }
    setSaving(true);
    try {
      const services = [
        ...form.services.map(s => ({ serviceID: s.serviceID, price: Number(s.price) || 0 })),
        ...form.customServices
          .filter(c => c.name.trim())
          .map(c => ({ serviceID: "other", serviceName: c.name.trim(), price: Number(c.price) || 0 })),
      ];

      const payload = {
        carID:               form.carID,
        basis:                form.basis,
        services,
        overrideTotal:        form.useManualTotal && form.overrideTotal !== "" ? Number(form.overrideTotal) : null,
        description:          form.description,
        maintenanceDate:      form.maintenanceDate,
        nextMaintenanceDate:  form.nextMaintenanceDate || null,
        status:               form.status,
      };

      const res = editRecord
        ? await authedFetch(`/api/maintenance/${editRecord.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await authedFetch("/api/maintenance", { method: "POST", body: JSON.stringify(payload) });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save maintenance record.");

      showToast(editRecord ? "Record updated." : "Maintenance scheduled.");
      setEditRecord(null); setShowAdd(false); setForm(EMPTY_FORM); setCustomName(""); setCustomPrice("");
      fetchAll();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const openEdit = (r) => {
    const allServices = r.services || [];
    setForm({
      carID:               r.carID || "",
      basis:                r.basis || "",
      services:             allServices.filter(s => s.serviceID !== "other"),
      customServices:       allServices.filter(s => s.serviceID === "other").map(s => ({ name: s.serviceName, price: s.price })),
      useManualTotal:       r.overrideTotal !== null && r.overrideTotal !== undefined,
      overrideTotal:        r.overrideTotal ?? "",
      description:          r.description || "",
      maintenanceDate:      isoDate(r.maintenanceDate),
      nextMaintenanceDate:  isoDate(r.nextMaintenanceDate),
      status:               r.status || "Scheduled",
    });
    setEditRecord(r);
    setShowAdd(false);
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setCustomName(""); setCustomPrice("");
    setEditRecord(null);
    setShowAdd(true);
  };

  const toggleService = (serviceID, serviceName) => {
    setForm(f => {
      const exists = f.services.find(s => s.serviceID === serviceID);
      return exists
        ? { ...f, services: f.services.filter(s => s.serviceID !== serviceID) }
        : { ...f, services: [...f.services, { serviceID, serviceName, price: 0 }] };
    });
  };

  const updateServicePrice = (serviceID, price) => {
    setForm(f => ({ ...f, services: f.services.map(s => s.serviceID === serviceID ? { ...s, price } : s) }));
  };

  const addCustomService = () => {
    const name = customName.trim();
    if (!name) return;
    setForm(f => ({ ...f, customServices: [...f.customServices, { name, price: Number(customPrice) || 0 }] }));
    setCustomName(""); setCustomPrice("");
  };

  const removeCustomService = (idx) => {
    setForm(f => ({ ...f, customServices: f.customServices.filter((_, i) => i !== idx) }));
  };

  const ALL_STATUSES = ["All", ...config.statusOptions];
  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    const serviceNames = (r.services || []).map(s => s.serviceName).join(" ").toLowerCase();
    const matchQ = !q
      || (r.carLabel || "").toLowerCase().includes(q)
      || (r.plateNumber || "").toLowerCase().includes(q)
      || (r.basis || "").toLowerCase().includes(q)
      || (r.description || "").toLowerCase().includes(q)
      || serviceNames.includes(q);
    const matchS = statusFilter === "All" || r.status === statusFilter;
    return matchQ && matchS;
  });

  const isOpen = showAdd || !!editRecord;

  return (
    <div className="w-full px-4 space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Maintenance</h1>
          <p className="text-xs text-gray-400 mt-0.5">{loading ? "Loading…" : `${records.length} records`}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="text" placeholder="Search car, basis, service…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light w-48" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <button onClick={fetchAll} disabled={loading}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">↺</button>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            <button onClick={() => setView("table")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${view === "table" ? "bg-white text-arl-dark shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <IconClipboard className="w-3.5 h-3.5" /> Table
            </button>
            <button onClick={() => setView("calendar")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${view === "calendar" ? "bg-white text-arl-dark shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <IconCalendar className="w-3.5 h-3.5" /> Calendar
            </button>
          </div>
          <button onClick={openAdd}
            className="px-4 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 font-semibold">
            + Schedule
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={<IconAlertCircle className="w-5 h-5" />} value={overdue}   label="Overdue"       color="red" />
        <StatCard icon={<IconWarning     className="w-5 h-5" />} value={dueSoon}   label="Due This Week" color="yellow" />
        <StatCard icon={<IconWrench      className="w-5 h-5" />} value={inService} label="In Progress"   color="blue" />
        <StatCard icon={<IconCheck       className="w-5 h-5" />} value={completed} label="Completed"     color="green" />
      </div>

      {/* Parts Attention Panel */}
      {(damagedParts.length > 0 || replacedParts.length > 0) && (
        <div className="space-y-3">
          {damagedParts.length > 0 && (() => {
            const damagedOnly = damagedParts.filter(p => p.status === "Damaged" || p.status === "Missing");
            const stolenOnly  = damagedParts.filter(p => p.status === "Stolen");
            return (
              <>
                {damagedOnly.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <IconAlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      <span className="text-red-500 font-bold text-sm">Damaged Parts Require Attention</span>
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">{damagedOnly.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {damagedOnly.map(p => (
                        <div key={p.id} className="flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-1.5 rounded-xl text-xs font-medium">
                          <span>{p.carPartName} — {p.carLabel}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${p.status === "Missing" ? "bg-orange-200 text-orange-800" : "bg-red-200 text-red-800"}`}>{p.status}</span>
                          <span className="text-red-400 text-[10px]">({p.source === "after_trip" ? "after trip" : "before trip"})</span>
                          <button onClick={() => markAsReplaced(p)}
                            className="ml-1 px-2 py-0.5 rounded-lg bg-green-500 text-white text-[10px] font-bold hover:bg-green-600 transition-colors">
                            ✓ Mark Replaced
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-red-500">Schedule maintenance for affected vehicles. Click <strong>Mark Replaced</strong> once the part has been replaced.</p>
                  </div>
                )}
                {stolenOnly.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <IconSiren className="w-4 h-4 text-purple-600 shrink-0" />
                      <span className="text-purple-600 font-bold text-sm">Stolen Parts Require Attention</span>
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-semibold">{stolenOnly.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {stolenOnly.map(p => (
                        <div key={p.id} className="flex items-center gap-1.5 bg-purple-100 text-purple-700 px-3 py-1.5 rounded-xl text-xs font-medium">
                          <span>{p.carPartName} — {p.carLabel}</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-200 text-purple-800">Stolen</span>
                          <span className="text-purple-400 text-[10px]">({p.source === "after_trip" ? "after trip" : "before trip"})</span>
                          <button onClick={() => markAsReplaced(p)}
                            className="ml-1 px-2 py-0.5 rounded-lg bg-green-500 text-white text-[10px] font-bold hover:bg-green-600 transition-colors">
                            ✓ Mark Replaced
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-purple-500">File a police report if needed. Click <strong>Mark Replaced</strong> once the stolen part has been replaced.</p>
                  </div>
                )}
              </>
            );
          })()}

          {replacedParts.filter(p => p.status !== "Stolen").length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <IconWrench className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-green-600 font-bold text-sm">Replaced Damaged Car Parts</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">{replacedParts.filter(p => p.status !== "Stolen").length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {replacedParts.filter(p => p.status !== "Stolen").map(p => (
                  <span key={p.id} className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1.5 rounded-xl text-xs font-medium">
                    <IconCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <span>{p.carPartName} — {p.carLabel}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-200 text-green-800">Replaced</span>
                    {p.replacedAt && (
                      <span className="text-green-400 text-[10px]">
                        {p.replacedAt instanceof Date ? p.replacedAt.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : ""}
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs text-green-600">These damaged parts have been replaced and resolved. Consider scheduling a full maintenance checkup.</p>
            </div>
          )}

          {replacedParts.filter(p => p.status === "Stolen").length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <IconKey className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-blue-600 font-bold text-sm">Replaced Stolen Car Parts</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{replacedParts.filter(p => p.status === "Stolen").length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {replacedParts.filter(p => p.status === "Stolen").map(p => (
                  <span key={p.id} className="flex items-center gap-1.5 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-xl text-xs font-medium">
                    <IconCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>{p.carPartName} — {p.carLabel}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-200 text-blue-800">Replaced</span>
                    {p.replacedAt && (
                      <span className="text-blue-400 text-[10px]">
                        {p.replacedAt instanceof Date ? p.replacedAt.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : ""}
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs text-blue-600">These stolen parts have been replaced. Ensure all insurance and police report documentation is filed.</p>
            </div>
          )}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {view === "calendar" && (
        <MaintenanceCalendar
          records={records}
          calMonth={calMonth}
          setCalMonth={setCalMonth}
          onEditRecord={openEdit}
        />
      )}

      {/* TABLE VIEW */}
      {view === "table" && <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{width:"20%"}} /><col style={{width:"18%"}} /><col style={{width:"13%"}} />
              <col style={{width:"13%"}} /><col style={{width:"10%"}} /><col style={{width:"12%"}} />
              <col style={{width:"14%"}} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-semibold">Vehicle</th>
                <th className="px-4 py-3 text-left font-semibold">Basis</th>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Next Due</th>
                <th className="px-4 py-3 text-left font-semibold">Cost</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({length:5}).map((_,i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({length:7}).map((_,j) => (
                      <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4"/></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-gray-400 text-sm">No maintenance records found.</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} onClick={() => openEdit(r)}
                  className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-teal-50/30 transition-colors ${editRecord?.id === r.id ? "bg-teal-50/50 ring-1 ring-inset ring-teal-200" : i%2===1 ? "bg-gray-50/20" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 text-xs truncate">{r.carLabel}</div>
                    <div className="text-xs text-gray-400">{r.plateNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 truncate">
                    {r.basis ? `${BASIS_ICON[r.basis] || ""} ${r.basis}` : "—"}
                    {r.services?.length > 0 && (
                      <div className="text-[10px] text-gray-400">{r.services.length} service{r.services.length > 1 ? "s" : ""}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.maintenanceDate)}</td>
                  <td className={`px-4 py-3 text-xs whitespace-nowrap font-semibold ${isPast(r.nextMaintenanceDate) && r.status !== "Completed" ? "text-red-500" : isSoon(r.nextMaintenanceDate) ? "text-yellow-600" : "text-gray-500"}`}>
                    {fmtDate(r.nextMaintenanceDate)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {r.totalCost ? peso(r.totalCost) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <MainStatusBadge status={r.status || "—"} />
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={e => { e.stopPropagation(); openEdit(r); }}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors font-medium">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Edit / Add Panel */}
        {isOpen && (
          <div className="w-96 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-4 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800 text-sm">
                {editRecord ? "Edit Record" : "Schedule Maintenance"}
              </h2>
              <button onClick={() => { setEditRecord(null); setShowAdd(false); }}
                className="text-gray-400 hover:text-gray-600">
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <Field label="Vehicle *">
              <select value={form.carID} onChange={e => setForm(f => ({...f, carID: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none">
                <option value="">Select vehicle…</option>
                {cars.map(c => <option key={c.id} value={c.id}>{c.label} {c.plateNumber ? `· ${c.plateNumber}` : ""}</option>)}
              </select>
            </Field>

            <Field label="Maintenance Basis *">
              <div className="flex flex-wrap gap-1.5">
                {config.basisOptions.map(b => (
                  <button key={b} type="button" onClick={() => setForm(f => ({...f, basis: b}))}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                      form.basis === b ? "border-teal-500 bg-teal-50 text-teal-700" : "border-gray-100 text-gray-600 hover:border-gray-300"
                    }`}>
                    {BASIS_ICON[b] || ""} {b}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Services Performed">
              <div className="max-h-72 overflow-y-auto pr-1 space-y-3 border border-gray-100 rounded-xl p-3">
                {config.serviceCatalog.map(group => (
                  <div key={group.group}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{group.group}</p>
                    <div className="space-y-1.5">
                      {group.services.map(s => {
                        const selected = form.services.find(x => x.serviceID === s.serviceID);
                        return (
                          <div key={s.serviceID} className="flex items-center gap-2">
                            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                              <input type="checkbox" checked={!!selected}
                                onChange={() => toggleService(s.serviceID, s.serviceName)}
                                className="accent-teal-600 shrink-0" />
                              <span className="text-xs text-gray-700 truncate">{s.serviceName}</span>
                            </label>
                            {selected && !form.useManualTotal && (
                              <input type="number" placeholder="₱0" value={selected.price || ""}
                                onChange={e => updateServicePrice(s.serviceID, e.target.value)}
                                className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-arl-light outline-none" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Custom / "Other" services */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Other</p>
                  {form.customServices.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-gray-700 flex-1 truncate">{c.name}</span>
                      {!form.useManualTotal && <span className="text-xs text-gray-500">{peso(c.price)}</span>}
                      <button type="button" onClick={() => removeCustomService(idx)} className="text-gray-400 hover:text-red-500">
                        <IconX className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                      placeholder="Custom service…"
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-arl-light outline-none" />
                    {!form.useManualTotal && (
                      <input type="number" value={customPrice} onChange={e => setCustomPrice(e.target.value)}
                        placeholder="₱0"
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-arl-light outline-none" />
                    )}
                    <button type="button" onClick={addCustomService}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-teal-400 hover:text-teal-600">
                      +
                    </button>
                  </div>
                </div>
              </div>
            </Field>

            <Field label="Total Cost">
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input type="checkbox" checked={form.useManualTotal}
                  onChange={e => setForm(f => ({...f, useManualTotal: e.target.checked}))}
                  className="accent-teal-600" />
                <span className="text-xs text-gray-600">Enter total manually instead of itemizing</span>
              </label>

              {form.useManualTotal ? (
                <input type="number" value={form.overrideTotal} onChange={e => setForm(f => ({...f, overrideTotal: e.target.value}))}
                  placeholder="₱0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none" />
              ) : (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="text-xs text-gray-500">Auto-computed from services</span>
                  <span className="text-sm font-bold text-gray-800">{peso(computedTotal)}</span>
                </div>
              )}
            </Field>

            <Field label="Description">
              <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))}
                rows={3} placeholder="Details of the maintenance…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none resize-none" />
            </Field>
            <Field label="Maintenance Date *">
              <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
                <input type="checkbox" checked={form.useToday}
                  onChange={e => setForm(f => ({...f, useToday: e.target.checked, maintenanceDate: e.target.checked ? isoDate(new Date()) : f.maintenanceDate}))}
                  className="accent-teal-600" />
                <span className="text-xs text-gray-600">Today</span>
              </label>
              <input type="date" value={form.maintenanceDate} disabled={form.useToday}
                onChange={e => setForm(f => ({...f, maintenanceDate: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none disabled:bg-gray-50 disabled:text-gray-400" />
            </Field>
            <Field label="Next Maintenance Date">
              <input type="date" value={form.nextMaintenanceDate} onChange={e => setForm(f => ({...f, nextMaintenanceDate: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none" />
              <p className="text-[10px] text-gray-400 mt-1">Optional — leave blank if this maintenance has no follow-up scheduled.</p>
            </Field>
            <Field label="Status">
              <div className="grid grid-cols-2 gap-1.5">
                {config.statusOptions.map(s => (
                  <button key={s} onClick={() => setForm(f => ({...f, status: s}))}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                      form.status === s
                        ? "border-teal-500 bg-teal-50 text-teal-700"
                        : "border-gray-100 text-gray-600 hover:border-gray-300"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setEditRecord(null); setShowAdd(false); }}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40">
                {saving ? "Saving…" : editRecord ? "Update" : "Schedule"}
              </button>
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────

function StatCard({ icon, value, label, color }) {
  const colors = { red: "text-red-500", yellow: "text-yellow-600", blue: "text-blue-600", green: "text-green-600" };
  const bgColors = { red: "bg-red-50 text-red-500", yellow: "bg-yellow-50 text-yellow-600", blue: "bg-blue-50 text-blue-600", green: "bg-green-50 text-green-600" };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4 flex items-center gap-3">
      <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${bgColors[color] || "bg-gray-100 text-gray-600"}`}>
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-bold ${colors[color] || "text-gray-800"}`}>{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

// ─── FIELD ────────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

// ─── MAINTENANCE CALENDAR ────────────────────────────────────────────────────

function MaintenanceCalendar({ records, calMonth, setCalMonth, onEditRecord }) {
  const { y, m } = calMonth;
  const monthName = new Date(y, m, 1).toLocaleString("en-PH", { month: "long", year: "numeric" });

  const firstDay    = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today       = new Date();

  const dayMap = {};
  records.forEach(r => {
    const d = toDate(r.maintenanceDate);
    if (!d || isNaN(d)) return;
    if (d.getFullYear() === y && d.getMonth() === m) {
      const k = d.getDate();
      if (!dayMap[k]) dayMap[k] = [];
      dayMap[k].push(r);
    }
    const nd = toDate(r.nextMaintenanceDate);
    if (!nd || isNaN(nd)) return;
    if (nd.getFullYear() === y && nd.getMonth() === m) {
      const k = `next_${nd.getDate()}`;
      if (!dayMap[k]) dayMap[k] = [];
      dayMap[k].push({ ...r, _isNext: true });
    }
  });

  const DOT = {
    Completed:    "bg-green-500",
    Scheduled:    "bg-blue-500",
    "In Progress":"bg-yellow-500",
    Cancelled:    "bg-gray-400",
    Overdue:      "bg-red-500",
  };

  const prevMonth = () => { if (m === 0) setCalMonth({ y: y - 1, m: 11 }); else setCalMonth({ y, m: m - 1 }); };
  const nextMonth = () => { if (m === 11) setCalMonth({ y: y + 1, m: 0 }); else setCalMonth({ y, m: m + 1 }); };

  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">‹</button>
          <h2 className="font-bold text-gray-800 text-base">{monthName}</h2>
          <button onClick={nextMonth}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">›</button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const isToday  = today.getDate() === day && today.getMonth() === m && today.getFullYear() === y;
            const dayRecs  = dayMap[day]           || [];
            const nextRecs = dayMap[`next_${day}`] || [];
            const allRecs  = [...dayRecs, ...nextRecs];
            const hasRecs  = allRecs.length > 0;
            return (
              <button key={i}
                onClick={() => setSelected(hasRecs ? { day, recs: allRecs } : null)}
                className={`relative min-h-[60px] p-1.5 rounded-xl text-left transition-all border ${
                  isToday ? "border-teal-500 bg-teal-50"
                  : hasRecs ? "border-gray-200 hover:border-teal-300 hover:bg-gray-50"
                  : "border-transparent hover:bg-gray-50"
                }`}>
                <span className={`text-xs font-semibold ${isToday ? "text-teal-600" : "text-gray-700"}`}>{day}</span>
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {dayRecs.slice(0, 3).map((r, ri) => (
                    <span key={ri} className={`w-2 h-2 rounded-full ${DOT[r.status] || "bg-gray-300"}`} title={`${r.basis} — ${r.status}`} />
                  ))}
                  {nextRecs.slice(0, 2).map((r, ri) => (
                    <span key={`n${ri}`} className="w-2 h-2 rounded-full bg-purple-400 border border-purple-300" title={`Next: ${r.basis}`} />
                  ))}
                  {allRecs.length > 3 && (
                    <span className="text-xs text-gray-400 leading-none">+{allRecs.length - 3}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-100">
          {Object.entries(DOT).map(([s, cls]) => (
            <span key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-2.5 h-2.5 rounded-full ${cls}`}/>{s}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400"/>Next Due
          </span>
        </div>
      </div>

      {selected && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-sm">
              {new Date(y, m, selected.day).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </h3>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
              <IconX className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {selected.recs.map((r, i) => (
              <div key={i}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:border-teal-300 transition-colors ${r._isNext ? "border-purple-200 bg-purple-50" : "border-gray-100 bg-gray-50"}`}
                onClick={() => { onEditRecord(r); setSelected(null); }}>
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${r._isNext ? "bg-purple-400" : DOT[r.status] || "bg-gray-300"}`}/>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{r.carLabel}</p>
                    <p className="text-xs text-gray-500">{r.basis}{r._isNext ? " (Next Due)" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!r._isNext && <MainStatusBadge status={r.status} />}
                  <span className="text-xs text-teal-500 font-medium">Edit →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}