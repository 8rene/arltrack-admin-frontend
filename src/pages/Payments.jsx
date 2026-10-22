import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import usePolling from "../hooks/usePolling";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";
import PaymentEntriesPanel from "../components/shared/PaymentEntriesPanel";
import ReturnChecklistModal from "../components/ReturnChecklistModal";

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
function fmtDateOnly(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTimeOnly(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
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
  // Giving a discount: Admin / Owner. Editing one that was given: Owner only (mirrors payments.routes.js).
  const canGiveDiscountRole = [ROLES.OWNER, ROLES.ADMIN].includes(effectiveRole);
  const canEditDiscountRole  = effectiveRole === ROLES.OWNER;
  // Returning the security deposit: Supervisor / Admin / Owner (mirrors booking.routes.js).
  const canReturnDepositRole = [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR].includes(effectiveRole);
  const [detailLoading, setDetailLoading] = useState(false);
  // "Return deposit": the hand-back of the security deposit (after penalties) for the open payment's booking.
  const [returnDepositOpen, setReturnDepositOpen] = useState(false);
  const [toast, setToast]                 = useState(null);
  const [updating, setUpdating]           = useState(false);
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [discountReason, setDiscountReason] = useState("");   // required: why the discount is given
  // A discount can be changed only until it is used (a penalty is paid from it, it is returned, or the deposit is
  // settled), and never taken back, so giving one goes through an "are you sure?" first.
  const [confirmDiscount, setConfirmDiscount] = useState(false);
  // The discount being changed: { id, value } while its inline form is open, null otherwise.
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [savingDiscountEdit, setSavingDiscountEdit] = useState(false);
  const [notifying, setNotifying] = useState(false);
  // In-store receipts (Supervisor / Admin / Owner): payment mode + reference number on record.
  const [inStoreOpen, setInStoreOpen] = useState(false);
  const [inStoreMethod, setInStoreMethod] = useState("Cash");
  const [inStoreRef, setInStoreRef] = useState("");
  const [savingInStore, setSavingInStore] = useState(false);
  const [refundMethod, setRefundMethod] = useState("Cash");
  const [refundRef, setRefundRef] = useState("");
  const [markingRefund, setMarkingRefund] = useState(false);
  const [retryingRefund, setRetryingRefund] = useState(false);
  const [detailTab, setDetailTab] = useState("summary");     // which tab of the payment modal is open
  const [entriesSummary, setEntriesSummary] = useState(null); // totals from All money movements (refunded amount etc.)
  const [sortKey, setSortKey]             = useState("submitted"); // default: newest submitted first
  const [sortDir, setSortDir]             = useState("desc");
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

  // Payment modal: Escape closes it (or the discount confirm on top of it first), and the page behind it
  // doesn't scroll. The receipt popup listens for Escape in the CAPTURE phase and stops the event, so while a
  // receipt is open Escape closes only the receipt -- this listener is deliberately the bubble-phase one.
  const modalOpen = !!(selected || detailLoading);
  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (returnDepositOpen) return;   // the Return deposit window is on top: let it handle its own close
      if (confirmDiscount) setConfirmDiscount(false); else setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [modalOpen, confirmDiscount, returnDepositOpen]);

  const openDetail = async (id) => {
    setDetailLoading(true); setSelected(null); setEntriesSummary(null); setDetailTab("summary");
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSelected(data.data);
      setDiscountInput(""); setDiscountReason(""); setEditingDiscount(null);
      setInStoreOpen(false); setInStoreMethod("Cash"); setInStoreRef("");
      setRefundMethod("Cash"); setRefundRef("");
    } catch (e) { showToast(e.message, "error"); }
    finally { setDetailLoading(false); }
  };

  // Return deposit — same checklist/settle endpoints Car Tracking uses (they accept the bookingID the payment carries).
  // Settling changes this payment (deposit settled / returned) and its penalties, so re-open the detail afterwards.
  const loadReturnChecklist = useCallback(async () => {
    if (!selected) return null;
    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${encodeURIComponent(selected.bookingID)}/return-checklist`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Couldn't load the deposit details.");
    return json.data;
  }, [selected, token]);

  const settleDepositFromPayments = async ({ method, referenceNumber, online, completeBooking }) => {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${encodeURIComponent(selected.bookingID)}/settle-deposit`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ method, referenceNumber, online: online === true, completeBooking: completeBooking === true }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Couldn't settle the deposit.");
    const o = json.data?.online;
    showToast(
      o?.state === "failed" ? "Deposit settled, but PayMongo refused the refund. See the Refunds page."
        : o?.state === "processing" ? "Deposit settled. PayMongo is returning it to the customer."
        : "Deposit settled.",
      o?.state === "failed" ? "error" : "success"
    );
    fetchPayments(true);
    return json.data;
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

  // How much MORE discount can be given right now. The server works it out (the remaining balance while the payment is
  // partial; otherwise what the customer paid, less the discounts already given) and enforces the same rule.
  const discountMax = (p) => (typeof p.discountMax === "number" ? p.discountMax : (p.balance > 0 ? p.balance : Math.min(p.totalFee || 0, p.amountPaid || 0)));
  // Where the next discount would go: "balance" (still partial: comes off what is owed) or "credit" (fully paid: held
  // for the customer and returned with the security deposit).
  const discountKindOf = (p) => p.discountKind || (p.balance > 0 ? "balance" : "credit");

  // More than one discount can be given. Partial payment -> comes off the remaining balance. Fully paid -> it is held
  // for the customer and goes back with the security deposit (nothing is refunded now). The drawer re-opens afterwards
  // so the new balance and the discount card show straight away.
  const submitDiscount = async () => {
    if (!selected) return;
    const amount = Number(discountInput);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (!discountReason.trim()) { showToast("Enter the reason for this discount.", "error"); return; }
    setApplyingDiscount(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/discount`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: discountReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setDiscountReason("");
      showToast(
        data.data?.kind !== "credit"
          ? "Discount given — deducted from the remaining balance."
          : data.data?.creditPaidPenalties > 0
            ? `Discount given — ${peso(data.data.creditPaidPenalties, fmtCurrency)} went toward the customer's unpaid penalty${data.data.creditHeld > 0 ? `; ${peso(data.data.creditHeld, fmtCurrency)} is held and returned with the deposit.` : "."}`
            : "Discount given — held for the customer and returned with the security deposit after the trip, less any penalties."
      );
      await openDetail(selected.id);
      await fetchPayments(true);
    } catch (e) { showToast(e.message, "error"); }
    finally { setApplyingDiscount(false); setConfirmDiscount(false); }
  };

  // Changes ONE discount that has not been used yet. The server decides (and checks again when it saves), so a screen that
  // was open too long just gets the reason back. The drawer re-opens afterwards so the figures and history are fresh.
  const submitDiscountEdit = async () => {
    if (!selected || !editingDiscount) return;
    const amount = Number(editingDiscount.value);
    if (!Number.isFinite(amount) || amount <= 0) { showToast("Enter a discount greater than ₱0.", "error"); return; }
    setSavingDiscountEdit(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/discount/${editingDiscount.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast(
        data.data?.kind === "balance"
          ? `Discount changed to ${peso(amount, fmtCurrency)} — the remaining balance is now ${peso(data.data.balanceAfter, fmtCurrency)}.`
          : `Discount changed to ${peso(amount, fmtCurrency)} — still held and returned with the security deposit.`
      );
      setEditingDiscount(null);
      await openDetail(selected.id);
      await fetchPayments(true);
    } catch (e) { showToast(e.message, "error"); }
    finally { setSavingDiscountEdit(false); }
  };

  // Checks first, then asks "are you sure?" before a NEW discount is given.
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

  // The discount's PayMongo refund failed: send it again. The failed attempt stays on the ledger as history; the server
  // refuses this while a refund is still processing or after it succeeded. A LEDGER discount's credit is its own payout,
  // retried through the deposit-return route (it retries whichever payout of the booking failed); a legacy one has its own.
  const handleRetryDiscountRefund = async () => {
    if (!selected) return;
    setRetryingRefund(true);
    try {
      const url = selected.discount?.ledger
        ? `${process.env.REACT_APP_API_URL}/api/bookings/${encodeURIComponent(selected.bookingID)}/deposit-return/retry`
        : `${process.env.REACT_APP_API_URL}/api/payments/booking/${selected.bookingID}/discount-refund/retry`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message);
      showToast("Refund sent to PayMongo again.");
      await openDetail(selected.id);
      await fetchPayments(true);
    } catch (e) { showToast(e.message, "error"); }
    finally { setRetryingRefund(false); }
  };

  // The security deposit's failed online return. The server retries whichever payout of the booking failed (the deposit's,
  // the discount credit's, or both), so this is the same call the discount card makes for a held-credit discount.
  const handleRetryDepositReturn = async () => {
    if (!selected) return;
    setRetryingRefund(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${encodeURIComponent(selected.bookingID)}/deposit-return/retry`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message);
      showToast("Refund sent to PayMongo again.");
      await openDetail(selected.id);
      await fetchPayments(true);
    } catch (e) { showToast(e.message, "error"); }
    finally { setRetryingRefund(false); }
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
      <ReturnChecklistModal
        open={returnDepositOpen && !!selected}
        onClose={() => setReturnDepositOpen(false)}
        title={selected ? `${selected.customerName} — ${selected.vehicleName}` : ""}
        depositOnly
        loadChecklist={loadReturnChecklist}
        onSettleDeposit={settleDepositFromPayments}
        onOpenRefunds={() => { setReturnDepositOpen(false); navigate(`/refund-requests?search=${encodeURIComponent(selected?.bookingID || "")}`); }}
      />

      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      {/* Payment Details — centered modal laid out like Bookings' "Booking Details": title + status, who / what,
          tabs, a scrolling body and a pinned footer. Clicking the dimmed area or pressing Escape closes it.
          z-[60], not z-40: the app's top Header bar is z-50 (see Header.jsx), so z-40 let the navbar draw over
          the top of this modal. The confirm dialogs below use z-[70] for the same reason. */}
      {(selected || detailLoading) && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={() => { if (!confirmDiscount) setSelected(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-detail-title"
            className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-20">Loading…</div>
            ) : selected && (
              <>
                {/* Header */}
                <div className="px-6 pt-5 shrink-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <h2 id="payment-detail-title" className="font-bold text-lg text-gray-800">Payment Details</h2>
                      <StatusBadge status={stageOf(selected)} />
                    </div>
                    <button onClick={() => setSelected(null)} aria-label="Close" className="text-gray-400 hover:text-gray-600 shrink-0">
                      <IconX className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 truncate">
                    {selected.customerName || "—"}{selected.vehicleName ? ` · ${selected.vehicleName}` : ""}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    <span className="font-mono">{selected.paymentID}</span>
                    {selected.methodOfPayment && selected.methodOfPayment !== "—" ? ` · ${selected.methodOfPayment}` : ""}
                    {` · Submitted ${fmtDate(selected.createdAt)}`}
                  </p>
                  <div className="flex border-b border-gray-100 mt-3" role="tablist">
                    {[
                      ["summary", "Summary"],
                      ["movements", `Money movements${entriesSummary?.count ? ` (${entriesSummary.count})` : ""}`],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={detailTab === key}
                        onClick={() => setDetailTab(key)}
                        className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                          detailTab === key ? "border-teal-600 text-teal-700" : "border-transparent text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Body. Both tabs stay mounted (the inactive one is just hidden) so the money movements load once,
                    and the Refunded amount in the Fee Breakdown is ready before anyone opens that tab. */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                  <div className={detailTab === "summary" ? "" : "hidden"}>
                    {selected.status === "Pending" && (
                      <div className="flex items-center justify-between gap-4 pb-5">
                        <p className="text-sm text-gray-500">
                          Waiting for the customer to pay through PayMongo — it's marked as paid automatically the moment they do.
                        </p>
                        <button disabled={updating} onClick={() => updateStatus(selected.id, "Rejected")}
                          className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                          Reject
                        </button>
                      </div>
                    )}

                    {/* The three numbers staff look for first. */}
                    <div className="grid grid-cols-3 border-y border-gray-100 py-4 mb-5">
                      <KeyFigure label="Total fee" value={peso(selected.totalFee, fmtCurrency)} />
                      <KeyFigure label="Amount paid" value={peso(selected.amountPaid, fmtCurrency)} />
                      <KeyFigure
                        label="Balance"
                        value={peso(selected.balance, fmtCurrency)}
                        color={selected.balance > 0 ? "text-red-500" : "text-green-600"}
                        note={
                          selected.balance > 0
                            ? `Remaining${selected.balanceStatus === "pending" ? " · payment in progress" : ""}`
                            : ["Cancelled", "Refunded", "Failed"].includes(stageOf(selected)) ? "No balance due" : "Fully paid"
                        }
                      />
                    </div>

                    {selected.heldAfterCancel && (
                      <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                        This booking was cancelled but {peso(selected.amountPaid, fmtCurrency)} the customer paid is still being held and no refund has been opened. Ask the customer to request one, or arrange the return.
                      </p>
                    )}

                    {/* The sections sit in their own wrapper so the first one has no hairline of its own
                        (the figures above already end in one). */}
                    <div>
                      <Section
                        title="Customer"
                        action={selected.bookingID && selected.bookingID !== "—" ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/bookings?search=${encodeURIComponent(selected.bookingID)}`)}
                            className="text-xs font-semibold text-teal-700 hover:underline"
                          >
                            View booking →
                          </button>
                        ) : null}
                      >
                        <Row label="Name" value={selected.customerName} />
                        <Row label="Booking ID" value={selected.bookingID} mono />
                        <Row label="Vehicle" value={selected.vehicleName} />
                        <Row
                          label="Balance"
                          hint="What the customer still has to pay. A discount on a partial payment comes off this amount."
                          value={peso(selected.balance, fmtCurrency)}
                          bold
                          color={selected.balance > 0 ? "text-red-500" : "text-green-600"}
                        />

                        {/* Still owed: the customer pays it online; this nudges them. In store is the exception. */}
                        {selected.balance > 0 && selected.status === "Approved" && !selected.refundRequestID && selected.balanceStatus !== "pending" && (
                          <div className="pt-3 space-y-2.5">
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
                          <p className="text-xs text-amber-600 pt-2">The customer has a balance payment in progress on PayMongo — it will show as paid once it clears.</p>
                        )}
                      </Section>

                      {/* What the booking cost, what was paid, and what happened to the deposit / discount / refund. */}
                      <Section title="Fee Breakdown">
                        <Row label="Rental Fee" value={peso(selected.rentalFee, fmtCurrency)} />
                        <Row label="Extra Fee" value={peso(selected.extraFee, fmtCurrency)} />
                        {selected.driversFee > 0 && <Row label="Driver's Fee" value={peso(selected.driversFee, fmtCurrency)} />}
                        <Row label={selected.serviceFeeRate > 0 ? `Service Fee (${selected.serviceFeeRate}% of rental)` : "Service Fee"} value={peso(selected.serviceFee, fmtCurrency)} />
                        {selected.gatewayFee > 0 && <Row label={selected.gatewayFeeRate > 0 ? `Gateway Fee (${selected.gatewayFeeRate}% of ${peso(selected.gatewayFeeBase, fmtCurrency)})` : "Gateway Fee"} value={peso(selected.gatewayFee, fmtCurrency)} />}
                        {selected.securityDeposit > 0 && <Row label="Security Deposit (refundable)" value={peso(selected.securityDeposit, fmtCurrency)} />}
                        <div className="border-t border-gray-100 mt-2 pt-2">
                          <Row label="Total Fee" value={peso(selected.totalFee, fmtCurrency)} bold />
                          {selected.discountAmount > 0 ? (
                            <>
                              {(() => {
                                const several = (selected.discount?.events || []).filter((e) => e.kind === "balance" || e.kind === "credit").length > 1;
                                return (
                                  <>
                                    <Row label={several ? "Discounts Given (total)" : "Discount Given"} value={`−${peso(selected.discountAmount, fmtCurrency)}`} bold color="text-red-500" />
                                    {selected.discountReason && <Row label={several ? "Latest Discount Reason" : "Discount Reason"} value={selected.discountReason} />}
                                    {selected.discountAt && <Row label={several ? "Latest Discount Given On" : "Discount Given On"} value={`${fmtDate(selected.discountAt)}${selected.discountBy ? ` · ${selected.discountBy}` : ""}`} />}
                                  </>
                                );
                              })()}
                            </>
                          ) : (
                            <Row label="Discount Given" value={peso(0, fmtCurrency)} color="text-gray-400" />
                          )}
                          <Row label="Amount Paid" value={peso(selected.amountPaid, fmtCurrency)} bold />
                        </div>
                        {entriesSummary && entriesSummary.refundedOut > 0 && (
                          <div className="border-t border-gray-100 mt-2 pt-2">
                            <Row label="Refunded Amount" value={`−${peso(entriesSummary.refundedOut, fmtCurrency)}`} bold color="text-purple-700" />
                          </div>
                        )}
                      </Section>

                      {/* The gateway fee the customer paid us vs. what PayMongo kept, one line per online charge. */}
                      <GatewayBreakdown payment={selected} fmt={fmtCurrency} />

                      {/* Every penalty charged on this booking: charged, paid, waived. Waived / voided ones are listed
                          but never counted toward what is owed, and never touch the booking's balance or discount. */}
                      <PenaltyBreakdown
                        penalties={selected.penalties} payment={selected} fmt={fmtCurrency}
                        // Opens the Penalties page's New Penalty form with this booking already filled in (same as Bookings).
                        onNotePenalty={canRecordInStore && selected.bookingID && selected.bookingID !== "—"
                          ? () => navigate(`/penalties?bookingID=${encodeURIComponent(selected.bookingID)}`)
                          : null}
                        // Opens that one penalty's details on the Penalties page (it opens from ?open=<penaltyID>).
                        onViewPenalty={(penaltyID) => navigate(`/penalties?open=${encodeURIComponent(penaltyID)}`)}
                      />

                      {/* ONE place for money going back to the customer. A discount and a refund request both do that, and both
                          wait on PayMongo, so they share the same stages as the Refund Requests page:
                          Waiting for PayMongo -> Refunded, or Failed (retry) / Waiting for hand-back (in store). */}
                      {(selected.discountRefund || selected.refundRequestID || (["failed", "processing"].includes(selected.depositReturn?.state) && selected.depositReturn?.via === "paymongo")) && (
                        <Section title="Money Back to Customer">
                          <div className="space-y-3">
                            {/* The security deposit's own payout. It is a separate PayMongo refund from the discount's, so it
                                gets its own card: before this, a failed deposit return looked like it had been returned. */}
                            {selected.depositReturn?.via === "paymongo" && ["failed", "processing"].includes(selected.depositReturn.state) && (() => {
                              const dr = selected.depositReturn;
                              const failed = dr.state === "failed";
                              return (
                                <div className={`rounded-xl border p-4 space-y-2 ${failed ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`}>
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className={`font-semibold ${failed ? "text-red-800" : "text-blue-800"}`}>Security deposit return {peso(dr.amount, fmtCurrency)}</span>
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/70 border border-white text-black">
                                      <span className={`w-2 h-2 rounded-full ${failed ? "bg-red-500" : "bg-blue-500"}`} />
                                      {failed ? "Refund failed" : "Processing"}
                                    </span>
                                  </div>
                                  <p className={`text-xs ${failed ? "text-red-800" : "text-blue-800"}`}>
                                    {failed
                                      ? `The ${peso(dr.amount, fmtCurrency)} deposit return did not go through, so the customer has NOT received it yet.${dr.errorNote ? ` (${dr.errorNote})` : ""} Retry it, or hand it back in store from the Refund Requests page.`
                                      : `PayMongo is returning the ${peso(dr.amount, fmtCurrency)} deposit. This can take up to 24 hours.`}
                                  </p>
                                  {failed && canRecordInStore && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      <button type="button" onClick={handleRetryDepositReturn} disabled={retryingRefund}
                                        className="px-4 py-2 rounded-full text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                                        {retryingRefund ? "Retrying…" : `Retry ${peso(dr.amount, fmtCurrency)} refund`}
                                      </button>
                                      <button type="button" onClick={() => navigate(`/refund-requests?search=${encodeURIComponent(selected.bookingID || "")}`)}
                                        className="px-4 py-2 rounded-full text-sm font-semibold border border-red-300 text-red-700 bg-white hover:bg-red-50">
                                        Hand back in store
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {selected.discountRefund && (
                              <DiscountRefundCard
                                payment={selected} fmt={fmtCurrency}
                                canAct={canRecordInStore}
                                canEdit={canEditDiscountRole}
                                onRetry={handleRetryDiscountRefund} retrying={retryingRefund}
                                edits={selected.discountEdits || []}
                                editing={editingDiscount} onEditChange={setEditingDiscount}
                                onEditSave={submitDiscountEdit} savingEdit={savingDiscountEdit}
                              >
                                {selected.discountRefund.state === "awaiting_handback" && (canRecordInStore ? (
                                  <InStoreForm
                                    amountLabel={peso(selected.discountRefund.amount, fmtCurrency)}
                                    method={refundMethod} setMethod={setRefundMethod}
                                    reference={refundRef} setReference={setRefundRef}
                                    receivedByLabel="Returned by" receivedBy={receivedBy}
                                    onSubmit={handleMarkRefundIssued}
                                    saving={markingRefund} submitLabel={`Record ${peso(selected.discountRefund.amount, fmtCurrency)} as returned`}
                                  />
                                ) : (
                                  <p className="text-xs text-gray-500">Only a Supervisor, Admin or Owner can record this.</p>
                                ))}
                              </DiscountRefundCard>
                            )}
                            {selected.refundRequestID && (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
                                <div className="text-xs text-amber-800 space-y-0.5">
                                  <p className="font-semibold">Refund request · {selected.refundRequestStatus}</p>
                                  {selected.discountRefund && ["processing", "failed"].includes(selected.discountRefund.state) && (
                                    <p>Approving it is on hold until the discount refund above is {selected.discountRefund.state === "failed" ? "retried and confirmed" : "confirmed by PayMongo"}.</p>
                                  )}
                                </div>
                                <button type="button"
                                  onClick={() => navigate(`/refund-requests?search=${encodeURIComponent(selected.refundRequestID || selected.paymentID)}`)}
                                  className="shrink-0 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap">
                                  Open →
                                </button>
                              </div>
                            )}
                          </div>
                        </Section>
                      )}

                      {/* LAST on the summary: where the security deposit stands, and where it is handed back. Penalties are
                          deducted from it first (Deposit Settled), the rest goes back to the customer (Deposit Returned). */}
                      {selected.securityDeposit > 0 && (
                        <Section title="Deposit Breakdown">
                          <Row label="Security Deposit" value={peso(selected.securityDeposit, fmtCurrency)} />
                          {selected.depositStatus && <Row label="Deposit Status" value={selected.depositStatus} />}
                          <Row label="Deposit Settled (used for penalties)" value={peso(selected.depositSettled, fmtCurrency)} />
                          {(() => {
                            // depositReturned is what settlement decided to hand back. Only count it as returned once the money
                            // really went (in store, or PayMongo confirmed). A failed / still-processing online return is NOT returned.
                            const dr = selected.depositReturn;
                            const notYet = dr && ["failed", "processing"].includes(dr.state) ? Math.min(Number(dr.amount) || 0, selected.depositReturned || 0) : 0;
                            return (
                              <>
                                <Row label="Deposit Returned" value={peso(Math.max(0, (selected.depositReturned || 0) - notYet), fmtCurrency)} />
                                {notYet > 0 && (
                                  <div className={`flex justify-between text-sm ${dr.state === "failed" ? "text-red-600" : "text-blue-600"}`}>
                                    <span>{dr.state === "failed" ? "Deposit return failed (not received)" : "Deposit return processing"}</span>
                                    <span className="font-medium">{peso(notYet, fmtCurrency)}</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          {/* The discount held for the customer goes back WITH the deposit, so it is part of this breakdown. */}
                          {(() => {
                            const held = Number(selected.discount?.credit) || 0;        // still held for the customer
                            const settledBack = Number(selected.discount?.returned) || 0;   // settled to go back (not always received yet)
                            const dRef = selected.discountRefund;
                            const dNotYet = dRef && ["failed", "processing"].includes(dRef.state) ? Math.min(Number(dRef.amount) || 0, settledBack) : 0;
                            const back = Math.max(0, settledBack - dNotYet);              // actually received by the customer
                            const dep = selected.depositReturn;
                            const depNotYet = dep && ["failed", "processing"].includes(dep.state) ? Math.min(Number(dep.amount) || 0, selected.depositReturned || 0) : 0;
                            if (!(held > 0 || settledBack > 0)) return null;
                            const stillHeld = selected.depositStatus === "Held";
                            const depositLeft = Math.max(0, (selected.securityDeposit || 0) - (selected.depositSettled || 0));
                            return (
                              <>
                                <Row label="Discount Held for Customer" value={peso(held, fmtCurrency)} />
                                {settledBack > 0 && <Row label="Discount Returned" value={peso(back, fmtCurrency)} />}
                                {dNotYet > 0 && (
                                  <div className={`flex justify-between text-sm ${dRef.state === "failed" ? "text-red-600" : "text-blue-600"}`}>
                                    <span>{dRef.state === "failed" ? "Discount return failed (not received)" : "Discount return processing"}</span>
                                    <span className="font-medium">{peso(dNotYet, fmtCurrency)}</span>
                                  </div>
                                )}
                                <div className="border-t border-gray-100 mt-2 pt-2">
                                  <Row label={stillHeld ? "To Return (deposit + discount)" : "Total Returned"}
                                    value={peso(stillHeld ? depositLeft + held : Math.max(0, (selected.depositReturned || 0) - depNotYet) + back, fmtCurrency)} />
                                </div>
                                {stillHeld && <p className="text-[11px] text-gray-400 mt-1">Any penalty still unpaid comes off this first. The exact amount is shown when you return it.</p>}
                              </>
                            );
                          })()}
                          {canReturnDepositRole && selected.depositStatus === "Held" && ["ongoing", "completed"].includes(String(selected.bookingStatus || "").toLowerCase()) && (
                            <div className="border-t border-gray-100 mt-2 pt-3 space-y-1.5">
                              <p className="text-xs text-gray-500">
                                {String(selected.bookingStatus || "").toLowerCase() === "ongoing"
                                  ? "The trip is still ongoing. Returning the deposit here also marks the booking completed."
                                  : "The booking is completed and the deposit is still held. Return it here — penalties are deducted first."}
                              </p>
                              <button onClick={() => setReturnDepositOpen(true)}
                                className="w-full py-2 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700">
                                Return deposit
                              </button>
                            </div>
                          )}
                        </Section>
                      )}
                    </div>
                  </div>

                  {/* Every money movement on this payment (deposit, balance, penalties, refunds, deposit returned,
                      pending / failed attempts) as a plain list, newest first, each with its own receipt. */}
                  <div className={detailTab === "movements" ? "" : "hidden"}>
                    <PaymentEntriesPanel
                      key={`${selected.paymentID}-${selected.status}-${selected.amountPaid}-${selected.refundIssued}-${selected.discountRefund?.state || ""}`}
                      query={{ paymentID: selected.paymentID || selected.id }}
                      title="All money movements"
                      hideSummary
                      onLoaded={setEntriesSummary}
                    />
                  </div>
                </div>

                {/* sticky footer: Give Discount + Close stay put while the rest scrolls */}
                <div className="shrink-0 border-t bg-white px-6 py-4 rounded-b-2xl space-y-3">
                  {(() => {
                    // More than one discount is allowed (the server caps all of them together). It is hidden when the server
                    // says none can be given: a legacy discount, a settled deposit, or nothing left to discount.
                    const stageOk = selected.status === "Approved" && !selected.refundRequestID &&
                      !["For Refund", "Refunded", "Cancelled"].includes(stageOf(selected));
                    const canGiveDiscount = canGiveDiscountRole && stageOk && !selected.discountBlocked && discountMax(selected) > 0;
                    if (stageOk && selected.discountBlocked && !(selected.discountAmount > 0)) {
                      return <p className="text-[11px] text-gray-400">{selected.discountBlocked}</p>;
                    }
                    // An open refund request (shown in "Money Back to Customer" above) means no new discount.
                    if (selected.refundRequestID) return null;
                    if (!canGiveDiscount) return null;
                    return (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{selected.discountAmount > 0 ? "Give Another Discount" : "Give Discount"}</p>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1 min-w-0">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                            <input
                              type="number" min="1" max={discountMax(selected)} step="1" placeholder="0"
                              value={discountInput}
                              onChange={(e) => setDiscountInput(e.target.value)}
                              className="w-full pl-7 pr-2 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light"
                            />
                          </div>
                          <button
                            onClick={handleApplyDiscount}
                            disabled={applyingDiscount || !(Number(discountInput) > 0) || Number(discountInput) > discountMax(selected)}
                            className="px-4 py-2 text-sm font-semibold rounded-xl border border-arl-dark text-arl-dark hover:bg-gray-50 transition disabled:opacity-50 whitespace-nowrap"
                          >
                            Give discount
                          </button>
                        </div>
                        {Number(discountInput) > discountMax(selected) ? (
                          <p className="text-xs text-red-500">The discount can't be more than {peso(discountMax(selected), fmtCurrency)}{selected.discountAmount > 0 ? " more" : ""}.</p>
                        ) : (
                          <p className="text-[11px] text-gray-400">
                            {discountKindOf(selected) === "balance"
                              ? `Comes off the remaining balance (up to ${peso(discountMax(selected), fmtCurrency)}).`
                              : `Payment is complete, so it is held for the customer and returned with the security deposit after the trip (up to ${peso(discountMax(selected), fmtCurrency)} more). Nothing is refunded now.`}
                            {" "}You'll confirm first.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  <button onClick={() => setSelected(null)} className="w-full py-2 border rounded-xl text-sm hover:bg-gray-50">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm a NEW discount. This restates exactly what will happen: off the balance
          on a partial payment, otherwise held for the customer and returned with the security deposit. */}
      {confirmDiscount && selected && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="font-bold text-arl-dark text-lg">Give this discount?</h3>
              <p className="text-sm text-gray-600 mt-2">
                {discountKindOf(selected) === "balance" ? (
                  <>
                    <span className="font-semibold">{peso(Number(discountInput) || 0, fmtCurrency)}</span> will be deducted from the remaining balance
                    ({peso(selected.balance, fmtCurrency)} → {peso(Math.max(0, selected.balance - (Number(discountInput) || 0)), fmtCurrency)}).
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{peso(Number(discountInput) || 0, fmtCurrency)}</span> will be held for the customer, since they have already paid in full.
                    It is returned together with the security deposit after the trip. Nothing is refunded now.
                  </>
                )}
              </p>
              <p className="text-xs text-red-500 mt-2">After you confirm, you can still change this amount until it is used (a penalty is paid from it, it is returned, or the deposit is settled). It can't be taken back.</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Reason for the discount <span className="text-red-500">*</span></label>
              <textarea value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} maxLength={300} rows={2}
                placeholder="e.g. Late pickup, goodwill, price match"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDiscount(false)} disabled={applyingDiscount}
                className="flex-1 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={submitDiscount} disabled={applyingDiscount || !discountReason.trim()}
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
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <SortableTh label="Created At" sortKey="submitted" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
              <SortableTh label="Total Fee" sortKey="totalFee" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment Type</th>
              <SortableTh label="Discount" sortKey="discount" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Amount Paid" sortKey="amountPaid" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Balance" sortKey="balance" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Method</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-16 text-gray-400 text-sm">
                {search || statusF !== "All" || methodF !== "All" || timeF !== "All Time" ? "No payments match your filters." : "No payments found."}
              </td></tr>
            ) : paginated.map((p, i) => (
              <tr key={p.id} className={`border-b border-gray-50 last:border-0 hover:bg-arl-light/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                  <span className="text-gray-700">{fmtDateOnly(p.createdAt)}</span>
                  <span className="mx-1.5 text-gray-300">|</span>
                  <span className="text-gray-500">{fmtTimeOnly(p.createdAt)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-800 text-xs">{p.customerName}</div>
                </td>
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
                    ? (
                      <div className="space-y-1">
                        <span className="text-red-500">−{peso(p.discountAmount, fmtCurrency)}</span>
                        <DiscountRefundBadge state={p.discountRefund?.state} />
                      </div>
                    )
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-800">{peso(p.amountPaid, fmtCurrency)}</td>
                <td className={`px-4 py-3 text-xs font-semibold ${p.balance > 0 ? "text-red-500" : "text-green-600"}`}>
                  {peso(p.balance, fmtCurrency)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{channelOf(p)}</td>
                <td className="px-4 py-3"><StatusBadge status={stageOf(p)} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => openDetail(p.id)}
                    className="px-3 py-1 border rounded-lg text-xs hover:bg-gray-50">View</button>
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

// A flat block of the detail modal: a heading, then its rows, separated from the previous block by a hairline
// (no grey boxes). `action` is an optional link / button shown at the right of the heading.
// ─── DISCOUNT (shared vocabulary with the Refund Requests page) ──────────────────────────────────────────────
// A discount given on a fully paid booking is HELD for the customer and goes back with the security deposit; PayMongo then
// takes time to confirm that payout (up to ~24h), exactly like an approved refund request. A LEGACY discount (given before
// this) was refunded on the spot, with the same stages. Staff read them all the same way.
const DISCOUNT_REFUND_STAGE = {
  processing:        { label: "Waiting for PayMongo",  dot: "bg-blue-500",   box: "border-blue-200 bg-blue-50",     text: "text-blue-800" },
  awaiting_handback: { label: "Waiting for hand-back", dot: "bg-orange-500", box: "border-orange-200 bg-orange-50", text: "text-orange-800" },
  failed:            { label: "Refund failed",         dot: "bg-red-500",    box: "border-red-200 bg-red-50",       text: "text-red-800" },
  refunded:          { label: "Refunded",              dot: "bg-green-500",  box: "border-green-200 bg-green-50",   text: "text-green-800" },
  deducted:          { label: "Taken off the balance", dot: "bg-gray-400",   box: "border-gray-200 bg-gray-50",     text: "text-gray-700" },
  held:              { label: "Held for customer",     dot: "bg-purple-500", box: "border-purple-200 bg-purple-50", text: "text-purple-800" },
  returned:          { label: "Returned with deposit", dot: "bg-green-500",  box: "border-green-200 bg-green-50",   text: "text-green-800" },
};

// Only the states that need someone's attention get a badge in the table; settled ones stay quiet.
function DiscountRefundBadge({ state }) {
  if (!["processing", "awaiting_handback", "failed", "held"].includes(state)) return null;
  const st = DISCOUNT_REFUND_STAGE[state];
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-700 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {state === "processing" ? "Refund processing" : state === "failed" ? "Refund failed" : state === "held" ? "Credit held" : "Hand back"}
    </span>
  );
}

const DISCOUNT_EVENT_LABEL = { balance: "Taken off the balance", credit: "Held for the customer", penalty: "Used for a penalty", return: "Returned to the customer" };
const EVENT_STATUS = { pending: " (processing)", failed: " (failed)" };

function DiscountRefundCard({ payment, fmt, canAct, canEdit = false, onRetry, retrying, edits = [], editing = null, onEditChange, onEditSave, savingEdit = false, children }) {
  const dr = payment.discountRefund;
  if (!dr) return null;
  const st = DISCOUNT_REFUND_STAGE[dr.state] || DISCOUNT_REFUND_STAGE.deducted;
  const d = payment.discount;
  const ledger = !!(d && d.ledger);   // a discount given with the ledger (held credit); otherwise a legacy one
  const copy = ledger ? {
    deducted: d.appliedPenalty > 0 && !(d.appliedBalance > 0)
      ? "Fully used: it paid penalties the security deposit could not cover, so nothing is owed back."
      : "The discount came off the remaining balance, so no money moved.",
    held: `${peso(d.credit, fmt)} is held for the customer: they already paid it. It goes back when the trip is settled, as its own return next to the security deposit. Nothing is refunded now.`,
    processing: `The ${peso(dr.amount, fmt)} discount return is being processed by PayMongo. This can take up to 24 hours.`,
    returned: dr.via === "in_store" ? `${peso(dr.amount, fmt)} of discount credit was handed back in store when the deposit was settled.` : `${peso(dr.amount, fmt)} of discount credit went back to the customer through PayMongo when the deposit was settled.`,
    failed: `The ${peso(dr.amount, fmt)} discount return did not go through, so the customer has NOT received it yet.${dr.errorNote ? ` (${dr.errorNote})` : ""} Retry it below, or hand it back in store from the Refund Requests page.`,
  }[dr.state] : {
    deducted: "The discount came off the remaining balance, so no money moved.",
    processing: `PayMongo has accepted the ${peso(dr.amount, fmt)} refund and is processing it. This can take up to 24 hours — nothing else is needed from you. The customer is notified once it is confirmed.`,
    refunded: dr.via === "in_store" ? `${peso(dr.amount, fmt)} was handed back to the customer in store.` : `PayMongo confirmed the ${peso(dr.amount, fmt)} refund to the customer.`,
    failed: `PayMongo could not complete the ${peso(dr.amount, fmt)} refund, so the customer has NOT received it yet.${dr.errorNote ? ` (${dr.errorNote})` : ""} Retry to send it again; the failed attempt stays on record.`,
    awaiting_handback: `A discount was given on money the customer paid in store, so it can't go back through PayMongo. Return ${peso(dr.amount, fmt)} in store, then record how it was returned.`,
  }[dr.state];
  const parts = ledger ? [
    ["Taken off the balance", d.appliedBalance], ["Used for penalties", d.appliedPenalty],
    ["Held for customer", d.credit], ["Returned", d.returned],
  ].filter(([, v]) => v > 0) : [];
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${st.box}`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={`font-semibold ${st.text}`}>Discount −{peso(payment.discountAmount, fmt)}</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/70 border border-white text-black">
          <span className={`w-2 h-2 rounded-full ${st.dot}`} />
          {st.label}
        </span>
      </div>
      {payment.discountReason && <p className="text-xs text-gray-600">{(d?.events || []).filter((e) => e.kind === "balance" || e.kind === "credit").length > 1 ? "Latest reason" : "Reason"}: {payment.discountReason}</p>}
      <p className={`text-xs ${st.text}`}>{copy}</p>
      {ledger && parts.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
          {parts.map(([label, v]) => <span key={label}>{label} <span className="font-semibold">{peso(v, fmt)}</span></span>)}
        </div>
      )}
      {ledger && (d.events || []).length > 0 && (
        <ul className="text-[11px] text-gray-600 divide-y divide-black/5 border-t border-black/5">
          {d.events.map((e) => {
            // Only a discount nothing has used yet is offered for editing; the server sends exactly which ones, and how high.
            const edit = canEdit ? edits.find((x) => x.id === e.id) : null;
            const open = !!edit && editing && editing.id === e.id;
            const typed = open ? Number(editing.value) : 0;
            const bad = open && (!(typed > 0) || typed > edit.max || typed === edit.current);
            return (
              <li key={e.id} className="py-1">
                <div className="flex justify-between gap-3">
                  <span>
                    {DISCOUNT_EVENT_LABEL[e.kind] || "Discount"}{e.kind === "return" ? (EVENT_STATUS[e.status] || "") : ""}{e.byName ? ` · ${e.byName}` : ""}{e.at ? ` · ${fmtDate(e.at)}` : ""}
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="font-semibold">{peso(e.amount, fmt)}</span>
                    {edit && !open && (
                      <button type="button" onClick={() => onEditChange({ id: e.id, value: String(edit.current) })}
                        className="ml-2 text-[11px] font-semibold text-arl-dark underline underline-offset-2 hover:opacity-70">Edit</button>
                    )}
                  </span>
                </div>
                {open && (
                  <div className="mt-1.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input type="number" min="1" max={edit.max} step="1" autoFocus value={editing.value}
                        onChange={(ev) => onEditChange({ id: e.id, value: ev.target.value })}
                        className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-black" />
                      <button type="button" onClick={onEditSave} disabled={savingEdit || bad}
                        className="px-3 py-1 text-xs font-semibold rounded-lg bg-arl-dark text-white hover:opacity-90 disabled:opacity-50">
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button type="button" onClick={() => onEditChange(null)} disabled={savingEdit}
                        className="px-3 py-1 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-50">Cancel</button>
                    </div>
                    <p className={`text-[11px] ${typed > edit.max ? "text-red-500" : "text-gray-500"}`}>
                      {typed > edit.max
                        ? `It can't be more than ${peso(edit.max, fmt)}.`
                        : edit.kind === "balance"
                          ? `Up to ${peso(edit.max, fmt)}. The remaining balance changes with it.`
                          : `Up to ${peso(edit.max, fmt)}. It stays held and returns with the security deposit.`}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ledger && d.consistent === false && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
          The saved discount figures don't match its history ({(d.problems || []).join(" ")}). Please tell the developer before changing anything on this payment.
        </p>
      )}
      {dr.referenceNumber && dr.via === "paymongo" && <p className="text-[11px] text-gray-500 font-mono">PayMongo ref {dr.referenceNumber}</p>}
      {dr.state === "failed" && (canAct ? (
        <button onClick={onRetry} disabled={retrying}
          className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50">
          {retrying ? "Sending…" : `Retry ${peso(dr.amount, fmt)} refund`}
        </button>
      ) : (
        <p className="text-xs text-gray-500">Only a Supervisor, Admin or Owner can retry this.</p>
      ))}
      {children}
    </div>
  );
}

function Section({ title, action = null, children }) {
  return (
    <section className="py-5 border-t border-gray-100 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

// `hint` (a short description of the row, e.g. how a figure was worked out) is hidden until the small "?" circle
// beside the label is clicked, so the rows stay clean. Every row with a hint gets the same button.
function Row({ label, hint, value, mono, bold, color }) {
  const [showHint, setShowHint] = useState(false);
  return (
    <div className="py-1.5">
      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0 shrink-0 max-w-[65%] flex items-center gap-1.5">
          <span className="text-sm text-gray-500">{label}</span>
          {hint && (
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              aria-expanded={showHint}
              aria-label="What is this?"
              title={showHint ? "Hide description" : "What is this?"}
              className={`w-4 h-4 shrink-0 rounded-full border text-[10px] leading-none font-semibold flex items-center justify-center transition-colors ${
                showHint ? "border-teal-600 bg-teal-50 text-teal-700" : "border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600"
              }`}
            >
              ?
            </button>
          )}
        </div>
        <span className={`text-sm text-right break-all ${mono ? "font-mono" : ""} ${bold ? "font-semibold" : ""} ${color || "text-gray-800"}`}>
          {value ?? "—"}
        </span>
      </div>
      {hint && showHint && <p className="text-xs text-gray-400 mt-1 pr-8">{hint}</p>}
    </div>
  );
}

// One of the three headline numbers at the top of the Summary tab.
function KeyFigure({ label, value, note, color }) {
  return (
    <div className="px-4 first:pl-0 last:pr-0 border-l border-gray-100 first:border-l-0 min-w-0">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold truncate ${color || "text-gray-800"}`}>{value}</p>
      {note && <p className="text-xs text-gray-400 truncate">{note}</p>}
    </div>
  );
}

// ─── Gateway breakdown ───────────────────────────────────────────────────────
// Two different things are called "gateway fee" here, so they are shown side by side:
//   received  = the gateway fee the CUSTOMER paid us (payments.gatewayFee, set at booking time)
//   PayMongo  = what PayMongo itself kept, one fee per online charge (deposit, balance), read from the
//               payment's paymentEntries rows (transactionFee)
//   total     = all PayMongo fees added up
//   sale      = received − total: what is left of the gateway fee after PayMongo took its cut
//               (negative = the business absorbed the difference)
// Penalties paid online count too (p.penaltyGateway): the customer pays the same gateway % on top of the penalty, so
// that fee is part of "received", and what PayMongo kept on those charges is one more line in the box.
const PHASE_NAME = { deposit: "Deposit", balance: "Balance", penalty: "Penalties" };

const round2 = (n) => Math.round(n * 100) / 100;
const signed = (n, fmtFn) => (n < 0 ? `−${peso(Math.abs(n), fmtFn)}` : peso(n, fmtFn));

function buildGatewayBreakdown(p) {
  const pg = p.penaltyGateway || null;
  const bookingReceived = Number(p.gatewayFee) || 0;
  const penaltyReceived = pg ? Number(pg.received) || 0 : 0;
  const received = round2(bookingReceived + penaltyReceived);
  const tx = Array.isArray(p.paymongoTransactions) ? p.paymongoTransactions : [];
  const fees = [];
  ["deposit", "balance"].forEach((phase) => {
    // A charge paid IN STORE never goes through PayMongo, so PayMongo kept nothing: listed at ₱0.00 so it is
    // visible here (with its method and reference) instead of looking like a missing record.
    const inStoreTx = tx.find((x) => x.phase === phase && x.source === "in_person" && x.status === "Paid");
    if (inStoreTx) {
      fees.push({
        phase, inStore: true, amount: 0,
        channel: inStoreTx.channel || null,
        charged: inStoreTx.amount != null ? Number(inStoreTx.amount) : null,
        ref: inStoreTx.ref || null,
      });
      return;
    }
    const raw = p.paymongoFee ? p.paymongoFee[phase] : null;
    if (raw === null || raw === undefined) return;          // no fee recorded for this charge
    const t = tx.find((x) => x.phase === phase && x.source === "online") || {};
    const channelRaw = t.channel || p.paymongoChannel || "";
    fees.push({
      phase,
      amount: Number(raw) || 0,
      channel: CHANNEL_LABEL[String(channelRaw).toLowerCase()] || channelRaw || null,
      charged: t.amount != null ? Number(t.amount) : null,   // what that online charge was for
    });
  });
  // The total only counts PayMongo's real fees (in-store rows are ₱0 and must not make "no fee recorded" look like ₱0).
  const onlineFees = fees.filter((f) => !f.inStore);
  const storedTotal = p.paymongoFee ? p.paymongoFee.total : null;
  const bookingTotal = storedTotal !== null && storedTotal !== undefined
    ? Number(storedTotal) || 0
    : onlineFees.length ? round2(onlineFees.reduce((s, f) => s + f.amount, 0)) : null;

  // Penalties paid online: what PayMongo kept on them is its own line, and it is added to the total.
  // (null = PayMongo's fee wasn't recorded for them, so no line and nothing added.)
  const penaltyFee = pg && pg.paymongoFee !== null && pg.paymongoFee !== undefined ? Number(pg.paymongoFee) || 0 : null;
  if (penaltyFee !== null) {
    fees.push({ phase: "penalty", amount: penaltyFee, channel: null, charged: pg.charged != null ? Number(pg.charged) : null });
  }
  const total = penaltyFee === null ? bookingTotal : round2((bookingTotal || 0) + penaltyFee);

  return {
    received,
    bookingReceived,
    penaltyReceived,
    rate: Number(p.gatewayFeeRate) || 0,
    base: Number(p.gatewayFeeBase) || 0,
    fees,
    total,
    sale: total === null ? null : round2(received - total),
    show: received > 0 || total !== null || fees.length > 0,
  };
}

function GatewayBreakdown({ payment, fmt }) {
  const g = buildGatewayBreakdown(payment);
  if (!g.show) return null;
  const saleColor = g.sale === null ? "" : g.sale >= 0 ? "text-green-600" : "text-red-500";
  return (
    <Section title="Gateway Breakdown">
      {/* What the customer paid us for the gateway (green: money in). */}
      <Row
        label="Gateway received"
        hint={[
          g.rate > 0 ? `${g.rate}% of ${peso(g.base, fmt)}, paid by the customer` : "Gateway fee the customer paid",
          g.penaltyReceived > 0 ? `includes ${peso(g.penaltyReceived, fmt)} paid on penalties` : null,
        ].filter(Boolean).join(" · ")}
        value={peso(g.received, fmt)}
        bold
        color="text-green-600"
      />

      {/* What PayMongo kept, grouped in one box: one line per payment, then the total (reddish: money out). */}
      {(g.fees.length > 0 || g.total !== null) && (
        <div className="my-2 rounded-xl border border-red-100 bg-red-50/40 px-4 py-1.5">
          {g.fees.map((f, i) => (
            <Row
              key={f.phase}
              label={`Payment ${i + 1} · ${PHASE_NAME[f.phase]}${f.inStore ? " (in store)" : ""}`}
              hint={f.inStore
                ? ["Paid in store, so PayMongo charged no fee", f.channel, f.charged != null ? `received ${peso(f.charged, fmt)}` : null, f.ref ? `ref ${f.ref}` : null].filter(Boolean).join(" · ")
                : ([f.channel, f.charged != null ? `charged ${peso(f.charged, fmt)}` : null].filter(Boolean).join(" · ") || null)}
              value={peso(f.amount, fmt)}
              color={f.inStore ? "text-gray-400" : "text-red-400"}
            />
          ))}
          {g.total !== null && (
            <div className={g.fees.length > 0 ? "border-t border-red-100 mt-1 pt-1" : ""}>
              <Row label="Gateway total" hint="All PayMongo fees added up" value={peso(g.total, fmt)} bold color="text-red-600" />
            </div>
          )}
        </div>
      )}

      {/* Outside the box: what is left of the gateway fee after PayMongo's cut (green; red if PayMongo cost more). */}
      {g.total !== null ? (
        <Row label="Gateway sale" hint="Gateway received minus gateway total" value={signed(g.sale, fmt)} bold color={saleColor} />
      ) : (
        <p className="text-xs text-gray-400 pt-2">
          PayMongo's own fee isn't recorded for this payment (cash payment, or paid before fee tracking started).
        </p>
      )}

      {/* PayMongo keeps its fee on a charge that is refunded. Its own line, NOT part of the gateway total or sale above
          (those stay "charges only"). Shown only once a refund / return row has recorded a share of the fee. */}
      {Number(payment?.paymongoFee?.keptOnRefunds) > 0 && (
        <Row
          label="PayMongo fee kept on refunds"
          hint="Fee PayMongo kept on charges that were refunded or returned"
          value={peso(Number(payment.paymongoFee.keptOnRefunds), fmt)}
          color="text-red-400"
        />
      )}
    </Section>
  );
}

// ─── Penalty breakdown ───────────────────────────────────────────────────────
//   charged     = confirmed penalties only (waived / voided ones were never owed)
//   paid        = what has been paid toward them (deposit offset, in store or online)
//   outstanding = charged − paid
//   waived      = forgiven penalties, shown for the record; separate from "Discount Given" on purpose, because a
//                 waived penalty never touched this payment's balance (a discount does)
function penaltyState(p) {
  if (p.status === "UnderReview") return { label: "Under review", color: "text-amber-600" };
  if (p.status === "Waived") return { label: "Waived", color: "text-amber-600" };
  if (p.status === "Voided") return { label: "Voided", color: "text-gray-400" };
  if (p.status === "Discarded") return { label: "Discarded", color: "text-gray-400" };
  if (p.paidAmount >= p.amount && p.amount > 0) return { label: "Paid", color: "text-green-600" };
  if (p.paidAmount > 0) return { label: "Partially paid", color: "text-orange-500" };
  return { label: "Unpaid", color: "text-red-500" };
}

function PenaltyBreakdown({ penalties, payment, fmt, onNotePenalty = null, onViewPenalty = null }) {
  const list = Array.isArray(penalties) ? penalties : [];
  const hasDeposit = Number(payment?.securityDeposit) > 0;
  const live = list.filter((p) => p.status === "Confirmed");
  const charged = round2(live.reduce((n, p) => n + p.amount, 0));
  const paid = round2(live.reduce((n, p) => n + Math.min(p.paidAmount, p.amount), 0));
  const outstanding = round2(Math.max(0, charged - paid));
  const waived = round2(list.filter((p) => p.status === "Waived").reduce((n, p) => n + p.amount, 0));
  const voided = round2(list.filter((p) => p.status === "Voided").reduce((n, p) => n + p.amount, 0));
  const discarded = round2(list.filter((p) => p.status === "Discarded").reduce((n, p) => n + p.amount, 0));
  return (
    <Section title="Penalty Breakdown">
      {list.length === 0 && <p className="text-xs text-gray-400 py-1.5">No penalties have been charged on this booking.</p>}
      {list.map((p, i) => {
        const st = penaltyState(p);
        const gone = p.status !== "Confirmed";
        return (
          <Row
            key={p.penaltyID}
            label={<>
              <span className="text-gray-400 mr-1.5">{i + 1}</span>{p.description} · <span className={st.color}>{st.label}</span>
              {onViewPenalty && p.penaltyID && (
                <button type="button" onClick={() => onViewPenalty(p.penaltyID)}
                  className="ml-2 text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap">
                  View →
                </button>
              )}
            </>}
            hint={gone
              ? p.status === "UnderReview"
                ? `Noted ${fmtDate(p.createdAt)} — waiting for a supervisor's review on the Penalties page. The customer hasn't been notified. Not counted as owed yet.`
                : `${p.status} on ${fmtDate(p.createdAt)}${p.statusReason ? ` — ${p.statusReason}` : ""}. Not counted as owed.`
              : `Charged ${fmtDate(p.createdAt)}${p.paidAmount > 0 ? ` · ${peso(Math.min(p.paidAmount, p.amount), fmt)} paid so far` : ""}`}
            value={peso(p.amount, fmt)}
            color={gone ? "text-gray-400 line-through" : undefined}
          />
        );
      })}
      <div className="border-t border-gray-100 mt-2 pt-2">
        <Row label="Total charged" hint="Confirmed penalties only. Waived and voided ones are not included." value={peso(charged, fmt)} bold />
        <Row label="Paid" hint="Covered by the held deposit, paid in store, or paid online." value={peso(paid, fmt)} />
        <Row label="Outstanding" hint="Total charged minus paid: what the customer still owes for penalties." value={peso(outstanding, fmt)} bold color={outstanding > 0 ? "text-red-500" : "text-green-600"} />
        <Row
          label="Penalties waived"
          hint="Forgiven by staff. Shown for the record; it does not change the booking's balance or discount."
          value={waived > 0 ? `−${peso(waived, fmt)}` : peso(0, fmt)}
          color={waived > 0 ? "text-amber-600" : "text-gray-400"}
        />
        {voided > 0 && <Row label="Penalties voided" hint="Removed as a mistake. Not counted as owed." value={`−${peso(voided, fmt)}`} color="text-gray-400" />}
        {discarded > 0 && <Row label="Penalties discarded" hint="Rejected in review before being charged. The customer was never told. Not counted as owed." value={`−${peso(discarded, fmt)}`} color="text-gray-400" />}
        {hasDeposit && (
          <>
            <Row
              label="Deposit settled"
              hint="Part of the security deposit used to pay penalties when the booking was settled."
              value={peso(Number(payment.depositSettled) || 0, fmt)}
              bold={Number(payment.depositSettled) > 0}
              color={Number(payment.depositSettled) > 0 ? undefined : "text-gray-400"}
            />
            {(Number(payment.depositReturned) > 0 || payment.depositStatus === "Settled") && (
              <Row label="Deposit returned" hint="What was left of the deposit and went back to the customer." value={peso(Number(payment.depositReturned) || 0, fmt)} />
            )}
          </>
        )}
      </div>
      {onNotePenalty && (
        <button onClick={onNotePenalty}
          className="mt-3 w-full py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50">
          + Note penalty
        </button>
      )}
    </Section>
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