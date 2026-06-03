import { useState, useEffect, useCallback } from "react";
import {
  collection, getDocs, query, where, doc,
  updateDoc, addDoc, serverTimestamp, orderBy
} from "firebase/firestore";
import { db } from "../fireabase";

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

const MAINTENANCE_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled", "Overdue"];
const MAINTENANCE_TYPES    = ["Routine Maintenance", "Oil Change", "Brake Inspection", "Tire Rotation", "Battery Check", "Engine Check", "Transmission Service", "Suspension Check", "Electrical Check", "Other"];

const EMPTY_FORM = {
  carID: "", type: "", description: "", cost: "",
  maintenanceDate: "", nextMaintenanceDate: "", status: "Scheduled",
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Maintenance() {
  const [records, setRecords]             = useState([]);
  const [cars, setCars]                   = useState([]);
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

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

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

  const fetchCars = useCallback(async () => {
    const [carsSnap, brandsSnap, modelsSnap] = await Promise.all([
      getDocs(collection(db, "cars")),
      getDocs(collection(db, "brand")),
      getDocs(collection(db, "model")),
    ]);
    const brandMap = Object.fromEntries(brandsSnap.docs.map(d => [d.id, d.data()]));
    const modelMap = Object.fromEntries(modelsSnap.docs.map(d => [d.id, d.data()]));
    return carsSnap.docs.map(d => {
      const c     = { id: d.id, ...d.data() };
      const model = modelMap[c.modelID] || {};
      const brand = brandMap[model.brandID] || {};
      return { ...c, label: `${brand.brandName || ""} ${model.modelName || ""}`.trim() || d.id };
    });
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [carList, maintSnap, beforeSnap, afterSnap, partsSnap] = await Promise.all([
        fetchCars(),
        getDocs(query(collection(db, "carMaintenance"), orderBy("maintenanceDate", "desc"))),
        getDocs(collection(db, "inventoryBeforeTrip")),
        getDocs(collection(db, "inventoryAfterTrip")),
        getDocs(collection(db, "carParts")),
      ]);
      setCars(carList);
      const carMap = Object.fromEntries(carList.map(c => [c.id, c]));
      setRecords(maintSnap.docs.map(d => ({
        id: d.id, ...d.data(),
        carLabel:    carMap[d.data().carID]?.label || "—",
        plateNumber: carMap[d.data().carID]?.platenumber || carMap[d.data().carID]?.plateNumber || "—",
      })));

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
    } catch (e) { console.error(e); showToast("Failed to load data.", "error"); }
    finally { setLoading(false); }
  }, [fetchCars]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const overdue   = records.filter(r => r.status === "Overdue" || (r.status !== "Completed" && r.status !== "Cancelled" && isPast(r.nextMaintenanceDate))).length;
  const dueSoon   = records.filter(r => isSoon(r.nextMaintenanceDate) && r.status !== "Completed" && r.status !== "Cancelled").length;
  const inService = records.filter(r => r.status === "In Progress").length;
  const completed = records.filter(r => r.status === "Completed").length;

  const handleSave = async () => {
    if (!form.carID || !form.type || !form.maintenanceDate) {
      showToast("Car, type, and maintenance date are required.", "error"); return;
    }
    setSaving(true);
    try {
      const payload = {
        carID:               form.carID,
        type:                form.type,
        description:         form.description,
        cost:                Number(form.cost) || 0,
        maintenanceDate:     form.maintenanceDate ? new Date(form.maintenanceDate) : null,
        nextMaintenanceDate: form.nextMaintenanceDate ? new Date(form.nextMaintenanceDate) : null,
        status:              form.status,
      };
      if (editRecord) {
        await updateDoc(doc(db, "carMaintenance", editRecord.id), { ...payload, updatedAt: serverTimestamp() });
        showToast("Record updated.");
      } else {
        const ref = await addDoc(collection(db, "carMaintenance"), { ...payload, createdAt: serverTimestamp() });
        await updateDoc(ref, { maintenanceID: ref.id });
        showToast("Maintenance scheduled.");
      }
      setEditRecord(null); setShowAdd(false); setForm(EMPTY_FORM);
      fetchAll();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const openEdit = (r) => {
    setForm({
      carID:               r.carID || "",
      type:                r.type || "",
      description:         r.description || "",
      cost:                r.cost || "",
      maintenanceDate:     isoDate(r.maintenanceDate),
      nextMaintenanceDate: isoDate(r.nextMaintenanceDate),
      status:              r.status || "Scheduled",
    });
    setEditRecord(r);
    setShowAdd(false);
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditRecord(null);
    setShowAdd(true);
  };

  const ALL_STATUSES = ["All", ...MAINTENANCE_STATUSES];
  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q
      || (r.carLabel || "").toLowerCase().includes(q)
      || (r.plateNumber || "").toLowerCase().includes(q)
      || (r.type || "").toLowerCase().includes(q)
      || (r.description || "").toLowerCase().includes(q);
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
          <input type="text" placeholder="Search car, type…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light w-44" />
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
              <col style={{width:"20%"}} /><col style={{width:"16%"}} /><col style={{width:"14%"}} />
              <col style={{width:"14%"}} /><col style={{width:"8%"}} /><col style={{width:"14%"}} />
              <col style={{width:"14%"}} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-semibold">Vehicle</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
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
                  <td className="px-4 py-3 text-xs text-gray-700 truncate">{r.type || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.maintenanceDate)}</td>
                  <td className={`px-4 py-3 text-xs whitespace-nowrap font-semibold ${isPast(r.nextMaintenanceDate) && r.status !== "Completed" ? "text-red-500" : isSoon(r.nextMaintenanceDate) ? "text-yellow-600" : "text-gray-500"}`}>
                    {fmtDate(r.nextMaintenanceDate)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {r.cost ? `₱${Number(r.cost).toLocaleString()}` : "—"}
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
          <div className="w-80 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-4 sticky top-4">
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
                {cars.map(c => <option key={c.id} value={c.id}>{c.label} {c.platenumber ? `· ${c.platenumber}` : ""}</option>)}
              </select>
            </Field>
            <Field label="Maintenance Type *">
              <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none">
                <option value="">Select type…</option>
                {MAINTENANCE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))}
                rows={3} placeholder="Details of the maintenance…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none resize-none" />
            </Field>
            <Field label="Cost (₱)">
              <input type="number" value={form.cost} onChange={e => setForm(f => ({...f, cost: e.target.value}))}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none" />
            </Field>
            <Field label="Maintenance Date *">
              <input type="date" value={form.maintenanceDate} onChange={e => setForm(f => ({...f, maintenanceDate: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none" />
            </Field>
            <Field label="Next Maintenance Date">
              <input type="date" value={form.nextMaintenanceDate} onChange={e => setForm(f => ({...f, nextMaintenanceDate: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none" />
            </Field>
            <Field label="Status">
              <div className="grid grid-cols-2 gap-1.5">
                {MAINTENANCE_STATUSES.map(s => (
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
    const d = r.maintenanceDate?.toDate?.() || (r.maintenanceDate?._seconds ? new Date(r.maintenanceDate._seconds * 1000) : r.maintenanceDate ? new Date(r.maintenanceDate) : null);
    if (!d || isNaN(d)) return;
    if (d.getFullYear() === y && d.getMonth() === m) {
      const k = d.getDate();
      if (!dayMap[k]) dayMap[k] = [];
      dayMap[k].push(r);
    }
    const nd = r.nextMaintenanceDate?.toDate?.() || (r.nextMaintenanceDate?._seconds ? new Date(r.nextMaintenanceDate._seconds * 1000) : r.nextMaintenanceDate ? new Date(r.nextMaintenanceDate) : null);
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
                    <span key={ri} className={`w-2 h-2 rounded-full ${DOT[r.status] || "bg-gray-300"}`} title={`${r.type} — ${r.status}`} />
                  ))}
                  {nextRecs.slice(0, 2).map((r, ri) => (
                    <span key={`n${ri}`} className="w-2 h-2 rounded-full bg-purple-400 border border-purple-300" title={`Next: ${r.type}`} />
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
                    <p className="text-xs text-gray-500">{r.type}{r._isNext ? " (Next Due)" : ""}</p>
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