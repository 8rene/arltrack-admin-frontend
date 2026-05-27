import { useEffect, useState, useCallback } from "react";

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

const PAGE_SIZE = 15;

export default function UserLogArchivePage() {
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [page, setPage]             = useState(1);
  const [toast, setToast]           = useState(null);
  const [confirmId, setConfirmId]   = useState(null);   // pending permanent-delete confirm
  const [actionId, setActionId]     = useState(null);   // loading state for buttons

  const token = localStorage.getItem("token");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ── FETCH ── */
  const fetchRecords = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/user-log`, {
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
  const handleRestore = async (userLogArchivesId) => {
    setActionId(userLogArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/user-log/${userLogArchivesId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Restore failed.");
      setRecords((prev) =>
        prev.map((r) =>
          r.userLogArchivesId === userLogArchivesId
            ? { ...r, restoredAt: new Date().toISOString() }
            : r
        )
      );
      showToast("User log restored to active table.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  /* ── PERMANENT DELETE ── */
  const handleDelete = async (userLogArchivesId) => {
    setConfirmId(null);
    setActionId(userLogArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/user-log/${userLogArchivesId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      setRecords((prev) => prev.filter((r) => r.userLogArchivesId !== userLogArchivesId));
      showToast("Permanently deleted.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  /* ── FILTER ── */
  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      (r.userLogArchivesId || "").toLowerCase().includes(q) ||
      (r.uID              || "").toLowerCase().includes(q) ||
      (r.username         || "").toLowerCase().includes(q);
    const matchDate = inRange(r.archivedAt, dateFrom, dateTo);
    return matchSearch && matchDate;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, dateFrom, dateTo]);

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

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">USER LOG ARCHIVE</h1>
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">userLogArchivesId</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Username</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">User ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Login Time</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Session Duration</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Archived At</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16 text-gray-400 text-sm">
                  {search || dateFrom || dateTo ? "No records match your filters." : "No archived user logs found."}
                </td>
              </tr>
            ) : (
              paginated.map((r, i) => (
                <tr
                  key={r.userLogArchivesId}
                  className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors ${i % 2 !== 0 ? "bg-gray-50/20" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[140px]">
                    {r.userLogArchivesId}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{r.username || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[120px]">{r.uID || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(r.loginDateTime)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDuration(r.sessionDuration)}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">
                      {formatDate(r.archivedAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.restoredAt ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-xs font-medium text-black"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />Restored</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs font-medium text-black"><span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />Archived</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleRestore(r.userLogArchivesId)}
                        disabled={!!actionId || !!r.restoredAt}
                        className="px-3 py-1.5 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 whitespace-nowrap"
                      >
                        {actionId === r.userLogArchivesId ? "…" : "Restore"}
                      </button>
                      <button
                        onClick={() => setConfirmId(r.userLogArchivesId)}
                        disabled={!!actionId}
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
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

