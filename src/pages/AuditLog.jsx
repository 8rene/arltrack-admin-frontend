import { useEffect, useState, useCallback } from "react";

const typeBadge = {
  delete:   "bg-red-100 text-red-600",
  update:   "bg-blue-100 text-blue-600",
  create:   "bg-green-100 text-green-600",
  export:   "bg-yellow-100 text-yellow-700",
  auth:     "bg-gray-100 text-gray-500",
  system:   "bg-purple-100 text-purple-600",
  REGISTER: "bg-green-100 text-green-600",
  LOGIN:    "bg-gray-100 text-gray-500",
  LOGOUT:   "bg-gray-100 text-gray-400",
  UPDATE:   "bg-blue-100 text-blue-600",
  DELETE:   "bg-red-100 text-red-600",
};

function formatDate(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

const PAGE_SIZE = 15;

export default function AuditLog() {
  const [logs, setLogs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState("");
  const [deletingId, setDeletingId]   = useState(null);
  const [confirmId, setConfirmId]     = useState(null);
  const [toast, setToast]             = useState(null);
  const [customerNames, setCustomerNames] = useState({});

  const token = localStorage.getItem("token");

  // Resolve customer name from userID: user collection -> userDetails -> firstName + lastName
  const resolveCustomerName = useCallback(async (userID) => {
    if (!userID) return;
    setCustomerNames((prev) => {
      if (prev[userID] !== undefined) return prev; // already resolved/loading
      return { ...prev, [userID]: null }; // mark as loading
    });

    try {
      // Step 1: Get user doc by uid
      const userRes = await fetch(`${process.env.REACT_APP_API_URL}/api/users/by-uid/${encodeURIComponent(userID)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) throw new Error("user not found");
      const userData = await userRes.json();
      const uid = userData?.data?.uid || userID;

      // Step 2: Get userDetails by uid
      const detailsRes = await fetch(`${process.env.REACT_APP_API_URL}/api/users/details/${encodeURIComponent(uid)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!detailsRes.ok) throw new Error("details not found");
      const detailsData = await detailsRes.json();
      const { firstName, lastName } = detailsData?.data || {};
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || userID;

      setCustomerNames((prev) => ({ ...prev, [userID]: fullName }));
    } catch {
      setCustomerNames((prev) => ({ ...prev, [userID]: userID }));
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
      if (log.userID) resolveCustomerName(log.userID);
    });
  }, [logs]); // eslint-disable-line

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
      showToast("Audit log moved to archive.", "success");
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
    const customerName = customerNames[log.userID] || "";
    return (
      (log.action || "").toLowerCase().includes(q) ||
      (log.userID || "").toLowerCase().includes(q) ||
      customerName.toLowerCase().includes(q) ||
      (log.description || "").toLowerCase().includes(q) ||
      (log.id || "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search]);

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
              This entry will be removed from <strong>auditLogs</strong> and moved to{" "}
              <strong>auditLogsArchive</strong>. This cannot be undone.
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
          <h1 className="text-xl font-bold text-arl-dark">Audit Logs</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"} found`}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Search logs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light w-56"
          />
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="px-3 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm font-sans min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Action</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer Name</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Timestamp</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-16 text-gray-400 text-sm">
                  {search ? "No logs match your search." : "No audit logs found."}
                </td>
              </tr>
            ) : (
              paginated.map((log, i) => {
                const actionKey = log.action || "system";
                const badgeClass = typeBadge[actionKey] || "bg-gray-100 text-gray-500";
                const nameVal = customerNames[log.userID];
                const displayName = !log.userID
                  ? "—"
                  : nameVal === undefined
                  ? "Loading…"
                  : nameVal === null
                  ? "Resolving…"
                  : nameVal;

                return (
                  <tr
                    key={log.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-arl-light/30 transition-colors ${
                      i % 2 === 0 ? "" : "bg-gray-50/30"
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badgeClass}`}>
                        {actionKey}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 max-w-xs truncate">
                      {log.description || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs">
                      {displayName}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(log.createdAt)}
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
