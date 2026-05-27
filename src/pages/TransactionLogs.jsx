import { useCurrency } from "../context/CurrencyContext";
import { useEffect, useState, useCallback } from "react";

const statusBadge = {
  Success:  "bg-green-50 border border-green-200",
  Failed:   "bg-red-50 border border-red-200",
  Pending:  "bg-yellow-50 border border-yellow-200",
  Refunded: "bg-blue-100 text-blue-600",
};

const typeBadge = {
  Payment:  "bg-purple-50 border border-purple-200",
  Refund:   "bg-blue-50 border border-blue-200",
  Deposit:  "bg-teal-50 border border-teal-200",
};

function formatDate(val) {
  if (!val) return "—";
  // Firestore Timestamp passed as ISO string from backend
  const d = new Date(val);
  if (isNaN(d)) return val;
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function formatAmount(amount, fmtFn) {
  if (amount == null) return "—";
  if (fmtFn) return fmtFn(amount);
  return `₱${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

const PAGE_SIZE = 15;

export default function TransactionLogs() {
  const { fmt } = useCurrency();
  const [logs, setLogs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId]   = useState(null);
  const [toast, setToast]           = useState(null);

  const token = localStorage.getItem("token");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/transaction-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load transaction logs.");
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
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/transaction-logs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      setLogs((prev) => prev.filter((l) => l.id !== id));
      showToast("Transaction log moved to archive.", "success");
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
    return (
      (log.transactionID || "").toLowerCase().includes(q) ||
      (log.paymentID || "").toLowerCase().includes(q) ||
      (log.type || "").toLowerCase().includes(q) ||
      (log.status || "").toLowerCase().includes(q) ||
      (log.description || "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search]);

  return (
    <div className="w-full px-4">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Confirm Archive Modal */}
      {confirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Archive this transaction log?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This entry will be removed from <strong>transactionLogs</strong> and moved to{" "}
              <strong>transactionLogsArchive</strong>. This cannot be undone.
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Transaction Logs</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"} found`}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Search transactions…"
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

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm font-sans min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Transaction ID</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-gray-400 text-sm">
                  {search ? "No transaction logs match your search." : "No transaction logs found."}
                </td>
              </tr>
            ) : (
              paginated.map((log, i) => {
                const sBadge = statusBadge[log.status] || "bg-gray-100 text-gray-500";
                const tBadge = typeBadge[log.type] || "bg-gray-100 text-gray-500";
                return (
                  <tr
                    key={log.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-arl-light/30 transition-colors ${
                      i % 2 === 0 ? "" : "bg-gray-50/30"
                    }`}
                  >
                    <td className="px-5 py-3.5 text-gray-500 font-mono text-xs truncate max-w-[160px]">
                      {log.transactionID || log.id || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-black ${tBadge}`}><span className={`w-2 h-2 rounded-full shrink-0 ${tBadge.includes("purple") ? "bg-purple-500" : tBadge.includes("blue") ? "bg-blue-500" : tBadge.includes("teal") ? "bg-teal-500" : "bg-gray-400"}`} />
                        {log.type || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 font-medium text-xs">
                      {formatAmount(log.amount, fmt)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-black ${sBadge}`}><span className={`w-2 h-2 rounded-full shrink-0 ${sBadge.includes("green") ? "bg-green-500" : sBadge.includes("red") ? "bg-red-500" : sBadge.includes("yellow") ? "bg-yellow-400" : sBadge.includes("blue") ? "bg-blue-500" : "bg-gray-400"}`} />
                        {log.status || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs max-w-xs truncate">
                      {log.description || "—"}
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

      {/* Pagination */}
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

