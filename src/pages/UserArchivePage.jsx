import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";

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

// Same colours as the account status chips on the live Users page.
const STATUS_BADGE = {
  active:   "bg-blue-50 border border-blue-200",
  inactive: "bg-gray-50 border border-gray-200",
  locked:   "bg-red-50 border border-red-200",
};
const STATUS_DOT = {
  active:   "bg-blue-500",
  inactive: "bg-gray-400",
  locked:   "bg-red-500",
};
function UserStatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-black capitalize ${STATUS_BADGE[s] || "bg-gray-50 border border-gray-200"}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s] || "bg-gray-400"}`} />
      {status || "—"}
    </span>
  );
}

const STATUS_CARDS = [
  { key: "active",   label: "Active",   icon: "check", color: "bg-blue-50 text-blue-600" },
  { key: "inactive", label: "Inactive", icon: "moon",  color: "bg-gray-100 text-gray-600" },
  { key: "locked",   label: "Locked",   icon: "lock",  color: "bg-red-50 text-red-600" },
];

// "Search by" options: the date option opens a date picker, the others are text. Status has its own cards.
const ARCHIVE_SEARCH_BY = [
  { key: "username",     label: "Username",      type: "text" },
  { key: "email",        label: "Email",         type: "text" },
  { key: "uid",          label: "Original UID",  type: "text" },
  { key: "archiveId",    label: "Archive ID",    type: "text" },
  { key: "archivedDate", label: "Archived Date", type: "date" },
];

// ─── DETAILS WINDOW ──────────────────────────────────────────────────────────
// Restore / Merge / Delete live in the footer (they used to sit on every table row).
function ViewModal({ record, canDelete, canMerge, busy, onRestore, onMerge, onDelete, onClose }) {
  return (
    <LogWindow
      title="Deleted User Details"
      badges={<UserStatusBadge status={record.status} />}
      onClose={onClose}
      footer={
        <ArchiveFooter
          onRestore={onRestore} onDelete={onDelete} canDelete={canDelete} busy={busy} onClose={onClose}
          extra={canMerge && (
            <button onClick={onMerge} disabled={busy}
              title="Move this account's old records onto a live account with the same email"
              className="px-4 py-2 rounded-xl text-sm font-medium bg-white text-teal-700 border border-teal-200 hover:bg-teal-50 disabled:opacity-40 transition-colors">
              Merge
            </button>
          )}
        />
      }
    >
      <InfoSection title="Account">
        <InfoField label="Username" value={record.username || record.email} />
        <InfoField label="Email" value={record.email} />
        <InfoField label="Last Status" value={<UserStatusBadge status={record.status} />} />
        {record.role && <InfoField label="Role" value={record.role} />}
        {record.phone && <InfoField label="Contact No." value={record.phone} />}
        {record.createdAt && <InfoField label="Joined" value={<Stamp iso={record.createdAt} />} />}
      </InfoSection>

      <ArchiveSection archivedAt={record.archivedAt} archivedBy={record.archivedBy} showArchivedBy={!!record.archivedBy} />

      <InfoSection title="Reference">
        <InfoField mono label="Archive ID" value={record.userArchivesId} />
        <InfoField mono label="Original UID" value={record.originalId} />
      </InfoSection>

      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
        While archived, the customer's login is disabled (their password is kept). Restoring brings back the profile,
        address, and documents and switches the login back on, so they can sign in as before. Older archives had their
        login deleted: restoring recreates it and emails them to reset their password; if they already signed up again
        with this email, use Merge instead.
      </div>
    </LogWindow>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────
export default function UserArchivePage() {
  const { effectiveRole } = useAuth();
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [searchBy, setSearchBy]   = useState("username");
  const [dateValue, setDateValue] = useState("");   // "YYYY-MM-DD" from the date picker
  const [statusF, setStatusF]     = useState("All");
  const [toast, setToast]         = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState(null);
  const [actionId, setActionId]   = useState(null);
  const [mergeInfo, setMergeInfo] = useState(null); // { record, candidate }
  const [viewRecord, setViewRecord] = useState(null);

  const [sortKey, setSortKey] = useState("archived");
  const [sortDir, setSortDir] = useState("desc");   // newest on top by default
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const token = localStorage.getItem("token");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load archive.");
      setRecords(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleRestore = async (userArchivesId) => {
    setRestoreConfirmId(null);
    setActionId(userArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/users/${userArchivesId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Restore failed.");
      setRecords((prev) => prev.filter((r) => r.userArchivesId !== userArchivesId));
      setViewRecord(null);
      showToast(data.message || "User restored to active table.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  // Look up a live account with the same email, then ask for confirmation.
  const openMerge = async (record) => {
    setActionId(record.userArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/users/${record.userArchivesId}/merge-candidate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Lookup failed.");
      if (!data.data) throw new Error("No live account with this email — use Restore instead.");
      setMergeInfo({ record, candidate: data.data });
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const handleMerge = async () => {
    const { record, candidate } = mergeInfo;
    setMergeInfo(null);
    setActionId(record.userArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/users/${record.userArchivesId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserID: candidate.userID }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Merge failed.");
      setRecords((prev) => prev.filter((r) => r.userArchivesId !== record.userArchivesId));
      setViewRecord(null);
      showToast(data.message || "Merged.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const handleDelete = async (userArchivesId) => {
    setConfirmId(null);
    setActionId(userArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/users/${userArchivesId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      setRecords((prev) => prev.filter((r) => r.userArchivesId !== userArchivesId));
      setViewRecord(null);
      showToast("Permanently deleted.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const statusOf = (r) => String(r.status || "").toLowerCase();

  const filtered = records.filter((r) => {
    if (statusF !== "All" && statusOf(r) !== statusF) return false;
    if (searchBy === "archivedDate") return !dateValue || dayKeyOf(r.archivedAt) === dateValue;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay =
      searchBy === "email"     ? (r.email || "") :
      searchBy === "uid"       ? (r.originalId || "") :
      searchBy === "archiveId" ? (r.userArchivesId || "") :
                                 `${r.username || ""} ${r.email || ""}`;
    return hay.toLowerCase().includes(q);
  });

  const msOf = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return isNaN(t) ? -Infinity : t; };
  const sorted = [...filtered].sort((a, b) => {
    const av = msOf(a.archivedAt), bv = msOf(b.archivedAt);
    if (av === bv) return 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(sorted, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, searchBy, dateValue, statusF, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchOpt = ARCHIVE_SEARCH_BY.find((o) => o.key === searchBy) || ARCHIVE_SEARCH_BY[0];
  const filtersActive = !!search.trim() || !!dateValue || statusF !== "All";
  const restoreConfirmRecord = records.find((r) => r.userArchivesId === restoreConfirmId);
  const canDelete = effectiveRole === ROLES.OWNER;
  const canMerge  = effectiveRole === ROLES.OWNER;   // merge can't be undone either, so Owner only

  return (
    <div className="w-full px-4 space-y-5">

      {toast && (
        <div className={`fixed top-5 right-5 z-[80] max-w-sm px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
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
            <p className="text-sm text-gray-500 mb-5">This will erase this deleted user's archived record and their login for good, and free their email for a new signup. This action cannot be undone.</p>
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
            <h3 className="font-semibold text-gray-800 mb-2">Restore this user?</h3>
            {restoreConfirmRecord && (
              <p className="text-xs text-gray-500 mb-2">{restoreConfirmRecord.username || restoreConfirmRecord.email || "—"}</p>
            )}
            <p className="text-sm text-gray-500 mb-5">Their profile, address and documents move back to the live Users table, their login is switched back on, and they are emailed.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRestoreConfirmId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleRestore(restoreConfirmId)} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700">Yes, Restore</button>
            </div>
          </div>
        </div>
      )}

      {mergeInfo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[26rem] max-w-[92vw]">
            <h3 className="font-semibold text-gray-800 mb-2">Merge into current account?</h3>
            <p className="text-sm text-gray-500 mb-3">
              This customer signed up again with the same email. Their old bookings, payments, penalties, refunds, reviews and logs will be moved onto the current account. The current account keeps its own profile details.
            </p>
            <div className="text-xs bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 space-y-1">
              <div><span className="text-gray-400">Old (archived):</span> <span className="font-mono">{mergeInfo.record.originalId}</span></div>
              <div><span className="text-gray-400">Current (kept):</span> <span className="font-mono">{mergeInfo.candidate.userID}</span></div>
              <div><span className="text-gray-400">Email:</span> {mergeInfo.candidate.email}</div>
            </div>
            <p className="text-xs text-amber-600 mb-5">This cannot be undone. The archived record is removed after merging.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setMergeInfo(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleMerge} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700">Merge</button>
            </div>
          </div>
        </div>
      )}

      {viewRecord && (
        <ViewModal
          record={viewRecord}
          canDelete={canDelete}
          canMerge={canMerge}
          busy={!!actionId}
          onRestore={() => setRestoreConfirmId(viewRecord.userArchivesId)}
          onMerge={() => openMerge(viewRecord)}
          onDelete={() => setConfirmId(viewRecord.userArchivesId)}
          onClose={() => setViewRecord(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">DELETED USERS ARCHIVE</h1>
        <p className="text-sm text-gray-400 mt-1">
          {loading ? "Loading…" : `${filtered.length} archived record${filtered.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      {/* STATUS CARDS: the account's status when it was deleted, same look as the Bookings status cards. */}
      <StatCards loading={loading} value={statusF} onSelect={setStatusF} className="grid-cols-2 sm:grid-cols-4"
        cards={[
          { key: "All", label: "All Deleted Users", count: records.length, ...ALL_CARD },
          ...STATUS_CARDS.map((c) => ({ ...c, count: records.filter((r) => statusOf(r) === c.key).length })),
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
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <SortableTh label="Archived At" sortKey="archived" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Last Status</th>
                <th className="pl-4 pr-8 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-12">
                    {filtersActive ? "No records match your filters." : "No deleted users found."}
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.userArchivesId} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><Stamp iso={r.archivedAt} /></td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap" title={r.originalId || ""}>{r.username || r.email || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{r.email || "—"}</td>
                    <td className="px-4 py-3"><UserStatusBadge status={r.status} /></td>
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
                  <td colSpan={5} className="h-[53px]">&nbsp;</td>
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