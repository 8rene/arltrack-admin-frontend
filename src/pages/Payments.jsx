import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import usePolling from "../hooks/usePolling";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";
import PaymentEntriesPanel from "../components/shared/PaymentEntriesPanel";

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
  Failed:    "bg-red-500",
  Refunded:  "bg-purple-500",
  Partial:      "bg-orange-400",
  Completed:    "bg-green-500",
  "For Refund": "bg-amber-500",
};
const statusBg = {
  Pending:   "bg-yellow-50 border border-yellow-200",
  Approved:  "bg-green-50 border border-green-200",
  Rejected:  "bg-red-50 border border-red-200",
  Cancelled: "bg-gray-100 border border-gray-200",
  Paid:      "bg-green-50 border border-green-200",
  Failed:    "bg-red-50 border border-red-200",
  Refunded:  "bg-purple-50 border border-purple-200",
  Partial:      "bg-orange-50 border border-orange-200",
  Completed:    "bg-green-50 border border-green-200",
  "For Refund": "bg-amber-50 border border-amber-200",
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
const STATUSES  = ["All", "Pending", "Partial", "Completed", "For Refund", "Refunded", "Cancelled", "Failed"];
const stageOf   = (p) => p.paymentStage || p.status;

const CHANNEL_LABEL = { gcash: "GCash", paymaya: "Maya", qrph: "QRPH" };
const channelOf = (p) => CHANNEL_LABEL[String(p.paymongoChannel || "").toLowerCase()] || p.paymongoChannel || p.paymentMethod;
const TXN_STATUS_STYLE = {
  "Paid":        "bg-green-100 text-green-700",
  "Pending":     "bg-amber-100 text-amber-700",
  "Failed":      "bg-red-100 text-red-700",
  "Cancelled":   "bg-gray-200 text-gray-600",
  "Refunded":    "bg-purple-100 text-purple-700",
  "Not yet due": "bg-gray-100 text-gray-500",
};
const refOf = (p) => {
  const r = p.depositPaymongoPaymentID || p.paymongoPaymentID || p.referenceNumber;
  return r && r !== "—" && r !== "N/A" ? r : null;
};
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
  const { effectiveRole } = useAuth();
  const canRecordInStore = [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR].includes(effectiveRole);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast]                 = useState(null);
  const [updating, setUpdating]           = useState(false);
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [discountReasonInput, setDiscountReasonInput] = useState("");
  // The discount is given ONCE and can't be edited afterwards, so it goes through an "are you sure?" first.
  const [confirmDiscount, setConfirmDiscount] = useState(false);
  const [notifying, setNotifying] = useState(false);
  // In-store receipts (Supervisor / Admin / Owner): payment mode + reference number on record.
  const [inStoreOpen, setInStoreOpen] = useState(false);
  const [inStoreMethod, setInStoreMethod] = useState("Cash");
  const [inStoreRef, setInStoreRef] = useState("");
  const [savingInStore, setSavingInStore] = useState(false);
  const [refundMethod, setRefundMethod] = useState("Cash");
  const [refundRef, setRefundRef] = useState("");
  const [markingRefund, setMarkingRefund] = useState(false);
  const [sortKey, setSortKey]             = useState(null); // null = default/unsorted (API order)
  const [sortDir, setSortDir]             = useState("asc");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

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
  const receivedBy = currentUser?.name || currentUser?.username || currentUser?.email || "You";
  const { fmt: fmtCurrency } = useCurrency();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // `silent` skips the loading spinner — used by the live-refresh listener below
  // so a change from another admin (or a customer's payment/refund action)
  // doesn't flash the whole table blank.
  const fetchPayments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/payments`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load payments.");
      setPayments(data.data || []);
    } catch (e) { if (!silent) setError(e.message); }
    finally { if (!silent) setLoading(false); }
  }, [token]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  // ── Live refresh ────────────────────────────────────────────────────────────
  // Same approach as Bookings.jsx: the REST endpoint does the real work
  // (joins, formatting), so we just listen for any change to the payments
  // collection and re-run the existing fetch, debounced to coalesce bursts.
  // CHANGED: was onSnapshot(collection(db, "payments")) — a full-collection read
  // on every page open + every change. Now re-runs the API fetch every 45s
  // while the tab is visible.
  usePolling(() => fetchPayments(true), 45_000, { immediate: false });

  // Deep-link from other pages (e.g. Car Tracking's payment modal linking
  // here with ?bookingID=...) — pre-fill the search box so the relevant
  // payment is right there in the filtered table, and jump straight into
  // its detail panel if it's the only match.
  useEffect(() => {
    // ?paymentID= (e.g. from Refund Requests) is the precise link; ?bookingID=
    // is the looser one and can match more than one payment.
    const paymentID = searchParams.get("paymentID");
    const bookingID = searchParams.get("bookingID");
    const key = paymentID || bookingID;
    if (!key || payments.length === 0) return;
    setSearch(key);
    const matches = paymentID
      ? payments.filter((p) => p.paymentID === paymentID || p.id === paymentID)
      : payments.filter((p) => p.bookingID === bookingID);
    if (matches.length === 1) openDetail(matches[0].id);
    // The link has been used, so take it out of the URL (same as Bookings.jsx does with ?open=). Without this the
    // effect runs again every time `payments` changes -- the 45-second refresh, a status change, recording a payment
    // -- and re-opened the details no matter how the user closed them.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("paymentID");
      next.delete("bookingID");
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, searchParams]);

  const openDetail = async (id) => {
    setDetailLoading(true); setSelected(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSelected(data.data);
      setDiscountInput("");
      setDiscountReasonInput("");
      setInStoreOpen(false); setInStoreMethod("Cash"); setInStoreRef("");
      setRefundMethod("Cash"); setRefundRef("");
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

  // How much a discount can be at most: the remaining balance while the payment is partial,
  // otherwise what the customer has paid (capped at the total fee). The server enforces the same rule.
  const discountMax = (p) => (p.balance > 0 ? p.balance : Math.min(p.totalFee || 0, p.amountPaid || 0));

  // One discount per booking: no editing, no re-sending. Partial payment -> comes off the remaining
  // balance. Fully paid -> PayMongo refunds it. The drawer re-opens afterwards so the new balance and
  // the refund line show straight away.
  const submitDiscount = async () => {
    if (!selected) return;
    const amount = Number(discountInput);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setApplyingDiscount(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/discount`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: discountReasonInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      const how = data.data?.refundedVia;
      showToast(
        how === "paymongo" ? "Discount given — the refund was sent through PayMongo."
        : how === "in_store" ? "Discount given — return the amount in store, then record it here."
        : "Discount given — deducted from the remaining balance."
      );
      await openDetail(selected.id);
      await fetchPayments(true);
    } catch (e) { showToast(e.message, "error"); }
    finally { setApplyingDiscount(false); setConfirmDiscount(false); }
  };

  // Checks first, then asks "are you sure?" -- the discount can't be changed once it's given.
  const handleApplyDiscount = () => {
    if (!selected) return;
    const amount = Number(discountInput);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const max = discountMax(selected);
    if (amount > max) {
      showToast(`The discount can't be more than ${peso(max, fmtCurrency)}.`, "error");
      return;
    }
    setConfirmDiscount(true);
  };

  // "Notify customer to pay": a bell notification AND an email asking them to pay the remaining balance online.
  // The server allows one reminder per booking every 6 hours.
  const handleNotifyBalance = async () => {
    if (!selected) return;
    setNotifying(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/notify-balance`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast(data?.data?.emailed
        ? "Customer notified by app and email."
        : `Customer notified in the app. ${data?.data?.emailNote || "The email was not sent."}`);
      await openDetail(selected.id);
    } catch (e) { showToast(e.message, "error"); }
    finally { setNotifying(false); }
  };

  // The exception: the customer pays the remaining balance IN STORE. Supervisor / Admin / Owner only,
  // with the payment mode and (for anything but cash) the reference number on record.
  const submitInStorePayment = async () => {
    if (!selected) return;
    if (inStoreMethod !== "Cash" && !inStoreRef.trim()) {
      showToast(`Enter the ${inStoreMethod} reference number.`, "error");
      return;
    }
    setSavingInStore(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/collect-balance`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: inStoreMethod, referenceNumber: inStoreRef.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast("In-store payment recorded.");
      await openDetail(selected.id);
      await fetchPayments(true);
    } catch (e) { showToast(e.message, "error"); }
    finally { setSavingInStore(false); }
  };

  // Only for a refund that could NOT go through PayMongo (the money was received in store): record how it
  // was handed back. Supervisor / Admin / Owner only, same details as an in-store payment.
  const handleMarkRefundIssued = async () => {
    if (!selected) return;
    if (refundMethod !== "Cash" && !refundRef.trim()) {
      showToast(`Enter the ${refundMethod} reference number.`, "error");
      return;
    }
    setMarkingRefund(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/refund-issued`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: refundMethod, referenceNumber: refundRef.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast("Refund recorded as returned.");
      await openDetail(selected.id);
      await fetchPayments(true);
    } catch (e) { showToast(e.message, "error"); }
    finally { setMarkingRefund(false); }
  };

  // ── filter ──
  const methods = ["All", ...new Set(payments.map((p) => p.paymentMethod).filter((m) => m && m !== "—"))];

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase();
    const matchQ = !q || (p.paymentID || "").toLowerCase().includes(q)
      || (p.customerName || "").toLowerCase().includes(q)
      || (p.bookingID || "").toLowerCase().includes(q)
      || (p.vehicleName || "").toLowerCase().includes(q);
    const matchS = statusF === "All" || stageOf(p) === statusF;
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
  const completed = payments.filter(p => stageOf(p) === "Completed").length;
  const pending   = payments.filter(p => stageOf(p) === "Pending").length;
  // Nothing is owed on cancelled/rejected bookings, failed payments, or refunded ones.
  const totalBal  = payments.filter(p => !["Cancelled","Rejected","Failed","Refunded"].includes(p.status)).reduce((s,p) => s + p.balance, 0);

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
                    <StatusBadge status={stageOf(selected)} />
                    {selected.status === "Pending" && (
                      <button disabled={updating} onClick={() => updateStatus(selected.id, "Rejected")}
                        className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                        Reject
                      </button>
                    )}
                  </div>
                  {selected.status === "Pending" && (
                    <p className="text-xs text-gray-400 -mt-2">Waiting for the customer to pay through PayMongo — it's marked as paid automatically the moment they do.</p>
                  )}

                  <Section title="Customer">
                    <Row label="Name" value={selected.customerName} />
                    <Row label="Booking ID" value={selected.bookingID} mono />
                    <Row label="Vehicle" value={selected.vehicleName} />
                    {selected.bookingID && (
                      <button
                        type="button"
                        onClick={() => navigate(`/bookings?open=${encodeURIComponent(selected.bookingID)}`)}
                        className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                      >
                        View booking →
                      </button>
                    )}
                  </Section>

                  {selected.refundRequestID && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      A refund request ({selected.refundRequestStatus}) is open for this payment — manage it on the Refund Requests page.
                    </div>
                  )}
                  {selected.heldAfterCancel && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      This booking was cancelled but {peso(selected.amountPaid, fmtCurrency)} the customer paid is still being held and no refund has been opened. Ask the customer to request one, or arrange the return.
                    </div>
                  )}

                  <Section title="Payment Info">
                    <Row label="Payment ID" value={selected.paymentID} mono />
                    <Row label="Payment Type" value={selected.methodOfPayment} />
                    <Row label="Submitted" value={fmtDate(selected.createdAt)} />
                  </Section>

                  {/* Every charge on this payment — deposit and balance, including pending / failed / not-yet-due ones. */}
                  {Array.isArray(selected.paymongoTransactions) && selected.paymongoTransactions.length > 0 && (
                    <Section title="Transactions">
                      {selected.paymongoTransactions.map((t, i) => (
                        <div key={`${t.phase}-${i}`} className="rounded-lg border border-gray-200 bg-white p-3 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-800">{t.phase === "balance" ? "Balance" : (selected.payType === "Full" ? "Full payment" : "Deposit")}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TXN_STATUS_STYLE[t.status] || "bg-gray-100 text-gray-600"}`}>{t.status}</span>
                          </div>
                          <p className={`text-sm break-all ${t.ref ? "font-mono text-gray-800" : "text-gray-400 italic"}`}>
                            {t.ref || (t.source === "in_person" ? "No PayMongo ref — paid in person" : t.status === "Paid" ? "No ref recorded" : "No ref yet")}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-600">
                            <span className="font-semibold text-gray-800">{peso(t.amount, fmtCurrency)}</span>
                            {t.fee !== null && t.fee !== undefined && <span>PayMongo fee {peso(t.fee, fmtCurrency)}</span>}
                            {t.channel && <span>{CHANNEL_LABEL[String(t.channel).toLowerCase()] || t.channel}</span>}
                            {t.paidAt && <span>{fmtDate(t.paidAt)}</span>}
                            {t.by && <span>by {t.by}</span>}
                          </div>
                        </div>
                      ))}
                      {/* PayMongo's own cost for the online charge(s): what PayMongo keeps, not the gateway fee the customer paid us. */}
                      {selected.paymongoFee && selected.paymongoFee.total !== null && (
                        <div className="border-t pt-2 mt-1">
                          <Row label="Total PayMongo fee" value={peso(selected.paymongoFee.total, fmtCurrency)} bold />
                          {selected.gatewayFee > 0 && (
                            <Row
                              label="Gateway fee collected − PayMongo fee"
                              value={peso(selected.gatewayFee - selected.paymongoFee.total, fmtCurrency)}
                              color={selected.gatewayFee - selected.paymongoFee.total >= 0 ? "text-green-600" : "text-red-500"}
                            />
                          )}
                        </div>
                      )}
                    </Section>
                  )}

                  {selected.payType !== "Full" && (
                    <Section title="Balance">
                      <Row label="Status" value={
                        selected.balanceCollected ? "Received in store"
                        : selected.balanceStatus === "paid" ? "Paid online (PayMongo)"
                        : selected.balanceStatus === "pending" ? "Payment in progress (PayMongo)"
                        : selected.balance > 0 ? "Outstanding" : "—"} />
                      {selected.balanceCollected && (
                        <>
                          <Row label="Payment mode" value={selected.balanceMethod || "—"} />
                          <Row label="Reference no." value={selected.balanceReferenceNumber || "—"} mono />
                          <Row label="Received by" value={selected.balanceCollectedBy} />
                          <Row label="Received at" value={fmtDate(selected.balanceCollectedAt)} />
                        </>
                      )}
                      {selected.balanceStatus === "paid" && <Row label="Paid at" value={fmtDate(selected.balancePaidAt)} />}

                      {/* Still owed: the customer pays it online; this nudges them. In store is the exception. */}
                      {selected.balance > 0 && selected.status === "Approved" && !selected.refundRequestID && selected.balanceStatus !== "pending" && (
                        <div className="pt-2 space-y-2.5">
                          <p className="text-xs text-gray-500">
                            The remaining {peso(selected.balance, fmtCurrency)} is paid online through PayMongo from the customer's booking.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={handleNotifyBalance} disabled={notifying}
                              className="px-4 py-2 text-sm font-semibold rounded-xl border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition disabled:opacity-50">
                              {notifying ? "Sending…" : "Notify customer to pay"}
                            </button>
                            {canRecordInStore && !inStoreOpen && (
                              <button onClick={() => setInStoreOpen(true)}
                                className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                                Record in-store payment
                              </button>
                            )}
                          </div>
                          {selected.balanceReminderAt && (
                            <p className="text-[11px] text-gray-400">Last reminded {fmtDate(selected.balanceReminderAt)}.</p>
                          )}
                          {inStoreOpen && canRecordInStore && (
                            <InStoreForm
                              amountLabel={peso(selected.balance, fmtCurrency)}
                              method={inStoreMethod} setMethod={setInStoreMethod}
                              reference={inStoreRef} setReference={setInStoreRef}
                              receivedByLabel="Received by" receivedBy={receivedBy}
                              onSubmit={submitInStorePayment} onCancel={() => setInStoreOpen(false)}
                              saving={savingInStore} submitLabel="Record payment"
                            />
                          )}
                        </div>
                      )}
                      {selected.balanceStatus === "pending" && selected.balance > 0 && (
                        <p className="text-xs text-amber-600 pt-1">The customer has a balance payment in progress on PayMongo — it will show as paid once it clears.</p>
                      )}
                    </Section>
                  )}

                  {/* EVERY money movement on this payment: deposit, balance, penalties paid on it, refunds, deposit returned,
                      failed attempts. The "Transactions" list above only has the incoming charges. */}
                  <PaymentEntriesPanel
                    key={`${selected.paymentID}-${selected.status}-${selected.amountPaid}-${selected.refundIssued}`}
                    query={{ paymentID: selected.paymentID || selected.id }}
                    title="All money movements"
                  />

                  <Section title="Fee Breakdown">
                    <Row label="Rental Fee" value={peso(selected.rentalFee, fmtCurrency)} />
                    <Row label="Extra Fee" value={peso(selected.extraFee, fmtCurrency)} />
                    {selected.driversFee > 0 && <Row label="Driver's Fee" value={peso(selected.driversFee, fmtCurrency)} />}
                    <Row label={selected.serviceFeeRate > 0 ? `Service Fee (${selected.serviceFeeRate}% of rental)` : "Service Fee"} value={peso(selected.serviceFee, fmtCurrency)} />
                    {selected.securityDeposit > 0 && <Row label="Security Deposit (refundable)" value={peso(selected.securityDeposit, fmtCurrency)} />}
                    {selected.gatewayFee > 0 && <Row label={selected.gatewayFeeRate > 0 ? `Gateway Fee (${selected.gatewayFeeRate}% of ${peso(selected.gatewayFeeBase, fmtCurrency)})` : "Gateway Fee"} value={peso(selected.gatewayFee, fmtCurrency)} />}
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
                    <Section title="Refund Due to Customer (in store)">
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-red-700">Amount owed back</span>
                          <span className="font-bold text-red-700">{peso(selected.refundDue, fmtCurrency)}</span>
                        </div>
                        <p className="text-xs text-red-600">
                          A discount was given on money the customer paid in store, so it can't go back through PayMongo.
                          Return it in store, then record how it was returned.
                        </p>
                        {canRecordInStore ? (
                          <InStoreForm
                            amountLabel={peso(selected.refundDue, fmtCurrency)}
                            method={refundMethod} setMethod={setRefundMethod}
                            reference={refundRef} setReference={setRefundRef}
                            receivedByLabel="Returned by" receivedBy={receivedBy}
                            onSubmit={handleMarkRefundIssued}
                            saving={markingRefund} submitLabel={`Record ${peso(selected.refundDue, fmtCurrency)} as returned`}
                          />
                        ) : (
                          <p className="text-xs text-gray-500">Only a Supervisor, Admin or Owner can record this.</p>
                        )}
                      </div>
                    </Section>
                  )}

                  <Section title="Give Discount">
                    {selected.discountAmount > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                          <span className="text-gray-500">Discount given</span>
                          <span className="font-semibold text-red-500">−{peso(selected.discountAmount, fmtCurrency)}</span>
                        </div>
                        {selected.discountReason && <Row label="Reason" value={selected.discountReason} />}
                        {selected.discountAt && <Row label="Given" value={`${fmtDate(selected.discountAt)}${selected.discountBy ? ` · ${selected.discountBy}` : ""}`} />}
                        <p className="text-[11px] text-gray-400">
                          One discount per booking — it can't be changed or given again.
                          {selected.balance <= 0 && selected.refundDue <= 0 && " Any refund shows in All money movements above."}
                        </p>
                      </div>
                    ) : selected.status !== "Approved" || selected.refundRequestID ? (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                        A discount can be given once the customer's first payment has been received through PayMongo{selected.refundRequestID ? ", and no refund request is open" : ""}.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                            <input
                              type="number" min="1" max={discountMax(selected)} step="1" placeholder="0"
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
                        {Number(discountInput) > discountMax(selected) && (
                          <p className="text-xs text-red-500">The discount can't be more than {peso(discountMax(selected), fmtCurrency)}.</p>
                        )}
                        <button
                          onClick={handleApplyDiscount}
                          disabled={applyingDiscount || !(Number(discountInput) > 0) || Number(discountInput) > discountMax(selected)}
                          className="px-4 py-2 text-sm font-semibold rounded-xl border border-arl-dark text-arl-dark hover:bg-gray-50 transition disabled:opacity-50"
                        >
                          Give discount
                        </button>
                        <p className="text-[11px] text-gray-400">
                          {selected.balance > 0
                            ? `The payment is still partial, so the discount comes off the remaining balance (up to ${peso(selected.balance, fmtCurrency)}).`
                            : `The payment is complete, so PayMongo refunds the discount to the customer (up to ${peso(discountMax(selected), fmtCurrency)}).`}
                          {" "}You'll be asked to confirm first — it can't be changed afterwards.
                        </p>
                      </div>
                    )}
                  </Section>

                  <div className="flex gap-2">
                    <button onClick={() => setSelected(null)} className="flex-1 py-2 border rounded-xl text-sm">Close</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm the one-time discount. There is no editing or re-sending afterwards, and on a fully paid
          booking the refund goes out through PayMongo straight away, so this restates exactly what will happen. */}
      {confirmDiscount && selected && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="font-bold text-arl-dark text-lg">Give this discount?</h3>
              <p className="text-sm text-gray-600 mt-2">
                {selected.balance > 0 ? (
                  <>
                    <span className="font-semibold">{peso(Number(discountInput) || 0, fmtCurrency)}</span> will be deducted from the remaining balance
                    ({peso(selected.balance, fmtCurrency)} → {peso(Math.max(0, selected.balance - (Number(discountInput) || 0)), fmtCurrency)}).
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{peso(Number(discountInput) || 0, fmtCurrency)}</span> will be refunded to the customer through PayMongo.
                  </>
                )}
              </p>
              <p className="text-xs text-red-500 mt-2">A discount can only be given once. After you confirm, it can't be edited, corrected or given again.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDiscount(false)} disabled={applyingDiscount}
                className="flex-1 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={submitDiscount} disabled={applyingDiscount}
                className="flex-1 px-4 py-2 bg-arl-dark text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {applyingDiscount ? "Saving…" : `Yes, give ${peso(Number(discountInput) || 0, fmtCurrency)}`}
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={<IconMoney      className="w-5 h-5" />} value={peso(totalCollected, fmtCurrency)} label="Total Collected"    color="teal" />
        <StatCard icon={<IconCheck      className="w-5 h-5" />} value={completed}            label="Fully Paid"         color="green"
          active={statusF === "Completed"}
          onClick={() => setStatusF(statusF === "Completed" ? "All" : "Completed")} />
        <StatCard icon={<IconClock      className="w-5 h-5" />} value={pending}              label="Awaiting Payment"   color="yellow"
          active={statusF === "Pending"}
          onClick={() => setStatusF(statusF === "Pending" ? "All" : "Pending")} />
        <StatCard icon={<IconCreditCard className="w-5 h-5" />} value={peso(totalBal, fmtCurrency)} label="Total Balance Due"  color="purple" />
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment Type</th>
              <SortableTh label="Discount" sortKey="discount" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Refund</th>
              <SortableTh label="Amount Paid" sortKey="amountPaid" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Balance" sortKey="balance" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">PayMongo Fee</th>
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
              <tr><td colSpan={15} className="text-center py-16 text-gray-400 text-sm">
                {search || statusF !== "All" || methodF !== "All" || timeF !== "All Time" ? "No payments match your filters." : "No payments found."}
              </td></tr>
            ) : paginated.map((p, i) => (
              <tr key={p.id} className={`border-b border-gray-50 last:border-0 hover:bg-arl-light/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs text-arl-dark font-semibold">{p.paymentID}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-800 text-xs">{p.customerName}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{p.vehicleName}</td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-800">{peso(p.totalFee, fmtCurrency)}</td>
                <td className="px-4 py-3">
                  {p.methodOfPayment && p.methodOfPayment !== "—" ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.methodOfPayment.toLowerCase().includes("full")
                        ? "bg-blue-100 text-blue-700"
                        : p.methodOfPayment.toLowerCase().includes("down")
                        ? "bg-purple-100 text-purple-700"
                        : "bg-orange-100 text-orange-700"
                    }`}>{p.methodOfPayment}</span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
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
                <td className="px-4 py-3 text-xs font-semibold text-gray-800" title={p.paymongoFee && p.paymongoFee.total !== null ? [p.paymongoFee.deposit !== null && `Deposit charge: ${peso(p.paymongoFee.deposit, fmtCurrency)}`, p.paymongoFee.balance !== null && `Balance charge: ${peso(p.paymongoFee.balance, fmtCurrency)}`].filter(Boolean).join(" · ") : "Not recorded (cash payment or paid before fee tracking)"}>
                  {p.paymongoFee && p.paymongoFee.total !== null
                    ? peso(p.paymongoFee.total, fmtCurrency)
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{channelOf(p)}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-600" title={p.balancePaymongoPaymentID ? `Balance: ${p.balancePaymongoPaymentID}` : undefined}>{refOf(p) || "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={stageOf(p)} /></td>
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

// Optional onClick makes the card a filter shortcut (used for Approved / Awaiting
// Review on this page). `active` highlights it while its filter is applied;
// clicking it again clears the filter back to "All".
function StatCard({ icon, value, label, color, onClick, active }) {
  const bgColors = {
    teal:   "bg-teal-50 text-teal-600",
    green:  "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
  };
  const body = (
    <>
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${bgColors[color] || "bg-gray-100 text-gray-600"}`}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold text-arl-dark">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </>
  );

  if (!onClick) {
    return <div className="bg-white rounded-2xl shadow-soft p-4 flex items-center gap-4">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      title={active ? "Click to clear this filter" : `Filter by ${label}`}
      className={`bg-white rounded-2xl shadow-soft p-4 flex items-center gap-4 text-left w-full transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-arl-light ${active ? "ring-2 ring-arl-light" : ""}`}
    >
      {body}
    </button>
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
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className={`text-sm text-right break-all ${mono ? "font-mono" : ""} ${bold ? "font-semibold" : ""} ${color || "text-gray-800"}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ─── In-store record form ────────────────────────────────────────────────────
// Used for an in-store payment and for returning a refund in store: payment mode,
// reference number (required for anything but cash) and who handled it.
const IN_STORE_METHODS = ["Cash", "GCash", "Bank Transfer"];

function InStoreForm({ amountLabel, method, setMethod, reference, setReference, receivedByLabel, receivedBy, onSubmit, onCancel, saving, submitLabel }) {
  const needsRef = method !== "Cash";
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <Row label="Amount" value={amountLabel} bold />
      <label className="block">
        <span className="text-xs font-semibold text-gray-500">Payment mode</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light"
        >
          {IN_STORE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-gray-500">{needsRef ? "Reference number (required)" : "Official receipt no. (optional)"}</span>
        <input
          type="text" maxLength={64}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={needsRef ? `${method} reference number` : "Receipt number"}
          className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light"
        />
      </label>
      <Row label={receivedByLabel} value={receivedBy} />
      <div className="flex gap-2">
        {onCancel && (
          <button onClick={onCancel} disabled={saving}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-white disabled:opacity-50">
            Cancel
          </button>
        )}
        <button onClick={onSubmit} disabled={saving || (needsRef && !reference.trim())}
          className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-arl-dark text-white hover:opacity-90 disabled:opacity-50">
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}