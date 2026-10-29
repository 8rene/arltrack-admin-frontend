import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";

const typeBadgeDot = {
  delete:   "bg-red-500",
  update:   "bg-blue-500",
  create:   "bg-green-500",
  export:   "bg-yellow-400",
  auth:     "bg-gray-400",
  system:   "bg-purple-500",
  REGISTER: "bg-green-500",
  LOGIN:    "bg-gray-400",
  LOGOUT:   "bg-gray-400",
  UPDATE:   "bg-blue-500",
  DELETE:   "bg-red-500",
};
const typeBadgeBg = {
  delete:   "bg-red-50 border border-red-200",
  update:   "bg-blue-50 border border-blue-200",
  create:   "bg-green-50 border border-green-200",
  export:   "bg-yellow-50 border border-yellow-200",
  auth:     "bg-gray-50 border border-gray-200",
  system:   "bg-purple-50 border border-purple-200",
  REGISTER: "bg-green-50 border border-green-200",
  LOGIN:    "bg-gray-50 border border-gray-200",
  LOGOUT:   "bg-gray-50 border border-gray-200",
  UPDATE:   "bg-blue-50 border border-blue-200",
  DELETE:   "bg-red-50 border border-red-200",
};

// ─── DATES ───────────────────────────────────────────────────────────────────
// "Oct 17, 2026 | 3:45 PM": date and time in one cell, split by a pipe (same as Payments / Penalties / Bookings).
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

// Local "YYYY-MM-DD" of a date value: what the Created At date picker is compared against.
const dayKeyOf = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ─── PAGINATION (same pattern as Bookings.jsx / Payments.jsx / Penalties.jsx) ───
const PAGE_SIZE = 15;

function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp if the list shrinks (filter / search / refresh / archive) and we were on a now-empty page.
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

// ─── SMALL PIECES ────────────────────────────────────────────────────────────
function ActionBadge({ action }) {
  const key = action || "system";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-black ${typeBadgeBg[key] || "bg-gray-50 border border-gray-200"}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${typeBadgeDot[key] || "bg-gray-400"}`} />
      {key}
    </span>
  );
}

// Card + label-over-value cell: same as Bookings' details window.
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

// "Search by" options: Created At opens a date picker, the others are text. The Type column has its own dropdown.
const AUDIT_SEARCH_BY = [
  { key: "description", label: "Description", type: "text" },
  { key: "user",        label: "User",        type: "text" },
  { key: "date",        label: "Created At",  type: "date" },
];
// Which Users tab a performer lives on, and who may open it. Keep in sync with ROLE_TABS in Users.jsx.
const USER_TAB_BY_ROLE = {
  Customer:           { key: "customer",   visibleTo: [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR] },
  [ROLES.DRIVER]:     { key: "driver",     visibleTo: [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR] },
  [ROLES.SUPERVISOR]: { key: "supervisor", visibleTo: [ROLES.OWNER, ROLES.ADMIN] },
  [ROLES.ADMIN]:      { key: "admin",      visibleTo: [ROLES.OWNER] },
};
const ACTION_OPTIONS = ["create", "update", "delete", "export", "auth", "system"];

// ─── DETAILS MODAL ───────────────────────────────────────────────────────────
// Everything one log entry carries: what happened (type + full description), who did it and when, the records it is
// about (booking / payment / refund request, each a link) and the ids for support. Archive lives here, not in the row.
function ViewModal({ log, user, onClose, onArchive }) {
  const navigate = useNavigate();
  const { user: viewer } = useAuth();
  const go = (path) => { onClose(); navigate(path); };
  const link = (label, path) => (
    <button type="button" onClick={() => go(path)} className="text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap">{label}</button>
  );
  const hasRelated = !!(log.bookingID || log.paymentID || log.refundRequestID);
  const userName = !log.userID ? null : user === undefined || user === null ? "Loading…" : user.name;

  // "View user" opens the person in Users (right role tab + their details window). Not every performer can be opened:
  // Owner accounts have no tab there, and Admins can't open the Admins tab.
  const userTab = user ? USER_TAB_BY_ROLE[user.role] : null;
  const canOpenUser = !!(log.userID && userTab && userTab.visibleTo.includes(viewer?.role));
  const userBtnTitle = canOpenUser ? "" : !log.userID ? "No user recorded" : !user ? "Loading…"
    : "This account isn't listed on the Users page for your role";
  const viewUserBtn = (
    <button type="button" disabled={!canOpenUser} title={userBtnTitle}
      onClick={() => go(`/users?role=${userTab.key}&tab=directory&open=${encodeURIComponent(log.userID)}`)}
      className="text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed">
      View user →
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-bold text-lg text-gray-800">Audit Log Details</h2>
              <ActionBadge action={log.action} />
            </div>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 shrink-0"><IconX className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3">
          <InfoSection title="What happened">
            <InfoField wide label="Description" value={<span className="whitespace-pre-wrap leading-relaxed font-normal">{log.description || "—"}</span>} />
            <InfoField wide label="Created At" value={stampText(log.createdAt)} />
          </InfoSection>

          <InfoSection title="Done by" action={viewUserBtn}>
            <InfoField label="User" value={userName} />
            <InfoField label="Email" value={user && user.email} />
          </InfoSection>

          {hasRelated && (
            <InfoSection title="Related records">
              {log.bookingID && (
                <InfoField label="Booking" value={<span className="inline-flex items-center gap-2 flex-wrap"><span className="font-mono text-xs">{log.bookingID}</span>{link("View booking →", `/bookings?open=${encodeURIComponent(log.bookingID)}`)}</span>} />
              )}
              {log.paymentID && (
                <InfoField label="Payment" value={<span className="inline-flex items-center gap-2 flex-wrap"><span className="font-mono text-xs">{log.paymentID}</span>{link("View payment →", `/payments?paymentID=${encodeURIComponent(log.paymentID)}`)}</span>} />
              )}
              {log.refundRequestID && (
                <InfoField label="Refund request" value={<span className="inline-flex items-center gap-2 flex-wrap"><span className="font-mono text-xs">{log.refundRequestID}</span>{link("View refund →", `/refund-requests?search=${encodeURIComponent(log.refundRequestID)}`)}</span>} />
              )}
            </InfoSection>
          )}

          <InfoSection title="Reference">
            <InfoField mono label="Log ID" value={log.auditLogsID || log.id} />
            <InfoField mono label="User ID" value={log.userID} />
          </InfoSection>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center gap-2">
          <button onClick={onArchive} className="px-4 py-2 border border-red-200 text-red-500 rounded-xl text-sm hover:bg-red-50 transition-colors">Archive</button>
          <button onClick={onClose} className="ml-auto px-4 py-2 border rounded-xl text-sm hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────
export default function AuditLog() {
  const [logs, setLogs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [search, setSearch]           = useState("");
  const [searchBy, setSearchBy]       = useState("description");
  const [dateValue, setDateValue]     = useState("");   // "YYYY-MM-DD" from the Created At date picker
  const [actionF, setActionF]         = useState("All");
  const [deletingId, setDeletingId]   = useState(null);
  const [confirmId, setConfirmId]     = useState(null);
  const [toast, setToast]             = useState(null);
  const [userInfo, setUserInfo]       = useState({});   // userID -> { name, email } (undefined = not asked yet, null = loading)
  const [viewLog, setViewLog]         = useState(null);

  const token = localStorage.getItem("token");
  const requestedRef = useRef(new Set()); // userIDs already fetched or in flight

  // The user is whoever performed the action (an admin, supervisor, owner...), so this is a "User", not a customer.
  // Resolve the name from the userID: user doc -> userDetails -> firstName + lastName.
  const resolveUser = useCallback(async (userID) => {
    if (!userID || requestedRef.current.has(userID)) return;
    requestedRef.current.add(userID);
    setUserInfo((prev) => ({ ...prev, [userID]: null })); // mark as loading

    try {
      const userRes = await fetch(`${process.env.REACT_APP_API_URL}/api/users/by-uid/${encodeURIComponent(userID)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) throw new Error("user not found");
      const userData = await userRes.json();
      const u = userData?.data || {};
      const uid = u.uid || userID;

      let fullName = "";
      try {
        const detailsRes = await fetch(`${process.env.REACT_APP_API_URL}/api/users/details/${encodeURIComponent(uid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (detailsRes.ok) {
          const { firstName, lastName } = (await detailsRes.json())?.data || {};
          fullName = [firstName, lastName].filter(Boolean).join(" ");
        }
      } catch { /* the name is cosmetic */ }

      setUserInfo((prev) => ({ ...prev, [userID]: { name: fullName || u.username || userID, email: u.email || "", role: u.role || "" } }));
    } catch {
      setUserInfo((prev) => ({ ...prev, [userID]: { name: userID, email: "", role: "" } }));
    }
  }, [token]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load audit logs.");
      setLogs(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    logs.forEach((log) => {
      if (log.userID) resolveUser(log.userID);
    });
  }, [logs]); // eslint-disable-line

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/audit-logs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      setLogs((prev) => prev.filter((l) => l.id !== id));
      setViewLog(null);
      showToast("Audit log moved to archive.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const userLabel = (log) => {
    if (!log.userID) return "—";
    const u = userInfo[log.userID];
    return u === undefined || u === null ? "Loading…" : u.name;
  };

  const filtered = logs.filter((log) => {
    if (actionF !== "All" && (log.action || "system") !== actionF) return false;
    if (searchBy === "date") return !dateValue || dayKeyOf(log.createdAt) === dateValue;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = searchBy === "user" ? `${userLabel(log)} ${log.userID || ""}` : (log.description || "");
    return hay.toLowerCase().includes(q);
  });

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(filtered, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, searchBy, dateValue, actionF]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchOpt = AUDIT_SEARCH_BY.find((o) => o.key === searchBy) || AUDIT_SEARCH_BY[0];
  const filtersActive = !!search.trim() || !!dateValue || actionF !== "All";

  return (
    <div className="w-full px-4 space-y-5">

      {toast && (
        <div className={`fixed top-5 right-5 z-[80] px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Archive confirmation. z-[70]: it opens on top of the details window it was started from. */}
      {confirmId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Archive this log?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This entry will be removed from <strong>auditLogs</strong> and moved to{" "}
              <strong>auditLogsArchives</strong>. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmId)}
                disabled={deletingId === confirmId}
                className="px-4 py-2 text-sm rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
              >
                {deletingId === confirmId ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewLog && (
        <ViewModal
          log={viewLog}
          user={viewLog.userID ? userInfo[viewLog.userID] : undefined}
          onClose={() => setViewLog(null)}
          onArchive={() => setConfirmId(viewLog.id)}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-arl-dark">Audit Logs</h1>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* TABLE: the search + filters sit on top of the table inside one box, same as Bookings */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        {/* SEARCH + FILTERS */}
        <div className="flex flex-wrap gap-3 items-end p-4 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search by</span>
            <select value={searchBy} onChange={(e) => { setSearchBy(e.target.value); setSearch(""); setDateValue(""); }}
              className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white">
              {AUDIT_SEARCH_BY.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
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
          <select value={actionF} onChange={(e) => setActionF(e.target.value)}
            className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white">
            <option value="All">All types</option>
            {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
          </select>
          <button onClick={fetchLogs} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 flex items-center gap-1.5">
            <IconRefresh className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Created At</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Description</th>
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
                    {filtersActive ? "No logs match your filters." : "No audit logs found."}
                  </td>
                </tr>
              ) : (
                paginated.map((log) => {
                  const desc = log.description || "—";
                  return (
                    <tr key={log.id} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3"><Stamp iso={log.createdAt} /></td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{userLabel(log)}</td>
                      <td className="px-4 py-3"><ActionBadge action={log.action} /></td>
                      {/* w-full + max-w-0: the description takes the space the other columns leave and is cut with "…". The full text is in the tooltip and the details window. */}
                      <td className="px-4 py-3 text-gray-700 w-full max-w-0 min-w-[160px]">
                        <div className="truncate" title={desc}>{desc}</div>
                      </td>
                      <td className="pl-4 pr-8 py-3 text-right">
                        <button onClick={() => setViewLog(log)}
                          className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">View</button>
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
    </div>
  );
}