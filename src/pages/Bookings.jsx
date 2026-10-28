import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import usePolling from "../hooks/usePolling";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import DeleteBundleModal from "../components/shared/DeleteBundleModal";
import { ROLES } from "../config/pagePermissions";
import TripMapModal from "../components/TripMapModal";
import { readCodingWarnings, warningsByCity } from "../utils/codingWarnings";
import StoreLocationMapPicker from "../components/shared/StoreLocationMapPicker";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Same shape MyTrips.jsx's tripStops() builds for TripMapModal — pickup,
// dropoff, and any extra stops the customer selected at booking time
// (booking.geofenceZones, now resolved by getAllBookings alongside
// pickupLocation/dropoffLocation — see booking.service.js's
// resolveHistoryInfo). Kept as its own small copy here rather than a
// shared import: duplicating small resolvers/helpers per-module is the
// existing convention in this codebase (see driverDispatch.service.js).
const SAME_SPOT_DEG = 0.0005;
const isSameSpot = (a, b) =>
  !!a && !!b && Math.abs(a.lat - b.lat) < SAME_SPOT_DEG && Math.abs(a.lng - b.lng) < SAME_SPOT_DEG;

function tripStops(booking) {
  const stops = [];
  if (booking.pickupLocation) stops.push({ key: "pickup", type: "pickup", ...booking.pickupLocation });
  if (booking.dropoffLocation) stops.push({ key: "dropoff", type: "dropoff", ...booking.dropoffLocation });
  (booking.geofenceZones || []).forEach((zone, i) => {
    if (typeof zone.lat !== "number" || typeof zone.lng !== "number") return;
    const label = (zone.label || "").toLowerCase();
    if (label.includes("pickup") || label.includes("drop")) return;
    if (isSameSpot(zone, booking.pickupLocation) || isSameSpot(zone, booking.dropoffLocation)) return;
    stops.push({ key: `stop-${i}`, type: "stop", address: zone.label || `Stop ${i + 1}`, lat: zone.lat, lng: zone.lng });
  });
  return stops;
}

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconWarning = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconCheck = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBlock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconClock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconRefresh = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Used for the "All Bookings" stat tab icon.
const IconGrid = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

// Used for the "Ongoing" stat tab icon — a pulse/activity line.
const IconActivity = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 12h4l3 8 4-16 3 8h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── DATA ────────────────────────────────────────────────────────────────────

// "To Pay" = the customer created the booking but the deposit hasn't cleared yet.
// Nothing has been paid, so staff can't act on it (no pickup/driver) — it's listed so
// pending bookings (and the car being held for them) are visible. It flips to
// "Upcoming" by itself the moment the deposit is paid, or auto-cancels after 12 hours.
const STATUS_TABS = ["All", "To Pay", "Upcoming", "Ongoing", "Cancelled", "Completed"];

// Icon + color per stat tab — colors match STATUS_DOT/STATUS_BG below so a
// status looks the same in the tab card as it does in the table badge.
const TAB_ICON = {
  All:       IconGrid,
  "To Pay":  IconClock,
  Upcoming:  IconClock,
  Ongoing:   IconActivity,
  Cancelled: IconX,
  Completed: IconCheck,
};

const TAB_ICON_COLOR = {
  All:       "bg-teal-50 text-teal-600",
  "To Pay":  "bg-orange-50 text-orange-600",
  Upcoming:  "bg-yellow-50 text-yellow-600",
  Ongoing:   "bg-blue-50 text-blue-600",
  Cancelled: "bg-red-50 text-red-600",
  Completed: "bg-green-50 text-green-600",
};

// STATUS_DOT / STATUS_BG / StatusBadge — kept identical to the copy in
// Dashboard.jsx so the same status always looks the same on both pages.
// If a new status is added, update both files.
const STATUS_DOT = {
  "to pay":  "bg-orange-400",
  upcoming:  "bg-yellow-400",
  ongoing:   "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
  stolen:    "bg-red-700",
};

const STATUS_BG = {
  "to pay":  "bg-orange-50 border border-orange-200",
  upcoming:  "bg-yellow-50 border border-yellow-200",
  ongoing:   "bg-blue-50 border border-blue-200",
  completed: "bg-green-50 border border-green-200",
  cancelled: "bg-red-50 border border-red-200",
  stolen:    "bg-red-100 border border-red-300",
};

function StatusBadge({ status }) {
  const s   = (status || "").toLowerCase();
  const dot = STATUS_DOT[s] || "bg-gray-400";
  const bg  = STATUS_BG[s]  || "bg-gray-50 border border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {status?.replace("_", " ")}
    </span>
  );
}

const fmtDate = (val) => {
  if (!val) return "—";
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
};

// Same parsing as fmtDate, but keeps the time — used for "Created", where the
// exact moment the booking was made matters (two bookings can share a date).
const fmtDateTime = (val) => {
  if (!val) return "—";
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else if (val?.seconds !== undefined) d = new Date(val.seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
};

// Same Firestore-Timestamp-or-string-or-seconds handling as fmtDate above,
// but returns a raw millisecond number (or -Infinity for unparsable/empty
// values) so sort() has something numeric to compare rather than strings.
const toMillis = (val) => {
  if (!val) return -Infinity;
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else if (val?.seconds !== undefined) d = new Date(val.seconds * 1000);
    else d = new Date(val);
    const ms = d.getTime();
    return isNaN(ms) ? -Infinity : ms;
  } catch { return -Infinity; }
};

// Time-of-day only (e.g. "3:45 PM") — shown in its own "Time" column next to "Date".
const fmtTime = (val) => {
  const ms = toMillis(val);
  if (!isFinite(ms)) return "—";
  return new Date(ms).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};

// "YYYY-MM-DD" (local day) of any date value the table shows, or null — what
// the date picker in "Search by" is compared against.
const dayKey = (val) => {
  const ms = toMillis(val);
  if (!isFinite(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "Search by" options — mirror the table's columns. Status is NOT here: it has
// its own dropdown. Booking ID has no column but stays searchable because
// Payments / Refund Requests link in with ?search=<bookingID>.
const SEARCH_BY = [
  { key: "created",  label: "Created At", type: "date" },
  { key: "customer", label: "Customer",   type: "text" },
  { key: "phone",    label: "Contact No.", type: "text" },
  { key: "vehicle",  label: "Vehicle",    type: "text" },
  { key: "start",    label: "Trip Start", type: "date" },
  { key: "end",      label: "Trip End",   type: "date" },
  { key: "phase",    label: "Phase",      type: "text" },
  { key: "booking",  label: "Booking ID", type: "text" },
];

// ─── SORT HEADER ────────────────────────────────────────────────────────────
// Clickable <th> that toggles asc/desc on the given sortKey. Shows a neutral
// up/down chevrons icon when the column isn't the active sort (so it reads
// as "sortable" even before you've clicked it), and a bold single arrow in
// the active color once it is. Keeps Bookings/Users sort UI visually and
// behaviorally identical.
const IconChevronsUpDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconSortArrow = ({ dir, className = "w-3.5 h-3.5" }) => (
  <svg
    className={`${className} transition-transform ${dir === "desc" ? "rotate-180" : ""}`}
    viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function SortableTh({ label, sortKey: key, sortKeyState, sortDir, onSort, className = "" }) {
  const active = sortKeyState === key;
  return (
    <th className={`px-4 py-3 text-left select-none ${className}`}>
      <button
        onClick={() => onSort(key)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={sortDir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

// Admin refund/cancel only applies before the trip starts — an ongoing trip goes through the customer's cancellation request instead.
const canRefundCancel = (status) => ["to pay", "upcoming"].includes(status?.toLowerCase());
const canEdit  = (status) => ["upcoming", "ongoing"].includes(status?.toLowerCase());

const PAGE_SIZE = 10;

// ─── PAGINATION ───────────────────────────────────────────────────────────────
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


// ─── INLINE LOCATION MAP ──────────────────────────────────────────────────────
// Small read-only Leaflet map used inside the Edit modal: plots pickup, dropoff
// and every extra stop. "Expand" opens the full TripMapModal. It's a preview —
// the coordinates come from the booking's trip session; moving a stop with its
// Map button shifts that stop's pin here right away.
const MAP_PIN_COLOR = { pickup: "#4f46e5", dropoff: "#f59e0b", stop: "#0d9488" };

function LocationMapPreview({ stops, title }) {
  const elRef  = useRef(null);
  const mapRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const valid = stops.filter((s) => typeof s.lat === "number" && typeof s.lng === "number");

  useEffect(() => {
    if (!elRef.current || valid.length === 0) return;
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
    mapRef.current = map;
    map.setView([valid[0].lat, valid[0].lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    valid.forEach((st) => {
      const color = MAP_PIN_COLOR[st.type] || MAP_PIN_COLOR.pickup;
      L.marker([st.lat, st.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [22, 22], iconAnchor: [11, 22],
        }),
      }).addTo(map).bindTooltip(st.type === "stop" ? (st.address || "Stop") : `${st.type === "pickup" ? "Pickup" : "Dropoff"}${st.address ? `: ${st.address}` : ""}`);
    });
    // The modal has only just mounted — let it lay out before measuring. The
    // frame is cancelled on cleanup: under React StrictMode (and on any re-run)
    // the effect's map is removed before this fires, and calling fitBounds on a
    // removed map is what threw "_leaflet_pos".
    let disposed = false;
    const frame = requestAnimationFrame(() => {
      if (disposed) return;
      map.invalidateSize();
      if (valid.length > 1) map.fitBounds(L.latLngBounds(valid.map((v) => [v.lat, v.lng])), { padding: [24, 24], maxZoom: 16, animate: false });
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(valid.map((v) => [v.lat, v.lng]))]);

  if (valid.length === 0) {
    return <div className="mt-2 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-xl p-3">No map data for this booking.</div>;
  }
  return (
    <div className="mt-2">
      <div ref={elRef} className="h-44 w-full rounded-xl border border-gray-200 overflow-hidden z-0" />
      <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: MAP_PIN_COLOR.pickup }} />Pickup</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: MAP_PIN_COLOR.dropoff }} />Dropoff</span>
          {valid.some((v) => v.type === "stop") && <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: MAP_PIN_COLOR.stop }} />Stop</span>}
        </span>
        <button type="button" onClick={() => setExpanded(true)} className="font-semibold text-teal-700 hover:underline">Expand →</button>
      </div>
      <TripMapModal open={expanded} onClose={() => setExpanded(false)} title={title} stops={stops} />
    </div>
  );
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────

function EditModal({ booking, onClose, onSave }) {
  const currentStatus     = booking.status?.toLowerCase() || "";
  const [form, setForm] = useState({
    notesAdmin: booking.notesAdmin || "",
    status:     "", // "" = no status change; staff must pick a transition on purpose
  });
  // Stop names are never typed — a stop's name only ever comes from a map pick, so the
  // text and its pin can't drift apart. edits = { [stopKey]: { address, lat, lng } }
  // for every stop moved this session; pickingKey is the stop the picker is open for.
  const [edits, setEdits]                 = useState({});
  const [pickingKey, setPickingKey]       = useState(null);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState(null);
  const [paymentStatus, setPaymentStatus]   = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    const bID = booking.bookingID || booking.id;
    if (!bID || currentStatus !== "upcoming") return;
    setPaymentLoading(true);
    fetch(`${process.env.REACT_APP_API_URL}/api/payments?bookingID=${encodeURIComponent(bID)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(json => {
        const list  = json.data || json.payments || [];
        const match = list.find(p => p.bookingID === bID);
        setPaymentStatus(match?.status ?? null);
      })
      .catch(() => setPaymentStatus(null))
      .finally(() => setPaymentLoading(false));
  }, [booking, currentStatus, getToken]);

  // Every editable location on the booking. A booking can carry several (the destination
  // plus any extra stops); pickup/dropoff are fixed and not listed. zoneIndex is the stop's
  // slot in the session's geofenceZones — what the backend uses to move the right one.
  const stopRows = useMemo(() => {
    const norm = (t) => (t || "").trim().toLowerCase();
    const dest = norm(booking.location);
    const rows = tripStops(booking)
      .filter((st) => st.type === "stop")
      .map((st) => ({
        key: st.key, zoneIndex: Number(st.key.split("-")[1]), label: st.address,
        lat: st.lat, lng: st.lng, isDestination: !!dest && norm(st.address) === dest,
      }));
    // Older bookings: a destination text with no zone of its own.
    if (booking.location && !rows.some((r) => r.isDestination)) {
      rows.unshift({ key: "destination", zoneIndex: null, label: booking.location, lat: null, lng: null, isDestination: true });
    }
    return rows;
  }, [booking]);

  // Preview pins: every stop, with the ones moved this session shown at their new spot.
  const previewStops = useMemo(() => {
    const moved = (st) => (edits[st.key] ? { ...st, ...edits[st.key] } : st);
    const base = tripStops(booking).map(moved);
    if (edits.destination) base.push({ key: "destination", type: "stop", ...edits.destination });
    return base;
  }, [booking, edits]);

  const pickingRow    = stopRows.find((r) => r.key === pickingKey) || null;
  const pickerCoords  = pickingRow
    ? (edits[pickingRow.key] || (pickingRow.lat != null ? pickingRow : null))
    : null;
  const editedCount   = Object.keys(edits).length;

  const approvedStatuses = ["approved", "paid"];
  const isApprovingWithUnpaidPayment =
    form.status === "ongoing" &&
    currentStatus === "upcoming" &&
    !paymentLoading &&
    (paymentStatus === null || !approvedStatuses.includes(paymentStatus?.toLowerCase()));

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const payload = { ...form };
      if (!payload.status) delete payload.status; // no status change
      if (editedCount) {
        payload.stopEdits = stopRows
          .filter((r) => edits[r.key])
          .map((r) => ({ zoneIndex: r.zoneIndex, oldLabel: r.label, ...edits[r.key] }));
      }
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to save");
      onSave();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-lg text-gray-800">Edit Booking</h2>
        <p className="text-xs text-gray-400 font-mono break-all">{booking.bookingID || booking.id}</p>
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-xl">{error}</div>}
        {form.status === "ongoing" && currentStatus === "upcoming" && (
          paymentLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-200 p-3 rounded-xl">
              <IconClock className="w-4 h-4 shrink-0" />
              Checking payment status…
            </div>
          ) : paymentStatus === null ? (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 p-3 rounded-xl">
              <IconBlock className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">No payment record found</p>
                <p className="text-xs text-red-600 mt-0.5">Cannot mark as picked up / ongoing — no payment has been submitted for this booking yet.</p>
              </div>
            </div>
          ) : approvedStatuses.includes(paymentStatus?.toLowerCase()) ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 p-3 rounded-xl">
              <IconCheck className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 font-medium">Payment is <span className="font-bold">{paymentStatus}</span> — booking can be marked as picked up (ongoing).</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 p-3 rounded-xl">
              <IconWarning className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Payment not yet approved</p>
                <p className="text-xs text-amber-700 mt-0.5">Payment status is currently <span className="font-bold">"{paymentStatus}"</span>. Go to the <span className="font-semibold">Payments page</span> and approve the payment first.</p>
              </div>
            </div>
          )
        )}
        <div className="space-y-3">
          <div>
            <p className="block text-sm font-medium text-gray-700">
              Locations{stopRows.length > 1 && <span className="ml-1 text-xs font-normal text-gray-400">({stopRows.length} stops)</span>}
            </p>
            {stopRows.length === 0 ? (
              <p className="mt-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-xl p-3">
                This booking has no destination or extra stops to edit. Pickup and dropoff can't be changed here.
              </p>
            ) : (
              <ul className="mt-1 space-y-2">
                {stopRows.map((r) => {
                  const e = edits[r.key];
                  return (
                    <li key={r.key} className={`flex items-start gap-2 border rounded-xl px-3 py-2 ${e ? "border-teal-300 bg-teal-50/50" : "border-gray-200 bg-gray-50"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          {r.isDestination ? "Destination" : "Stop"}
                        </p>
                        <p className="text-sm text-gray-800 break-words">{e ? e.address : (r.label || "—")}</p>
                        {e && <p className="text-xs text-gray-400 break-words">was: {r.label || "—"}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <button type="button" onClick={() => setPickingKey(r.key)}
                          className="px-3 py-1.5 rounded-xl border border-teal-500 text-teal-700 hover:bg-teal-50 transition-colors text-xs font-semibold whitespace-nowrap">
                          📍 {e ? "Change" : "Move on map"}
                        </button>
                        {e && (
                          <button type="button" onClick={() => setEdits(({ [r.key]: _, ...rest }) => rest)}
                            className="text-xs text-gray-500 hover:underline">Undo</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {editedCount > 0 && (
              <p className="mt-1 text-xs text-teal-700">
                {editedCount === 1 ? "1 stop" : `${editedCount} stops`} moved — the trip's geofence zone{editedCount === 1 ? "" : "s"} update when you save.
              </p>
            )}
          </div>
          <StoreLocationMapPicker
            isOpen={!!pickingRow}
            onClose={() => setPickingKey(null)}
            onConfirm={({ address, lat, lng }) => {
              setEdits((prev) => ({ ...prev, [pickingKey]: { address, lat, lng } }));
              setPickingKey(null);
            }}
            initialLabel={pickingRow ? (edits[pickingRow.key]?.address || pickingRow.label || "") : ""}
            initialCoords={pickerCoords ? { lat: pickerCoords.lat, lng: pickerCoords.lng } : null}
            title={pickingRow?.isDestination ? "📍 Move Destination" : "📍 Move Stop"}
            subtitle="Search, click the map, or drag the pin"
          />
          <LocationMapPreview stops={previewStops} title={`${booking.customerName || "Booking"} — ${booking.vehicleName || ""}`} />
          <label className="block text-sm font-medium text-gray-700">Admin Notes
            <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none resize-none" value={form.notesAdmin} onChange={(e) => setForm({ ...form, notesAdmin: e.target.value })} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Status
            <select className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="">No change ({booking.status})</option>
              {booking.status?.toLowerCase() === "upcoming" ? (
                <><option value="ongoing">Ongoing (Picked Up)</option><option value="cancelled">Cancelled</option></>
              ) : (
                <><option value="completed">Completed</option>{booking.status?.toLowerCase() === "to pay" && <option value="cancelled">Cancelled</option>}</>
              )}
            </select>
          </label>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || isApprovingWithUnpaidPayment} className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── REFUND & CANCEL MODAL ────────────────────────────────────────────────────
// Admin/Owner only. "Refund & cancel" hits POST /api/bookings/:id/refund-cancel,
// which sends the PayMongo refund(s), cancels the booking + GPS session, flips
// the refund-request/payment records and notifies the customer. "Cancel only"
// cancels without returning any money.

function RefundCancelModal({ booking, onClose, onDone }) {
  const { fmt } = useCurrency();
  const { getToken } = useAuth();
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [mode, setMode]         = useState("refund"); // "refund" | "cancel" | "no_show"
  const [reason, setReason]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState(null);
  const [notice, setNotice]     = useState(null); // set when part of the money has to be settled by staff after the cancel went through
  const navigate = useNavigate();
  const api = `${process.env.REACT_APP_API_URL}/api/bookings/${booking.id}`;

  useEffect(() => {
    let alive = true;
    fetch(`${api}/refund-preview`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) throw new Error(j.message || "Could not load refund preview.");
        setPreview(j.data);
        if (!(j.data.total > 0)) setMode("cancel"); // nothing to refund → plain cancel
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  const hasMoney = (preview?.total || 0) > 0;
  const blocked  = !!preview?.existingRequest && (mode === "cancel" || mode === "no_show");
  const ns       = preview?.noShow;
  const canNoShow = !!ns && ns.pickupPassed && !preview?.alreadyRefunded;

  const submit = async () => {
    setSubmitting(true); setError(null);
    try {
      // A no-show (pickup time passed, customer never came) keeps the deposit and refunds the rest.
      const res  = await fetch(mode === "no_show" ? `${api}/no-show` : `${api}/refund-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(mode === "no_show" ? { reason: reason.trim() } : { reason: reason.trim(), refund: mode === "refund" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Request failed.");
      // The booking IS cancelled and the online part is on its way. If some money can't go back online, keep the
      // modal open with what staff still have to do instead of closing on a toast they might miss.
      if (json.data?.followUp) { setNotice({ message: json.message || "Booking cancelled.", ...json.data.followUp }); return; }
      onDone(json.message || "Booking cancelled.");
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const opt = (value, title, desc) => (
    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${mode === value ? "border-teal-500 bg-teal-50" : "border-gray-200"}`}>
      <input type="radio" className="mt-1" checked={mode === value} onChange={() => setMode(value)} />
      <div>
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
    </label>
  );

  // Partial refund: amber notice (not a red error) with what is left to do and a way straight to the payment.
  if (notice) {
    const finish = () => onDone(notice.message);
    const toPayments = () => { finish(); navigate(notice.paymentID ? `/payments?paymentID=${encodeURIComponent(notice.paymentID)}` : "/payments"); };
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
          <div>
            <h2 className="font-bold text-lg text-gray-800">{notice.onlineAmount > 0 ? "Partial refund sent" : "Booking cancelled"}</h2>
            <p className="text-xs text-gray-400 font-mono break-all">{booking.bookingID || booking.id}</p>
          </div>
          <div className="text-sm bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl space-y-2">
            {notice.onlineAmount > 0 && (
              <div className="flex justify-between gap-4"><span>Going back through PayMongo</span><span className="font-semibold">{fmt(notice.onlineAmount)}</span></div>
            )}
            {notice.inStoreAmount > 0 && (
              <div className="flex justify-between gap-4"><span>Can't be refunded online, settle in store</span><span className="font-semibold text-orange-700">{fmt(notice.inStoreAmount)}</span></div>
            )}
            {notice.unrefundableAmount > 0 && (
              <div className="flex justify-between gap-4"><span>Paid online, no PayMongo payment ID</span><span className="font-semibold text-red-600">{fmt(notice.unrefundableAmount)}</span></div>
            )}
          </div>
          <p className="text-sm text-gray-600">
            {notice.inStoreAmount > 0
              ? "The booking is cancelled. Please settle the in-store amount with the customer, then record it on the payment."
              : "The booking is cancelled. Refund the remaining amount from the PayMongo dashboard."}
          </p>
          <div className="flex gap-3 justify-end pt-1">
            <button onClick={finish} className="px-4 py-2 border rounded-xl text-sm">Done</button>
            <button onClick={toPayments} className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700 transition-colors">Continue to Payments &rarr;</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-lg text-gray-800">Cancel Booking</h2>
        <p className="text-xs text-gray-400 font-mono break-all">{booking.bookingID || booking.id}</p>
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-xl">{error}</div>}

        {loading ? (
          <div className="text-sm text-gray-400">Checking payment…</div>
        ) : preview && (
          <>
            {preview.alreadyRefunded ? (
              <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl">This payment was already refunded — cancelling will just close the booking.</div>
            ) : hasMoney ? (
              <div className="text-sm bg-gray-50 border border-gray-200 p-3 rounded-xl space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Total to refund</span><span className="font-semibold">{fmt(preview.total)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Via PayMongo (automatic)</span><span>{fmt(preview.onlineAmount)}</span></div>
                {preview.manualAmount > 0 && <div className="flex justify-between"><span className="text-gray-500">Hand back in person</span><span>{fmt(preview.manualAmount)}</span></div>}
              </div>
            ) : (
              <div className="text-sm bg-gray-50 border border-gray-200 text-gray-600 p-3 rounded-xl">{preview.unrefundableAmount > 0 ? "Nothing can be refunded through PayMongo for this booking." : "Nothing has been paid on this booking, so there is nothing to refund."}</div>
            )}

            {!preview.alreadyRefunded && preview.unrefundableAmount > 0 && (
              <div className="text-sm bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl">
                <span className="font-semibold">{fmt(preview.unrefundableAmount)} — Payment ID does not exist.</span>{" "}
                It was paid online but no PayMongo payment ID is on record, so it can't be refunded through PayMongo{hasMoney ? " (the amount above is only the part that can be)" : ""}. Fix the payment record or refund it from the PayMongo dashboard.
              </div>
            )}

            {preview.existingRequest && (
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl">
                The customer already has a refund request ({preview.existingRequest.status}). Refunding here will approve that same request — no double refund.
              </div>
            )}

            {hasMoney && (
              <div className="space-y-2">
                {opt("refund", "Refund & cancel", "Sends the PayMongo refund automatically, cancels the booking and emails the customer. Full refund, no fee.")}
                {opt("cancel", "Cancel only (no refund)", "Cancels the booking but keeps the customer's money. Use only when the cancellation isn't refundable.")}
                {canNoShow && opt("no_show", "Customer didn't show up (no-show)", `Pickup time has passed. Keeps the ${fmt(ns.forfeit)} deposit and refunds the rest (${fmt(ns.total)}).`)}
              </div>
            )}
            {mode === "no_show" && canNoShow && (
              <div className="text-sm bg-amber-50 border border-amber-200 p-3 rounded-xl space-y-1">
                <div className="flex justify-between"><span className="text-gray-600">Customer paid</span><span className="font-semibold">{fmt(ns.grossPaid)}</span></div>
                <div className="flex justify-between text-amber-700"><span>Deposit kept (no-show)</span><span className="font-semibold">-{fmt(ns.forfeit)}</span></div>
                <div className="flex justify-between border-t border-black/10 pt-1"><span className="font-bold text-gray-800">Refund</span><span className="font-black">{fmt(ns.total)}</span></div>
                {ns.manualAmount > 0 && <p className="text-xs text-orange-600">{fmt(ns.manualAmount)} of this must be handed back in person.</p>}
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700">Reason (shown to the customer)
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none resize-none" />
            </label>
            {blocked && <p className="text-xs text-red-600">Resolve the customer's open refund request first, or choose Refund & cancel.</p>}
          </>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 border rounded-xl text-sm disabled:opacity-50">Back</button>
          <button
            onClick={submit}
            disabled={submitting || loading || !preview || !reason.trim() || blocked}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
          >
            {submitting ? "Processing…" : mode === "no_show" ? "Mark as No-show" : mode === "refund" && hasMoney ? "Refund & Cancel" : "Cancel Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VIEW DETAILS MODAL ───────────────────────────────────────────────────────

// ─── CUSTOMER PROFILE MODAL ─────────────────────────────────────────────
// Opened from the Customer name in either the table row or ViewModal,
// instead of navigating to /users. Pulls the base user doc (by-uid, which
// also carries the profile photo + referral info) and the userDetails doc
// (details).
//
// Booking counts come from the `bookings` list this page already loaded
// (/api/bookings?status=all returns every booking with its userID), so
// showing "how many bookings has this person made" costs no extra request.
//
// The invited-users list only shows each person's booking count plus a
// "View" button. View swaps THIS modal's content to a brief profile of that
// invited user (same modal, no stacking); the back arrow returns to the
// original customer's view.
const IconArrowLeft = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="19" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <polyline points="12 19 5 12 12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Profile photo with an initials fallback (no photo, or the image fails to load).
function ProfileAvatar({ src, initials, className = "w-16 h-16 text-xl" }) {
  const [failed, setFailed] = useState(false);
  const base = `${className} rounded-xl flex-shrink-0`;
  if (src && !failed) {
    return <img src={src} alt="" onError={() => setFailed(true)} className={`${base} object-cover bg-gray-100`} />;
  }
  return <div className={`${base} bg-teal-600 text-white flex items-center justify-center font-bold`}>{initials}</div>;
}

// Loads one customer's base doc + details. Safe to call with a null id (idle).
function useCustomerProfile(userID) {
  const { getToken } = useAuth();
  const [state, setState] = useState({ basic: null, details: null, loading: !!userID, error: null });

  useEffect(() => {
    if (!userID) { setState({ basic: null, details: null, loading: false, error: null }); return; }
    let cancelled = false;
    setState({ basic: null, details: null, loading: true, error: null });
    const headers = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch(`${process.env.REACT_APP_API_URL}/api/users/by-uid/${userID}`, { headers }).then((r) => r.json()),
      fetch(`${process.env.REACT_APP_API_URL}/api/users/details/${userID}`, { headers }).then((r) => r.json()).catch(() => null),
    ])
      .then(([basicRes, detailsRes]) => {
        if (cancelled) return;
        if (!basicRes?.success) throw new Error(basicRes?.message || "Could not load customer profile.");
        // Details 404s for a customer who never filled in personal info —
        // that's a normal state here, not an error worth surfacing.
        setState({ basic: basicRes.data, details: detailsRes?.success ? detailsRes.data : null, loading: false, error: null });
      })
      .catch((e) => !cancelled && setState({ basic: null, details: null, loading: false, error: e.message }));
    return () => { cancelled = true; };
  }, [userID, getToken]);

  return state;
}

const profileFullName = (details, basic) =>
  (details
    ? `${details.firstName || ""} ${details.middleName ? details.middleName + " " : ""}${details.lastName || ""}`.trim()
    : "") || basic?.username || "Customer Profile";

const profileInitials = (details, basic) =>
  ((details?.firstName?.[0] || basic?.email?.[0] || "?") + (details?.lastName?.[0] || "")).toUpperCase();

function CustomerProfileModal({ userID, bookings, onClose }) {
  const [subID, setSubID] = useState(null); // invited user currently being viewed (null = original customer)
  const root = useCustomerProfile(userID);
  const sub  = useCustomerProfile(subID);
  const cur  = subID ? sub : root;
  const { basic, details, loading, error } = cur;

  // userID -> { total, completed } across every booking this page loaded.
  const statsMap = useMemo(() => {
    const m = new Map();
    (bookings || []).forEach((b) => {
      if (!b.userID) return;
      const s = m.get(b.userID) || { total: 0, completed: 0 };
      s.total += 1;
      if ((b.status || "").toLowerCase() === "completed") s.completed += 1;
      m.set(b.userID, s);
    });
    return m;
  }, [bookings]);
  const statsOf = (id) => statsMap.get(id) || { total: 0, completed: 0 };

  const shownID = subID || userID;
  const stats   = statsOf(shownID);
  const bookingsText = `${stats.total} total · ${stats.completed} completed`;

  const refBy = basic?.referral?.referredBy;
  const refByText = refBy
    ? (refBy.removed
        ? `${refBy.code || "—"} (account removed)`
        : (refBy.name && refBy.username ? `${refBy.name} (@${refBy.username})`
          : refBy.name || (refBy.username ? `@${refBy.username}` : refBy.code)))
    : "None";

  const row = (label, value) => (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
      <span className="text-gray-500 font-medium w-32 shrink-0">{label}</span>
      <span className="text-gray-800 text-right break-words">{value || "—"}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-2 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {subID && (
              <button onClick={() => setSubID(null)} title="Back" aria-label="Back"
                className="shrink-0 p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100">
                <IconArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="font-bold text-lg text-gray-800 truncate">
              {loading ? (subID ? "Invited user" : "Customer Profile") : profileFullName(details, basic)}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-red-500">{error}</div>
        ) : (
          <div>
            <div className="flex items-center gap-3 pb-3 mb-1 border-b border-gray-100">
              <ProfileAvatar key={basic?.profileImage || "none"} src={basic?.profileImage} initials={profileInitials(details, basic)} />
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 truncate">{profileFullName(details, basic)}</p>
                <p className="text-xs text-gray-400 truncate">@{basic?.username || "—"}</p>
                <p className="mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                  {stats.total} {stats.total === 1 ? "booking" : "bookings"}
                </p>
              </div>
            </div>

            {row("Email",     basic?.email)}
            {row("Phone",     basic?.phone)}
            {row("Username",  basic?.username)}
            {row("Status",    basic?.status)}
            {row("ID Status", basic?.isVerified ? "✓ Verified" : "Pending")}
            {row("Joined",    fmtDate(basic?.createdAt))}
            {row("Bookings",  bookingsText)}

            {subID ? (
              // Brief view of an invited user: just the essentials.
              row("Invited", String(basic?.referral?.invitedCount || 0))
            ) : (
              <>
                {row("Referral Code", basic?.referral?.code)}
                {row("Referred By",   refByText)}
                {row("Invited",       String(basic?.referral?.invitedCount || 0))}
                {basic?.referral?.invited?.length > 0 && (
                  <ul className="mt-1 mb-1 divide-y border rounded-xl">
                    {basic.referral.invited.map((p) => {
                      const n = statsOf(p.id).total;
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="min-w-0 truncate text-gray-700">
                            {p.name || "—"}{p.username && <span className="text-gray-400"> (@{p.username})</span>}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-gray-500">{n} {n === 1 ? "booking" : "bookings"}</span>
                            <button onClick={() => setSubID(p.id)}
                              className="px-2.5 py-1 border border-teal-200 text-teal-700 rounded-lg text-xs font-semibold hover:bg-teal-50">
                              View
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {details && row("Birth Date", details.birthDate ? fmtDate(details.birthDate) : "—")}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Check circle for each step in the booking checklist (View modal, "Step by step" tab).
const STEP_STYLE = {
  done:    { dot: "bg-green-500 text-white border-green-500",                      text: "text-gray-800" },
  current: { dot: "bg-white text-teal-700 border-teal-500 ring-4 ring-teal-100",   text: "text-gray-900" },
  todo:    { dot: "bg-white text-gray-400 border-gray-300",                        text: "text-gray-500" },
  skipped: { dot: "bg-gray-100 text-gray-400 border-gray-200",                     text: "text-gray-400" },
  missing: { dot: "bg-amber-50 text-amber-600 border-amber-300",                   text: "text-gray-700" },
  partial: { dot: "bg-orange-100 text-orange-600 border-orange-400",               text: "text-orange-700" },
  stopped: { dot: "bg-red-500 text-white border-red-500",                          text: "text-red-700" },
};

function ViewModal({ booking, onClose, onViewCustomer, onEdit, onRefund, onDelete }) {
  const { fmt } = useCurrency();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const row = (label, value) => (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
      <span className="text-gray-500 font-medium w-36 shrink-0">{label}</span>
      <span className="text-gray-800 text-right">{value || "—"}</span>
    </div>
  );

  // Inline check: does THIS booking actually have before/after-trip
  // inventory records? Don't just link off to Vehicle Inspections and
  // hope it lands on the right one — that page defaults to a car's
  // nearest/upcoming booking, which for a completed booking is very
  // likely the wrong record entirely.
  const [inventoryCheck, setInventoryCheck]     = useState(null); // { before, after } | null
  const [inventoryLoading, setInventoryLoading] = useState(true);

  useEffect(() => {
    const bID = booking.bookingID || booking.id;
    if (!bID) { setInventoryLoading(false); return; }
    setInventoryLoading(true);
    fetch(`${process.env.REACT_APP_API_URL}/api/inventory/booking/${encodeURIComponent(bID)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((json) => setInventoryCheck(json.data || { before: null, after: null }))
      .catch(() => setInventoryCheck(null))
      .finally(() => setInventoryLoading(false));
  }, [booking, getToken]);

  const goToHistory = () => {
    navigate("/car-tracking", {
      state: {
        tab: "history",
        carID: booking.carID,
        bookingID: booking.bookingID || booking.id,
      },
    });
  };

  // Vehicle name -> Car Tracking (Live tab) with this car already selected.
  // CarTracking already reads location.state.selectCarId (same deep link
  // Header notifications and GPS Setup use) and selects that car.
  const goToCarTracking = () => {
    navigate("/car-tracking", { state: { selectCarId: booking.carID } });
  };

  const goToPayments = () => {
    navigate(`/payments?bookingID=${encodeURIComponent(booking.bookingID || booking.id)}`);
  };

  // Terms & Conditions page, opened on the exact version this booking agreed to
  // (termsViewID = the termsVersions doc ID, or the old hash for pre-switch bookings).
  // bookingID lets the Terms page offer a "Back to booking" button.
  const goToTerms = () => {
    const params = new URLSearchParams({
      version: booking.termsViewID,
      bookingID: booking.bookingID || booking.id,
    });
    navigate(`/terms?${params.toString()}`);
  };

  // Vehicle Inspections page (system inventory: before/after-trip part
  // condition + photos) is keyed by carID first, bookingID second — same
  // deep-link shape it already reads elsewhere (?carID=...&bookingID=...).
  const goToInventory = () => {
    const params = new URLSearchParams({
      carID: booking.carID || "",
      bookingID: booking.bookingID || booking.id || "",
    });
    navigate(`/vehicle-documentation?${params.toString()}`);
  };

  // Maintenance.jsx already handles ?carID= (from Fleet.jsx); this reuses
  // that same effect, extended to also pre-fill ?bookingID= and default
  // the basis to "Post-Rental" — see that file's deep-link effect.
  const goToMaintenance = () => {
    const params = new URLSearchParams({
      carID: booking.carID || "",
      bookingID: booking.bookingID || booking.id || "",
    });
    navigate(`/maintenance?${params.toString()}`);
  };

  // Maintenance records already linked to THIS booking (filed manually
  // via the button below) — so staff can see at a glance whether post-rental cleaning/repair
  // has already been scheduled instead of guessing or re-filing it.
  const [linkedMaintenance, setLinkedMaintenance] = useState(null); // null = loading
  useEffect(() => {
    const bID = booking.bookingID || booking.id;
    if (!bID) { setLinkedMaintenance([]); return; }
    fetch(`${process.env.REACT_APP_API_URL}/api/maintenance/booking/${encodeURIComponent(bID)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((json) => setLinkedMaintenance(json.data || []))
      .catch(() => setLinkedMaintenance([]));
  }, [booking, getToken]);

  // Every stop for this booking's trip (pickup, dropoff, any extra stops
  // selected at booking time) — same shape MyTrips.jsx's map already uses.
  // Only ever non-empty once getAllBookings has resolved a session for
  // this booking (see booking.service.js's resolveHistoryInfo).
  const [mapOpen, setMapOpen] = useState(false);
  const locationStops = tripStops(booking);
  // Booking-time Number Coding restrictions the customer app saved (booking.codingWarnings) —
  // the list the customer was warned about; empty for bookings made before that existed.
  const codingByCity = warningsByCity(readCodingWarnings(booking.codingWarnings));

  // Existing penalties already tied to this booking — same "always shown,
  // even when empty" treatment as Linked Maintenance below, so staff can
  // see at a glance whether anything's been noted against this booking
  // instead of guessing or re-checking on the Penalties page.
  const [linkedPenalties, setLinkedPenalties] = useState(null); // null = loading
  useEffect(() => {
    const bID = booking.bookingID || booking.id;
    if (!bID) { setLinkedPenalties([]); return; }
    fetch(`${process.env.REACT_APP_API_URL}/api/penalties/booking/${encodeURIComponent(bID)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((json) => setLinkedPenalties(json.data || []))
      .catch(() => setLinkedPenalties([]));
  }, [booking, getToken]);

  // Penalties.jsx is where penalties actually get drafted (see its own
  // CreatePenaltyModal) — this hands it the bookingID via query param so
  // the draft it opens is pre-filled and locked to THIS booking, instead
  // of staff having to copy/type the ID over there themselves.
  const goToNotePenalty = () => {
    navigate(`/penalties?bookingID=${encodeURIComponent(booking.bookingID || booking.id)}`);
  };

  // ── Two tabs: "Step by step" (a checklist with View buttons) and "Details" ──
  // The 8 steps: Booked → Paid → Driver → Before-trip inspection → Pickup & trip
  // → Drop-off & after-trip inspection → Maintenance → Deposit & completion.
  // Each step's check is worked out from data this modal already has, and its
  // View button jumps to the page where that step is handled.
  const [tab, setTab] = useState("steps");

  const status        = (booking.status || "").toLowerCase();
  const dead          = status === "cancelled" || status === "stolen";
  const isStolen      = status === "stolen";
  const isChauffeur   = (booking.modeOfDriving || "").toLowerCase().includes("chauffeur");
  const before        = inventoryCheck?.before || null;
  const after         = inventoryCheck?.after || null;
  // The same before/after checklist the Pickup and Return gates use (it comes with every booking in the list):
  // { photos, parts, complete, videos } where photos = a video OR the 3 exterior photos. An inspection step is only
  // green when the parts condition AND that video/photos evidence both exist, so the tracker never says "done"
  // for something the gate would still block.
  const beforeChk     = booking.beforeInspection || null;
  const afterChk      = booking.afterInspection || null;
  const maint         = linkedMaintenance || [];
  const maintAllDone  = maint.length > 0 && maint.every((m) => m.status === "Completed");
  const depStatus     = booking.deposit?.status || (booking.paymentStatus === "Refunded" ? "Refunded" : null);
  const depositClosed = ["Settled", "Refunded", "Forfeited", "Waived"].includes(depStatus);
  // A cancelled booking that was refunded may have lost its deposit record, so money that came in
  // (or went back out) still counts as paid.
  const paid          = ["upcoming", "ongoing", "completed", "cancellation_request"].includes(status) || !!booking.deposit
    || (dead && (booking.paymentStatus === "Refunded" || booking.paymentStage === "Refunded" || Number(booking.amountPaid) > 0));
  // What happened to the money on a cancelled booking (shown under "Paid" and in the red banner).
  const refundNote    = status !== "cancelled" || !paid ? null
    : (booking.paymentStatus === "Refunded" || booking.paymentStage === "Refunded") ? "Refunded"
    : booking.paymentStage === "For Refund" ? "Refund pending"
    : depStatus === "Forfeited" ? "Deposit kept"
    : "No refund";
  // Paid but not in full yet (the balance is still owed) -> shown orange, "in the middle".
  const partial       = paid && !dead && status !== "completed" && (String(booking.paymentStage || "").toLowerCase() === "partial" || Number(booking.balance) > 0);
  const discountGiven = Number(booking.discountAmount) > 0;
  const started       = !!booking.startedAt || status === "ongoing" || status === "completed";
  const droppedOff    = !!booking.droppedOffTime || status === "completed";
  const invLabel      = (rec) => (rec.inventoryOverallStatus === "has damage" ? `Has damage (${rec.damageParts?.length || 0})` : "Good");
  // Parts confirmed = the saved parts record (fetched just now) or the checklist's flag; evidence = video or 3 photos.
  const inspectionDone = (rec, chk) => (!!rec || !!chk?.parts) && !!chk?.photos;
  const inspectionSub  = (rec, chk, emptyText) => {
    if (inventoryLoading) return "Checking…";
    const hasParts = !!rec || !!chk?.parts;
    const hasMedia = !!chk?.photos;
    const partsText = rec ? invLabel(rec) : "Parts confirmed";
    const mediaText = chk?.videos > 0 ? `${chk.videos} video${chk.videos > 1 ? "s" : ""}` : "photos";
    if (hasParts && hasMedia) return `${partsText} · ${mediaText}`;
    if (hasParts)             return `${partsText} · video or photos missing`;
    if (hasMedia)             return `${chk?.videos > 0 ? "Video added" : "Photos added"} · parts condition not confirmed`;
    return emptyText;
  };
  const pendingMaint  = maint.filter((m) => m.status !== "Completed").length;
  const penaltyCount  = (linkedPenalties || []).length;

  const monitorText = !started ? "Not started"
    : isStolen ? `Flagged stolen${booking.hasHistory ? " · GPS trail saved" : ""}`
    : !droppedOff ? "Trip in progress — track it live"
    : booking.hasHistory ? "GPS trail saved" : "No GPS trail saved";
  const penaltiesDone = penaltyCount > 0;

  const stepDefs = [
    { key: "booked", title: "Booked", done: true, sub: fmtDateTime(booking.createdAt) },
    {
      // Payment AND the one-time discount. Orange while only part of the fee has come in.
      key: "paid", title: "Paid | Give discount", done: paid && !partial, partial,
      sub: !paid ? "Awaiting payment"
        : [
            partial ? `Partial · ${fmt(booking.balance)} still to pay` : (booking.paymentMethod || "Paid"),
            refundNote,
            discountGiven ? `Discount −${fmt(booking.discountAmount)}` : null,
          ].filter(Boolean).join(" · "),
    },
    {
      key: "driver", title: "Driver assigned", done: !isChauffeur || !!booking.driverID,
      sub: !isChauffeur ? "Self-drive — no driver needed" : booking.driverID ? (booking.driverName || "Assigned") : "No driver yet",
    },
    { key: "before", title: "Before-trip inspection", done: inspectionDone(before, beforeChk), sub: inspectionSub(before, beforeChk, "Not recorded") },
    {
      // One process: pickup → monitor → drop-off. Done once the car is dropped off.
      key: "trip", title: "Pickup, monitor & drop-off", done: droppedOff,
      sub: droppedOff ? "Dropped off" : started ? "Trip in progress" : "Not started",
      parts: [
        { key: "pickup", label: "Pickup", done: started, text: booking.startedAt ? fmtDateTime(booking.startedAt) : started ? "Trip started" : "Not picked up yet" },
        {
          key: "monitor", label: "Monitor", done: droppedOff || isStolen, text: monitorText,
          actions: [
            { label: "Car Tracking", onClick: goToCarTracking },
            ...(booking.hasHistory ? [{ label: "Trip History", onClick: goToHistory }] : []),
          ],
        },
        { key: "dropoff", label: "Drop-off", done: droppedOff, bad: isStolen && !droppedOff,
          text: booking.droppedOffTime ? fmtDateTime(booking.droppedOffTime) : droppedOff ? "Dropped off" : isStolen ? "Never dropped off — flagged stolen" : "Not dropped off yet" },
      ],
    },
    {
      // Green once the after-trip inspection is complete: parts condition + a video (or the 3 exterior photos).
      key: "after", title: "Post-rental inspection", done: inspectionDone(after, afterChk),
      warn: after?.inventoryOverallStatus === "has damage",
      sub: inspectionSub(after, afterChk, droppedOff ? "Dropped off · not inspected yet" : "Not recorded"),
    },
    {
      key: "maintenance", title: "Maintenance", done: maintAllDone,
      skipped: !maintAllDone && linkedMaintenance !== null && maint.length === 0 && status === "completed",
      sub: linkedMaintenance === null ? "Checking…"
        : maint.length === 0 ? (status === "completed" ? "None filed" : "None filed yet")
        : maintAllDone ? "Completed" : `${pendingMaint} in progress`,
    },
    {
      key: "penalties", title: "Penalties", done: penaltiesDone,
      skipped: !penaltiesDone && linkedPenalties !== null && status === "completed",
      sub: linkedPenalties === null ? "Checking…"
        : penaltyCount ? `${penaltyCount} noted` : status === "completed" ? "None noted" : "None noted yet",
    },
    {
      key: "deposit", title: "Deposit & completion", done: depositClosed,
      sub: depStatus || (Number(booking.securityDeposit) > 0 ? "Not settled yet" : "No deposit"),
    },
  ];

  // done as computed; on a cancelled or stolen booking every step that never happened is red
  // ("stopped"); otherwise the first one not done is "current", and on a finished booking gaps show as "missing".
  let currentSeen = false;
  const steps = stepDefs.map((d, i) => {
    let state;
    if (d.done) state = "done";
    else if (dead) state = "stopped";        // cancelled / stolen: everything that didn't happen is red
    else if (d.partial) state = "partial";   // in the middle: orange, and it doesn't hold up the steps after it
    else if (d.skipped) state = "skipped";
    else if (status === "completed") state = "missing";
    else if (!currentSeen) { state = dead ? "stopped" : "current"; currentSeen = true; }
    else state = "todo";
    return { ...d, n: i + 1, state };
  });
  const countable = steps.filter((s) => s.state !== "skipped");
  const doneCount = countable.filter((s) => s.state === "done").length;

  // Every button is named after the page it opens.
  const goToDispatch = () => navigate("/driver-dispatch", {
    state: { assignBookingId: booking.bookingID || booking.id, assignCustomerName: booking.customerName },
  });
  const stepActions = {
    booked:      [{ label: "Details", onClick: () => setTab("details") }],
    paid:        [
      { label: "Payments", onClick: goToPayments },
      // One discount per booking, given on the Payments page.
      ...(paid && !discountGiven && !dead && status !== "completed" ? [{ label: "Give discount", onClick: goToPayments }] : []),
    ],
    driver:      isChauffeur ? [{ label: "Driver Dispatch", onClick: goToDispatch }] : [],
    before:      [{ label: "Vehicle Inspections", onClick: goToInventory }],
    after:       [{ label: "Vehicle Inspections", onClick: goToInventory }],
    maintenance: [{ label: "Maintenance", onClick: goToMaintenance }],
    penalties:   [{ label: "Penalties", onClick: goToNotePenalty }],
    // The deposit is handed back from the Payments page ("Return deposit"), so name the button for it while one is waiting.
    deposit:     [{ label: status === "ongoing" && depStatus === "Held" ? "Return deposit (Payments)" : "Payments", onClick: goToPayments }],
  };

  const stepBtn = "px-3.5 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition whitespace-nowrap";
  const partBtn = "px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition whitespace-nowrap";

  const tabBtn = (key, label) => (
    <button
      onClick={() => setTab(key)}
      className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
        tab === key ? "border-teal-600 text-teal-700" : "border-transparent text-gray-400 hover:text-gray-600"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-bold text-lg text-gray-800">Booking Details</h2>
              <StatusBadge status={booking.status} />
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
              <IconX className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1 truncate">
            {booking.customerName || "—"}{booking.vehicleName ? ` · ${booking.vehicleName}` : ""}
          </p>
          <div className="flex border-b border-gray-100 mt-3">
            {tabBtn("steps", "Step by step")}
            {tabBtn("details", "Details")}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {/* The customer's own request to cancel an ongoing trip (cancellationRequests).
              Shown on both tabs — this is the only place the approver can read WHY it was asked. */}
          {booking.cancellationRequest && (
            <div className="mt-2 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2">
              <p className="text-xs font-semibold text-orange-700 mb-1">Cancellation request</p>
              {row("Status", String(booking.cancellationRequest.status || "").replace(/^./, (c) => c.toUpperCase()))}
              {row("Reason", booking.cancellationRequest.reason || "—")}
              {row("Requested", fmtDateTime(booking.cancellationRequest.createdAt || booking.cancellationRequest.requestedAt))}
              {booking.cancellationRequest.processedAt && row(
                "Processed",
                `${fmtDateTime(booking.cancellationRequest.processedAt)}${booking.cancellationRequest.processedByName ? ` by ${booking.cancellationRequest.processedByName}` : ""}`
              )}
              {booking.cancellationRequest.rejectReason && row("Reject reason", booking.cancellationRequest.rejectReason)}
            </div>
          )}

          {/* Cancelled / stolen: one clear red banner on both tabs. */}
          {dead && (
            <div className="mt-2 mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-red-700">
                {isStolen ? "Stolen — car flagged stolen" : "Cancelled"}
              </p>
              {!isStolen && booking.cancellationReason && (
                <p className="text-xs text-red-700 mt-0.5">Reason: {booking.cancellationReason}</p>
              )}
              {refundNote && <p className="text-xs text-red-700 mt-0.5">Payment: {refundNote}</p>}
            </div>
          )}

          {/* Number Coding restrictions the customer was warned about when booking
              (booking.codingWarnings). Shown on both tabs — staff doing pickup on the Steps tab
              need it as much as someone reading Details. Nothing renders for older bookings. */}
          {codingByCity.length > 0 && (
            <div className="mt-2 mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">⚠️ Number Coding restrictions found before booking</p>
              <ul className="mt-1.5 space-y-0.5">
                {codingByCity.map((c) => (
                  <li key={c.city || "city"}>
                    <span className="font-semibold">{c.city || "City"}</span>
                    {c.plateLastDigit != null ? ` (plate ending ${c.plateLastDigit})` : ""}
                    {c.text ? `: ${c.text}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "steps" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                {doneCount} of {countable.length} steps done
              </p>
              <ol className="space-y-2">
                {steps.map((st) => {
                  const sty = STEP_STYLE[st.state];
                  const actions = stepActions[st.key] || [];
                  return (
                    <li
                      key={st.key}
                      className={`rounded-xl border ${st.state === "current" ? "border-teal-200 bg-teal-50/40" : st.state === "stopped" ? "border-red-200 bg-red-50/40" : "border-gray-100 bg-white"}`}
                    >
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className={`w-8 h-8 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold ${sty.dot}`}>
                          {st.state === "done" ? <IconCheck className="w-4 h-4" />
                            : st.state === "stopped" ? <IconX className="w-4 h-4" />
                            : st.state === "skipped" ? "–"
                            : st.state === "missing" ? "!"
                            : st.n}
                        </span>
                        <div className="min-w-0 flex-1 basis-40">
                          <p className={`text-sm font-semibold leading-snug ${sty.text}`}>{st.n}. {st.title}</p>
                          <p className={`text-xs mt-0.5 ${st.warn ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                            {st.state === "stopped" ? (isStolen ? "Not completed — car flagged stolen" : "Cancelled — did not happen") : st.sub}
                          </p>
                        </div>
                        {actions.length > 0 && (
                          <div className="flex items-center gap-2 shrink-0 ml-auto">
                            {actions.map((a) => (
                              <button key={a.label} onClick={a.onClick} className={stepBtn}>{a.label}</button>
                            ))}
                          </div>
                        )}
                      </div>

                      {st.parts && (
                        <ul className="pl-[3.75rem] pr-4 pb-3 pt-0.5 space-y-2">
                          {st.parts.map((p) => (
                            <li key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              <span className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                                p.bad ? "bg-red-500 text-white border-red-500"
                                : p.done === undefined ? "bg-gray-100 text-gray-400 border-gray-200"
                                : p.done ? "bg-green-500 text-white border-green-500"
                                : "bg-white text-gray-300 border-gray-300"
                              }`}>
                                {p.bad ? <IconX className="w-3 h-3" /> : p.done ? <IconCheck className="w-3 h-3" /> : p.done === undefined ? "•" : ""}
                              </span>
                              <div className="min-w-0 flex-1 basis-40">
                                <span className="text-sm font-medium text-gray-700">{p.label}</span>
                                <span className={`text-xs ml-2 ${p.warn || p.bad ? "text-red-600 font-semibold" : "text-gray-400"}`}>{p.text}</span>
                              </div>
                              {p.actions && (
                                <div className="flex items-center gap-2 shrink-0 ml-auto">
                                  {p.actions.map((a) => (
                                    <button key={a.label} onClick={a.onClick} className={partBtn}>{a.label}</button>
                                  ))}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <div className="grid md:grid-cols-2 gap-x-8">
              <div>
                {row("Booking ID",      booking.bookingID || booking.id)}
                <div className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-500 font-medium w-36 shrink-0">Customer</span>
                  {booking.userID ? (
                    <button onClick={() => onViewCustomer(booking.userID)} className="text-indigo-600 hover:underline font-medium text-right">
                      {booking.customerName || "—"}
                    </button>
                  ) : (
                    <span className="text-gray-800 text-right">{booking.customerName || "—"}</span>
                  )}
                </div>
                {row("Phone",           booking.phone)}
                {row("Vehicle",
                  booking.carID && booking.vehicleName ? (
                    <button onClick={goToCarTracking} title="Open in Car Tracking" className="text-indigo-600 hover:underline font-medium text-right">
                      {booking.vehicleName}
                    </button>
                  ) : booking.vehicleName
                )}
                {row("Service Type",    booking.serviceTypeName)}
                {row("Car ID",          booking.carID)}
                {row("Created",         fmtDateTime(booking.createdAt))}
                {row("Start Date",      fmtDate(booking.startDateTime))}
                {row("End Date",        fmtDate(booking.endDateTime))}
                {row("Duration",        booking.totalDays != null ? `${booking.totalDays} day${booking.totalDays > 1 ? "s" : ""}` : "—")}
                <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-500 font-medium w-36 shrink-0">Location</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-800 text-right truncate">{booking.location || "—"}</span>
                    {locationStops.length > 0 ? (
                      <button onClick={() => setMapOpen(true)} className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg px-2.5 py-1 transition-colors shrink-0">
                        View Map →
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300 shrink-0">No map data</span>
                    )}
                  </div>
                </div>
                {/* T&C this customer ticked "I agree" to. Written once at booking creation, never edited. */}
                <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-500 font-medium w-36 shrink-0">Terms &amp; Conditions</span>
                  {booking.termsViewID && booking.termsAcceptedAt ? (
                    <div className="text-right min-w-0">
                      <button onClick={goToTerms} title="Open the exact Terms & Conditions text the customer agreed to" className="text-indigo-600 hover:underline font-medium">
                        {booking.termsVersionNumber != null && Number.isFinite(Number(booking.termsVersionNumber))
                          ? `Version ${Number(booking.termsVersionNumber).toFixed(2)}`
                          : "View agreed terms"} →
                      </button>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Agreed {fmtDateTime(booking.termsAcceptedAt)}
                      </p>
                    </div>
                  ) : booking.termsAcceptedAt ? (
                    <div className="text-right">
                      <span className="text-gray-800">Agreed {fmtDateTime(booking.termsAcceptedAt)}</span>
                      <p className="text-xs text-gray-400 mt-0.5">Version not recorded</p>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-right">No agreement recorded</span>
                  )}
                </div>
              </div>

              <div>
                {row("Rental Fee",  fmt(booking.rentalFee))}
                {row("Service Fee", fmt(booking.serviceFee))}
                {Number(booking.gatewayFee) > 0 && row("Gateway Fee", fmt(booking.gatewayFee))}
                {row("Extra Fee",   fmt(booking.extraFee))}
                {Number(booking.driversFee) > 0 && row("Driver's Fee", fmt(booking.driversFee))}
                {row("Security Deposit", booking.paymentStatus === "Refunded" && booking.securityDeposit > 0
                  ? `${fmt(booking.securityDeposit)} · Refunded`
                  : booking.deposit
                    ? (booking.deposit.status === "Waived"
                        ? "Waived"
                        : `${fmt(booking.deposit.amount)} · ${booking.deposit.status || "Held"}`)
                    : Number(booking.securityDeposit) > 0
                      ? `${fmt(booking.securityDeposit)} · Awaiting payment`
                      : "Not collected")}
                {row("Total Fee",   fmt(booking.totalFee))}
                {row("Payment", (
                  <button
                    type="button"
                    onClick={goToPayments}
                    className="text-teal-700 font-semibold hover:underline"
                    title="Open this booking's payment on the Payments page"
                  >
                    {booking.paymentMethod || "Payment"} · View in Payments →
                  </button>
                ))}
                {row("Driving",     booking.modeOfDriving)}
                <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-500 font-medium w-36 shrink-0">Driver</span>
                  {booking.driverID ? (
                    <span className="text-gray-800 text-right">
                      {booking.driverName || "—"}
                      {booking.driverPhone && booking.driverPhone !== "—" ? ` · ${booking.driverPhone}` : ""}
                    </span>
                  ) : (
                    <span className="text-gray-400 italic text-right">{isChauffeur ? "No driver assigned" : "Not needed"}</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 pt-1 mt-1 border-t border-gray-100">
                {row("Notes (User)",  booking.notesUser)}
                {row("Notes (Admin)", booking.notesAdmin)}
                {booking.cancellationReason && row("Cancel Reason", booking.cancellationReason)}
              </div>
            </div>
          )}
        </div>

        {/* Actions — only the ones that apply to this booking / this role. */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
        {(onEdit || onRefund || onDelete) && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
            {onEdit && canEdit(booking.status) && (
              <button onClick={() => onEdit(booking)} className="flex-1 px-3 py-2 border border-teal-400 text-teal-600 rounded-xl text-sm hover:bg-teal-50 transition-colors">Edit</button>
            )}
            {onRefund && canRefundCancel(booking.status) && (
              <button onClick={() => onRefund(booking)} className="flex-1 px-3 py-2 border border-orange-300 text-orange-600 rounded-xl text-sm hover:bg-orange-50 transition-colors whitespace-nowrap">Refund / Cancel</button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(booking)} className="flex-1 px-3 py-2 border border-red-200 text-red-500 rounded-xl text-sm hover:bg-red-50 transition-colors">Delete</button>
            )}
          </div>
        )}
          <button onClick={onClose} className="w-full mt-2 py-2 border rounded-xl text-sm">Close</button>
        </div>
      </div>

      <TripMapModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title={`${booking.customerName || "Booking"} — ${booking.vehicleName || ""}`}
        stops={locationStops}
      />
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function Bookings() {
  const { fmt } = useCurrency();
  const { getToken, effectiveRole } = useAuth();
  const canRefundRole = [ROLES.ADMIN, ROLES.OWNER].includes(effectiveRole);
  const [refundBooking, setRefundBooking] = useState(null);
  const [activeTab, setActiveTab]           = useState("All");
  const [search, setSearch]                 = useState("");
  const [searchBy, setSearchBy]             = useState("customer");
  const [dateValue, setDateValue]           = useState(""); // "YYYY-MM-DD" from the date picker
  const [allBookings, setAllBookings]       = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [viewBooking, setViewBooking]       = useState(null);
  const [editBooking, setEditBooking]       = useState(null);
  const [deleteBooking, setDeleteBooking]   = useState(null);
  const [deleteToast, setDeleteToast]       = useState(null);
  // Customer name → profile modal, in place, instead of navigating to /users.
  // Shared by both the table row and ViewModal (ViewModal passes its own
  // trigger down to this same modal via the userID it's given).
  const [profileUserID, setProfileUserID]   = useState(null);
  const [searchParams, setSearchParams]     = useSearchParams();
  const [sortKey, setSortKey]               = useState("created");  // newest bookings on top by default
  const [sortDir, setSortDir]               = useState("desc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created" ? "desc" : "asc");
    }
  };

  const showToast = (msg, type = "success") => {
    setDeleteToast({ msg, type });
    setTimeout(() => setDeleteToast(null), 4000);
  };

  // `silent` skips the loading spinner — used by the live-refresh listener below
  // so a change from another admin/customer doesn't flash the whole table blank.
  const fetchBookings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings?status=all`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load bookings");
      setAllBookings(json.data);
    } catch (err) { if (!silent) setError(err.message); }
    finally { if (!silent) setLoading(false); }
  }, [getToken]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // ── Live refresh ────────────────────────────────────────────────────────────
  // The REST endpoint does all the real work (joins car/user/driver info, sorts,
  // filters), so instead of re-implementing that here off raw Firestore docs,
  // we just listen for *any* change to the bookings collection and re-run the
  // existing fetch. Bursts of writes (e.g. a booking + its history doc changing
  // together) are coalesced with a short debounce so we don't hammer the API.
  //
  // CHANGED: this used to be onSnapshot(collection(db, "bookings")) — which reads
  // EVERY booking document each time the page opens and again on every change
  // (per open tab), on top of the API re-fetch it triggered. Now it just
  // re-runs the same API fetch every 45s while the tab is visible.
  usePolling(() => fetchBookings(true), 45_000, { immediate: false });

  // Opens a specific status tab when linked in via ?tab=<Upcoming|Ongoing|...>
  // (used by Dashboard's stat cards). Runs once, on mount — doesn't need to
  // wait on bookings to load like ?open= below does.
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (!tabParam) return;
    const match = STATUS_TABS.find((t) => t.toLowerCase() === tabParam.toLowerCase());
    if (match) setActiveTab(match);
    setSearchParams((prev) => { prev.delete("tab"); return prev; }, { replace: true });
  }, [searchParams, setSearchParams]);

  // Linked in with ?search=<bookingID> (e.g. Payments' "View booking"): fills the search bar, on the All tab so the
  // booking can't be hidden by a status tab, then strips the param. The list is filtered right away, no loading wait.
  useEffect(() => {
    const q = searchParams.get("search");
    if (!q) return;
    setSearchBy("booking"); // these links always carry a booking ID
    setDateValue("");
    setSearch(q);
    setActiveTab("All");
    setSearchParams((prev) => { prev.delete("search"); return prev; }, { replace: true });
  }, [searchParams, setSearchParams]);

  // Opens the exact booking a notification click pointed to (?open=<refID>,
  // set by Header.jsx). Runs once bookings are loaded so the record is
  // actually there to find; strips the param afterward so refreshing/
  // navigating away doesn't keep re-opening it.
  useEffect(() => {
    const openID = searchParams.get("open");
    if (!openID || loading || allBookings.length === 0) return;
    const match = allBookings.find((b) => b.id === openID || b.bookingID === openID);
    if (match) setViewBooking(match);
    setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
  }, [searchParams, allBookings, loading, setSearchParams]);

  // DeleteBundleModal does the asking + the DELETE call (blockers, force, whole-booking archive); we only react.
  const handleDeleted = (json) => {
    const removed = deleteBooking;
    setAllBookings((prev) => prev.filter((b) => b.id !== removed.id));
    showToast(json?.message || "Booking archived.", "success");
    setDeleteBooking(null);
  };

  const counts = {
    All:       allBookings.length,
    "To Pay":  allBookings.filter((b) => b.status?.toLowerCase() === "to pay").length,
    Upcoming:  allBookings.filter((b) => b.status?.toLowerCase() === "upcoming").length,
    Ongoing:   allBookings.filter((b) => b.status?.toLowerCase() === "ongoing").length,
    Cancelled: allBookings.filter((b) => b.status?.toLowerCase() === "cancelled").length,
    Completed: allBookings.filter((b) => b.status?.toLowerCase() === "completed").length,
  };
  const cancellationRequestCount = allBookings.filter((b) => b.status?.toLowerCase() === "cancellation_request").length;

  const tabFiltered  = activeTab === "All"
    ? allBookings
    : allBookings.filter((b) => b.status?.toLowerCase() === activeTab.toLowerCase());

  const searchType = SEARCH_BY.find((o) => o.key === searchBy)?.type || "text";
  const hasFilters = !!search.trim() || !!dateValue || activeTab !== "All";
  const clearFilters = () => { setSearch(""); setDateValue(""); setActiveTab("All"); };

  const filtered = tabFiltered.filter((b) => {
    if (searchType === "date") {
      if (!dateValue) return true;
      const val = searchBy === "created" ? b.createdAt : searchBy === "start" ? b.startDateTime : b.endDateTime;
      return dayKey(val) === dateValue;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = {
      customer: b.customerName,
      phone:    b.phone,
      vehicle:  b.vehicleName,
      phase:    b.paymentStage,
      booking:  b.bookingID || b.id,
    }[searchBy];
    return String(hay || "").toLowerCase().includes(q);
  });

  // Sort (dates/fee only — everything else stays in API/insertion order).
  // Applied after search+tab filtering, before pagination, so page counts
  // reflect the sorted set and Page 1 always shows the "top" of the sort.
  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    let av, bv;
    if (sortKey === "start") { av = toMillis(a.startDateTime); bv = toMillis(b.startDateTime); }
    else if (sortKey === "end") { av = toMillis(a.endDateTime); bv = toMillis(b.endDateTime); }
    else if (sortKey === "fee") { av = a.totalFee ?? -Infinity; bv = b.totalFee ?? -Infinity; }
    else if (sortKey === "created") { av = toMillis(a.createdAt); bv = toMillis(b.createdAt); }
    else return 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const { page, setPage, totalPages, pageItems, start, count } = usePagination(sorted);
  // Jump back to page 1 whenever the visible set changes shape (new search/filter/tab).
  useEffect(() => { setPage(1); }, [search, searchBy, dateValue, activeTab, allBookings]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtDuration = (days) => { if (days == null) return "—"; return days <= 1 ? `${days} day` : `${days} days`; };

  return (
    <div className="p-4 space-y-5 font-sans">

      {/* TOAST */}
      {deleteToast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${deleteToast.type === "error" ? "bg-red-500" : "bg-teal-600"}`}>
          {deleteToast.msg}
        </div>
      )}

      {/* STAT TABS */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {STATUS_TABS.map((tab) => {
          const TabIcon = TAB_ICON[tab];
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`p-4 rounded-2xl border text-left transition-all ${activeTab === tab ? "border-teal-500 bg-teal-50 shadow-sm" : "bg-white hover:bg-gray-50"}`}
            >
              <div className="flex items-start justify-between">
                <div className={`text-2xl font-bold ${activeTab === tab ? "text-teal-600" : "text-gray-800"}`}>{loading ? "…" : counts[tab] ?? 0}</div>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${TAB_ICON_COLOR[tab]}`}>
                  <TabIcon className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                {tab === "All" ? "All Bookings" : tab}
                {tab === "Cancelled" && cancellationRequestCount > 0 && <span className="w-2 h-2 bg-red-500 rounded-full inline-block" />}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex justify-between items-center">
          <span className="flex items-center gap-2">
            <IconWarning className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={fetchBookings} className="underline font-semibold">Retry</button>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        {/* SEARCH + FILTERS */}
        <div className="flex flex-wrap gap-3 items-end p-4 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search by</span>
            <select
              value={searchBy}
              onChange={(e) => { setSearchBy(e.target.value); setSearch(""); setDateValue(""); }}
              className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white"
            >
              {SEARCH_BY.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          {searchType === "date" ? (
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none"
            />
          ) : (
            <input
              type="text"
              placeholder={`Enter ${(SEARCH_BY.find((o) => o.key === searchBy)?.label || "").toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none"
            />
          )}
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white"
          >
            {STATUS_TABS.map((t) => <option key={t} value={t}>{t === "All" ? "All statuses" : t}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 rounded-xl transition-colors">
              Clear
            </button>
          )}
          <button
            onClick={fetchBookings}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 flex items-center gap-1.5"
          >
            <IconRefresh className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <SortableTh label="Created At" sortKey="created" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Contact No.</th>
                <th className="px-4 py-3 text-left">Vehicle</th>
                <SortableTh label="Trip Start" sortKey="start" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Trip End" sortKey="end" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left">Duration</th>
                <SortableTh label="Total Fee" sortKey="fee" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left">Phase</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 11 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-gray-400 py-12">No bookings found</td></tr>
              ) : (
                pageItems.map((b) => {
                  const needsAction = b.status?.toLowerCase() === "cancellation_request";
                  return (
                    <tr key={b.id} className={`border-t hover:bg-gray-50 transition-colors ${needsAction ? "bg-orange-50 border-l-4 border-l-orange-500" : ""}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-gray-700">{fmtDate(b.createdAt)}</span>
                        <span className="mx-1.5 text-gray-300">|</span>
                        <span className="text-gray-500">{fmtTime(b.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setProfileUserID(b.userID)}
                          disabled={!b.userID}
                          className="font-medium text-gray-800 hover:text-indigo-600 hover:underline text-left disabled:no-underline disabled:cursor-default disabled:hover:text-gray-800"
                        >
                          {b.customerName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{b.phone || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700">{b.vehicleName}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(b.startDateTime)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(b.endDateTime)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDuration(b.totalDays)}
                        {b.durationType && <span className="text-xs text-gray-400 ml-1">· {b.durationType}</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{fmt(b.totalFee)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {b.paymentStage && b.paymentStage !== "—" ? b.paymentStage : "—"}
                        {Number(b.balance) > 0 && ![ "For Refund", "Refunded", "Cancelled" ].includes(b.paymentStage) && <div className="text-xs text-orange-600">{fmt(b.balance)} remaining</div>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => setViewBooking(b)} className="px-3 py-1 border rounded-lg text-xs hover:bg-gray-50">View</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>

      {viewBooking   && (
        <ViewModal
          booking={viewBooking}
          onClose={() => setViewBooking(null)}
          onViewCustomer={setProfileUserID}
          onEdit={(b) => { setViewBooking(null); setEditBooking(b); }}
          onRefund={canRefundRole ? (b) => { setViewBooking(null); setRefundBooking(b); } : undefined}
          onDelete={(b) => { setViewBooking(null); setDeleteBooking(b); }}
        />
      )}
      {editBooking   && <EditModal booking={editBooking} onClose={() => setEditBooking(null)} onSave={() => { setEditBooking(null); fetchBookings(); }} />}
      {refundBooking && (
        <RefundCancelModal
          booking={refundBooking}
          onClose={() => setRefundBooking(null)}
          onDone={(msg) => { setRefundBooking(null); showToast(msg, "success"); fetchBookings(); }}
        />
      )}
      {profileUserID && <CustomerProfileModal userID={profileUserID} bookings={allBookings} onClose={() => setProfileUserID(null)} />}
      {deleteBooking && (
        <DeleteBundleModal
          kind="booking"
          id={deleteBooking.id}
          label={deleteBooking.bookingID || deleteBooking.id}
          onClose={() => setDeleteBooking(null)}
          onDone={handleDeleted}
        />
      )}
    </div>
  );
}