import { Fragment, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";
import { useCurrency } from "../context/CurrencyContext";
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import PaymentEntriesPanel from "../components/shared/PaymentEntriesPanel";

const PAGE_SIZE = 10;

// ─── SHARED PIECES (local to this page) ─────────────────
// ─── ICONS ───────────────────────────────────────────────────────────────────
const IconX = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconRefresh = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── DATES ───────────────────────────────────────────────────────────────────
// "Oct 17, 2026 | 3:45 PM": date and time in one cell, split by a pipe (same as the live log pages).
const stampParts = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
  };
};
const stampText = (iso) => { const p = stampParts(iso); return p ? `${p.date} | ${p.time}` : "—"; };
const Stamp = ({ iso }) => {
  const p = stampParts(iso);
  if (!p) return <span className="text-gray-300">—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="text-gray-700">{p.date}</span>
      <span className="mx-1.5 text-gray-300">|</span>
      <span className="text-gray-500">{p.time}</span>
    </span>
  );
};

// Local "YYYY-MM-DD" of a date value: what a date picker is compared against.
const dayKeyOf = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ─── PAGINATION ──────────────────────────────────────────────────────────────
function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp if the list shrinks (filter / search / refresh / restore) and we were on a now-empty page.
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { page: safePage, setPage, totalPages, pageItems, start, count: items.length };
}

function Pagination({ page, totalPages, onChange, start, pageSize, count }) {
  if (count === 0) return null;

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

// ─── DETAILS WINDOW PIECES ───────────────────────────────────────────────────
// Card + label-over-value cell: same as the live log pages' details windows.
function InfoSection({ title, action, children }) {
  return (
    <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4">{children}</div>
    </section>
  );
}
function InfoField({ label, value, wide, mono }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className={`text-sm font-medium text-gray-800 mt-0.5 break-words ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</div>
    </div>
  );
}

// The window itself: title + badges on top, scrolling body, footer slot. Esc closes it.
// `tabs` (optional) is a strip that sits between the title and the body; `wide` makes the window larger and a fixed height
// so switching tabs doesn't make it jump.
function LogWindow({ title, badges, onClose, footer, children, tabs, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full flex flex-col ${wide ? "max-w-4xl h-[88vh]" : "max-w-2xl max-h-[92vh]"}`} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              <h2 className="font-bold text-lg text-gray-800">{title}</h2>
              {badges}
            </div>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 shrink-0"><IconX className="w-5 h-5" /></button>
          </div>
        </div>
        {tabs}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3">{children}</div>
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center gap-2">{footer}</div>
      </div>
    </div>
  );
}

// Footer for an archived record: Restore, Delete forever (Owner only) and Close.
function ArchiveFooter({ onRestore, onDelete, canDelete, busy, onClose, extra }) {
  return (
    <>
      <button onClick={onRestore} disabled={busy}
        className="px-4 py-2 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors">
        {busy ? "…" : "Restore"}
      </button>
      {extra}
      {canDelete && (
        <button onClick={onDelete} disabled={busy}
          className="px-4 py-2 border border-red-200 text-red-500 rounded-xl text-sm hover:bg-red-50 disabled:opacity-40 transition-colors">
          Delete
        </button>
      )}
      <button onClick={onClose} className="ml-auto px-4 py-2 border rounded-xl text-sm hover:bg-gray-50">Close</button>
    </>
  );
}

// ─── ACCOUNTS ────────────────────────────────────────────────────────────────
// Which Users tab an account lives on, and who may open it. Keep in sync with ROLE_TABS in Users.jsx.
const USER_TAB_BY_ROLE = {
  Customer:           { key: "customer",   visibleTo: [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR] },
  [ROLES.DRIVER]:     { key: "driver",     visibleTo: [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR] },
  [ROLES.SUPERVISOR]: { key: "supervisor", visibleTo: [ROLES.OWNER, ROLES.ADMIN] },
  [ROLES.ADMIN]:      { key: "admin",      visibleTo: [ROLES.OWNER] },
};

// Looks one account up by ID: undefined = loading, null = no ID / not found (e.g. deleted since), else { name, email, role }.
function useAccount(uid) {
  const [account, setAccount] = useState(undefined);
  useEffect(() => {
    if (!uid) { setAccount(null); return; }
    let cancelled = false;
    setAccount(undefined);
    const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
    const base = process.env.REACT_APP_API_URL;
    (async () => {
      try {
        const res = await fetch(`${base}/api/users/by-uid/${encodeURIComponent(uid)}`, { headers });
        if (!res.ok) throw new Error("user not found");
        const u = (await res.json())?.data || {};
        let fullName = "";
        try {
          const d = await fetch(`${base}/api/users/details/${encodeURIComponent(u.uid || uid)}`, { headers });
          if (d.ok) {
            const { firstName, lastName } = (await d.json())?.data || {};
            fullName = [firstName, lastName].filter(Boolean).join(" ");
          }
        } catch { /* the name is cosmetic */ }
        if (!cancelled) setAccount({ name: fullName || u.username || uid, email: u.email || "", role: u.role || "" });
      } catch {
        if (!cancelled) setAccount(null);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);
  return account;
}

// What to show for an account's name while / after it is looked up. `fallback` is a name the record already carries.
const accountName = (uid, account, fallback) =>
  !uid ? null : account === undefined ? (fallback || "Loading…") : account ? account.name : (fallback || "Account no longer exists");

// "View user →": opens the person in Users (right role tab + their details window). Greyed out, with the reason on hover,
// when it can't: no ID, account deleted, or not listed on the Users page for the viewer's role.
function ViewUserButton({ uid, account, viewerRole, onGo }) {
  const tab = account ? USER_TAB_BY_ROLE[account.role] : null;
  const canOpen = !!(uid && tab && tab.visibleTo.includes(viewerRole));
  const title = canOpen ? "" : !uid ? "No user recorded"
    : account === undefined ? "Loading…"
    : account === null ? "This account no longer exists"
    : "This account isn't listed on the Users page for your role";
  return (
    <button type="button" disabled={!canOpen} title={title}
      onClick={() => onGo(`/users?role=${tab.key}&tab=directory&open=${encodeURIComponent(uid)}`)}
      className="text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed">
      View user →
    </button>
  );
}

// "Archive" card: when it was archived and (when the record carries it) by whom.
function ArchiveSection({ archivedAt, archivedBy, showArchivedBy = true }) {
  const by = useAccount(showArchivedBy ? archivedBy : null);
  return (
    <InfoSection title="Archive">
      <InfoField label="Archived At" value={stampText(archivedAt)} />
      {showArchivedBy && <InfoField label="Archived By" value={accountName(archivedBy, by)} />}
    </InfoSection>
  );
}

// ─── SORT HEADER (same look as Bookings / Refunds) ───────────────────────────
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
    <th className={`px-4 py-3 text-left select-none ${className}`}>
      <button onClick={() => onSort(key)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}>
        {label}
        {active ? <IconSortArrow dir={sortDir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

// ─── STAT CARDS (same look as the Bookings status cards) ─────────────────────
const CARD_PATHS = {
  grid:     "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  clock:    "M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2",
  check:    "M20 6L9 17l-5-5",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  close:    "M18 6L6 18M6 6l12 12",
  lock:     "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4",
  moon:     "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
  user:     "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  alert:    "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
};
const CardIcon = ({ name, className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d={CARD_PATHS[name]} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
// One card = count + round icon + label. Click a card to filter the table to it; the "All" card clears the filter.
function StatCards({ cards, value, onSelect, loading, className }) {
  return (
    <div className={`grid gap-3 ${className}`}>
      {cards.map((c) => {
        const on = value === c.key;
        return (
          <button key={c.key} type="button" onClick={() => onSelect(c.key)}
            className={`p-4 rounded-2xl border text-left transition-all ${on ? "border-teal-500 bg-teal-50 shadow-sm" : "bg-white hover:bg-gray-50"}`}>
            <div className="flex items-start justify-between">
              <div className={`text-2xl font-bold ${on ? "text-teal-600" : "text-gray-800"}`}>{loading ? "…" : c.count}</div>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${c.color}`}>
                <CardIcon name={c.icon} />
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{c.label}</div>
          </button>
        );
      })}
    </div>
  );
}
const ALL_CARD = { icon: "grid", color: "bg-teal-50 text-teal-600" };

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
function Fields({ record, labels = {}, omit = [] }) {
  const entries = Object.entries(record || {}).filter(([k]) => !omit.includes(k));
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

// ── Inspection photos ────────────────────────────────────────
// Photo fields are stored as links (frontViewUrl, leftMirrorUrl, ...). Show them as thumbnails; click to enlarge.
const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v.trim());
const isPhotoEntry = ([k, v]) => /Url$/.test(k) && isHttpUrl(v);
const photoLabel = (k) => prettyLabel(k.replace(/Url$/, ""));

// Esc closes the topmost layer only (capture phase, so the modal underneath doesn't close too).
function useEscapeLayer(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
}

function PhotoLightbox({ photo, onClose }) {
  useEscapeLayer(onClose);
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={photo.label}>
      <div className="w-full max-w-5xl flex items-center justify-between text-white mb-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold">{photo.label}</p>
        <div className="flex items-center gap-3">
          <a href={photo.url} target="_blank" rel="noreferrer" className="text-xs underline text-white/80 hover:text-white">Open original</a>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">✕</button>
        </div>
      </div>
      <img src={photo.url} alt={photo.label} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-[80vh] rounded-xl object-contain bg-black/30" />
    </div>
  );
}

function PhotoGrid({ photos, onOpen }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
      {photos.map((ph) => (
        <button key={ph.key} type="button" onClick={() => onOpen(ph)} className="group text-left rounded-xl overflow-hidden border border-gray-100 bg-gray-50 hover:border-teal-300 transition">
          <img src={ph.url} alt={ph.label} loading="lazy" className="w-full h-28 object-cover bg-gray-100"
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <span className="block px-2 py-1.5 text-[11px] font-medium text-gray-600 truncate group-hover:text-teal-700">{ph.label}</span>
        </button>
      ))}
    </div>
  );
}

// One documentation record: its photos as thumbnails, its other fields (ids, dates) as before.
function PhotoRecord({ row, onOpen }) {
  const photos = Object.entries(row).filter(isPhotoEntry).map(([k, v]) => ({ key: k, label: photoLabel(k), url: v.trim() }));
  const videos = Array.isArray(row.videos) ? row.videos : [];
  const extras = Array.isArray(row.extraPhotos) ? row.extraPhotos : [];
  const extraPhotos = extras.filter((p) => isHttpUrl(p?.url)).map((p, i) => ({ key: p.url, label: p.caption || `Additional photo ${i + 1}`, url: p.url.trim() }));
  const confirmed = row.inspectionConfirmed || null;
  return (
    <div className="border border-gray-100 rounded-xl bg-white p-3">
      <Fields record={row} omit={[...photos.map((p) => p.key), "videos", "extraPhotos", "inspectionConfirmed"]} />
      {confirmed && (
        <p className="text-xs text-green-700 mt-2">
          {"\u2713"} Inspection confirmed{confirmed.at ? ` on ${formatValue("confirmedAt", confirmed.at)}` : ""}
        </p>
      )}
      {photos.length > 0 && <PhotoGrid photos={photos} onOpen={onOpen} />}
      {extraPhotos.length > 0 && <PhotoGrid photos={extraPhotos} onOpen={onOpen} />}
      {videos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {videos.map((v) => (
            <video key={v.url} src={v.url} controls preload="metadata" className="w-full rounded-xl border border-gray-100 bg-black" />
          ))}
        </div>
      )}
    </div>
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
  const [photo, setPhoto] = useState(null);
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
                key.startsWith("vehicleDocumentation")
                  ? <PhotoRecord key={row.id ?? i} row={row} onOpen={setPhoto} />
                  : <div key={row.id ?? i} className="border border-gray-100 rounded-xl bg-white p-3"><Fields record={row} /></div>
              ))}
            </div>
          </section>
        ))}
        {photo && <PhotoLightbox photo={photo} onClose={() => setPhoto(null)} />}
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

function FitPlaces({ places, focus = null }) {
  const map = useMap();
  useEffect(() => {
    if (focus !== null && places[focus]) {          // a clicked place: zoom right in on it
      map.invalidateSize();
      map.setView([places[focus].lat, places[focus].lng], 17);
      return;
    }
    const bounds = L.latLngBounds([]);
    places.forEach((p) => {
      if (Number.isFinite(p.radius) && p.radius > 0) bounds.extend(L.latLng(p.lat, p.lng).toBounds(p.radius * 2)); // box around the circle; needs no map (Circle.getBounds() does)
      else bounds.extend([p.lat, p.lng]);
    });
    if (!bounds.isValid()) return;
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }, [map, places, focus]);
  return null;
}

function PlaceMarkers({ places }) {
  return places.map((p, i) => (
    <Fragment key={i}>
      {Number.isFinite(p.radius) && p.radius > 0 && (
        <Circle center={[p.lat, p.lng]} radius={p.radius} pathOptions={{ color: PLACE_COLOR[p.kind], weight: 1.5, fillOpacity: 0.12 }} />
      )}
      <CircleMarker center={[p.lat, p.lng]} radius={8} pathOptions={{ color: "#fff", weight: 2, fillColor: PLACE_COLOR[p.kind], fillOpacity: 1 }}>
        <Tooltip>{p.label}</Tooltip>
      </CircleMarker>
    </Fragment>
  ));
}

// Big, fully zoomable map. `focus` = index of the clicked place (null = show every place).
function MapLightbox({ places, focus, onClose }) {
  useEscapeLayer(onClose);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Map">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800 truncate">{focus !== null && places[focus] ? places[focus].label : "Map"}</p>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100">✕</button>
        </div>
        <div style={{ height: "75vh" }}>
          <MapContainer center={[places[0].lat, places[0].lng]} zoom={14} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <PlaceMarkers places={places} />
            <FitPlaces places={places} focus={focus} />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

function LocationMap({ record, height = 240 }) {
  const places = collectPlaces(record);
  const [zoomed, setZoomed] = useState(false);   // is the big map open
  const [focus, setFocus]   = useState(null);    // index of the place it opened on (null = all)
  const closeZoom = useCallback(() => setZoomed(false), []);
  if (places.length === 0) return null;
  const openZoom = (i = null) => { setFocus(i); setZoomed(true); };
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Map</h4>
      <div className="relative isolate rounded-xl overflow-hidden border border-gray-100" style={{ height }}>
        <MapContainer center={[places[0].lat, places[0].lng]} zoom={14} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <PlaceMarkers places={places} />
          <FitPlaces places={places} />
        </MapContainer>
        <button type="button" onClick={() => openZoom(null)}
          className="absolute top-2 right-2 z-[1000] px-2.5 py-1 rounded-lg bg-white/95 border border-gray-200 shadow text-xs font-semibold text-gray-700 hover:bg-white">
          ⤢ Enlarge
        </button>
      </div>
      <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {places.map((p, i) => (
          <li key={i} className="min-w-0">
            <button type="button" onClick={() => openZoom(i)} title="Click to zoom to this place"
              className="w-full flex items-start gap-2 text-xs text-gray-600 text-left min-w-0 rounded-lg px-1 py-0.5 hover:bg-teal-50 hover:text-teal-700">
              <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PLACE_COLOR[p.kind] }} />
              <span className="break-words min-w-0">
                {p.label}{Number.isFinite(p.radius) && p.radius > 0 ? ` (${p.radius} m)` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {zoomed && <MapLightbox places={places} focus={focus} onClose={closeZoom} />}
    </section>
  );
}

// ─── LIST + WINDOW HELPERS ───────────────────────────────────────────────────
// Archive dates can arrive as ISO strings or Firestore { _seconds } objects; the shared Stamp / dayKeyOf want an ISO string.
const toIso = (v) => { const t = asTimestamp(v); return t ? t.toISOString() : v; };
const msOf  = (v) => { const iso = toIso(v); const t = iso ? new Date(iso).getTime() : NaN; return isNaN(t) ? -Infinity : t; };
const present = (v) => !(v === null || v === undefined || v === "");

// Same colours as the status badge / cards on the live Bookings page.
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
const statusKeyOf = (r) => String(r.status || "").toLowerCase().replace(/_/g, " ");
function BookingStatusBadge({ status }) {
  const s = String(status || "").toLowerCase().replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${STATUS_BG[s] || "bg-gray-50 border border-gray-200"}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s] || "bg-gray-400"}`} />
      {status ? String(status).replace(/_/g, " ") : "—"}
    </span>
  );
}

const STATUS_CARDS = [
  { key: "to pay",    label: "To Pay",    icon: "clock",    color: "bg-orange-50 text-orange-600" },
  { key: "upcoming",  label: "Upcoming",  icon: "clock",    color: "bg-yellow-50 text-yellow-600" },
  { key: "ongoing",   label: "Ongoing",   icon: "activity", color: "bg-blue-50 text-blue-600" },
  { key: "cancelled", label: "Cancelled", icon: "close",    color: "bg-red-50 text-red-600" },
  { key: "completed", label: "Completed", icon: "check",    color: "bg-green-50 text-green-600" },
];

// "Search by" options: the two date options open a date picker, the others are text. Status has its own cards.
const ARCHIVE_SEARCH_BY = [
  { key: "customer",     label: "Customer",      type: "text" },
  { key: "booking",      label: "Booking ID",    type: "text" },
  { key: "archiveId",    label: "Archive ID",    type: "text" },
  { key: "createdDate",  label: "Created Date",  type: "date" },
  { key: "archivedDate", label: "Archived Date", type: "date" },
];

// Fields the "Booking" tab already shows in its own cards, so "All other details" doesn't repeat them.
const SHOWN_KEYS = [
  "bookingArchivesId", "bookingID", "userID", "carID", "customerName", "phone", "createdAt", "archivedAt", "archivedBy",
  "status", "amount", "totalFee", "vehicleName", "serviceTypeName", "startDateTime", "endDateTime", "totalDays",
  "modeOfDriving", "driverName", "rentalFee", "serviceFee", "gatewayFee", "extraFee", "driversFee",
];

// The "Booking" tab: same cards as the live Bookings window (customer, booking, fee), plus the archive facts.
function BookingTab({ record, peso, viewerRole, onGo }) {
  const customer = useAccount(record.userID);
  const fees = [
    ["Rental Fee", record.rentalFee], ["Service Fee", record.serviceFee], ["Gateway Fee", record.gatewayFee],
    ["Extra Fee", record.extraFee], ["Driver's Fee", record.driversFee],
  ].filter(([, v]) => Number(v) > 0);
  const total = record.amount ?? record.totalFee;

  return (
    <div className="space-y-3">
      <InfoSection title="Customer" action={<ViewUserButton uid={record.userID} account={customer} viewerRole={viewerRole} onGo={onGo} />}>
        <InfoField label="Name" value={accountName(record.userID, customer, record.customerName) || record.customerName} />
        <InfoField label="Email" value={customer && customer.email} />
        {present(record.phone) && <InfoField label="Phone" value={record.phone} />}
      </InfoSection>

      <InfoSection title="Booking">
        <InfoField mono label="Booking ID" value={record.bookingID || record.originalId} />
        <InfoField label="Created At" value={present(record.createdAt) ? <Stamp iso={toIso(record.createdAt)} /> : null} />
        {present(record.vehicleName) && <InfoField label="Vehicle" value={record.vehicleName} />}
        {present(record.serviceTypeName) && <InfoField label="Service Type" value={record.serviceTypeName} />}
        {present(record.startDateTime) && <InfoField label="Trip Start" value={<Stamp iso={toIso(record.startDateTime)} />} />}
        {present(record.endDateTime) && <InfoField label="Trip End" value={<Stamp iso={toIso(record.endDateTime)} />} />}
        {present(record.totalDays) && <InfoField label="Duration" value={`${record.totalDays} day${Number(record.totalDays) > 1 ? "s" : ""}`} />}
        {present(record.modeOfDriving) && <InfoField label="Driving" value={record.modeOfDriving} />}
        {present(record.driverName) && <InfoField label="Driver" value={record.driverName} />}
      </InfoSection>

      <InfoSection title="Booking Fee">
        {fees.map(([label, v]) => <InfoField key={label} label={label} value={peso(v)} />)}
        <div className="col-span-2 flex items-baseline justify-end gap-4 pt-3 border-t border-gray-100">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Total Fee</span>
          <span className="text-base font-bold text-gray-800">{peso(total)}</span>
        </div>
      </InfoSection>

      <ArchiveSection archivedAt={toIso(record.archivedAt)} archivedBy={record.archivedBy} showArchivedBy={!!record.archivedBy} />

      <LocationMap record={record} />

      <InfoSection title="Reference">
        <InfoField mono label="Archive ID" value={record.bookingArchivesId} />
        <InfoField mono label="Car ID" value={record.carID} />
        <InfoField mono label="User ID" value={record.userID} />
      </InfoSection>

      <section className="bg-white border rounded-2xl p-4 shadow-sm">
        <PaymentEntriesPanel query={{ bookingID: record.bookingID }} title="Money movements for this booking" />
      </section>

      <details className="bg-white border rounded-2xl shadow-sm">
        <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">All other details</summary>
        <div className="p-4 border-t"><Fields record={record} omit={SHOWN_KEYS} /></div>
      </details>
    </div>
  );
}

// ─── DETAILS WINDOW ──────────────────────────────────────────────────────────
// Tabs run along the top (Booking | Payment | Inspection | …); Restore / Delete live in the footer.
function BookingArchiveViewModal({ record, token, viewerRole, canDelete, busy, onRestore, onDelete, onClose }) {
  const navigate = useNavigate();
  const go = (path) => { onClose(); navigate(path); };
  const { fmt } = useCurrency();
  const [active, setActive] = useState("booking");
  const [cache, setCache]   = useState({}); // tab key -> { loading, data, error, message }

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
  const activeTab = TABS.find((t) => t.key === active);

  const tabs = (
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
  );

  return (
    <LogWindow
      wide
      title="Booking Archive Details"
      badges={<BookingStatusBadge status={record.status} />}
      onClose={onClose}
      tabs={tabs}
      footer={<ArchiveFooter onRestore={onRestore} onDelete={onDelete} canDelete={canDelete} busy={busy} onClose={onClose} />}
    >
      {active === "booking"
        ? <BookingTab record={record} peso={peso} viewerRole={viewerRole} onGo={go} />
        : <LinkedBody tab={activeTab} state={cache[active]} />}
    </LogWindow>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────
export default function BookingArchivePage() {
  const { user: viewer, effectiveRole } = useAuth();
  const { fmt } = useCurrency();
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [searchBy, setSearchBy]   = useState("customer");
  const [dateValue, setDateValue] = useState("");   // "YYYY-MM-DD" from the date picker
  const [statusF, setStatusF]     = useState("All");
  const [toast, setToast]         = useState(null);
  const [confirmId, setConfirmId] = useState(null);               // bookingArchivesId pending delete confirm
  const [restoreConfirmId, setRestoreConfirmId] = useState(null); // bookingArchivesId pending restore confirm
  const [actionId, setActionId]   = useState(null);               // currently processing id
  const [viewRecord, setViewRecord] = useState(null);

  const [sortKey, setSortKey] = useState("created");   // "created" | "archived"
  const [sortDir, setSortDir] = useState("desc");      // newest on top by default
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

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
      setRecords((prev) => prev.filter((r) => r.bookingArchivesId !== bookingArchivesId));
      setViewRecord(null);
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
      setViewRecord(null);
      showToast(data.message || "Permanently deleted.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const peso = (n) => {
    if (n == null) return "—";
    if (fmt) return fmt(n);
    return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  };

  const filtered = records.filter((r) => {
    if (statusF !== "All" && statusKeyOf(r) !== statusF) return false;
    if (searchBy === "archivedDate") return !dateValue || dayKeyOf(toIso(r.archivedAt)) === dateValue;
    if (searchBy === "createdDate")  return !dateValue || dayKeyOf(toIso(r.createdAt)) === dateValue;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay =
      searchBy === "booking"   ? `${r.bookingID || ""} ${r.originalId || ""}` :
      searchBy === "archiveId" ? (r.bookingArchivesId || "") :
                                 (r.customerName || "");
    return hay.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = msOf(sortKey === "archived" ? a.archivedAt : a.createdAt);
    const bv = msOf(sortKey === "archived" ? b.archivedAt : b.createdAt);
    if (av === bv) return 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(sorted, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, searchBy, dateValue, statusF, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchOpt = ARCHIVE_SEARCH_BY.find((o) => o.key === searchBy) || ARCHIVE_SEARCH_BY[0];
  const filtersActive = !!search.trim() || !!dateValue || statusF !== "All";
  const confirmRecord = records.find((r) => r.bookingArchivesId === confirmId);
  const restoreConfirmRecord = records.find((r) => r.bookingArchivesId === restoreConfirmId);
  const canDelete = effectiveRole === ROLES.OWNER;

  return (
    <div className="w-full px-4 space-y-5">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[80] px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === "error"
            ? "bg-red-50 text-red-700 border border-red-200"
            : "bg-green-50 text-green-700 border border-green-200"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* z-[70]: the two confirmations open on top of the details window they were started from. */}
      {/* CASCADE RESTORE CONFIRM */}
      {restoreConfirmId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
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
              <button onClick={() => setRestoreConfirmId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleRestore(restoreConfirmId)} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700">Yes, Restore</button>
            </div>
          </div>
        </div>
      )}

      {/* CASCADE DELETE CONFIRM */}
      {confirmId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
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
              <button onClick={() => setConfirmId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(confirmId)} className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm hover:bg-red-600">Yes, Delete All</button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILS WINDOW — booking + tabs for everything archived with it (payment, inspection, session, penalties, refunds, reviews, maintenance) */}
      {viewRecord && (
        <BookingArchiveViewModal
          record={viewRecord}
          token={token}
          viewerRole={viewer?.role}
          canDelete={canDelete}
          busy={!!actionId}
          onRestore={() => setRestoreConfirmId(viewRecord.bookingArchivesId)}
          onDelete={() => setConfirmId(viewRecord.bookingArchivesId)}
          onClose={() => setViewRecord(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">BOOKING ARCHIVE</h1>
        <p className="text-sm text-gray-400 mt-1">
          {loading ? "Loading…" : `${filtered.length} archived record${filtered.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      {/* STATUS CARDS: same look as the Bookings status cards. Click one to filter; "All" clears it. */}
      <StatCards loading={loading} value={statusF} onSelect={setStatusF} className="grid-cols-3 sm:grid-cols-6"
        cards={[
          { key: "All", label: "All Bookings", count: records.length, ...ALL_CARD },
          ...STATUS_CARDS.map((c) => ({ ...c, count: records.filter((r) => statusKeyOf(r) === c.key).length })),
        ]} />

      {/* TABLE: the search sits on top of the table inside one box, same as the other archive pages */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        {/* SEARCH + FILTERS */}
        <div className="flex flex-wrap gap-3 items-end p-4 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search by</span>
            <select value={searchBy} onChange={(e) => { setSearchBy(e.target.value); setSearch(""); setDateValue(""); }}
              className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white">
              {ARCHIVE_SEARCH_BY.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          {searchOpt.type === "date" ? (
            <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none" />
          ) : (
            <input type="text" placeholder={`Enter ${searchOpt.label.toLowerCase()}...`}
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none" />
          )}
          <button onClick={fetchRecords} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 flex items-center gap-1.5">
            <IconRefresh className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <SortableTh label="Created At" sortKey="created" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Archived At" sortKey="archived" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left">Booking ID</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="pl-4 pr-8 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-gray-400 py-12">
                    {filtersActive ? "No records match your filters." : "No archived bookings found."}
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.bookingArchivesId} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><Stamp iso={toIso(r.createdAt)} /></td>
                    <td className="px-4 py-3"><Stamp iso={toIso(r.archivedAt)} /></td>
                    <td className="px-4 py-3 max-w-[200px]" title={r.bookingArchivesId}>
                      <span className="font-mono text-xs font-semibold text-gray-700 break-all">{r.bookingID || r.originalId || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.customerName || "—"}</td>
                    <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">{peso(r.amount ?? r.totalFee)}</td>
                    <td className="px-4 py-3"><BookingStatusBadge status={r.status} /></td>
                    <td className="pl-4 pr-8 py-3 text-right">
                      <button onClick={() => setViewRecord(r)}
                        className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">View</button>
                    </td>
                  </tr>
                ))
              )}
              {/* Pad a short page with empty rows so the table always keeps its 10-row height. */}
              {!loading && paginated.length > 0 && Array.from({ length: Math.max(0, PAGE_SIZE - paginated.length) }).map((_, i) => (
                <tr key={`filler-${i}`} aria-hidden="true" className="border-t">
                  <td colSpan={7} className="h-[53px]">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>
    </div>
  );
}