import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";

// Fire-and-forget audit log write — same pattern as Fleet.jsx's status
// changes. Never blocks or fails the action it's logging.
const logAuditEvent = (action, description) => {
  const token = localStorage.getItem("token");
  fetch(`${process.env.REACT_APP_API_URL}/api/audit-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, description }),
  }).catch((e) => console.error("Audit log write failed:", e));
};

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconMoney = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="12" cy="12.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 6V5M18 6V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconCheck = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconClock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconCreditCard = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
    <path d="M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconChevronDown = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── SORT HEADER (same pattern as Bookings.jsx / Users.jsx) ──────────────────
// Neutral up/down chevrons when a column isn't the active sort (reads as
// "sortable" even before it's clicked), a bold single arrow in the active
// color once it is — toggles asc/desc on repeat clicks of the same column.
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
    <th className={`px-4 py-3 text-left select-none ${className}`}>
      <button
        onClick={() => onSort(key)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={sortDir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function peso(n, fmtFn) {
  if (n == null || n === "") return "—";
  if (fmtFn) return fmtFn(n);
  return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

// ─── BADGE MAPS ───────────────────────────────────────────────────────────────

const statusDot = {
  Pending:   "bg-yellow-400",
  Approved:  "bg-green-500",
  Rejected:  "bg-red-500",
  Cancelled: "bg-gray-400",
  Paid:      "bg-green-500",
};
const statusBg = {
  Pending:   "bg-yellow-50 border border-yellow-200",
  Approved:  "bg-green-50 border border-green-200",
  Rejected:  "bg-red-50 border border-red-200",
  Cancelled: "bg-gray-100 border border-gray-200",
  Paid:      "bg-green-50 border border-green-200",
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

const PAGE_SIZE = 15;
const STATUSES  = ["All", "Pending", "Approved", "Rejected", "Cancelled"];
const TIME_RANGES = ["All Time", "Today", "Last 7 Days", "This Month", "Custom Range"];

// ─── PAGINATION (same shared pattern as Bookings.jsx / Users.jsx) ─────────────
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

// Is createdAt (ISO string) within the selected time range?
function inTimeRange(iso, range, customFrom, customTo) {
  if (range === "All Time") return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d)) return false;
  const now = new Date();

  if (range === "Today") {
    return d.toDateString() === now.toDateString();
  }
  if (range === "Last 7 Days") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    return d >= cutoff && d <= now;
  }
  if (range === "This Month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (range === "Custom Range") {
    if (!customFrom && !customTo) return true; // no bounds picked yet — don't filter anything out
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const to   = customTo   ? new Date(`${customTo}T23:59:59`)   : null;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  }
  return true;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Payments() {
  const [payments, setPayments]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [search, setSearch]               = useState("");
  const [statusF, setStatusF]             = useState("All");
  const [methodF, setMethodF]             = useState("All");
  const [timeF, setTimeF]                 = useState("All Time");
  const [customFrom, setCustomFrom]       = useState("");
  const [customTo, setCustomTo]           = useState("");
  const [selected, setSelected]           = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast]                 = useState(null);
  const [updating, setUpdating]           = useState(false);
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [discountReasonInput, setDiscountReasonInput] = useState("");
  const [confirmEditDiscount, setConfirmEditDiscount] = useState(false);
  // Once a discount already exists on a booking, the amount/reason fields
  // start locked (read-only) behind a "Re-edit Discount" button, instead of
  // sitting open and editable — makes it much harder to bump an existing
  // discount by accident. Clicking it unlocks the fields for this viewing
  // session; re-opening the booking (openDetail) locks it again.
  const [discountUnlocked, setDiscountUnlocked] = useState(false);
  const [markingRefund, setMarkingRefund] = useState(false);
  const [correctingDiscount, setCorrectingDiscount] = useState(false);
  const [correctionInput, setCorrectionInput] = useState("");
  const [correctionReasonInput, setCorrectionReasonInput] = useState("");
  const [confirmCorrection, setConfirmCorrection] = useState(false);
  const [sortKey, setSortKey]             = useState(null); // null = default/unsorted (API order)
  const [sortDir, setSortDir]             = useState("asc");
  const [searchParams] = useSearchParams();

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const token = localStorage.getItem("token");
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  })();
  const isAdmin = currentUser?.role === "Admin";
  const { fmt: fmtCurrency } = useCurrency();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPayments = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/payments`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load payments.");
      setPayments(data.data || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  // Deep-link from other pages (e.g. Car Tracking's payment modal linking
  // here with ?bookingID=...) — pre-fill the search box so the relevant
  // payment is right there in the filtered table, and jump straight into
  // its detail panel if it's the only match.
  useEffect(() => {
    const bookingID = searchParams.get("bookingID");
    if (!bookingID || payments.length === 0) return;
    setSearch(bookingID);
    const matches = payments.filter((p) => p.bookingID === bookingID);
    if (matches.length === 1) openDetail(matches[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, searchParams]);

  const openDetail = async (id) => {
    setDetailLoading(true); setSelected(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSelected(data.data);
      setDiscountInput(data.data.discountAmount ? String(data.data.discountAmount) : "");
      setDiscountReasonInput("");
      setCorrectionInput(data.data.discountAmount ? String(data.data.discountAmount) : "");
      setCorrectionReasonInput("");
      setDiscountUnlocked(false);
    } catch (e) { showToast(e.message, "error"); }
    finally { setDetailLoading(false); }
  };

  const updateStatus = async (id, status) => {
    setUpdating(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/${id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast(`Status updated to ${status}.`);
      setPayments((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
      setSelected((prev) => prev ? { ...prev, status } : prev);
    } catch (e) { showToast(e.message, "error"); }
    finally { setUpdating(false); }
  };

  // Flat-peso discount — keeps the drawer open afterward (rather than
  // closing it) so the recalculated Amount Paid/Balance are visible right
  // away. Re-opens the same payment via openDetail() so amountPaid/balance
  // come back freshly recomputed server-side by computeAmounts(), instead
  // of trying to replicate that spillover math here in the frontend.
  const submitDiscount = async () => {
    if (!selected) return;
    const amount = Number(discountInput);
    if (!Number.isFinite(amount) || amount < 0) return;
    const previousAmount = selected.discountAmount || 0;
    setApplyingDiscount(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/discount`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: discountReasonInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast("Discount applied.");
      logAuditEvent(
        "update",
        previousAmount > 0
          ? `Discount on booking ${selected.bookingID} updated from ₱${previousAmount.toLocaleString()} to ₱${amount.toLocaleString()}.${discountReasonInput.trim() ? ` Reason: ${discountReasonInput.trim()}` : ""}`
          : `Discount of ₱${amount.toLocaleString()} applied to booking ${selected.bookingID}.${discountReasonInput.trim() ? ` Reason: ${discountReasonInput.trim()}` : ""}`
      );
      await openDetail(selected.id);
      await fetchPayments();
    } catch (e) { showToast(e.message, "error"); }
    finally { setApplyingDiscount(false); setConfirmEditDiscount(false); }
  };

  // Gate in front of submitDiscount() — a discount already exists on this
  // booking, so this click is an *edit*, not the first time it's being
  // given. Route through a confirmation step instead of writing straight
  // away, since staff may not realize the customer could've already been
  // told/charged the original amount. First-time discounts skip this and
  // submit immediately.
  const handleApplyDiscount = () => {
    if (!selected) return;
    const amount = Number(discountInput);
    if (!Number.isFinite(amount) || amount < 0) return;
    if (selected.discountAmount > 0) {
      setConfirmEditDiscount(true);
      return;
    }
    submitDiscount();
  };

  // Confirm a refund-due amount (created by a discount that overshot the
  // balance) was actually handed back to the customer. Same re-open
  // pattern as handleApplyDiscount — refundDue recomputes server-side.
  const handleMarkRefundIssued = async () => {
    if (!selected) return;
    setMarkingRefund(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/refund-issued`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast("Refund marked as returned.");
      logAuditEvent("update", `Refund of ₱${selected.refundDue.toLocaleString()} on booking ${selected.bookingID} marked as returned to customer.`);
      await openDetail(selected.id);
      await fetchPayments();
    } catch (e) { showToast(e.message, "error"); }
    finally { setMarkingRefund(false); }
  };

  // Admin-only backdoor: corrects an already-issued discount's recorded
  // amount for the books — no notification, no reopening. Mirrors
  // submitDiscount()'s re-open-and-refresh pattern, but hits the
  // /discount/correct route instead.
  const submitCorrection = async () => {
    if (!selected) return;
    const amount = Number(correctionInput);
    if (!Number.isFinite(amount) || amount < 0) return;
    if (!correctionReasonInput.trim()) { showToast("A reason is required for a correction.", "error"); return; }
    const previousAmount = selected.discountAmount || 0;
    setCorrectingDiscount(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/discount/correct`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: correctionReasonInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast("Discount record corrected.");
      logAuditEvent(
        "update",
        `[Admin correction] Discount record on booking ${selected.bookingID} corrected from ₱${previousAmount.toLocaleString()} to ₱${amount.toLocaleString()} (refund already returned — documentation only, no notification sent). Reason: ${correctionReasonInput.trim()}`
      );
      await openDetail(selected.id);
      await fetchPayments();
    } catch (e) { showToast(e.message, "error"); }
    finally { setCorrectingDiscount(false); setConfirmCorrection(false); }
  };

  const handleSubmitCorrection = () => {
    if (!selected) return;
    const amount = Number(correctionInput);
    if (!Number.isFinite(amount) || amount < 0) return;
    if (!correctionReasonInput.trim()) { showToast("A reason is required for a correction.", "error"); return; }
    setConfirmCorrection(true);
  };

  // ── filter ──
  const methods = ["All", ...new Set(payments.map((p) => p.paymentMethod).filter((m) => m && m !== "—"))];

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase();
    const matchQ = !q || (p.paymentID || "").toLowerCase().includes(q)
      || (p.customerName || "").toLowerCase().includes(q)
      || (p.bookingID || "").toLowerCase().includes(q)
      || (p.vehicleName || "").toLowerCase().includes(q);
    const matchS = statusF === "All" || p.status === statusF;
    const matchM = methodF === "All" || p.paymentMethod === methodF;
    const matchT = inTimeRange(p.createdAt, timeF, customFrom, customTo);
    return matchQ && matchS && matchM && matchT;
  });

  // ── sort (numeric/date columns only — everything else stays in API/insertion order) ──
  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    let av, bv;
    if (sortKey === "totalFee") { av = a.totalFee ?? -Infinity; bv = b.totalFee ?? -Infinity; }
    else if (sortKey === "amountPaid") { av = a.amountPaid ?? -Infinity; bv = b.amountPaid ?? -Infinity; }
    else if (sortKey === "balance") { av = a.balance ?? -Infinity; bv = b.balance ?? -Infinity; }
    else if (sortKey === "discount") { av = a.discountAmount ?? 0; bv = b.discountAmount ?? 0; }
    else if (sortKey === "submitted") { av = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity; bv = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity; }
    else return 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(sorted, PAGE_SIZE);
  useEffect(() => setPage(1), [search, statusF, methodF, timeF, customFrom, customTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── stat cards ──
  const totalCollected = payments.filter(p => ["Approved","Paid"].includes(p.status)).reduce((s,p) => s + p.amountPaid, 0);
  const approved  = payments.filter(p => ["Approved","Paid"].includes(p.status)).length;
  const pending   = payments.filter(p => p.status === "Pending").length;
  const totalBal  = payments.filter(p => !["Cancelled","Rejected"].includes(p.status)).reduce((s,p) => s + p.balance, 0);

  return (
    <div className="w-full px-4 space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      {/* Payment Detail — centered modal like Bookings' "Booking Details".
          z-[60], not z-40: the app's top Header bar is z-50 (see
          Header.jsx), so z-40 let the navbar draw over the top of this
          modal and hide the "Payment Detail" label entirely — matches
          the other centered modals below (Confirm Edit Discount, Mark
          Refund), which already use z-[60] for the same reason. */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-20">Loading…</div>
            ) : selected && (
              <>
                <div className="sticky top-0 bg-white border-b rounded-t-2xl px-6 py-4 flex items-center justify-between z-10">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Payment Detail</p>
                    <p className="font-bold text-arl-dark text-sm">{selected.paymentID}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                    <IconX className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  {/* Status + Actions */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <StatusBadge status={selected.status} />
                    {!["Cancelled","Approved"].includes(selected.status) && (
                      <>
                        <button disabled={updating} onClick={() => updateStatus(selected.id, "Approved")}
                          className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
                          Approve
                        </button>
                        <button disabled={updating} onClick={() => updateStatus(selected.id, "Rejected")}
                          className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                          Reject
                        </button>
                      </>
                    )}
                  </div>

                  <Section title="Customer">
                    <Row label="Name" value={selected.customerName} />
                    <Row label="Booking ID" value={selected.bookingID} mono />
                    <Row label="Vehicle" value={selected.vehicleName} />
                  </Section>

                  <Section title="Payment Info">
                    <Row label="Payment ID" value={selected.paymentID} mono />
                    <Row label="Reference #" value={selected.referenceNumber} />
                    <Row label="Payment Type" value={selected.methodOfPayment} />
                    <Row label="Gateway" value={selected.paymentMethod} />
                    <Row label="Submitted" value={fmtDate(selected.createdAt)} />
                  </Section>

                  <Section title="Fee Breakdown">
                    <Row label="Rental Fee" value={peso(selected.rentalFee, fmtCurrency)} />
                    <Row label="Deposit Fee" value={peso(selected.depositFee, fmtCurrency)} />
                    <Row label="Extra Fee" value={peso(selected.extraFee, fmtCurrency)} />
                    <Row label="Service Fee" value={peso(selected.serviceFee, fmtCurrency)} />
                    <div className="border-t pt-2 mt-1">
                      <Row label="Total Fee" value={peso(selected.totalFee, fmtCurrency)} bold />
                      {selected.discountAmount > 0 && (
                        <Row label="Discount" value={`−${peso(selected.discountAmount, fmtCurrency)}`} bold color="text-red-500" />
                      )}
                      <Row label="Amount Paid" value={peso(selected.amountPaid, fmtCurrency)} bold />
                      <Row label="Balance" value={peso(selected.balance, fmtCurrency)} bold color={selected.balance > 0 ? "text-red-500" : "text-green-600"} />
                    </div>
                  </Section>

                  {selected.refundDue > 0 && (
                    <Section title="Refund Due to Customer">
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-red-700">Amount owed back</span>
                          <span className="font-bold text-red-700">{peso(selected.refundDue, fmtCurrency)}</span>
                        </div>
                        <p className="text-xs text-red-600">
                          A discount was applied after this booking was already fully paid — the driver or whoever holds the cash needs to return this amount.
                        </p>
                        <button
                          onClick={handleMarkRefundIssued}
                          disabled={markingRefund}
                          className="w-full py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {markingRefund ? "Marking…" : `Mark ${peso(selected.refundDue, fmtCurrency)} as Returned`}
                        </button>
                      </div>
                    </Section>
                  )}

                  <Section title="Apply Discount">
                    {selected.refundIssued ? (
                      isAdmin ? (
                        <div className="space-y-2.5">
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                            This booking's refund has already been marked as returned. Editing here only corrects the number on record — it will <span className="font-semibold">not</span> reopen the refund or notify anyone.
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                              <input
                                type="number" min="0" step="1" placeholder="0"
                                value={correctionInput}
                                onChange={(e) => setCorrectionInput(e.target.value)}
                                className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light"
                              />
                            </div>
                            <input
                              type="text" placeholder="Reason (required)"
                              value={correctionReasonInput}
                              onChange={(e) => setCorrectionReasonInput(e.target.value)}
                              className="flex-[1.3] px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light"
                            />
                          </div>
                          <button
                            onClick={handleSubmitCorrection}
                            disabled={correctingDiscount || correctionInput === "" || !correctionReasonInput.trim()}
                            className="w-full py-2 rounded-xl text-sm font-semibold border border-amber-500 text-amber-700 hover:bg-amber-50 active:scale-[0.99] transition-all disabled:opacity-50"
                          >
                            {correctingDiscount ? "Correcting…" : "Correct Discount Record"}
                          </button>
                          <p className="text-[11px] text-gray-400">Admin-only. Logged to the Audit Log. Does not send a notification.</p>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                          This booking's refund has already been marked as returned, so the discount can no longer be edited here. Only an Admin can correct the recorded amount now.
                        </div>
                      )
                    ) : selected.discountAmount > 0 && !discountUnlocked ? (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                          <span className="text-gray-500">Current discount</span>
                          <span className="font-semibold text-red-500">−{peso(selected.discountAmount, fmtCurrency)}</span>
                        </div>
                        <button
                          onClick={() => setDiscountUnlocked(true)}
                          className="w-full py-2 rounded-xl text-sm font-semibold border border-arl-dark text-arl-dark hover:bg-white active:scale-[0.99] transition-all"
                        >
                          Re-edit Discount
                        </button>
                        <p className="text-[11px] text-gray-400">Locked to avoid accidental changes. Click above to unlock and edit it.</p>
                      </div>
                    ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                          <input
                            type="number" min="0" step="1" placeholder="0"
                            value={discountInput}
                            onChange={(e) => setDiscountInput(e.target.value)}
                            className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light"
                          />
                        </div>
                        <input
                          type="text" placeholder="Reason (optional)"
                          value={discountReasonInput}
                          onChange={(e) => setDiscountReasonInput(e.target.value)}
                          className="flex-[1.3] px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light"
                        />
                      </div>
                      <button
                        onClick={handleApplyDiscount}
                        disabled={applyingDiscount || discountInput === ""}
                        className="w-full py-2 rounded-xl text-sm font-semibold border border-arl-dark text-arl-dark hover:bg-white active:scale-[0.99] transition-all disabled:opacity-50"
                      >
                        {applyingDiscount ? "Applying…" : selected.discountAmount > 0 ? "Edit Discount" : "Apply Discount"}
                      </button>
                      {selected.discountAmount > 0 && (
                        <p className="text-[11px] text-amber-600">A discount is already on this booking — changing it will ask you to confirm first.</p>
                      )}
                      <p className="text-[11px] text-gray-400">Sets the total discount on this booking — entering a new amount replaces the old one, it doesn't add to it.</p>
                    </div>
                    )}
                  </Section>

                  <button onClick={() => setSelected(null)} className="w-full py-2 border rounded-xl text-sm">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm Edit Discount — only shown when changing a discount that's
          already on the booking (first-time discounts skip straight to
          submitDiscount). Staff may not realize the customer could've
          already been told/charged the original amount, so this is a
          speed bump for corrections, not a hard lock. */}
      {confirmEditDiscount && selected && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="font-bold text-arl-dark text-lg">Update existing discount?</h3>
              <p className="text-sm text-gray-500 mt-1">
                A discount of <span className="font-semibold text-gray-700">{peso(selected.discountAmount, fmtCurrency)}</span> was already given on this booking.
                Changing it to <span className="font-semibold text-gray-700">{peso(Number(discountInput) || 0, fmtCurrency)}</span> will replace that amount.
                Only proceed if this is a correction to the original discount.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmEditDiscount(false)} disabled={applyingDiscount}
                className="flex-1 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={submitDiscount} disabled={applyingDiscount}
                className="flex-1 px-4 py-2 bg-arl-dark text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {applyingDiscount ? "Saving…" : "Yes, this is a correction"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Correction — Admin-only backdoor edit for a discount whose
          refund has already been marked as returned. Extra confirm step
          since this bypasses the normal notify-and-reopen flow entirely. */}
      {confirmCorrection && selected && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="font-bold text-arl-dark text-lg">Correct discount record?</h3>
              <p className="text-sm text-gray-500 mt-1">
                This booking's refund was already marked as returned. This will only update the recorded discount from{" "}
                <span className="font-semibold text-gray-700">{peso(selected.discountAmount, fmtCurrency)}</span> to{" "}
                <span className="font-semibold text-gray-700">{peso(Number(correctionInput) || 0, fmtCurrency)}</span>{" "}
                for the books — <span className="font-semibold">no one will be notified</span> and the refund will stay marked as returned.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCorrection(false)} disabled={correctingDiscount}
                className="flex-1 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={submitCorrection} disabled={correctingDiscount}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {correctingDiscount ? "Saving…" : "Yes, correct the record"}
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={<IconMoney      className="w-5 h-5" />} value={peso(totalCollected)} label="Total Collected"    color="teal" />
        <StatCard icon={<IconCheck      className="w-5 h-5" />} value={approved}             label="Approved Payments"  color="green" />
        <StatCard icon={<IconClock      className="w-5 h-5" />} value={pending}              label="Awaiting Review"    color="yellow" />
        <StatCard icon={<IconCreditCard className="w-5 h-5" />} value={peso(totalBal)}       label="Total Balance Due"  color="purple" />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-soft flex flex-wrap gap-3 items-center">
        <input type="text" placeholder="Search by customer, ref, booking…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
        <div className="relative">
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-sm bg-white">
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <IconChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={methodF} onChange={(e) => setMethodF(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-sm bg-white">
            {methods.map((m) => <option key={m}>{m}</option>)}
          </select>
          <IconChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={timeF} onChange={(e) => setTimeF(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-sm bg-white">
            {TIME_RANGES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <IconChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        {timeF === "Custom Range" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              max={customTo || undefined}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white" />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              min={customFrom || undefined}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white" />
          </div>
        )}
        <button onClick={fetchPayments} disabled={loading}
          className="px-4 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 disabled:opacity-50">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {/* Error */}
      {error && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-arl-dark">
            All Payment Records{" "}
            <span className="text-gray-400 text-sm font-normal">({filtered.length} results)</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Ref #</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Car</th>
              <SortableTh label="Total Fee" sortKey="totalFee" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Discount" sortKey="discount" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Refund</th>
              <SortableTh label="Amount Paid" sortKey="amountPaid" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Balance" sortKey="balance" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Method</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment Ref</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <SortableTh label="Submitted" sortKey="submitted" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 12 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr><td colSpan={13} className="text-center py-16 text-gray-400 text-sm">
                {search || statusF !== "All" || methodF !== "All" || timeF !== "All Time" ? "No payments match your filters." : "No payments found."}
              </td></tr>
            ) : paginated.map((p, i) => (
              <tr key={p.id} className={`border-b border-gray-50 last:border-0 hover:bg-arl-light/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs text-arl-dark font-semibold">{p.paymentID}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-800 text-xs">{p.customerName}</div>
                  <div className="text-xs text-gray-400 font-mono">{p.bookingID}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{p.vehicleName}</td>
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-gray-800">{peso(p.totalFee, fmtCurrency)}</div>
                  {p.methodOfPayment && p.methodOfPayment !== "—" && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.methodOfPayment.toLowerCase().includes("full")
                        ? "bg-blue-100 text-blue-700"
                        : p.methodOfPayment.toLowerCase().includes("down")
                        ? "bg-purple-100 text-purple-700"
                        : "bg-orange-100 text-orange-700"
                    }`}>{p.methodOfPayment}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-semibold">
                  {p.discountAmount > 0
                    ? <span className="text-red-500">−{peso(p.discountAmount, fmtCurrency)}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-xs font-semibold">
                  {p.refundDue > 0
                    ? <span className="text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Due {peso(p.refundDue, fmtCurrency)}</span>
                    : p.refundIssued
                    ? <span className="text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Returned</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-800">{peso(p.amountPaid, fmtCurrency)}</td>
                <td className={`px-4 py-3 text-xs font-semibold ${p.balance > 0 ? "text-red-500" : "text-green-600"}`}>
                  {peso(p.balance, fmtCurrency)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{p.paymentMethod}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-600">{p.referenceNumber || "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openDetail(p.id)}
                    className="px-3 py-1.5 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                    View →
                  </button>
                </td>
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

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function StatCard({ icon, value, label, color }) {
  const bgColors = {
    teal:   "bg-teal-50 text-teal-600",
    green:  "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="bg-white rounded-2xl shadow-soft p-4 flex items-center gap-4">
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${bgColors[color] || "bg-gray-100 text-gray-600"}`}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold text-arl-dark">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, mono, bold, color }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-xs text-right break-all ${mono ? "font-mono" : ""} ${bold ? "font-semibold" : ""} ${color || "text-gray-800"}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}