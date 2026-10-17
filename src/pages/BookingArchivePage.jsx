import { Fragment, useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";
import { useCurrency } from "../context/CurrencyContext";
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import PaymentEntriesPanel from "../components/shared/PaymentEntriesPanel";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function inRange(iso, from, to) {
  if (!from && !to) return true;
  const d = new Date(iso);
  if (isNaN(d)) return true;
  if (from && d < new Date(from)) return false;
  if (to   && d > new Date(to + "T23:59:59")) return false;
  return true;
}

const statusColor = {
  pending:   "bg-yellow-100 text-yellow-700",
  approved:  "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const PAGE_SIZE = 15;

// The View dialog for one archived booking. Tabs run along the top:
//   Booking | Payment | Inspection | Session | Penalties | Refunds | Reviews | Maintenance
// "Booking" is the archived booking itself. Every other tab loads the first time it is opened and is then kept.
// Read-only: Restore and permanent delete stay on the booking row.

const money = (n) => `\u20b1${(Number(n) || 0).toLocaleString("en-PH")}`;

const prettyLabel = (key) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()).trim();

const DATE_KEY_RE = /(At|Date|Time)$/;
const MONEY_KEY_RE = /(amount|fee|cost|price|deposit|balance|paid)/i;
const fmtDate = (v) => {
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

// Firestore timestamps come through the API as { _seconds, _nanoseconds } (or { seconds, nanoseconds }).
const asTimestamp = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const s = v._seconds ?? v.seconds;
  return typeof s === "number" ? new Date(s * 1000) : null;
};

const isEmpty = (v) =>
  v === null || v === undefined || v === "" ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && !asTimestamp(v) && Object.keys(v).length === 0);

// One readable string for any value: dates as dates, objects as "Label: value" lines, lists as numbered blocks.
function toText(key, val, depth = 0) {
  if (isEmpty(val)) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  const ts = asTimestamp(val);
  if (ts) return fmtDate(ts);
  if (typeof val === "number" && MONEY_KEY_RE.test(key)) return money(val);
  if (typeof val === "string" && DATE_KEY_RE.test(key)) { const d = new Date(val); if (!isNaN(d)) return fmtDate(val); }
  if (Array.isArray(val)) {
    if (val.every((x) => x === null || typeof x !== "object")) return val.map((x) => toText(key, x, depth)).join(", ");
    return val.map((x, n) => `${val.length > 1 ? `${n + 1}. ` : ""}${toText(key, x, depth + 1).replace(/\n/g, "\n   ")}`).join("\n");
  }
  if (typeof val === "object") {
    return Object.entries(val)
      .filter(([, v]) => !isEmpty(v))
      .map(([k, v]) => {
        const t = toText(k, v, depth + 1);
        return `${prettyLabel(k)}: ${t.includes("\n") ? "\n  " + t.replace(/\n/g, "\n  ") : t}`;
      })
      .join("\n") || "—";
  }
  return String(val);
}
const formatValue = (key, val) => toText(key, val);
const isIdKey = (k) => /(Id|ID)$/.test(k);

const STATUS = {
  pending:   "bg-yellow-100 text-yellow-700",
  approved:  "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

// kind: "single" = one record, "inspection" = four groups of rows, "list" = several records with a Details toggle.
const TABS = [
  { key: "booking", label: "Booking" },
  {
    key: "payment", label: "Payment", endpoint: "payment", kind: "single",
    empty: "No payment was archived with this booking.",
    labels: { paymentsArchivesId: "Archive ID", bookingID: "Booking ID", userID: "User ID" },
  },
  { key: "inspection", label: "Inspection", endpoint: "vehicle-inspection", kind: "inspection", empty: "No vehicle inspection records for this booking." },
  {
    key: "session", label: "Session", endpoint: "booking-session", kind: "single",
    empty: "No booking session was archived with this booking.",
    labels: { bookingSessionArchivesId: "Archive ID", bookingID: "Booking ID", carID: "Car ID" },
  },
  {
    key: "penalties", label: "Penalties", endpoint: "penalties", kind: "list", empty: "No penalties were archived with this booking.",
    summary: (r) => ({ main: r.penaltyID || r.id, sub: [r.status, money(r.amount)] }),
    labels: { penaltyArchivesId: "Archive ID", bookingID: "Booking ID", paymentID: "Payment ID", userID: "User ID", carID: "Car ID" },
  },
  {
    key: "refunds", label: "Refunds", endpoint: "refund-requests", kind: "list", empty: "No refund requests were archived with this booking.",
    summary: (r) => ({ main: r.refundRequestID || r.id, sub: [r.status, money(r.toRefundAmount)] }),
    labels: { refundArchivesId: "Archive ID", bookingID: "Booking ID", paymentID: "Payment ID" },
  },
  {
    key: "reviews", label: "Reviews", endpoint: "reviews", kind: "list", empty: "No reviews were archived with this booking.",
    summary: (r) => ({ main: `${r.rating ?? "—"} / 5`, sub: [r.comment ? String(r.comment).slice(0, 80) : "No comment"] }),
    labels: { reviewsArchivesID: "Archive ID", bookingID: "Booking ID", userID: "User ID", carID: "Car ID" },
  },
  {
    key: "maintenance", label: "Maintenance", endpoint: "maintenance", kind: "list", empty: "No maintenance records were archived with this booking.",
    summary: (r) => ({ main: r.description || r.maintenanceID || r.id, sub: [r.status, r.basis, money(r.totalCost)] }),
    labels: { maintenanceArchivesId: "Archive ID", bookingID: "Booking ID", carID: "Car ID" },
  },
];

const INSPECTION_GROUPS = [
  ["inventoryBeforeTrip", "Parts — before trip"],
  ["inventoryAfterTrip", "Parts — after trip"],
  ["vehicleDocumentationBeforeTrip", "Photos — before trip"],
  ["vehicleDocumentationAfterTrip", "Photos — after trip"],
];

// Label/value cards in two columns; ids are monospaced, long or object values take the full row.
function Fields({ record, labels = {} }) {
  const entries = Object.entries(record || {});
  if (entries.length === 0) return <p className="text-sm text-gray-400">No details available.</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {entries.map(([key, val]) => {
        const text = formatValue(key, val);
        const wide = text.includes("\n") || text.length > 48;
        return (
          <div key={key} className={`rounded-xl bg-gray-50 px-3 py-2 min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
            <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{labels[key] || prettyLabel(key)}</dt>
            <dd className={`text-sm text-gray-800 break-all whitespace-pre-wrap mt-0.5 ${isIdKey(key) ? "font-mono text-xs" : ""}`}>{text}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Empty({ text }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 text-gray-400">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3 text-lg">∅</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-gray-100" />)}
    </div>
  );
}

function ListRows({ tab, rows }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const id = r.id ?? i;
        const { main, sub = [] } = tab.summary(r);
        const isOpen = openId === id;
        const chips = sub.filter(Boolean);
        return (
          <div key={id} className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{main}</p>
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {chips.map((c, k) => (
                      <span key={k} className={`px-2 py-0.5 rounded-full text-[11px] ${STATUS[String(c).toLowerCase()] || "bg-gray-100 text-gray-500"}`}>{c}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setOpenId(isOpen ? null : id)}
                className="px-3 py-1.5 text-xs rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 whitespace-nowrap"
              >
                {isOpen ? "Hide" : "Details"}
              </button>
            </div>
            {isOpen && (
              <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-white">
                <Fields record={r} labels={tab.labels} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LinkedBody({ tab, state }) {
  if (!state || state.loading) return <Skeleton />;
  if (state.error) return <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{state.error}</div>;

  if (tab.kind === "single") {
    if (!state.data) return <Empty text={state.message || tab.empty} />;
    return (
      <div className="space-y-5">
        {tab.key === "session" && <LocationMap record={state.data} />}
        <Fields record={state.data} labels={tab.labels} />
        {tab.key === "payment" && (
          <div className="pt-4 border-t border-gray-100">
            <PaymentEntriesPanel query={{ paymentID: state.data.paymentID || state.data.originalId }} title="All money movements on this payment" />
          </div>
        )}
      </div>
    );
  }

  if (tab.kind === "inspection") {
    const data = state.data || {};
    const groups = INSPECTION_GROUPS.filter(([key]) => (data[key] || []).length > 0);
    if (groups.length === 0) return <Empty text={state.message || tab.empty} />;
    return (
      <div className="space-y-6">
        {groups.map(([key, label]) => (
          <section key={key}>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label} <span className="text-gray-300">({data[key].length})</span></h4>
            <div className="space-y-2">
              {data[key].map((row, i) => (
                <div key={row.id ?? i} className="border border-gray-100 rounded-xl bg-white p-3"><Fields record={row} /></div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  const rows = Array.isArray(state.data) ? state.data : [];
  if (rows.length === 0) return <Empty text={state.message || tab.empty} />;
  return <ListRows tab={tab} rows={rows} />;
}

// ── Location map ─────────────────────────────────────────────
// Collects every place on an archived record (pickup, dropoff, geofence zones, last position) and draws them on one map.
const toNum = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const readPoint = (o) => {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const lat = toNum(o.lat ?? o.latitude);
  const lng = toNum(o.lng ?? o.lon ?? o.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, label: o.address || o.label || o.name || null, radius: toNum(o.radius) };
};
function collectPlaces(record) {
  const out = [];
  const one = (key, kind, label) => {
    const pt = readPoint(record?.[key]);
    if (pt) out.push({ ...pt, kind, label: pt.label ? `${label}: ${pt.label}` : label, radius: NaN });
  };
  one("pickupLocation", "pickup", "Pickup");
  one("dropoffLocation", "dropoff", "Dropoff");
  one("location", "location", "Location");
  one("currentPosition", "position", "Last known position");
  (Array.isArray(record?.geofenceZones) ? record.geofenceZones : []).forEach((z, i) => {
    const pt = readPoint(z);
    if (pt) out.push({ ...pt, kind: "zone", label: pt.label ? `Zone ${i + 1}: ${pt.label}` : `Zone ${i + 1}` });
  });
  return out;
}

const PLACE_COLOR = { pickup: "#0d9488", dropoff: "#f59e0b", location: "#6366f1", position: "#ef4444", zone: "#3b82f6" };

function FitPlaces({ places }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    places.forEach((p) => {
      if (Number.isFinite(p.radius) && p.radius > 0) bounds.extend(L.latLng(p.lat, p.lng).toBounds(p.radius * 2)); // box around the circle; needs no map (Circle.getBounds() does)
      else bounds.extend([p.lat, p.lng]);
    });
    if (!bounds.isValid()) return;
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }, [map, places]);
  return null;
}

function LocationMap({ record, height = 240 }) {
  const places = collectPlaces(record);
  if (places.length === 0) return null;
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Map</h4>
      <div className="rounded-xl overflow-hidden border border-gray-100" style={{ height }}>
        <MapContainer center={[places[0].lat, places[0].lng]} zoom={14} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {places.map((p, i) => (
            <Fragment key={i}>
              {Number.isFinite(p.radius) && p.radius > 0 && (
                <Circle center={[p.lat, p.lng]} radius={p.radius} pathOptions={{ color: PLACE_COLOR[p.kind], weight: 1.5, fillOpacity: 0.12 }} />
              )}
              <CircleMarker center={[p.lat, p.lng]} radius={8} pathOptions={{ color: "#fff", weight: 2, fillColor: PLACE_COLOR[p.kind], fillOpacity: 1 }}>
                <Tooltip>{p.label}</Tooltip>
              </CircleMarker>
            </Fragment>
          ))}
          <FitPlaces places={places} />
        </MapContainer>
      </div>
      <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {places.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-600 min-w-0">
            <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PLACE_COLOR[p.kind] }} />
            <span className="break-words min-w-0">
              {p.label}{Number.isFinite(p.radius) && p.radius > 0 ? ` (${p.radius} m)` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, children }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 min-w-0">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <div className="text-sm font-medium text-gray-800 mt-0.5 truncate">{children}</div>
    </div>
  );
}

function BookingArchiveViewModal({ record, token, onClose }) {
  const { fmt } = useCurrency();
  const [active, setActive] = useState("booking");
  const [cache, setCache]   = useState({}); // tab key -> { loading, data, error, message }

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!record) return null;

  const load = async (tab) => {
    setCache((c) => ({ ...c, [tab.key]: { loading: true } }));
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/bookings/${record.bookingArchivesId}/${tab.endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let json = {};
      try { json = JSON.parse(text); } catch { /* HTML error page from the server */ }
      if (!res.ok) throw new Error(json.message || `Could not load (${res.status}).`);
      setCache((c) => ({ ...c, [tab.key]: { loading: false, data: json.data ?? null, message: json.message } }));
    } catch (err) {
      setCache((c) => ({ ...c, [tab.key]: { loading: false, error: err.message } }));
    }
  };

  const select = (tab) => {
    setActive(tab.key);
    if (tab.key === "booking") return;
    const cached = cache[tab.key];
    if (!cached || cached.error) load(tab); // load once; retry only after a failure
  };

  const countOf = (tab) => {
    const st = cache[tab.key];
    if (tab.kind !== "list" || !st || st.loading || st.error) return null;
    return Array.isArray(st.data) ? st.data.length : null;
  };

  const peso = (n) => (n == null ? "—" : fmt ? fmt(n) : `\u20b1${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  const status = (record.status || "").toLowerCase();
  const activeTab = TABS.find((t) => t.key === active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-teal-600 uppercase tracking-wider">Booking archive</p>
            <h3 className="text-lg font-semibold text-gray-800 font-mono break-all">{record.bookingID || record.bookingArchivesId}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {record.customerName || "Unknown customer"}
              {record.archivedAt ? ` · archived ${fmtDate(record.archivedAt)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {record.status && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS[status] || "bg-gray-100 text-gray-500"}`}>{record.status}</span>
            )}
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">✕</button>
          </div>
        </div>

        {/* TABS */}
        <div className="px-6 border-b border-gray-100 shrink-0 overflow-x-auto">
          <div role="tablist" className="flex gap-1 min-w-max">
            {TABS.map((tab) => {
              const on = active === tab.key;
              const n = countOf(tab);
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => select(tab)}
                  className={`relative px-4 py-2.5 text-sm whitespace-nowrap transition-colors ${
                    on ? "text-teal-700 font-semibold" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {tab.label}
                  {n !== null && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">{n}</span>}
                  {on && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-teal-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-5 bg-gray-50/40">
          {active === "booking" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Customer">{record.customerName || "—"}</Stat>
                <Stat label="Amount">{peso(record.amount ?? record.totalFee)}</Stat>
                <Stat label="Booking date">{record.createdAt ? fmtDate(record.createdAt) : "—"}</Stat>
                <Stat label="Archived at">{record.archivedAt ? fmtDate(record.archivedAt) : "—"}</Stat>
              </div>
              <LocationMap record={record} />
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">All booking details</h4>
                <Fields record={record} labels={{ bookingArchivesId: "Archive ID", bookingID: "Booking ID", carID: "Car ID", userID: "User ID" }} />
              </section>
              <section className="pt-4 border-t border-gray-100">
                <PaymentEntriesPanel query={{ bookingID: record.bookingID }} title="Money movements for this booking" />
              </section>
            </div>
          ) : (
            <LinkedBody tab={activeTab} state={cache[active]} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function BookingArchivePage() {
  const { effectiveRole } = useAuth();
  const { fmt } = useCurrency();
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [page, setPage]           = useState(1);
  const [toast, setToast]         = useState(null);
  const [confirmId, setConfirmId] = useState(null); // bookingArchivesId pending delete confirm
  const [restoreConfirmId, setRestoreConfirmId] = useState(null); // bookingArchivesId pending restore confirm
  const [actionId, setActionId]   = useState(null); // currently processing id
  const [viewRecord, setViewRecord] = useState(null); // record currently shown in the detail modal

  const token = localStorage.getItem("token");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load archive.");
      setRecords(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // ── CASCADE RESTORE ──────────────────────────────────────────
  // Restores booking + linked payment, reviews, session, penalties, refund requests, payment entries,
  // driver assignments, cancellation requests and maintenance records back to live collections,
  // then removes all three archive records.
  const handleRestore = async (bookingArchivesId) => {
    setRestoreConfirmId(null);
    setActionId(bookingArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/bookings/${bookingArchivesId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Restore failed.");
      // Remove the record from the list since the archive doc was deleted on restore
      setRecords((prev) => prev.filter((r) => r.bookingArchivesId !== bookingArchivesId));
      showToast(data.message || "Booking restored successfully.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  // ── CASCADE DELETE ───────────────────────────────────────────
  // Permanently deletes bookingArchive + every linked archive (payment, reviews, session, penalties, refunds,
  // payment entries, driver assignments, cancellation requests, maintenance) + inspection records.
  const handleDelete = async (bookingArchivesId) => {
    setConfirmId(null);
    setActionId(bookingArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/bookings/${bookingArchivesId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      setRecords((prev) => prev.filter((r) => r.bookingArchivesId !== bookingArchivesId));
      showToast(data.message || "Permanently deleted.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      (r.bookingArchivesId || "").toLowerCase().includes(q) ||
      (r.bookingID         || "").toLowerCase().includes(q) ||
      (r.customerName      || "").toLowerCase().includes(q) ||
      (r.status            || "").toLowerCase().includes(q);
    return matchSearch && inRange(r.archivedAt, dateFrom, dateTo);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, dateFrom, dateTo]);

  const peso = (n) => {
    if (n == null) return "—";
    if (fmt) return fmt(n);
    return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  };

  // The record currently pending delete (for confirm modal details)
  const confirmRecord = records.find((r) => r.bookingArchivesId === confirmId);
  const restoreConfirmRecord = records.find((r) => r.bookingArchivesId === restoreConfirmId);

  return (
    <div className="w-full px-6 py-6">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.type === "error" ? "bg-red-500" : "bg-teal-600"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* CASCADE RESTORE CONFIRM MODAL */}
      {restoreConfirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 text-lg">↺</div>
              <h3 className="font-semibold text-gray-800">Restore this booking?</h3>
            </div>
            {restoreConfirmRecord && (
              <p className="text-xs font-mono text-gray-400 mb-3 break-all">
                Booking ID: {restoreConfirmRecord.bookingID || restoreConfirmRecord.bookingArchivesId}
              </p>
            )}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 mb-4 space-y-1">
              <p className="text-xs font-semibold text-teal-800">This will also restore:</p>
              <ul className="text-xs text-teal-700 list-disc ml-4 space-y-0.5">
                <li>The linked payment and its payment entries (if any)</li>
                <li>All linked reviews (if any)</li>
                <li>The linked booking session (if any)</li>
                <li>Penalties and refund requests (if any)</li>
                <li>Driver assignments and cancellation requests (if any)</li>
                <li>Maintenance records linked to this booking (if any)</li>
                <li>This booking's vehicle inspection records — before/after parts status and photo links (if any)</li>
              </ul>
              <p className="text-xs text-teal-600 mt-1">All matching archive records will be removed once restored.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => setRestoreConfirmId(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestore(restoreConfirmId)}
                className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700"
              >
                Yes, Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODAL — booking + tabs for everything archived with it (payment, inspection, session, penalties, refunds, reviews, maintenance) */}
      {viewRecord && (
        <BookingArchiveViewModal record={viewRecord} token={token} onClose={() => setViewRecord(null)} />
      )}

      {/* CASCADE DELETE CONFIRM MODAL */}
      {confirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-lg">🗑</div>
              <h3 className="font-semibold text-gray-800">Permanently Delete Archive?</h3>
            </div>
            {confirmRecord && (
              <p className="text-xs font-mono text-gray-400 mb-3 break-all">
                Booking ID: {confirmRecord.bookingID || confirmRecord.bookingArchivesId}
              </p>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 space-y-1">
              <p className="text-xs font-semibold text-amber-800">This will also permanently delete:</p>
              <ul className="text-xs text-amber-700 list-disc ml-4 space-y-0.5">
                <li>The linked payment archive and its payment entries (if any)</li>
                <li>All linked review archives (if any)</li>
                <li>The linked booking session archive (if any)</li>
                <li>Penalty and refund request archives (if any)</li>
                <li>Driver assignment and cancellation request archives (if any)</li>
                <li>Maintenance archives linked to this booking (if any)</li>
                <li>This booking's vehicle inspection archive — before/after parts status and photo links (if any)</li>
                <li>The inspection photos and the GPS history file stored in Firebase Storage (they are removed from Storage too)</li>
              </ul>
              <p className="text-xs text-amber-600 mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmId)}
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm hover:bg-red-600"
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">BOOKING ARCHIVE</h1>
        <p className="text-sm text-gray-400 mt-1">
          {loading ? "Loading…" : `${filtered.length} archived record${filtered.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by archive ID, booking ID, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 w-72"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 whitespace-nowrap">Archived from</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <label className="text-xs text-gray-400">to</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
        <button onClick={fetchRecords} disabled={loading} className="px-4 py-2 text-sm rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 ml-auto">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Archive ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Deleted Booking ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Booking Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Archived At</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">{search || dateFrom || dateTo ? "No records match your filters." : "No archived bookings found."}</td></tr>
            ) : (
              paginated.map((r, i) => (
                <tr key={r.bookingArchivesId} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors ${i % 2 !== 0 ? "bg-gray-50/20" : ""}`}>
                  {/* Archive ID */}
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[130px]" title={r.bookingArchivesId}>
                    {r.bookingArchivesId}
                  </td>
                  {/* Deleted Booking ID — the main identifier of what was deleted */}
                  <td className="px-4 py-3 max-w-[180px]">
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg break-all">
                      {r.bookingID || r.originalId || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">{r.customerName || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-700 font-medium">{peso(r.amount ?? r.totalFee)}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[(r.status || "").toLowerCase()] || "bg-gray-100 text-gray-500"}`}>
                      {r.status || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">{formatDate(r.archivedAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setViewRecord(r)}
                        disabled={!!actionId}
                        title="View full archived record"
                        className="px-3 py-1.5 text-xs rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        View
                      </button>
                      <button
                        onClick={() => setRestoreConfirmId(r.bookingArchivesId)}
                        disabled={!!actionId}
                        title="Restores the booking and everything archived with it (payment, entries, reviews, session, penalties, refunds, driver, cancellation, maintenance) and removes the archive records"
                        className="px-3 py-1.5 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 whitespace-nowrap"
                      >
                        {actionId === r.bookingArchivesId ? "…" : "Restore"}
                      </button>
                      {(effectiveRole === ROLES.OWNER || effectiveRole === ROLES.ADMIN) && (
                      <button
                        onClick={() => setConfirmId(r.bookingArchivesId)}
                        disabled={!!actionId}
                        title="Permanently deletes this archive and everything archived with it, plus its inspection records"
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        Delete
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">← Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}