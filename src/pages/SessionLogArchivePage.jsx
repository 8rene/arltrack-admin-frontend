import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";
import ArchiveDetailModal from "../components/shared/ArchiveDetailModal";

/* ── helpers ─────────────────────────────────────────────────────────────── */
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function formatDuration(sec) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(" ") || "0s";
}
function inRange(iso, from, to) {
  if (!from && !to) return true;
  const d = new Date(iso);
  if (isNaN(d)) return true;
  if (from && d < new Date(from)) return false;
  if (to   && d > new Date(to + "T23:59:59")) return false;
  return true;
}

const PLATFORM_LABEL = {
  admin_web: "Admin Web",
  customer_web: "Customer Web",
  mobile_app: "Mobile App",
};

const STATUS_BADGE = {
  logged_out: { label: "Logged out", cls: "bg-gray-50 text-gray-500 border border-gray-200" },
  expired:    { label: "Expired",    cls: "bg-amber-50 text-amber-600 border border-amber-200" },
  blocked:    { label: "Blocked",    cls: "bg-red-50 text-red-600 border border-red-200" },
  active:     { label: "Active",     cls: "bg-green-50 text-green-600 border border-green-200" },
};

const PAGE_SIZE = 15;

export default function SessionLogArchivePage() {
  const { effectiveRole } = useAuth();
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [page, setPage]             = useState(1);
  const [toast, setToast]           = useState(null);
  const [confirmId, setConfirmId]   = useState(null);   // pending permanent-delete confirm
  const [restoreConfirmId, setRestoreConfirmId] = useState(null); // pending restore confirm
  const [actionId, setActionId]     = useState(null);   // loading state for buttons
  const [viewRecord, setViewRecord] = useState(null);

  const token = localStorage.getItem("token");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ── FETCH ── */
  const fetchRecords = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/session-log`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load archive.");
      setRecords(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  /* ── RESTORE ── */
  const handleRestore = async (sessionLogArchivesId) => {
    setRestoreConfirmId(null);
    setActionId(sessionLogArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/session-log/${sessionLogArchivesId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Restore failed.");
      setRecords((prev) => prev.filter((r) => r.sessionLogArchivesId !== sessionLogArchivesId));
      showToast("Session log restored to active table.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  /* ── PERMANENT DELETE ── */
  const handleDelete = async (sessionLogArchivesId) => {
    setConfirmId(null);
    setActionId(sessionLogArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/session-log/${sessionLogArchivesId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      setRecords((prev) => prev.filter((r) => r.sessionLogArchivesId !== sessionLogArchivesId));
      showToast("Permanently deleted.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  /* ── FILTER ── */
  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      (r.sessionLogArchivesId || "").toLowerCase().includes(q) ||
      (r.uID                  || "").toLowerCase().includes(q) ||
      (r.username              || "").toLowerCase().includes(q);
    const matchDate = inRange(r.archivedAt, dateFrom, dateTo);
    return matchSearch && matchDate;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, dateFrom, dateTo]);

  const restoreConfirmRecord = records.find((r) => r.sessionLogArchivesId === restoreConfirmId);

  /* ── RENDER ── */
  return (
    <div className="w-full px-6 py-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === "error" ? "bg-red-500" : "bg-teal-600"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Confirm modal */}
      {confirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-gray-800 mb-2">Permanently Delete?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This action cannot be undone. The record will be removed from the archive forever.
            </p>
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore confirm modal */}
      {restoreConfirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-gray-800 mb-2">Restore this session log?</h3>
            {restoreConfirmRecord && (
              <p className="text-xs text-gray-500 mb-2">
                {restoreConfirmRecord.username || restoreConfirmRecord.uID || "—"}
              </p>
            )}
            <p className="text-sm text-gray-500 mb-5">It will move back to the live session logs table.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRestoreConfirmId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleRestore(restoreConfirmId)} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700">Yes, Restore</button>
            </div>
          </div>
        </div>
      )}

      {/* View details modal */}
      {viewRecord && (
        <ArchiveDetailModal
          title={`Session Log Archive — ${viewRecord.username || viewRecord.uID || viewRecord.sessionLogArchivesId}`}
          record={viewRecord}
          onClose={() => setViewRecord(null)}
          labelOverrides={{ sessionLogArchivesId: "Archive ID", sessionLogsID: "Session Log ID", uID: "User ID" }}
        />
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">SESSION LOG ARCHIVE</h1>
        <p className="text-sm text-gray-400 mt-1">
          {loading ? "Loading…" : `${filtered.length} archived record${filtered.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by ID, user ID, username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 w-64"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 whitespace-nowrap">Archived from</label>
          <input
            type="date" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
          <label className="text-xs text-gray-400">to</label>
          <input
            type="date" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>
        <button
          onClick={fetchRecords}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 ml-auto"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">sessionLogArchivesId</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">User ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Platform</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Session Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Login Time</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Session Duration</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Archived At</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-16 text-gray-400 text-sm">
                  {search || dateFrom || dateTo ? "No records match your filters." : "No archived session logs found."}
                </td>
              </tr>
            ) : (
              paginated.map((r, i) => {
                const statusBadge = STATUS_BADGE[r.status] || { label: r.status || "—", cls: "bg-gray-50 text-gray-500 border border-gray-200" };
                return (
                <tr
                  key={r.sessionLogArchivesId}
                  className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors ${i % 2 !== 0 ? "bg-gray-50/20" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[140px]">
                    {r.sessionLogArchivesId}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{r.username || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[120px]">{r.uID || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{PLATFORM_LABEL[r.platform] || r.platform || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.cls}`}>{statusBadge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(r.status === "blocked" ? r.attemptedAt : r.loginDateTime)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDuration(r.sessionDuration)}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">
                      {formatDate(r.archivedAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setViewRecord(r)}
                        disabled={!!actionId}
                        className="px-3 py-1.5 text-xs rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        View
                      </button>
                      <button
                        onClick={() => setRestoreConfirmId(r.sessionLogArchivesId)}
                        disabled={!!actionId}
                        className="px-3 py-1.5 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 whitespace-nowrap"
                      >
                        {actionId === r.sessionLogArchivesId ? "…" : "Restore"}
                      </button>
                      {effectiveRole === ROLES.OWNER && (
                      <button
                        onClick={() => setConfirmId(r.sessionLogArchivesId)}
                        disabled={!!actionId}
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        Delete
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              );})
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >← Prev</button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}