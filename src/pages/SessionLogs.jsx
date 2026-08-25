import { useEffect, useState, useCallback } from "react";

function formatDate(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(" ");
}

const PLATFORM_LABEL = {
  admin_web: "Admin Web",
  customer_web: "Customer Web",
  mobile_app: "Mobile App",
};

// status -> badge classes + label
const STATUS_BADGE = {
  active:      { label: "Active",      cls: "bg-green-50 text-green-600 border border-green-200" },
  logged_out:  { label: "Logged out",  cls: "bg-gray-50 text-gray-500 border border-gray-200" },
  expired:     { label: "Expired",     cls: "bg-amber-50 text-amber-600 border border-amber-200" },
  blocked:     { label: "Blocked",     cls: "bg-red-50 text-red-600 border border-red-200" },
};

// Same-day check against a yyyy-mm-dd input value, done in local time so
// "today" in the date picker actually matches "today" in the log.
function inDateRange(isoString, from, to) {
  if (!from && !to) return true;
  const d = new Date(isoString);
  if (isNaN(d)) return true;
  if (from) {
    const fromD = new Date(from + "T00:00:00");
    if (d < fromD) return false;
  }
  if (to) {
    const toD = new Date(to + "T23:59:59");
    if (d > toD) return false;
  }
  return true;
}

const PAGE_SIZE = 15;

export default function SessionLogs() {
  const [logs, setLogs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId]   = useState(null);
  const [toast, setToast]           = useState(null);

  const token = localStorage.getItem("token");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/session-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load session logs.");
      setLogs(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/session-logs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      setLogs((prev) => prev.filter((l) => l.id !== id));
      showToast("Session log moved to archive.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filtered = logs.filter((log) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (log.uID || "").toLowerCase().includes(q) ||
      (log.username || "").toLowerCase().includes(q) ||
      (log.sessionLogsID || "").toLowerCase().includes(q) ||
      (log.id || "").toLowerCase().includes(q);
    const refDate = log.status === "blocked" ? log.attemptedAt : log.loginDateTime;
    return matchesSearch && inDateRange(refDate, dateFrom, dateTo);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, dateFrom, dateTo]);

  const clearDateFilter = () => { setDateFrom(""); setDateTo(""); };

  return (
    <div className="w-full px-4">

      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {toast.msg}
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Archive this log?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This entry will be removed from <strong>sessionLogs</strong> and moved to{" "}
              <strong>sessionLogArchives</strong>. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmId)}
                disabled={deletingId === confirmId}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
              >
                {deletingId === confirmId ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Session Logs</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"} found`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <input
          type="text"
          placeholder="Search by user ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light w-56"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 whitespace-nowrap">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light"
          />
          <label className="text-xs text-gray-400">to</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={clearDateFilter}
              className="text-xs text-gray-400 hover:text-red-500 underline whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-3 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 disabled:opacity-50 ml-auto"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm font-sans min-w-[960px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Log ID</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">User ID (uID)</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Platform</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Login / Attempted</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Logout Time</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-16 text-gray-400 text-sm">
                  {search || dateFrom || dateTo ? "No logs match your filters." : "No session logs found."}
                </td>
              </tr>
            ) : (
              paginated.map((log, i) => {
                const badge = STATUS_BADGE[log.status] || { label: log.status || "—", cls: "bg-gray-50 text-gray-500 border border-gray-200" };
                const isBlocked = log.status === "blocked";
                return (
                  <tr
                    key={log.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-arl-light/30 transition-colors ${
                      i % 2 === 0 ? "" : "bg-gray-50/30"
                    }`}
                  >
                    <td className="px-5 py-3.5 text-gray-500 font-mono text-xs truncate max-w-[140px]">
                      {log.sessionLogsID || log.id || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 text-xs truncate max-w-[160px]">
                      {log.username || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 font-mono text-xs truncate max-w-[180px]">
                      {log.uID || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs whitespace-nowrap">
                      {PLATFORM_LABEL[log.platform] || log.platform || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {log.status === "logged_out" && log.closedReason === "revoked" && (
                        <span className="ml-1.5 px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 text-xs font-medium">
                          Revoked
                        </span>
                      )}
                      {isBlocked && log.blockedReason && (
                        <div className="text-[11px] text-gray-400 mt-0.5">{log.blockedReason}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs whitespace-nowrap">
                      {formatDate(isBlocked ? log.attemptedAt : log.loginDateTime)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                      {isBlocked ? "—" : formatDate(log.logoutDateTime)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs">
                      {isBlocked ? "—" : (log.sessionDuration ? formatDuration(log.sessionDuration) : "—")}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setConfirmId(log.id)}
                        className="text-xs text-red-400 hover:text-red-600 hover:underline transition-colors"
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}