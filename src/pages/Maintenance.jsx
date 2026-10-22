import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../fireabase";
import { buildFlaggedParts, toMs } from "../utils/damagedParts";

const API_URL = process.env.REACT_APP_API_URL;
const PAGE_SIZE = 15;

// --- PAGINATION (same pattern as Bookings.jsx / Payments.jsx / Users.jsx) -----
function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp if the list shrinks (filter/search/refresh) and we were on a now-empty page.
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { page: safePage, setPage, totalPages, pageItems, start, count: items.length };
}

function Pagination({ page, totalPages, onChange, start, pageSize, count }) {
  if (totalPages <= 1) return null;

  const nums = [];
  const add = (n) => nums.push(n);
  add(1);
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) add(n);
  if (totalPages > 1) add(totalPages);
  const dedup = [...new Set(nums)].sort((a, b) => a - b);

  const rangeEnd = Math.min(start + pageSize, count);

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50/50">
      <p className="text-xs text-gray-400">
        Showing {count === 0 ? 0 : start + 1}–{rangeEnd} of {count}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Prev
        </button>
        {dedup.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - dedup[i - 1] > 1 && <span className="px-1.5 text-gray-300 text-xs">…</span>}
            <button onClick={() => onChange(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                n === page ? "bg-teal-600 text-white shadow" : "border text-gray-600 hover:bg-white"
              }`}>
              {n}
            </button>
          </span>
        ))}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Next
        </button>
      </div>
    </div>
  );
}

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
// Time-of-day only (e.g. "3:45 PM") — shown after the date, same "date | time" style as the Bookings table.
const fmtTime = (val) => {
  const d = toDate(val);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};
// Today as YYYY-MM-DD in the browser's local timezone. isoDate() goes through
// toISOString() (UTC), which returns *yesterday* between 12:00am and 8:00am in PH.
const localISODate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const isoDate = (val) => {
  const d = toDate(val);
  if (!d || isNaN(d)) return "";
  return d.toISOString().split("T")[0];
};
// ─── SORT HEADER — same clickable <th> as Bookings/Users/Refund Requests ───
const IconChevronsUpDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSortArrow = ({ dir, className = "w-3.5 h-3.5" }) => (
  <svg className={`${className} transition-transform ${dir === "desc" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
function SortableTh({ label, sortKey: key, sortKeyState, sortDir, onSort, className = "" }) {
  const active = sortKeyState === key;
  return (
    <th className={`px-4 py-3 text-left font-semibold select-none ${className}`}>
      <button
        onClick={() => onSort(key)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs px-1.5 py-1 -mx-1.5 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={sortDir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

const isPast = (val) => { const d = toDate(val); return d && d < new Date(); };
const isSoon = (val) => {
  const d = toDate(val);
  if (!d) return false;
  const diff = (d - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
};
const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;
// Same rule the "Overdue" stat card counts by: a Scheduled job whose own
// maintenanceDate has already passed. Kept as one shared predicate so the
// card's number, the row highlight, and the default sort order can never
// silently drift apart from each other.
const isOverdueJob = (r) => r.status === "Scheduled" && isPast(r.maintenanceDate);

const STATUS_DOT = {
  Completed:    "bg-green-500",
  Scheduled:    "bg-blue-500",
  Cancelled:    "bg-gray-400",
  Overdue:      "bg-red-500",
};
const STATUS_BG = {
  Completed:    "bg-green-50 border border-green-200",
  Scheduled:    "bg-blue-50 border border-blue-200",
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
const FALLBACK_STATUSES = ["Scheduled", "Completed", "Cancelled"];
const FALLBACK_BASIS    = ["Post-Rental", "Monthly", "Mileage-based", "Annual", "Repair/Unplanned"];
const PART_AFTER_OPTIONS = ["Good", "Damaged"]; // fixed — not read from the backend config

// Pre-fills the "After" condition: a job normally leaves the part Good. How it
// was fixed (repaired / replaced...) goes in the part's description.
// Same rule the backend uses when a job is completed without one chosen.
const defaultAfter = () => "Good";

const EMPTY_FORM = {
  carID: "", bookingID: "", basis: "",
  services: [],        // [{ serviceID, serviceName, price }] — from the catalog
  customServices: [],  // [{ name, price }] — free-text "Other" entries
  useManualTotal: false, // false = auto-compute from itemized services; true = use overrideTotal
  overrideTotal: "",
  description: "",
  maintenanceDate: "", status: "Scheduled",
  partsAddressed: [], // [{ carPartID, carPartName, conditionBefore, conditionAfter, price, description }] — parts this job works on
  useToday: false,      // true = maintenanceDate always mirrors today's date
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Maintenance() {
  const token = localStorage.getItem("token");
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

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
  const [viewing, setViewing]             = useState(false); // the open modal is read-only until "Edit" is clicked
  const [toast, setToast]                 = useState(null);
  const [showAllParts, setShowAllParts]   = useState(false); // attention strip: collapsed shows the first few flagged parts
  const [selectedDay, setSelectedDay]     = useState(null); // "YYYY-MM-DD" picked on the calendar; filters the table below
  const [calMonth, setCalMonth]           = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [damagedParts, setDamagedParts]   = useState([]);
  const [partNames, setPartNames]         = useState({}); // carPartID -> name, fallback for parts missing from the catalog
  // The open modal's car: every part with its catalog price, from /api/car-part-pricing/car/:carID
  const [catalog, setCatalog]             = useState({ carID: "", parts: [], loading: false });
  const [customName, setCustomName]       = useState("");
  const [customPrice, setCustomPrice]     = useState("");
  const [sortKey, setSortKey] = useState(null); // null = default (open first, soonest due on top)
  const [sortDir, setSortDir] = useState("asc");
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  // Predicate + highlight color for each stat card, keyed the same as the
  // card labels. Only one card can be "active" at a time (clicking a second
  // one swaps to it, clicking the active one again clears it). Matching
  // rows get pushed to the top of the default sort and get a tinted
  // highlight — nothing is filtered out of the table.
  const STAT_FILTERS = {
    overdue:   { predicate: isOverdueJob, rowClass: "bg-red-50/60 ring-1 ring-inset ring-red-200" },
    dueSoon:   { predicate: (r) => r.status === "Scheduled" && isSoon(r.maintenanceDate), rowClass: "bg-yellow-50/60 ring-1 ring-inset ring-yellow-200" },
    scheduled: { predicate: (r) => r.status === "Scheduled", rowClass: "bg-blue-50/60 ring-1 ring-inset ring-blue-200" },
    completed: { predicate: (r) => r.status === "Completed", rowClass: "bg-green-50/60 ring-1 ring-inset ring-green-200" },
  };
  const [activeStatFilter, setActiveStatFilter] = useState(null); // null | "overdue" | "dueSoon" | "scheduled" | "completed"
  const toggleStatFilter = (key) => {
    setActiveStatFilter((v) => {
      const next = v === key ? null : key;
      if (next) { setSortKey(null); setSortDir("asc"); }
      return next;
    });
  };

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
      setPartNames(Object.fromEntries(Object.entries(partsMap).map(([id, d]) => [id, d.carPartName || ""])));

      // Inspection records are history and never edited. A part is flagged
      // while the latest inspection lists it as damaged/stolen/missing AND no
      // Completed maintenance job has covered it since (utils/damagedParts.js).
      const toDocs = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const { flagged } = buildFlaggedParts({
        afterRecords:  toDocs(afterSnap),
        beforeRecords: toDocs(beforeSnap),
        jobs:          maintJson.data || [],
      });
      setDamagedParts(flagged.map(p => ({
        ...p,
        carPartName: p.carPartName || partsMap[p.carPartID]?.carPartName || "Unknown Part",
        carLabel:    carMap[p.carID]?.label || "Unknown Car",
      })));
    } catch (e) { console.error(e); showToast(e.message || "Failed to load data.", "error"); }
    finally { setLoading(false); }
  }, [authedFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Arrived via a "View Maintenance" / status-switch link from Fleet.jsx
  // (?carID=...) — open the add-record form pre-filled to that car instead
  // of leaving staff to find and select it themselves.
  //
  // Also handles ?bookingID=..., set alongside carID by Bookings.jsx's
  // "+ Post-Rental Maintenance" button (goToMaintenance). When a booking
  // is present this is a customer-caused repair being filed against a
  // specific rental, so basis defaults to "Post-Rental" too — staff can
  // still change it if that's wrong, this just saves the click for the
  // common case.
  useEffect(() => {
    const carID = searchParams.get("carID");
    const bookingID = searchParams.get("bookingID");
    // ?carPartID=... (Dashboard "Damaged Part" alert) is resolved by the effect below once the records have loaded.
    if (carID && !searchParams.get("carPartID")) {
      setForm((f) => ({ ...f, carID, bookingID: bookingID || "", basis: bookingID ? "Post-Rental" : f.basis }));
      setShowAdd(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arrived from a Dashboard "Damaged Part Detected" alert (?carID=...&carPartID=...).
  //   1. A Scheduled job on that car already covers the part -> open the most recent one (by its date).
  //   2. Otherwise -> open a new job for the car with just that part selected.
  // Only Scheduled jobs count: a Completed job didn't fix it (or the part was flagged again since), and
  // a Cancelled one isn't going to happen. Runs once, after the first load finishes.
  const partLinkHandled = useRef(false);
  useEffect(() => {
    const carID = searchParams.get("carID");
    const carPartID = searchParams.get("carPartID");
    if (!carID || !carPartID || loading || partLinkHandled.current) return;
    partLinkHandled.current = true;

    const existing = records
      .filter((r) => r.carID === carID && r.status === "Scheduled" && (r.partsAddressed || []).some((p) => p?.carPartID === carPartID))
      .sort((a, b) => toMs(b.maintenanceDate) - toMs(a.maintenanceDate) || toMs(b.updatedAt) - toMs(a.updatedAt))[0];
    if (existing) {
      openView(existing);
      showToast("This part is already on a scheduled maintenance job.");
      return;
    }

    const flagged = damagedParts.find((p) => p.carID === carID && p.carPartID === carPartID);
    const entry = flagged
      ? entryFromFlagged(flagged)
      : { carPartID, carPartName: partNames[carPartID] || "Unknown Part", conditionBefore: "Damaged", conditionAfter: defaultAfter(), price: undefined, description: "" };
    setForm({ ...EMPTY_FORM, carID, partsAddressed: [entry] });
    setCustomName(""); setCustomPrice("");
    setEditRecord(null);
    setViewing(false);
    setShowAdd(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, records, damagedParts]);

  // Arrived from a notification-bell click ("Maintenance Created" / "Maintenance Overdue"): the bell sends
  // ?open=<maintenance doc id> (Header.jsx, same ?open= convention as Bookings / Users / Penalties), so open that
  // record in its read-only view. Runs once after the first load; the param is then dropped so a refresh or a
  // later navigation does not re-open it. A record that is gone (deleted / archived since) gets a toast instead
  // of a silent landing on the list.
  const openLinkHandled = useRef(false);
  useEffect(() => {
    const openID = searchParams.get("open");
    if (!openID || loading || openLinkHandled.current) return;
    openLinkHandled.current = true;
    const match = records.find((r) => r.id === openID);
    if (match) openView(match);
    else showToast("That maintenance record could not be found. It may have been deleted or archived.", "error");
    setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, records]);

  // Arrived straight from a Return on Car Tracking (see confirmReturn
  // there) — tell staff why the form is open instead of silently landing
  // here. Closing the form skips post-rental maintenance.
  useEffect(() => {
    if (location.state?.returnedBooking) {
      showToast("Car returned. Add its post-rental maintenance below, or close the form to skip.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overdue   = records.filter(r => r.status === "Scheduled" && isPast(r.maintenanceDate)).length;
  const dueSoon   = records.filter(r => r.status === "Scheduled" && isSoon(r.maintenanceDate)).length;
  const scheduled = records.filter(r => r.status === "Scheduled").length;
  const completed = records.filter(r => r.status === "Completed").length;

  const servicesTotal = useMemo(() => {
    const catalogSum = form.services.reduce((s, x) => s + (Number(x.price) || 0), 0);
    const customSum  = form.customServices.reduce((s, x) => s + (Number(x.price) || 0), 0);
    return catalogSum + customSum;
  }, [form.services, form.customServices]);
  const partsTotal = useMemo(
    () => form.partsAddressed.reduce((s, p) => s + (Number(p.price) || 0), 0),
    [form.partsAddressed]
  );
  const computedTotal = servicesTotal + partsTotal;

  const modalOpen = showAdd || !!editRecord;
  const closeModal = useCallback(() => { setEditRecord(null); setShowAdd(false); setViewing(false); }, []);

  // Esc closes the modal.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => { if (e.key === "Escape" && !saving) closeModal(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal, saving]);

  // Load the chosen car's parts + catalog prices while the modal is open.
  useEffect(() => {
    if (!modalOpen || !form.carID) { setCatalog({ carID: "", parts: [], loading: false }); return; }
    let cancelled = false;
    setCatalog({ carID: form.carID, parts: [], loading: true });
    (async () => {
      try {
        const res = await authedFetch(`/api/car-part-pricing/car/${form.carID}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Failed to load parts.");
        if (!cancelled) setCatalog({ carID: form.carID, parts: json.data || [], loading: false });
      } catch (e) {
        if (!cancelled) { setCatalog({ carID: form.carID, parts: [], loading: false }); showToast(e.message || "Couldn't load this vehicle's parts.", "error"); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, form.carID, authedFetch]);

  const catalogByID = useMemo(
    () => Object.fromEntries(catalog.parts.map(p => [p.carPartID, p])),
    [catalog.parts]
  );
  const flaggedByPart = useMemo(
    () => Object.fromEntries(damagedParts.filter(p => p.carID === form.carID).map(p => [p.carPartID, p])),
    [damagedParts, form.carID]
  );

  // Rows added before the catalog finished loading (Schedule Fix / pre-selected
  // damaged parts) get their catalog price once it arrives. Rows that already
  // have a price — including saved ones being edited — are never touched.
  useEffect(() => {
    if (catalog.loading || catalog.carID !== form.carID) return;
    setForm(f => {
      if (!f.partsAddressed.some(p => p.price === undefined)) return f;
      return { ...f, partsAddressed: f.partsAddressed.map(p => p.price === undefined ? { ...p, price: catalogByID[p.carPartID]?.price ?? 0 } : p) };
    });
  }, [catalog.loading, catalog.carID, catalogByID, form.carID]);

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
        bookingID:           form.bookingID || null,
        basis:                form.basis,
        services,
        overrideTotal:        form.useManualTotal && form.overrideTotal !== "" ? Number(form.overrideTotal) : null,
        description:          form.description,
        maintenanceDate:      form.maintenanceDate,
        status:               form.status,
        partsAddressed:       form.partsAddressed.map(p => ({
          carPartID:       p.carPartID,
          conditionBefore: p.conditionBefore,
          conditionAfter:  p.conditionAfter === "Damaged" ? "Damaged" : "Good",
          description:     (p.description || "").trim(),
          price:           Number(p.price) || 0,
        })),
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
      bookingID:           r.bookingID || "",
      basis:                r.basis || "",
      services:             allServices.filter(s => s.serviceID !== "other"),
      customServices:       allServices.filter(s => s.serviceID === "other").map(s => ({ name: s.serviceName, price: s.price })),
      useManualTotal:       r.overrideTotal !== null && r.overrideTotal !== undefined,
      overrideTotal:        r.overrideTotal ?? "",
      description:          r.description || "",
      maintenanceDate:      isoDate(r.maintenanceDate),
      status:               r.status || "Scheduled",
      // Saved entries are { carPartID, conditionBefore, conditionAfter, description, price }.
      // Older ones lack some of that (and carry a name) — price falls back to 0 so a
      // legacy job's total isn't changed just by opening and saving it.
      partsAddressed:       (r.partsAddressed || []).map(p => ({
        carPartID:       p.carPartID,
        carPartName:     p.carPartName || "",
        conditionBefore: p.conditionBefore || undefined, // keep unknown (older records) unknown — never overwrite with "Good"
        conditionAfter:  p.conditionAfter === "Damaged" ? "Damaged" : "Good",
        description:     p.description || "",
        price:           p.price ?? 0,
      })),
    });
    setEditRecord(r);
    setShowAdd(false);
    setViewing(false);
  };

  // Same modal, read-only. Its "Edit" button unlocks the form (setViewing(false)).
  const openView = (r) => {
    openEdit(r);
    setViewing(true);
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setCustomName(""); setCustomPrice("");
    setEditRecord(null);
    setViewing(false);
    setShowAdd(true);
  };

  // "Confirm" on a Scheduled row: the same edit modal, with the status already set to Completed.
  // Nothing is saved until "Update" is clicked, so the date, the parts' After conditions, prices and
  // the total can be checked (and changed) first.
  const openConfirm = (r) => {
    openEdit(r);
    setForm(f => ({ ...f, status: "Completed" }));
  };

  // A flagged part as a row for the modal. The price stays undefined until the
  // car's catalog has loaded (see the effect above), then becomes its catalog price.
  const entryFromFlagged = (p) => ({
    carPartID:       p.carPartID,
    carPartName:     p.carPartName,
    conditionBefore: p.status,                 // Damaged | Stolen | Missing
    conditionAfter:  defaultAfter(p.status),
    price:           undefined,
    description:     "",
  });

  // "Schedule Fix" on a banner: opens the modal for that vehicle with the part
  // already on the job. Nothing about the part changes until the job is Completed.
  const openScheduleForPart = (part) => {
    setForm({ ...EMPTY_FORM, carID: part.carID, partsAddressed: [entryFromFlagged(part)] });
    setCustomName(""); setCustomPrice("");
    setEditRecord(null);
    setShowAdd(true);
  };

  // Choosing a vehicle in the modal. A new job starts with that vehicle's
  // still-flagged parts already on it (remove any you won't fix). Changing the
  // vehicle of a saved job clears its parts — they belong to the old car.
  const onCarChange = (carID) => {
    setForm(f => ({
      ...f,
      carID,
      partsAddressed: editRecord || !carID ? [] : damagedParts.filter(p => p.carID === carID).map(entryFromFlagged),
    }));
  };

  const addPart = (carPartID) => {
    const cat = catalogByID[carPartID];
    if (!cat) return;
    const cond = flaggedByPart[carPartID]?.status || "Good";
    setForm(f => f.partsAddressed.some(p => p.carPartID === carPartID) ? f : ({
      ...f,
      partsAddressed: [...f.partsAddressed, {
        carPartID,
        carPartName:     cat.carPartName,
        conditionBefore: cond,
        conditionAfter:  defaultAfter(cond),
        price:           cat.price ?? 0,
        description:     "",
      }],
    }));
  };

  const updatePart = (carPartID, patch) => {
    setForm(f => ({ ...f, partsAddressed: f.partsAddressed.map(p => p.carPartID === carPartID ? { ...p, ...patch } : p) }));
  };

  const removePart = (carPartID) => {
    setForm(f => ({ ...f, partsAddressed: f.partsAddressed.filter(p => p.carPartID !== carPartID) }));
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
  // Table order: unfinished work first, soonest due date on top (overdue lands
  // above everything), so nothing urgent hides on a later page. Finished /
  // cancelled records follow in the backend's newest-first order (stable sort).
  // Clicking a header switches to that sort; with no header chosen, fall
  // back to the original business-rule order (open work first, soonest due
  // date on top of that).
  const sortedRecords = sortKey ? [...records].sort((a, b) => {
    let av, bv;
    if (sortKey === "vehicle") {
      const c = (a.carLabel || "").localeCompare(b.carLabel || "");
      return sortDir === "asc" ? c : -c;
    } else if (sortKey === "plate") {
      const c = (a.plateNumber || "").localeCompare(b.plateNumber || "");
      return sortDir === "asc" ? c : -c;
    } else if (sortKey === "created") { av = toDate(a.createdAt)?.getTime() || 0; bv = toDate(b.createdAt)?.getTime() || 0; }
    else if (sortKey === "date") { av = toDate(a.maintenanceDate)?.getTime() || 0; bv = toDate(b.maintenanceDate)?.getTime() || 0; }
    else if (sortKey === "cost")   { av = a.totalCost || 0; bv = b.totalCost || 0; }
    return sortDir === "asc" ? av - bv : bv - av;
  }) : [...records].sort((a, b) => {
    if (activeStatFilter) {
      const pred = STAT_FILTERS[activeStatFilter].predicate;
      const aM = pred(a), bM = pred(b);
      if (aM !== bM) return aM ? -1 : 1;
    }
    const aOD = isOverdueJob(a), bOD = isOverdueJob(b);
    if (aOD !== bOD) return aOD ? -1 : 1;
    const aOpen = !["Completed", "Cancelled"].includes(a.status);
    const bOpen = !["Completed", "Cancelled"].includes(b.status);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (!aOpen) return 0;
    const da = toDate(a.maintenanceDate)?.getTime() || Infinity;
    const db_ = toDate(b.maintenanceDate)?.getTime() || Infinity;
    return da === db_ ? 0 : da < db_ ? -1 : 1;
  });

  const filtered = sortedRecords.filter(r => {
    const q = search.toLowerCase();
    const serviceNames = (r.services || []).map(s => s.serviceName).join(" ").toLowerCase();
    const matchQ = !q
      || (r.carLabel || "").toLowerCase().includes(q)
      || (r.plateNumber || "").toLowerCase().includes(q)
      || (r.basis || "").toLowerCase().includes(q)
      || (r.description || "").toLowerCase().includes(q)
      || serviceNames.includes(q);
    const matchS = statusFilter === "All" || r.status === statusFilter;
    const matchD = !selectedDay || (toDate(r.maintenanceDate) && localISODate(toDate(r.maintenanceDate)) === selectedDay);
    return matchQ && matchS && matchD;
  });

  // The table is paginated and day-filtered; the calendar and stat cards keep reading all records.
  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(filtered, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter, sortKey, sortDir, activeStatFilter, selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full px-4 space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[70] px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
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
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={<IconAlertCircle className="w-5 h-5" />} value={overdue}   label="Overdue"       color="red"
          onClick={() => toggleStatFilter("overdue")} active={activeStatFilter === "overdue"} />
        <StatCard icon={<IconWarning     className="w-5 h-5" />} value={dueSoon}   label="Due This Week" color="yellow"
          onClick={() => toggleStatFilter("dueSoon")} active={activeStatFilter === "dueSoon"} />
        <StatCard icon={<IconWrench      className="w-5 h-5" />} value={scheduled} label="Scheduled"     color="blue"
          onClick={() => toggleStatFilter("scheduled")} active={activeStatFilter === "scheduled"} />
        <StatCard icon={<IconCheck       className="w-5 h-5" />} value={completed} label="Completed"     color="green"
          onClick={() => toggleStatFilter("completed")} active={activeStatFilter === "completed"} />
      </div>

      {/* Parts Attention strip — one compact card; first few parts shown, the rest expand */}
      {damagedParts.length > 0 && (() => {
        const PREVIEW = 4;
        const stolen  = damagedParts.filter(p => p.status === "Stolen");
        const damaged = damagedParts.filter(p => p.status === "Damaged" || p.status === "Missing");
        const ordered = [...stolen, ...damaged]; // stolen first — most urgent
        const visible = showAllParts ? ordered : ordered.slice(0, PREVIEW);
        const hidden  = ordered.length - visible.length;
        const hasStolen = stolen.length > 0;
        return (
          <div className={`bg-white rounded-2xl border shadow-soft p-4 space-y-3 ${hasStolen ? "border-purple-200" : "border-red-200"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <IconAlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-gray-800 font-bold text-sm">Parts Need Attention</span>
              {damaged.length > 0 && (
                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">{damaged.length} damaged / missing</span>
              )}
              {hasStolen && (
                <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-semibold">
                  <IconSiren className="w-3 h-3" />{stolen.length} stolen
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto hidden sm:inline">
                {hasStolen ? "File a police report for stolen parts. " : ""}Schedule Fix opens a job with the part already added.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {visible.map(p => {
                const isStolen = p.status === "Stolen";
                const box   = isStolen ? "bg-purple-50 text-purple-700" : "bg-red-50 text-red-700";
                const badge = isStolen ? "bg-purple-200 text-purple-800" : p.status === "Missing" ? "bg-orange-200 text-orange-800" : "bg-red-200 text-red-800";
                return (
                  <div key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${box}`}>
                    <span>{p.carPartName} — {p.carLabel}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${badge}`}>{p.status}</span>
                    <span className="opacity-60 text-[10px]">({SOURCE_LABEL[p.source] || "before trip"})</span>
                    <button onClick={() => openScheduleForPart(p)}
                      className="ml-1 px-2 py-0.5 rounded-lg bg-teal-600 text-white text-[10px] font-bold hover:bg-teal-700 transition-colors">
                      🔧 Schedule Fix
                    </button>
                  </div>
                );
              })}
              {ordered.length > PREVIEW && (
                <button onClick={() => setShowAllParts(v => !v)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  {showAllParts ? "Show less" : `+${hidden} more`}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* CALENDAR — always visible; clicking a day filters the table below */}
      <MaintenanceCalendar
        records={records}
        calMonth={calMonth}
        setCalMonth={setCalMonth}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      {/* Under the calendar: day filter chip (left) + Schedule button (right) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          {selectedDay && (
            <span className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold">
              Showing {fmtDate(selectedDay + "T00:00:00")} · {count} record{count === 1 ? "" : "s"}
              <button onClick={() => setSelectedDay(null)} title="Show all records"
                className="w-5 h-5 rounded-full hover:bg-teal-100 flex items-center justify-center">
                <IconX className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
        <button onClick={openAdd}
          className="px-4 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 font-semibold">
          + Schedule
        </button>
      </div>

      {/* TABLE */}
      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{width:"15%"}} /><col style={{width:"15%"}} /><col style={{width:"10%"}} /><col style={{width:"13%"}} />
              <col style={{width:"12%"}} /><col style={{width:"9%"}} /><col style={{width:"12%"}} /><col style={{width:"14%"}} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                <SortableTh label="Created" sortKey="created" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Vehicle" sortKey="vehicle" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Plate No." sortKey="plate" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left font-semibold">Basis</th>
                <SortableTh label="Date" sortKey="date" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Cost" sortKey="cost" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({length:5}).map((_,i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({length:8}).map((_,j) => (
                      <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4"/></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">{selectedDay ? "No maintenance records on this day." : "No maintenance records found."}</td></tr>
              ) : paginated.map((r, i) => {
                const isEditing = editRecord?.id === r.id;
                const statMatch = activeStatFilter && STAT_FILTERS[activeStatFilter].predicate(r);
                const rowClass = isEditing
                  ? "bg-teal-50/50 ring-1 ring-inset ring-teal-200"
                  : statMatch
                  ? STAT_FILTERS[activeStatFilter].rowClass
                  : i % 2 === 1 ? "bg-gray-50/20" : "";
                return (
                <tr key={r.id} onClick={() => openView(r)}
                  className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-teal-50/30 transition-colors ${rowClass}`}>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <span className="text-gray-700">{fmtDate(r.createdAt)}</span>
                    <span className="mx-1.5 text-gray-300">|</span>
                    <span className="text-gray-500">{fmtTime(r.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 text-xs truncate">{r.carLabel}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-gray-600 whitespace-nowrap truncate">{r.plateNumber || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-700 truncate">
                    {r.basis ? `${BASIS_ICON[r.basis] || ""} ${r.basis}` : "—"}
                  </td>
                  <td className={`px-4 py-3 text-xs whitespace-nowrap ${isOverdueJob(r) ? "text-red-500 font-semibold" : "text-gray-500"}`}>
                    <span className="inline-flex items-center gap-1">
                      {fmtDate(r.maintenanceDate)}
                      {isOverdueJob(r) && (
                        <IconAlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {r.totalCost ? peso(r.totalCost) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <MainStatusBadge status={r.status || "—"} />
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "Scheduled" ? (
                      <button onClick={e => { e.stopPropagation(); openConfirm(r); }}
                        className="text-xs px-2.5 py-1 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors font-semibold">
                        Confirm
                      </button>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); openView(r); }}
                        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors font-medium">
                        View
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
        </div>

      </div>

      {/* Schedule / Edit modal */}
      {modalOpen && (
        <MaintenanceModal
          form={form} setForm={setForm} config={config} cars={cars}
          editRecord={editRecord} saving={saving}
          viewing={viewing} onEdit={() => setViewing(false)}
          onClose={closeModal} onSave={handleSave} onCarChange={onCarChange}
          servicesTotal={servicesTotal} partsTotal={partsTotal} computedTotal={computedTotal}
          toggleService={toggleService} updateServicePrice={updateServicePrice}
          customName={customName} setCustomName={setCustomName}
          customPrice={customPrice} setCustomPrice={setCustomPrice}
          addCustomService={addCustomService} removeCustomService={removeCustomService}
          catalog={catalog} catalogByID={catalogByID} flaggedByPart={flaggedByPart} partNames={partNames}
          addPart={addPart} updatePart={updatePart} removePart={removePart}
        />
      )}
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────

function StatCard({ icon, value, label, color, onClick, active }) {
  const colors = { red: "text-red-500", yellow: "text-yellow-600", blue: "text-blue-600", green: "text-green-600" };
  const bgColors = { red: "bg-red-50 text-red-500", yellow: "bg-yellow-50 text-yellow-600", blue: "bg-blue-50 text-blue-600", green: "bg-green-50 text-green-600" };
  const activeRing = {
    red: "border-red-300 ring-2 ring-red-100",
    yellow: "border-yellow-300 ring-2 ring-yellow-100",
    blue: "border-blue-300 ring-2 ring-blue-100",
    green: "border-green-300 ring-2 ring-green-100",
  };
  const clickable = typeof onClick === "function";
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={onClick}
      aria-pressed={clickable ? !!active : undefined}
      className={`w-full text-left bg-white rounded-2xl border shadow-soft p-4 flex items-center gap-3 transition-all ${
        active ? activeRing[color] || "border-gray-300 ring-2 ring-gray-100" : "border-gray-100"
      } ${clickable ? "cursor-pointer hover:border-gray-200 hover:shadow-md" : ""}`}
    >
      <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${bgColors[color] || "bg-gray-100 text-gray-600"}`}>
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-bold ${colors[color] || "text-gray-800"}`}>{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </Tag>
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

// ─── PART BADGE ──────────────────────────────────────────────────────────────

// Where a flagged part came from (see utils/damagedParts.js).
const SOURCE_LABEL = { after_trip: "after trip", before_trip: "before trip", maintenance: "found in a job" };

const PART_BADGE = {
  Good:     "bg-green-50 text-green-700 border-green-200",
  Damaged:  "bg-red-50 text-red-700 border-red-200",
  Missing:  "bg-orange-50 text-orange-700 border-orange-200",
  Stolen:   "bg-purple-50 text-purple-700 border-purple-200",
};

function PartBadge({ label }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${PART_BADGE[label] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {label}
    </span>
  );
}

const IconLock = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M8 11V7a4 4 0 118 0v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

function ModalSection({ n, title, hint, children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{n}</span>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// ─── MAINTENANCE MODAL ───────────────────────────────────────────────────────
// Three sections — Job (what/when), Work (services + parts), Total.
// Parts: pick from the vehicle's own parts (name · catalog price · condition).
// A picked part is a row with a locked name, the condition it was in, what the
// job does to it, and a price you can change. That price is saved on the job
// only — it never changes the catalog price.

function MaintenanceModal({
  form, setForm, config, cars, editRecord, saving, viewing, onEdit,
  onClose, onSave, onCarChange,
  servicesTotal, partsTotal, computedTotal,
  toggleService, updateServicePrice,
  customName, setCustomName, customPrice, setCustomPrice, addCustomService, removeCustomService,
  catalog, catalogByID, flaggedByPart, partNames,
  addPart, updatePart, removePart,
}) {
  const car = cars.find(c => c.id === form.carID);
  const afterOptions = PART_AFTER_OPTIONS;

  const addedIDs       = new Set(form.partsAddressed.map(p => p.carPartID));
  const available      = catalog.parts.filter(p => !addedIDs.has(p.carPartID));
  const needsAttention = available.filter(p => flaggedByPart[p.carPartID]);
  const others         = available.filter(p => !flaggedByPart[p.carPartID]);
  const optionLabel = (p) =>
    `${p.carPartName} — ${p.price != null ? peso(p.price) : "no price set"}${flaggedByPart[p.carPartID] ? ` · ${flaggedByPart[p.carPartID].status}` : ""}`;

  const effectiveTotal = form.useManualTotal && form.overrideTotal !== "" ? Number(form.overrideTotal) || 0 : computedTotal;
  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none disabled:bg-gray-50 disabled:text-gray-500";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={viewing ? "Maintenance details" : editRecord ? "Edit maintenance record" : "Schedule maintenance"}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 text-base">{viewing ? "Maintenance Details" : editRecord ? "Edit Maintenance" : "Schedule Maintenance"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {car ? `${car.label}${car.plateNumber ? ` · ${car.plateNumber}` : ""}` : "Choose a vehicle to begin"}
            </p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Close" className="w-8 h-8 disabled:opacity-40 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* View mode: the whole form is a disabled fieldset, so nothing can be changed until "Edit". */}
          <fieldset disabled={viewing} className="space-y-7 min-w-0 border-0 p-0 m-0">

          {/* 1 · JOB */}
          <ModalSection n="1" title="Job">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Vehicle *">
                <select value={form.carID} onChange={e => onCarChange(e.target.value)} className={inputCls}>
                  <option value="">Select vehicle…</option>
                  {cars.map(c => <option key={c.id} value={c.id}>{c.label} {c.plateNumber ? `· ${c.plateNumber}` : ""}</option>)}
                </select>
              </Field>

              <Field label="Maintenance Date *">
                <div className="flex items-center gap-3">
                  <input type="date" value={form.maintenanceDate} disabled={form.useToday}
                    onChange={e => setForm(f => ({ ...f, maintenanceDate: e.target.value }))}
                    className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`} />
                  <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                    <input type="checkbox" checked={form.useToday}
                      onChange={e => setForm(f => ({
                        ...f,
                        useToday: e.target.checked,
                        maintenanceDate: e.target.checked ? localISODate() : f.maintenanceDate,
                        status: e.target.checked ? "Completed" : f.status,
                      }))}
                      className="accent-teal-600" />
                    <span className="text-xs text-gray-600">Today</span>
                  </label>
                </div>
              </Field>

              <div className="md:col-span-2">
                <Field label="Maintenance Basis *">
                  <div className="flex flex-wrap gap-1.5">
                    {config.basisOptions.map(b => (
                      <button key={b} type="button" onClick={() => setForm(f => ({ ...f, basis: b }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                          form.basis === b ? "border-teal-500 bg-teal-50 text-teal-700" : "border-gray-100 text-gray-600 hover:border-gray-300"
                        }`}>
                        {BASIS_ICON[b] || ""} {b}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <Field label="Status">
                <div className="flex gap-1.5">
                  {config.statusOptions.map(s => (
                    <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                        form.status === s ? "border-teal-500 bg-teal-50 text-teal-700" : "border-gray-100 text-gray-600 hover:border-gray-300"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
                {form.status === "Completed" && form.partsAddressed.length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">Completing marks each part below as done and updates its condition.</p>
                )}
              </Field>

              {form.bookingID ? (
                <div className="rounded-xl bg-teal-50 border border-teal-200 px-3 py-2 text-xs text-teal-700 flex items-center justify-between gap-2 self-end">
                  <span>Linked to booking <span className="font-semibold">{form.bookingID}</span></span>
                  <button type="button" onClick={() => setForm(f => ({ ...f, bookingID: "" }))}
                    className="text-teal-500 hover:text-teal-700 underline shrink-0">Unlink</button>
                </div>
              ) : <div className="hidden md:block" />}

              <div className="md:col-span-2">
                <Field label="Job Notes">
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} placeholder="What the mechanic found, where it was done, anything worth remembering…"
                    className={`${inputCls} resize-none`} />
                </Field>
              </div>
            </div>
          </ModalSection>

          {/* 2 · WORK */}
          <ModalSection n="2" title="Work" hint="services done and parts handled">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

              {/* Services */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Services Performed</p>
                <div className="max-h-80 overflow-y-auto pr-1 space-y-3 border border-gray-100 rounded-xl p-3">
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
                              {selected && (
                                <input type="number" min="0" placeholder="₱0" value={selected.price || ""}
                                  onChange={e => updateServicePrice(s.serviceID, e.target.value)}
                                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-arl-light outline-none" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Other</p>
                    {form.customServices.map((c, idx) => (
                      <div key={idx} className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs text-gray-700 flex-1 truncate">{c.name}</span>
                        <span className="text-xs text-gray-500">{peso(c.price)}</span>
                        <button type="button" onClick={() => removeCustomService(idx)} className="text-gray-400 hover:text-red-500">
                          <IconX className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-1.5">
                      <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                        placeholder="Custom service…"
                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-arl-light outline-none" />
                      <input type="number" min="0" value={customPrice} onChange={e => setCustomPrice(e.target.value)}
                        placeholder="₱0"
                        className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-arl-light outline-none" />
                      <button type="button" onClick={addCustomService}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-teal-400 hover:text-teal-600">+</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Parts */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Parts {form.partsAddressed.length > 0 && <span className="text-gray-300">· {form.partsAddressed.length}</span>}
                </p>

                {!form.carID ? (
                  <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl px-3 py-4 text-center">
                    Select a vehicle to load its parts.
                  </p>
                ) : (
                  <>
                    <select value="" onChange={e => e.target.value && addPart(e.target.value)}
                      disabled={catalog.loading || available.length === 0}
                      className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}>
                      <option value="">
                        {catalog.loading ? "Loading parts…" : available.length === 0 ? (catalog.parts.length === 0 ? "This vehicle has no parts on record" : "All parts added") : "+ Select parts…"}
                      </option>
                      {needsAttention.length > 0 && (
                        <optgroup label="Needs attention">
                          {needsAttention.map(p => <option key={p.carPartID} value={p.carPartID}>{optionLabel(p)}</option>)}
                        </optgroup>
                      )}
                      {others.length > 0 && (
                        <optgroup label="Other parts">
                          {others.map(p => <option key={p.carPartID} value={p.carPartID}>{optionLabel(p)}</option>)}
                        </optgroup>
                      )}
                    </select>

                    {form.partsAddressed.length === 0 ? (
                      <p className="text-xs text-gray-400 px-1">No parts on this job yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {form.partsAddressed.map(p => {
                          const cat = catalogByID[p.carPartID];
                          const name = cat?.carPartName || p.carPartName || partNames[p.carPartID] || "Removed part";
                          const differs = cat && cat.price != null && Number(p.price) !== Number(cat.price);
                          return (
                            <div key={p.carPartID} className="rounded-xl border border-gray-200 p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="relative flex-1 min-w-0">
                                  <input readOnly value={name} tabIndex={-1} title="Part names can't be edited here"
                                    className="w-full bg-gray-100 border border-gray-200 rounded-lg pl-7 pr-2.5 py-1.5 text-xs font-semibold text-gray-700 cursor-not-allowed outline-none" />
                                  <IconLock className="w-3 h-3 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                </div>
                                <button type="button" onClick={() => removePart(p.carPartID)} aria-label={`Remove ${name}`}
                                  className="text-gray-400 hover:text-red-500 shrink-0"><IconX className="w-3.5 h-3.5" /></button>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-gray-400">Before</span>
                                <PartBadge label={p.conditionBefore} />
                                <span className="text-gray-300 text-xs">→</span>
                                <span className="text-[11px] text-gray-400">After</span>
                                <select value={p.conditionAfter === "Damaged" ? "Damaged" : "Good"} onChange={e => updatePart(p.carPartID, { conditionAfter: e.target.value })}
                                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-arl-light outline-none">
                                                                    {afterOptions.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="relative w-32 shrink-0">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₱</span>
                                  <input type="number" min="0" value={p.price ?? ""} placeholder="0"
                                    onChange={e => updatePart(p.carPartID, { price: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-xs focus:ring-2 focus:ring-arl-light outline-none" />
                                </div>
                                {cat && cat.price != null && (
                                  <span className="text-[11px] text-gray-400 truncate">
                                    Catalog {peso(cat.price)}
                                    {differs && (
                                      <button type="button" onClick={() => updatePart(p.carPartID, { price: cat.price })}
                                        className="ml-1.5 text-teal-600 hover:underline">reset</button>
                                    )}
                                  </span>
                                )}
                                {cat && cat.price == null && <span className="text-[11px] text-gray-400">No catalog price</span>}
                              </div>

                              <input type="text" value={p.description || ""} placeholder="What was done (e.g. repaired / replaced with new OEM unit)"
                                onChange={e => updatePart(p.carPartID, { description: e.target.value })}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-arl-light outline-none" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400 px-1">
                      Prices here belong to this job only — they never change the catalog price.
                    </p>
                  </>
                )}
              </div>
            </div>
          </ModalSection>

          </fieldset>
        </div>

        {/* Total — pinned under the scrolling body so it is always visible */}
        <div className="shrink-0 px-6 py-2 border-t border-gray-100">
          <fieldset disabled={viewing} className="min-w-0 m-0 border-0 p-0">
            <h3 className="text-sm font-bold text-gray-800 mb-1.5">Total</h3>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600"><span>Services</span><span>{peso(servicesTotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Parts</span><span>{peso(partsTotal)}</span></div>
              <div className="flex justify-between text-gray-500 border-t border-gray-200 pt-1 text-xs">
                <span>Sum of the above</span><span>{peso(computedTotal)}</span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.useManualTotal}
                  onChange={e => setForm(f => ({ ...f, useManualTotal: e.target.checked }))}
                  className="accent-teal-600" />
                <span className="text-xs text-gray-600">Enter the total manually instead (replaces the sum)</span>
              </label>
              {form.useManualTotal && (
                <input type="number" min="0" value={form.overrideTotal}
                  onChange={e => setForm(f => ({ ...f, overrideTotal: e.target.value }))}
                  placeholder="₱0" className={inputCls} />
              )}

              <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="text-lg font-bold text-gray-900 leading-tight">{peso(effectiveTotal)}</span>
              </div>
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          {viewing ? (
            <>
              <span className="mr-auto text-xs text-gray-400">Read-only. Click Edit to make changes.</span>
              <button onClick={onClose}
                className="px-5 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Close</button>
              <button onClick={onEdit}
                className="px-6 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700">Edit</button>
            </>
          ) : (
            <>
              <button onClick={onClose}
                className="px-5 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={onSave} disabled={saving || catalog.loading}
                className="px-6 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40">
                {saving ? "Saving…" : editRecord ? "Update" : "Schedule"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAINTENANCE CALENDAR ────────────────────────────────────────────────────

function MaintenanceCalendar({ records, calMonth, setCalMonth, selectedDay, onSelectDay }) {
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
  });

  const DOT = {
    Completed:    "bg-green-500",
    Scheduled:    "bg-blue-500",
    Cancelled:    "bg-gray-400",
    Overdue:      "bg-red-500",
  };
  // A Scheduled job whose date has passed shows as Overdue (matches the table + stat card).
  const dotOf = (r) => (isOverdueJob(r) ? DOT.Overdue : DOT[r.status] || "bg-gray-300");

  const prevMonth = () => { if (m === 0) setCalMonth({ y: y - 1, m: 11 }); else setCalMonth({ y, m: m - 1 }); };
  const nextMonth = () => { if (m === 11) setCalMonth({ y: y + 1, m: 0 }); else setCalMonth({ y, m: m + 1 }); };

  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

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
            const dayRecs  = dayMap[day] || [];
            const hasRecs  = dayRecs.length > 0;
            const iso      = localISODate(new Date(y, m, day));
            const isSel    = selectedDay === iso;
            return (
              <button key={i}
                onClick={() => onSelectDay(isSel ? null : iso)}
                className={`relative min-h-[60px] p-1.5 rounded-xl text-left transition-all border ${
                  isSel ? "border-teal-600 bg-teal-100 ring-2 ring-teal-300"
                  : isToday ? "border-teal-500 bg-teal-50"
                  : hasRecs ? "border-gray-200 hover:border-teal-300 hover:bg-gray-50"
                  : "border-transparent hover:bg-gray-50"
                }`}>
                <span className={`text-xs font-semibold ${isToday ? "text-teal-600" : "text-gray-700"}`}>{day}</span>
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {dayRecs.slice(0, 3).map((r, ri) => (
                    <span key={ri} className={`w-2 h-2 rounded-full ${dotOf(r)}`} title={`${r.basis} — ${r.status}`} />
                  ))}
                  {dayRecs.length > 3 && (
                    <span className="text-xs text-gray-400 leading-none">+{dayRecs.length - 3}</span>
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
        </div>
      </div>

    </div>
  );
}