import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";
import { useCurrency } from "../context/CurrencyContext";

// ─── SHARED PIECES (local to this page) ─────────────────
const PAGE_SIZE = 10;

const IconRefresh = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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

const IconX = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// The window itself: title + badges on top, scrolling body, footer slot. Esc closes it.
function LogWindow({ title, badges, onClose, footer, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              <h2 className="font-bold text-lg text-gray-800">{title}</h2>
              {badges}
            </div>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 shrink-0"><IconX className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3">{children}</div>
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center gap-2">{footer}</div>
      </div>
    </div>
  );
}

// Footer for an archived record: Restore, Delete forever (Owner only) and Close.
function ArchiveFooter({ onRestore, onDelete, canDelete, busy, onClose }) {
  return (
    <>
      <button onClick={onRestore} disabled={busy}
        className="px-4 py-2 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors">
        {busy ? "…" : "Restore"}
      </button>
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
      className="text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed">
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



// Same badges as the live Transaction Logs page.
const statusBadge = {
  Success:  "bg-green-50 border border-green-200",
  Failed:   "bg-red-50 border border-red-200",
  Pending:  "bg-yellow-50 border border-yellow-200",
  Refunded: "bg-blue-100 text-blue-600",
  Rejected: "bg-red-50 border border-red-200",
};
const typeBadge = {
  Payment:  "bg-purple-50 border border-purple-200",
  Refund:   "bg-blue-50 border border-blue-200",
  Deposit:  "bg-teal-50 border border-teal-200",
  Discount: "bg-orange-50 border border-orange-200",
  Expense:  "bg-pink-50 border border-pink-200",
};
const TYPE_OPTIONS   = ["Payment", "Refund", "Deposit", "DepositReturn", "Discount", "Expense"];
const STATUS_OPTIONS = Object.keys(statusBadge);

const typeDot = (cls) => cls.includes("purple") ? "bg-purple-500" : cls.includes("blue") ? "bg-blue-500" : cls.includes("teal") ? "bg-teal-500" : "bg-gray-400";
const statusDot = (cls) => cls.includes("green") ? "bg-green-500" : cls.includes("red") ? "bg-red-500" : cls.includes("yellow") ? "bg-yellow-400" : cls.includes("blue") ? "bg-blue-500" : "bg-gray-400";

function TypeBadge({ type }) {
  const cls = typeBadge[type] || "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-black ${cls}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${typeDot(cls)}`} />
      {type || "—"}
    </span>
  );
}
function StatusBadge({ status }) {
  const cls = statusBadge[status] || "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-black ${cls}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(cls)}`} />
      {status || "—"}
    </span>
  );
}

// "Search by" options: the two date options open a date picker, the others are text. Type and Status have their own dropdowns.
const ARCHIVE_SEARCH_BY = [
  { key: "user",         label: "Customer",      type: "text" },
  { key: "uid",          label: "User ID",       type: "text" },
  { key: "logId",        label: "Log ID",        type: "text" },
  { key: "paymentId",    label: "Payment ID",    type: "text" },
  { key: "description",  label: "Description",   type: "text" },
  { key: "archivedDate", label: "Archived Date", type: "date" },
  { key: "createdDate",  label: "Created Date",  type: "date" },
];

// ─── DETAILS WINDOW ──────────────────────────────────────────────────────────
// Same layout as the live Transaction Logs window, plus the archive facts, with Restore / Delete in the footer.
function ViewModal({ record, fmtAmount, viewerRole, canDelete, busy, onRestore, onDelete, onClose }) {
  const navigate = useNavigate();
  const go = (path) => { onClose(); navigate(path); };
  const link = (label, path) => (
    <button type="button" onClick={() => go(path)} className="text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap">{label}</button>
  );
  const idLine = (id, linkEl) => <span className="inline-flex items-center gap-2 flex-wrap"><span className="font-mono text-xs">{id}</span>{linkEl}</span>;
  const customer = useAccount(record.userID);        // the customer the money event belongs to
  const staff    = useAccount(record.performedBy);   // admin who triggered it (discount, reject, expense); null for customer/webhook events
  const hasRelated = !!(record.bookingID || record.paymentID || record.refundReqID || record.penaltyID);

  return (
    <LogWindow
      title="Transaction Log Archive Details"
      badges={<><TypeBadge type={record.type} /><StatusBadge status={record.status} /></>}
      onClose={onClose}
      footer={<ArchiveFooter onRestore={onRestore} onDelete={onDelete} canDelete={canDelete} busy={busy} onClose={onClose} />}
    >
      <InfoSection title="What happened">
        <InfoField wide label="Description" value={<span className="whitespace-pre-wrap leading-relaxed font-normal">{record.description || "—"}</span>} />
        <InfoField label="Amount" value={fmtAmount(record.amount)} />
        <InfoField label="Method" value={record.paymentMethod && record.paymentMethod !== "Not recorded" ? record.paymentMethod : "Not recorded"} />
        <InfoField label="Reference #" value={record.referenceNumber} />
        <InfoField label="Created At" value={<Stamp iso={record.createdAt} />} />
      </InfoSection>

      <InfoSection title="Customer" action={<ViewUserButton uid={record.userID} account={customer} viewerRole={viewerRole} onGo={go} />}>
        <InfoField label="Name" value={accountName(record.userID, customer, record.userName)} />
        <InfoField label="Email" value={customer && customer.email} />
      </InfoSection>

      {record.performedBy && (
        <InfoSection title="Done by (staff)" action={<ViewUserButton uid={record.performedBy} account={staff} viewerRole={viewerRole} onGo={go} />}>
          <InfoField label="Name" value={accountName(record.performedBy, staff)} />
          <InfoField label="Email" value={staff && staff.email} />
        </InfoSection>
      )}

      {hasRelated && (
        <InfoSection title="Related records">
          {record.bookingID && <InfoField label="Booking" value={idLine(record.bookingID, link("View booking →", `/bookings?open=${encodeURIComponent(record.bookingID)}`))} />}
          {record.paymentID && <InfoField label="Payment" value={idLine(record.paymentID, link("View payment →", `/payments?paymentID=${encodeURIComponent(record.paymentID)}`))} />}
          {record.refundReqID && <InfoField label="Refund request" value={idLine(record.refundReqID, link("View refund →", `/refund-requests?search=${encodeURIComponent(record.refundReqID)}`))} />}
          {record.penaltyID && <InfoField label="Penalty" value={idLine(record.penaltyID, link("View penalty →", `/penalties?open=${encodeURIComponent(record.penaltyID)}`))} />}
        </InfoSection>
      )}

      <ArchiveSection archivedAt={record.archivedAt} archivedBy={record.archivedBy} />

      <InfoSection title="Reference">
        <InfoField mono label="Archive ID" value={record.transactionLogArchivesId} />
        <InfoField mono label="Log ID" value={record.transactionLogsID || record.originalId} />
        <InfoField mono label="User ID" value={record.userID} />
        {record.paymentEntryID && <InfoField mono label="Payment entry ID" value={record.paymentEntryID} />}
      </InfoSection>
    </LogWindow>
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
  plus:     "M12 5v14M5 12h14",
  edit:     "M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z",
  trash:    "M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14M10 11v6M14 11v6",
  upload:   "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  lock:     "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4",
  server:   "M2 4h20v6H2zM2 14h20v6H2zM6 7h.01M6 17h.01",
  monitor:  "M2 4h20v13H2zM8 21h8M12 17v4",
  globe:    "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18",
  phone:    "M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1zM12 18h.01",
  card:     "M2 5h20v14H2zM2 10h20",
  undo:     "M1 4v6h6M3.51 15a9 9 0 102.13-9.36L1 10",
  tag:      "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01",
  file:     "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8",
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
const TX_CARD_META = {
  Payment:       { label: "Payment",        icon: "card",     color: "bg-purple-50 text-purple-600" },
  Refund:        { label: "Refund",         icon: "undo",     color: "bg-blue-50 text-blue-600" },
  Deposit:       { label: "Deposit",        icon: "download", color: "bg-teal-50 text-teal-600" },
  DepositReturn: { label: "Deposit Return", icon: "upload",   color: "bg-gray-100 text-gray-600" },
  Discount:      { label: "Discount",       icon: "tag",      color: "bg-orange-50 text-orange-600" },
  Expense:       { label: "Expense",        icon: "file",     color: "bg-pink-50 text-pink-600" },
};

// ─── PAGE ────────────────────────────────────────────────────────────────────
export default function TransactionLogArchivePage() {
  const { user: viewer, effectiveRole } = useAuth();
  const { fmt } = useCurrency();
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [searchBy, setSearchBy]   = useState("user");
  const [dateValue, setDateValue] = useState("");   // "YYYY-MM-DD" from the date picker
  const [typeF, setTypeF]         = useState("All");
  const [statusF, setStatusF]     = useState("All");
  const [toast, setToast]         = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState(null);
  const [actionId, setActionId]   = useState(null);
  const [viewRecord, setViewRecord] = useState(null);

  const [sortKey, setSortKey] = useState("created");   // "created" | "archived"
  const [sortDir, setSortDir] = useState("desc");     // newest on top by default
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const token = localStorage.getItem("token");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/transaction-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load archive.");
      setRecords(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleRestore = async (transactionLogArchivesId) => {
    setRestoreConfirmId(null);
    setActionId(transactionLogArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/transaction-logs/${transactionLogArchivesId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Restore failed.");
      setRecords((prev) => prev.filter((r) => r.transactionLogArchivesId !== transactionLogArchivesId));
      setViewRecord(null);
      showToast("Transaction log restored to active table.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const handleDelete = async (transactionLogArchivesId) => {
    setConfirmId(null);
    setActionId(transactionLogArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/transaction-logs/${transactionLogArchivesId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      setRecords((prev) => prev.filter((r) => r.transactionLogArchivesId !== transactionLogArchivesId));
      setViewRecord(null);
      showToast("Permanently deleted.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const peso = (n) => {
    if (n == null) return "—";
    if (fmt) return fmt(n);
    return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  };

  const filtered = records.filter((r) => {
    if (typeF !== "All" && r.type !== typeF) return false;
    if (statusF !== "All" && r.status !== statusF) return false;
    if (searchBy === "archivedDate") return !dateValue || dayKeyOf(r.archivedAt) === dateValue;
    if (searchBy === "createdDate")  return !dateValue || dayKeyOf(r.createdAt) === dateValue;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay =
      searchBy === "uid"         ? (r.userID || "") :
      searchBy === "logId"       ? `${r.transactionLogArchivesId || ""} ${r.transactionLogsID || ""}` :
      searchBy === "paymentId"   ? (r.paymentID || "") :
      searchBy === "description" ? (r.description || "") :
                                   `${r.userName || ""} ${r.userID || ""}`;
    return hay.toLowerCase().includes(q);
  });

  const msOf = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return isNaN(t) ? -Infinity : t; };
  const dateOf = (r) => (sortKey === "archived" ? r.archivedAt : r.createdAt);
  const sorted = [...filtered].sort((a, b) => {
    const av = msOf(dateOf(a)), bv = msOf(dateOf(b));
    if (av === bv) return 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(sorted, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, searchBy, dateValue, typeF, statusF, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchOpt = ARCHIVE_SEARCH_BY.find((o) => o.key === searchBy) || ARCHIVE_SEARCH_BY[0];
  const filtersActive = !!search.trim() || !!dateValue || typeF !== "All" || statusF !== "All";
  const restoreConfirmRecord = records.find((r) => r.transactionLogArchivesId === restoreConfirmId);
  const canDelete = effectiveRole === ROLES.OWNER;

  return (
    <div className="w-full px-4 space-y-5">

      {toast && (
        <div className={`fixed top-5 right-5 z-[80] px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === "error"
            ? "bg-red-50 text-red-700 border border-red-200"
            : "bg-green-50 text-green-700 border border-green-200"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* z-[70]: these open on top of the details window they were started from. */}
      {confirmId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-gray-800 mb-2">Permanently Delete?</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(confirmId)} className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}

      {restoreConfirmId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-gray-800 mb-2">Restore this transaction log?</h3>
            {restoreConfirmRecord && (
              <p className="text-xs text-gray-500 mb-2">{restoreConfirmRecord.userName || "—"} — {restoreConfirmRecord.type}</p>
            )}
            <p className="text-sm text-gray-500 mb-5">It will move back to the live transaction log.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRestoreConfirmId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleRestore(restoreConfirmId)} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700">Yes, Restore</button>
            </div>
          </div>
        </div>
      )}

      {viewRecord && (
        <ViewModal
          record={viewRecord}
          fmtAmount={peso}
          viewerRole={viewer?.role}
          canDelete={canDelete}
          busy={!!actionId}
          onRestore={() => setRestoreConfirmId(viewRecord.transactionLogArchivesId)}
          onDelete={() => setConfirmId(viewRecord.transactionLogArchivesId)}
          onClose={() => setViewRecord(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">TRANSACTION LOG ARCHIVE</h1>
        <p className="text-sm text-gray-400 mt-1">
          {loading ? "Loading…" : `${filtered.length} archived record${filtered.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      {/* TYPE CARDS: one per type + All, same look as the Bookings status cards. */}
      <StatCards loading={loading} value={typeF} onSelect={setTypeF} className="grid-cols-3 sm:grid-cols-4 lg:grid-cols-7"
        cards={[
          { key: "All", label: "All Transactions", count: records.length, ...ALL_CARD },
          ...TYPE_OPTIONS.map((t) => ({ key: t, count: records.filter((l) => l.type === t).length, ...TX_CARD_META[t] })),
        ]} />

      {/* TABLE: the search + filters sit on top of the table inside one box, same as the live Transaction Logs */}
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
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
            className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white">
            <option value="All">All statuses</option>
            {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
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
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="pl-4 pr-8 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400 py-12">
                    {filtersActive ? "No records match your filters." : "No archived transaction logs found."}
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.transactionLogArchivesId} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><Stamp iso={r.createdAt} /></td>
                    <td className="px-4 py-3"><Stamp iso={r.archivedAt} /></td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap" title={r.userID || ""}>{r.userName || r.userID || "—"}</td>
                    <td className="px-4 py-3"><TypeBadge type={r.type} /></td>
                    <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">{peso(r.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs"><span className="block truncate" title={r.description || ""}>{r.description || "—"}</span></td>
                    <td className="pl-4 pr-8 py-3 text-right">
                      <button onClick={() => setViewRecord(r)}
                        className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">View</button>
                    </td>
                  </tr>
                ))
              )}
              {/* Same as Refunds: pad a short page with empty rows so the table always keeps its 10-row height. */}
              {!loading && paginated.length > 0 && Array.from({ length: Math.max(0, PAGE_SIZE - paginated.length) }).map((_, i) => (
                <tr key={`filler-${i}`} aria-hidden="true" className="border-t">
                  <td colSpan={8} className="h-[53px]">&nbsp;</td>
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