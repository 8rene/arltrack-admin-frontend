import { useEffect, useState, useCallback } from "react";
import { useCurrency } from "../context/CurrencyContext";

// ─── SVG ICONS ─────────────────────────────────────────────────────────────

const IconCheck = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconX = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconRefund = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 10a9 9 0 1 1 2.6 6.36" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M3 4v6h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── HELPERS ────────────────────────────────────────────────────────────────

function fmtDate(val) {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

const statusDot = {
  Pending:  "bg-yellow-400",
  Approved: "bg-blue-500",
  Refunded: "bg-green-500",
  Rejected: "bg-red-500",
  Failed:   "bg-red-500",
};
const statusBg = {
  Pending:  "bg-yellow-50 border border-yellow-200",
  Approved: "bg-blue-50 border border-blue-200",
  Refunded: "bg-green-50 border border-green-200",
  Rejected: "bg-red-50 border border-red-200",
  Failed:   "bg-red-50 border border-red-200",
};
function StatusBadge({ status }) {
  const dot = statusDot[status] || "bg-gray-400";
  const bg  = statusBg[status]  || "bg-gray-50 border border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-black ${bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {status}
    </span>
  );
}

const STATUSES = ["All", "Pending", "Approved", "Refunded", "Rejected", "Failed"];

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function RefundRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [statusF, setStatusF]   = useState("Pending");
  const [search, setSearch]     = useState("");
  const [toast, setToast]       = useState(null);
  const [busyId, setBusyId]     = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // request being rejected
  const [rejectReason, setRejectReason] = useState("");

  const token = localStorage.getItem("token");
  const { fmt } = useCurrency();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRequests = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load refund requests.");
      setRequests(data.data || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const approve = async (id) => {
    setBusyId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests/${id}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to approve refund.");
      showToast(data.message || "Refund approved and sent to PayMongo.");
      setRequests((prev) => prev.map((r) => r.refundRequestID === id ? { ...r, status: "Approved" } : r));
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    const id = rejectTarget.refundRequestID;
    setBusyId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests/${id}/reject`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rejectReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reject refund.");
      showToast("Refund request rejected.");
      setRequests((prev) => prev.map((r) => r.refundRequestID === id ? { ...r, status: "Rejected", rejectReason } : r));
      setRejectTarget(null); setRejectReason("");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  };

  const filtered = requests.filter((r) => {
    const q = search.toLowerCase();
    const matchQ = !q
      || (r.refundRequestID || "").toLowerCase().includes(q)
      || (r.customerName || "").toLowerCase().includes(q)
      || (r.bookingID || "").toLowerCase().includes(q)
      || (r.paymentID || "").toLowerCase().includes(q);
    const matchS = statusF === "All" || r.status === statusF;
    return matchQ && matchS;
  });

  const pendingCount = requests.filter((r) => r.status === "Pending").length;

  return (
    <div className="w-full px-4 space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setRejectTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-arl-dark">Reject Refund Request</h3>
              <button onClick={() => setRejectTarget(null)} className="text-gray-400 hover:text-gray-600">
                <IconX />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              {rejectTarget.customerName} — {fmt(rejectTarget.amount)}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejecting (optional, shown to customer)"
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-dark/20"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectTarget(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <button
                onClick={submitReject}
                disabled={busyId === rejectTarget.refundRequestID}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
              >
                {busyId === rejectTarget.refundRequestID ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-arl-dark flex items-center gap-2">
            <IconRefund className="w-5 h-5 text-arl-secondary" /> Refunds
          </h1>
          <p className="text-sm text-gray-500">
            {pendingCount > 0 ? `${pendingCount} pending review` : "No pending requests"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, booking, or payment ID…"
          className="flex-1 min-w-[220px] rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-dark/20"
        />
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusF(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                statusF === s ? "bg-arl-dark text-white border-arl-dark" : "bg-white text-gray-600 border-gray-200 hover:border-arl-dark"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading refund requests…</div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-red-500">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">No refund requests found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Booking</th>
                <th className="px-5 py-3 font-semibold">Reason</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Requested</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.refundRequestID} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-arl-dark">{r.customerName || "—"}</p>
                    <p className="text-xs text-gray-400">{r.paymentID}</p>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{r.bookingID || "—"}</td>
                  <td className="px-5 py-4">
                    <p className="text-gray-700">{r.reason}</p>
                    {r.notes && <p className="text-xs text-gray-400 max-w-[220px] truncate" title={r.notes}>{r.notes}</p>}
                    {r.status === "Rejected" && r.rejectReason && (
                      <p className="text-xs text-red-500 max-w-[220px] truncate" title={r.rejectReason}>Reason: {r.rejectReason}</p>
                    )}
                  </td>
                  <td className="px-5 py-4 font-semibold text-arl-dark">{fmt(r.amount)}</td>
                  <td className="px-5 py-4 text-gray-500 text-xs">{fmtDate(r.createdAt)}</td>
                  <td className="px-5 py-4"><StatusBadge status={r.status} /></td>
                  <td className="px-5 py-4 text-right">
                    {r.status === "Pending" ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => approve(r.refundRequestID)}
                          disabled={busyId === r.refundRequestID}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                        >
                          <IconCheck /> {busyId === r.refundRequestID ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => { setRejectTarget(r); setRejectReason(""); }}
                          disabled={busyId === r.refundRequestID}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50"
                        >
                          <IconX /> Reject
                        </button>
                      </div>
                    ) : r.status === "Approved" ? (
                      <span className="text-xs text-gray-400 italic">Waiting for PayMongo…</span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
