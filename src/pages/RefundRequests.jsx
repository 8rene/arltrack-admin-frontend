import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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

// ─── HELPERS ────────────────────────────────────────────────────────────────

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

// "Active" = still an open queue item admin needs to act on or is waiting
// on PayMongo for. "History" = resolved, permanent record — money already
// moved (or definitively didn't). Tab lives above the status chips; the
// chips themselves narrow further within whichever tab is selected.
const PAGE_SIZE = 15;

// --- PAGINATION (same pattern as Bookings.jsx / Payments.jsx / Users.jsx) -----
function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp if the list shrinks (filter/search/refresh) and we were on a now-empty page.
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

const TABS = [
  { key: "active",  label: "Active Queue", statuses: ["Pending", "Approved"] },
  { key: "history", label: "History",      statuses: ["Refunded", "Rejected", "Failed"] },
];

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

// ─── SORT HEADER ────────────────────────────────────────────────────────────
// Same clickable <th> as Bookings/Users: toggles asc/desc, neutral chevrons when
// the column isn't the active sort. (px-5 here to line up with this table's cells.)
const IconChevronsUpDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconSortArrow = ({ dir, className = "w-3.5 h-3.5" }) => (
  <svg
    className={`${className} transition-transform ${dir === "desc" ? "rotate-180" : ""}`}
    viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function SortableTh({ label, sortKey: key, sortKeyState, sortDir, onSort, className = "" }) {
  const active = sortKeyState === key;
  return (
    <th className={`px-5 py-3 text-left select-none ${className}`}>
      <button
        onClick={() => onSort(key)}
        className={`flex items-center gap-1.5 uppercase tracking-wider text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={sortDir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

// ─── DATES ──────────────────────────────────────────────────────────────────
// createdAt / updatedAt / processedAt come back from the API as Firestore
// timestamps ({_seconds}) — or ISO strings, depending on the path.
const toDate = (val) => {
  if (!val) return null;
  let d;
  if (typeof val.toDate === "function") d = val.toDate();
  else if (val._seconds !== undefined)  d = new Date(val._seconds * 1000);
  else if (val.seconds !== undefined)   d = new Date(val.seconds * 1000);
  else d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};
const toMillis = (d) => (d ? d.getTime() : -Infinity);

// "Updated" only means something once the request changed after it was filed;
// a still-untouched Pending request shows "—" instead of repeating the request date.
// Keyed off status, not a time gap — a quick Approve/Reject right after filing
// is still a real change and must show its own Updated date.
const updatedDate = (r) => {
  if (r.status === "Pending") return null;
  return toDate(r.updatedAt) || toDate(r.processedAt);
};

const stampParts = (d) => d && ({
  date: d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
  time: d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
});

const DateCell = ({ date }) => {
  const p = stampParts(date);
  if (!p) return <span className="text-gray-300">—</span>;
  return (
    <>
      <p className="text-sm text-gray-700">{p.date}</p>
      <p className="text-xs text-gray-400">{p.time}</p>
    </>
  );
};

export default function RefundRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("active");
  const [statusF, setStatusF]   = useState("All");
  const [search, setSearch]     = useState("");
  const [toast, setToast]       = useState(null);
  const [busyId, setBusyId]     = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // request being rejected
  const [rejectReason, setRejectReason] = useState("");
  const [sortKey, setSortKey] = useState(null); // null = default/unsorted (API order: newest request first)
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const token = localStorage.getItem("token");
  const { fmt } = useCurrency();
  const navigate = useNavigate();

  const activeTab = TABS.find((t) => t.key === tab) || TABS[0];

  const switchTab = (key) => {
    setTab(key);
    setStatusF("All"); // reset the sub-filter so switching tabs doesn't hide everything
  };

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
      setRequests((prev) => prev.map((r) => r.refundRequestID === id ? { ...r, status: "Approved", paymongoRefundID: data.paymongoRefundID || r.paymongoRefundID } : r));
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
    const matchTab = activeTab.statuses.includes(r.status);
    const matchS = statusF === "All" || r.status === statusF;
    return matchQ && matchTab && matchS;
  });

  // Numbered pagination (same shared component as Bookings/Payments). The hook
  // clamps the page if approving/rejecting shrinks the list underneath us.
  // Sort after search/tab/status filtering, before pagination, so Page 1 is the
  // top of whatever sort is active.
  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    if (sortKey === "customer") {
      const c = (a.customerName || "").localeCompare(b.customerName || "", undefined, { sensitivity: "base" });
      return sortDir === "asc" ? c : -c;
    }
    let av, bv;
    if (sortKey === "amount")         { av = Number(a.amount) || 0;             bv = Number(b.amount) || 0; }
    else if (sortKey === "requested") { av = toMillis(toDate(a.createdAt));     bv = toMillis(toDate(b.createdAt)); }
    else if (sortKey === "updated")   { av = toMillis(updatedDate(a));          bv = toMillis(updatedDate(b)); }
    else return 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(sorted, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusF, tab, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  // History is a closed record — nothing left to approve/reject — so no Actions column there.
  const showActions = tab !== "history";

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
            Refunds
          </h1>
          <p className="text-sm text-gray-500">
            {pendingCount > 0 ? `${pendingCount} pending review` : "No pending requests"}
          </p>
        </div>
      </div>

      {/* Active / History tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-arl-dark text-arl-dark"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t.label}
            {t.key === "active" && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-yellow-100 text-yellow-700 text-[11px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
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
          {["All", ...activeTab.statuses].map((s) => (
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
      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Loading refund requests…</div>
          ) : error ? (
            <div className="p-10 text-center text-sm text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              {tab === "history" ? "No resolved refunds yet." : "No refund requests found."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <SortableTh label="Customer" sortKey="customer" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-5 py-3 font-semibold">Booking</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <SortableTh label="Amount" sortKey="amount" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Requested" sortKey="requested" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Updated" sortKey="updated" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-5 py-3 font-semibold">Status</th>
                  {showActions && <th className="px-5 py-3 font-semibold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginated.map((r) => (
                  <tr key={r.refundRequestID} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-arl-dark">{r.customerName || "—"}</p>
                      {r.paymentID ? (
                        <button
                          onClick={() => navigate(`/payments?paymentID=${encodeURIComponent(r.paymentID)}`)}
                          className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
                          title="Open this payment"
                        >
                          {r.paymentID}
                        </button>
                      ) : (
                        <p className="text-xs text-gray-400">—</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {r.bookingID ? (
                        <button
                          onClick={() => navigate(`/bookings?open=${encodeURIComponent(r.bookingID)}`)}
                          className="font-medium text-teal-600 hover:text-teal-700 hover:underline"
                          title="Open this booking"
                        >
                          {r.bookingID}
                        </button>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-gray-700">{r.reason}</p>
                      {r.notes && <p className="text-xs text-gray-400 max-w-[220px] truncate" title={r.notes}>{r.notes}</p>}
                      {r.status === "Rejected" && r.rejectReason && (
                        <p className="text-xs text-red-500 max-w-[220px] truncate" title={r.rejectReason}>Reason: {r.rejectReason}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 font-semibold text-arl-dark">{fmt(r.amount)}</td>
                    <td className="px-5 py-4 whitespace-nowrap"><DateCell date={toDate(r.createdAt)} /></td>
                    <td className="px-5 py-4 whitespace-nowrap"><DateCell date={updatedDate(r)} /></td>
                    <td className="px-5 py-4"><StatusBadge status={r.status} /></td>
                    {showActions && (
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
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>
    </div>
  );
}