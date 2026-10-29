import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";

// ─── SVG ICONS ─────────────────────────────────────────────────────────────

const IconCheck = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconRefresh = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconClock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
const IconHourglass = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 4h10M7 20h10M8 4v3a4 4 0 0 0 1.6 3.2L12 12l2.4-1.8A4 4 0 0 0 16 7V4M8 20v-3a4 4 0 0 1 1.6-3.2L12 12l2.4 1.8A4 4 0 0 1 16 17v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconAlertCircle = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

// Clickable summary card, same look as the Payments page's. Click to filter by that type; click again to clear.
function StatCard({ icon, value, label, sub, color, onClick, active, hint }) {
  const bgColors = {
    teal:   "bg-teal-50 text-teal-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
    blue:   "bg-blue-50 text-blue-600",
    red:    "bg-red-50 text-red-500",
    green:  "bg-green-50 text-green-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      title={active ? "Click to clear this filter" : (hint || `Show only ${label}`)}
      className={`bg-white rounded-2xl shadow-soft p-4 flex items-center gap-4 text-left w-full transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-arl-light ${active ? "ring-2 ring-arl-light" : ""}`}
    >
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${bgColors[color] || "bg-gray-100 text-gray-600"}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-arl-dark">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {sub && <div className="text-[11px] text-orange-600 font-semibold">{sub}</div>}
      </div>
    </button>
  );
}

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
// "Approved" is stored as-is, but it is a WAITING state, not a finished one: the booking is
// cancelled and PayMongo has been asked to refund, yet the money isn't back until PayMongo
// confirms (and staff hand back any in-person part). So the screen shows what it is waiting on:
//   paymongo → a refund part hasn't been confirmed by PayMongo yet
//   handback → every online part is done, only the in-person cash is left for staff to hand back
const WAIT_STAGE = {
  paymongo: { label: "Waiting for PayMongo",  dot: "bg-blue-500",   bg: "bg-blue-50 border border-blue-200",     tip: "Approved — waiting for PayMongo to confirm the refund." },
  handback: { label: "Waiting for hand-back", dot: "bg-orange-500", bg: "bg-orange-50 border border-orange-200", tip: "Approved — the online part is done; the in-person amount still has to be handed back." },
  scheduled: { label: "Scheduled",           dot: "bg-violet-500", bg: "bg-violet-50 border border-violet-200", tip: "Approved — the payment was made today, so PayMongo can't send a partial refund yet. It is sent automatically after midnight." },
};
// Scheduled send (same-day payment): the cron tries once; if PayMongo refuses, staff use "Retry now".
// The last error is on the part's payment-entry row, which arrives here as parts[].error.
const scheduleLastError = (r) => { const p = r && Array.isArray(r.parts) ? r.parts.find((x) => x && x.error) : null; return p ? p.error : null; };
// Approved, but the PayMongo refund has not been created yet: it is waiting for its send time (same-day payment).
const isScheduled = (r) => !!(r && r.status === "Approved" && r.sendAfter && !r.scheduledSentAt
  && Array.isArray(r.parts) && r.parts.some((x) => !x.paymongoRefundID && x.status !== "succeeded"));
const stageOf = (r) => {
  if (!r || r.status !== "Approved") return null;
  if (isScheduled(r)) return "scheduled";
  const parts = Array.isArray(r.parts) ? r.parts : [];
  // No parts + a pending in-person amount + nothing sent to PayMongo (e.g. QR Ph, which PayMongo can't refund) = hand-back only.
  // Only an older request with neither parts nor a manual amount is assumed to be waiting on PayMongo.
  const handbackOnly = parts.length === 0 && !!r.manualRefund && !(Number(r.onlineAmount) > 0) && !r.paymongoRefundID;
  const onlinePending = handbackOnly ? false : (parts.length === 0 || parts.some((x) => x.status !== "succeeded"));
  const handbackPending = !!(r.manualRefund && !r.manualRefund.issued);
  if (onlinePending) return "paymongo";
  return handbackPending ? "handback" : "paymongo";
};
// A scheduled (same-day) refund whose automatic send failed and is past its send time: staff can still pay the unsent part
// back in store instead of pressing "Retry now". Returns the amount of the unsent online part(s), 0 when it does not apply.
const scheduledStuckDue = (r) => (isScheduled(r) && scheduleLastError(r) && new Date(r.sendAfter?.toDate ? r.sendAfter.toDate() : r.sendAfter).getTime() <= Date.now()
  ? r.parts.filter((x) => !x.paymongoRefundID && x.status !== "succeeded").reduce((s, x) => s + (Number(x.amount) || 0), 0)
  : 0);
const handbackDue = (r) => (r && r.status === "Approved" && r.manualRefund && !r.manualRefund.issued ? Number(r.manualRefund.amount) || 0 : 0);
// A Failed request: PayMongo refused part of it. That part is still owed to the customer, and staff pay it back themselves.
const failedDue = (r) => (r && r.status === "Failed" && Array.isArray(r.parts)
  ? r.parts.filter((x) => x.status === "failed").reduce((s, x) => s + (Number(x.amount) || 0), 0)
  : 0);

// A staff discount on the same payment is money going back to the customer too, and it waits on PayMongo like this
// refund does. While it is still processing (or failed) the server refuses to approve, so the button says why.
const DISCOUNT_WAIT = {
  processing:        { label: "Discount refund waiting for PayMongo", cls: "text-blue-700" },
  failed:            { label: "Discount refund failed — retry it on Payments", cls: "text-red-600 font-semibold" },
  awaiting_handback: { label: "Discount to hand back in store", cls: "text-orange-600" },
  refunded:          { label: "Discount refunded", cls: "text-green-700" },
};
const discountBlocksApproval = (r) => !!(r && r.discount && r.discount.refund && ["processing", "failed"].includes(r.discount.refund.state));

function StatusBadge({ status, stage }) {
  const w   = stage ? WAIT_STAGE[stage] : null;
  const dot = w ? w.dot : (statusDot[status] || "bg-gray-400");
  const bg  = w ? w.bg  : (statusBg[status]  || "bg-gray-50 border border-gray-200");
  return (
    <span title={w ? w.tip : undefined} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-black ${bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {w ? w.label : status}
    </span>
  );
}


// How long an approved refund has been waiting (since it was approved). Lets stuck ones stand out.
const waitStartMs = (r) => {
  const d = r.processedAt || r.updatedAt;
  const t = d && d.toDate ? d.toDate() : d ? new Date(d) : null;
  return t && !isNaN(t) ? t.getTime() : 0;
};
const fmtWaiting = (r) => {
  const t = waitStartMs(r);
  if (!t) return null;
  const hours = Math.max(0, (Date.now() - t) / 3600000);
  return { text: hours < 48 ? `${Math.max(1, Math.floor(hours))}h` : `${Math.floor(hours / 24)}d`, late: hours >= 72 };
};

// One table for every refund. The cards at the top and the status dropdown are the same filter (see statusKeyOf below).
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

// One table, one status filter (the cards and the dropdown both set it). Statuses, split by WHO has to act:
//   pending     a customer asked; staff must approve or reject
//   scheduled / paymongo / handback   money is on its way back (a same-day send waiting for its time, PayMongo confirming,
//               or cash to hand back). Refund requests AND discount refunds both live here: both wait on PayMongo.
//   failed      something failed and needs a person
//   refunded / rejected   finished
const DISCOUNT_STATES = { processing: "paymongo", awaiting_handback: "handback", failed: "failed", refunded: "done" };
// "Discount" rows and "deposit return" rows are both money that went (or is going) back through PayMongo and carry a
// `refund` object, so every place that handles `isDiscount` handles both. isDeposit tells them apart for wording and actions.
const isDeposit  = (r) => !!r && r.kind === "deposit";
const isDiscount = (r) => !!r && (r.kind === "discount" || r.kind === "deposit");
// A discount whose credit went back as its OWN payout (a ledger discount) is retried / handed back through the deposit-return
// routes, which act on whichever payout of the booking failed (the deposit's, the discount's, or both).
const viaDepositRoutes = (r) => isDeposit(r) || !!(r && r.ledger);
// The one status an item is in. This is what the cards, the dropdown, the default order and the sub-counts all read.
const statusKeyOf = (r) => {
  if (isDiscount(r)) {
    const k = DISCOUNT_STATES[r.refund.state] || "paymongo";
    if (k === "paymongo" && r.refund.sendAfter) return "scheduled";   // same-day payment: waiting for its send time, not for PayMongo yet
    return k === "done" ? "refunded" : k;
  }
  if (r.status === "Pending") return "pending";
  if (r.status === "Failed") return "failed";      // a Failed request needs manual follow-up
  if (r.status === "Approved") return stageOf(r);
  return String(r.status || "").toLowerCase();     // Refunded, Rejected
};
// "Under process" = the three in-flight statuses (a Failed one has its own card).
const IN_PROCESS = ["scheduled", "paymongo", "handback"];
const STATUS_OPTIONS = [
  { key: "pending",   label: "Request pending" },
  { key: "inprocess", label: "Under process (all)" },
  { key: "scheduled", label: "Scheduled" },
  { key: "paymongo",  label: "Waiting for PayMongo" },
  { key: "handback",  label: "Waiting for hand-back" },
  { key: "failed",    label: "Failed" },
  { key: "refunded",  label: "Refunded" },
  { key: "rejected",  label: "Rejected" },
];
const statusMatches = (filter, r) => {
  if (filter === "All") return true;
  const k = statusKeyOf(r);
  return filter === "inprocess" ? IN_PROCESS.includes(k) : k === filter;
};
// When a scheduled refund will be sent (the next Manila midnight after approval), as a date; null when it isn't scheduled.
const sendDateText = (r) => {
  if (statusKeyOf(r) !== "scheduled") return null;
  const d = toDate(isDiscount(r) ? r.refund.sendAfter : r.sendAfter);
  return d ? d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }) : null;
};
// Default order: what needs a person first (pending, then failed), then in-flight, then finished.
const priorityOf = (r) => {
  const k = statusKeyOf(r);
  return k === "pending" ? 0 : k === "failed" ? 1 : IN_PROCESS.includes(k) ? 2 : 3;
};
// A discount refund shaped like a request row, so the table, search, sort and filters treat both the same way.
const toDiscountItem = (d) => ({ ...d, kind: "discount", refundRequestID: `discount_${d.paymentID}`, amount: d.refund.amount, createdAt: d.discountAt, updatedAt: d.refund.at, status: d.refund.state });

// A security-deposit return sent through PayMongo, shaped the same way.
const toDepositItem = (d) => ({ ...d, kind: "deposit", refundRequestID: `deposit_${d.paymentID}`, amount: d.refund.amount, discountAmount: 0, updatedAt: d.refund.at, status: d.refund.state });

// A discount that sent money back, as a row. Same columns and the same stages as a refund request, so the two read alike.
const DISCOUNT_BADGE = {
  processing:        { label: "Waiting for PayMongo",  dot: "bg-blue-500",   bg: "bg-blue-50 border border-blue-200" },
  awaiting_handback: { label: "Waiting for hand-back", dot: "bg-orange-500", bg: "bg-orange-50 border border-orange-200" },
  failed:            { label: "Refund failed",         dot: "bg-red-500",    bg: "bg-red-50 border border-red-200" },
  refunded:          { label: "Refunded",              dot: "bg-green-500",  bg: "bg-green-50 border border-green-200" },
  scheduled:         { label: "Scheduled",             dot: "bg-violet-500", bg: "bg-violet-50 border border-violet-200" },
};
const DiscountBadge = ({ state, scheduled }) => {
  const b = (scheduled ? DISCOUNT_BADGE.scheduled : DISCOUNT_BADGE[state]) || DISCOUNT_BADGE.processing;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-black ${b.bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${b.dot}`} />{b.label}
    </span>
  );
};

// ── what the table and the View modal both read ──
const updatedOf = (r) => (isDiscount(r) ? toDate(r.refund.at) : updatedDate(r));
// 48-hour policy outcome. Pending: the live preview. Otherwise: what was saved when the request was made.
const policyOf = (r) => {
  const pv = r.status === "Pending" ? r.planPreview : null;
  const tier = pv ? pv.tier : (r.policyTier || (typeof r.returnDeposit === "boolean" ? (r.returnDeposit ? "full" : "late") : null));
  return { tier, kept: pv ? Number(pv.forfeit) || 0 : Number(r.depositForfeited) || 0, gw: pv ? Number(pv.gatewayFeeKept) || 0 : Number(r.gatewayFeeKept) || 0, hours: pv ? pv.hoursBeforePickup : null };
};
// The type is read from what is kept, the same way the backend does it (refundKindOf):
//   deposit kept                  -> No deposit refund  (asked under 48h before pickup, or after it: the gateway fee goes back)
//   gateway fee kept              -> Normal refund      (asked 48h+ before pickup, or inside the 2-hour grace: the deposit goes back)
//   nothing kept                  -> Full refund        (only staff give this, when the cancellation is the business's own issue)
const TYPE_STYLE = {
  no_deposit: { label: "No deposit refund", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  normal:     { label: "Normal refund",     cls: "bg-blue-100 text-blue-700 border-blue-200" },
  full:       { label: "Full refund",       cls: "bg-green-100 text-green-700 border-green-200" },
};
function TypeBadge({ r }) {
  if (isDeposit(r)) return <span className="inline-block rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">Deposit return</span>;
  if (isDiscount(r)) return <span className="inline-block rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">Discount</span>;
  const { tier, kept, gw } = policyOf(r);
  if (!tier) return <span className="inline-block rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-600">{r.source === "staff" ? "Staff cancel" : "Refund"}</span>;
  const t = TYPE_STYLE[kept > 0 ? "no_deposit" : gw > 0 ? "normal" : "full"];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${t.cls}`}>{t.label}</span>;
}

// HOW the money went (or is going) back: through PayMongo, handed over in store, or both. Its own column, separate from
// Type (which says what KIND of refund it is). A request nobody has approved yet has no route, so it shows "—".
const viaOf = (r) => {
  if (isDiscount(r)) return r.refund.via === "in_store" ? "in_store" : r.refund.via === "paymongo" ? "paymongo" : null;
  const online = (r.parts || []).length > 0;
  const store  = !!(r.manualRefund && Number(r.manualRefund.amount) > 0);
  return online && store ? "both" : online ? "paymongo" : store ? "in_store" : null;
};
const VIA_STYLE = {
  paymongo: { label: "PayMongo",            cls: "border-blue-200 bg-blue-50 text-blue-700" },
  in_store: { label: "In store",            cls: "border-gray-200 bg-gray-50 text-gray-600" },
  both:     { label: "PayMongo + in store", cls: "border-indigo-200 bg-indigo-50 text-indigo-700" },
};
const ViaBadge = ({ r }) => {
  const v = VIA_STYLE[viaOf(r)];
  return v ? <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${v.cls}`}>{v.label}</span> : <span className="text-gray-300">—</span>;
};

// HOW THE CUSTOMER PAID (the backend sends r.paidWith = { deposit, balance } for requests still being worked on).
// QR Ph is highlighted: PayMongo's refund API refuses it, so it can only be handed back in person.
const PAID_WITH_LABEL = { gcash: "GCash", maya: "Maya", qrph: "QR Ph", cash: "Cash", bank_transfer: "Bank transfer" };
const paidWithList = (r) => {
  const pw = r && r.paidWith;
  if (!pw) return [];
  return [...new Set([pw.deposit, pw.balance].filter(Boolean))];
};
const paidWithLabel = (code) => PAID_WITH_LABEL[code] || String(code);
const PaidWithBadge = ({ r }) => {
  const list = paidWithList(r);
  if (!list.length) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((c) => (
        <span key={c} className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${c === "qrph" ? "border-orange-200 bg-orange-50 text-orange-700" : "border-gray-200 bg-gray-50 text-gray-600"}`}>{paidWithLabel(c)}</span>
      ))}
    </span>
  );
};
const QRPH_NOTE = "QR Ph can't be refunded through PayMongo. Approving moves this to Under Process: hand the money back in person, then record the hand-back.";

// "Oct 17, 2026 | 3:45 PM" — date and time in one cell, split by a pipe.
const stampText = (d) => { const p = stampParts(d); return p ? `${p.date} | ${p.time}` : "—"; };
const Stamp = ({ date }) => {
  const p = stampParts(date);
  if (!p) return <span className="text-gray-300">—</span>;
  return (
    <span className="whitespace-nowrap text-sm">
      <span className="text-gray-700">{p.date}</span>
      <span className="mx-1.5 text-gray-300">|</span>
      <span className="text-gray-500">{p.time}</span>
    </span>
  );
};

// View modal building blocks: the same card + label-over-value cells as Bookings' details window (InfoSection / InfoField).
// A Block is a two-column grid; a <Line wide> takes the full row, and notes (<p>) and buttons placed directly in a Block span it too.
const Line = ({ label, wide, children }) => (
  <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
    <div className="text-sm font-medium text-gray-800 mt-0.5 break-words">{children || "—"}</div>
  </div>
);
const Block = ({ title, children }) => (
  <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
    </div>
    <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4 [&>p]:col-span-2 [&>button]:col-span-2 [&>button]:justify-self-start">{children}</div>
  </section>
);

// Who last acted on a request (approved, rejected, handed back), by name. The backend sends updatedByName / updatedByRole.
// A request nobody has touched yet (Pending) and discount / deposit rows have none; a decided request with no staff on it was done by the system.
const updatedByText = (r) => {
  if (!r || isDiscount(r) || r.status === "Pending") return null;
  if (r.updatedByName) return r.updatedByName;
  return r.processedBy ? "Staff · name not recorded" : "System";
};
// The Cancellation section of the Bookings details window, for a refund request: who cancelled, when, why, and what the money does.
const stripStaffPrefix = (t) => String(t || "").replace(/^Cancelled by (staff|admin):\s*/i, "").trim();
function CancellationBlock({ r, fmt }) {
  const pending  = r.status === "Pending";
  const rejected = r.status === "Rejected";
  const isStaff  = r.source === "staff";
  const pv = pending ? r.planPreview : null;
  const staffLabel = r.updatedByName ? `${r.updatedByName} · ${r.updatedByRole || "Staff"}` : (r.processedBy ? "Staff · name not recorded" : "System (auto-approved)");
  const cancelledBy = isStaff ? staffLabel : `${r.customerName || "Customer"} · Customer`;
  const cancelledAt = pending ? "Not cancelled yet — waiting for approval" : rejected ? "Not cancelled — request rejected" : stampText(toDate(r.processedAt) || updatedDate(r));
  const rawReason = r.customerReason !== undefined ? r.customerReason : r.reason;
  const reason = isStaff ? stripStaffPrefix(rawReason) : String(rawReason || "").trim();
  // Same wording as Bookings' "Refund Type"
  const { kept } = policyOf(r);
  const gw   = Number(pv ? pv.gatewayFeeKept : r.gatewayFeeKept) || 0;
  const paid = Number(pv ? (pv.bookingPaid ?? pv.grossPaid) : r.bookingPaid) || 0;
  const amt  = Number(pv ? pv.total : r.amount) || 0;
  const refundType = rejected ? "No refund"
    : kept > 0 ? `No Deposit Refund · ${fmt(kept)} deposit not returned`
    : gw > 0 ? `Normal refund · ${fmt(gw)} payment fee not returned`
    : paid > amt ? `Partial refund · ${fmt(paid - amt)} not returned`
    : paid > 0 ? "Full refund" : null;
  const stage = stageOf(r);
  const refundText = pending ? "Awaiting approval"
    : rejected ? "No refund — request rejected"
    : r.status === "Approved" ? ((stage && WAIT_STAGE[stage]?.label) || "Approved")
    : r.status === "Failed" ? "Failed — needs follow-up"
    : "Refunded";
  return (
    <Block title="Cancellation Details">
      <Line label="Requested">{stampText(toDate(r.createdAt))}</Line>
      <Line label={pending || rejected ? "Requested By" : "Cancelled By"}>{cancelledBy}</Line>
      <Line label="Cancelled At">{cancelledAt}</Line>
      {!isStaff && !pending && <Line label={rejected ? "Rejected By" : "Approved By"}>{staffLabel}</Line>}
      <Line wide label="Reason">{reason}</Line>
      {r.notes && <Line wide label="Notes">{r.notes}</Line>}
      {rejected && r.rejectReason && <Line wide label="Rejected because"><span className="text-red-600">{r.rejectReason}</span></Line>}
      {refundType && <Line wide label="Refund Type">{refundType}</Line>}
      <Line wide label="Refund Status">{refundText}</Line>
    </Block>
  );
}

// The money of a refund as a table (same look as the table lists on the other pages): what the customer paid and what is kept
// while the request is still Pending, then every PayMongo refund and the in-person hand-back with its status and reference.
function MoneyTable({ r, pv, fmt }) {
  const rows = [];
  if (pv) {
    rows.push({ item: "Customer paid", amount: fmt(pv.bookingPaid ?? pv.grossPaid) });
    if (pv.forfeit > 0) rows.push({ item: "Deposit kept", amount: `−${fmt(pv.forfeit)}`, amountCls: "text-amber-700" });
    if (pv.gatewayFeeKept > 0) rows.push({ item: "Gateway fee kept", amount: `−${fmt(pv.gatewayFeeKept)}`, amountCls: "text-amber-700" });
    rows.push({ item: "Via PayMongo", amount: fmt(pv.onlineAmount), status: pv.scheduled && pv.sendAfter ? `Scheduled — ${stampText(toDate(pv.sendAfter))}` : "Sent when approved", statusCls: pv.scheduled ? "text-violet-700" : "text-gray-500" });
    if (pv.manualAmount > 0) rows.push({ item: "Hand back in person", amount: fmt(pv.manualAmount), amountCls: "text-orange-600", status: "To hand back", statusCls: "text-orange-600 font-semibold" });
    if (pv.unrefundableAmount > 0) rows.push({ item: "Not refundable", amount: fmt(pv.unrefundableAmount), amountCls: "text-red-600", status: "Payment ID does not exist", statusCls: "text-red-600" });
  }
  (Array.isArray(r.parts) ? r.parts : []).forEach((pt) => {
    const sent = !pt.paymongoRefundID && r.sendAfter && !r.scheduledSentAt;
    rows.push({
      item: pt.kind === "balance" ? "Balance" : "Deposit",
      amount: fmt(pt.amount),
      status: pt.handedBack ? "Handed back" : pt.status === "succeeded" ? "Refunded" : pt.status === "failed" ? "Failed" : sent ? `Scheduled — ${stampText(toDate(r.sendAfter))}` : "Processing at PayMongo",
      statusCls: pt.status === "succeeded" || pt.handedBack ? "text-green-600" : pt.status === "failed" ? "text-red-600" : sent ? "text-violet-700" : "text-blue-600",
      note: pt.status === "failed" && pt.error ? pt.error : pt.handedBack ? "PayMongo could not refund this part, so it was paid back by hand." : null,
      noteCls: pt.status === "failed" ? "text-red-600" : "text-gray-400",
      ref: pt.handedBack ? [pt.handedBack.method, pt.handedBack.referenceNumber].filter(Boolean).join(" · ") : pt.paymongoRefundID,
    });
  });
  if (r.manualRefund) {
    const m = r.manualRefund;
    rows.push({
      item: "In person", amount: fmt(m.amount),
      status: m.issued ? "Handed back" : "Not yet handed back",
      statusCls: m.issued ? "text-green-600" : "text-orange-600 font-semibold",
      ref: m.issued ? [m.method, m.referenceNumber].filter(Boolean).join(" · ") : null,
    });
  }
  if (!pv && Number(r.unrefundableAmount) > 0) rows.push({ item: "Not refunded", amount: fmt(r.unrefundableAmount), amountCls: "text-red-600", status: "Payment ID does not exist", statusCls: "text-red-600" });
  if (!rows.length) return null;
  return (
    <div className="col-span-2 overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2.5 text-left">Item</th>
            <th className="px-4 py-2.5 text-left">Amount</th>
            <th className="px-4 py-2.5 text-left">Status</th>
            <th className="px-4 py-2.5 text-left">Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{row.item}</td>
              <td className={`px-4 py-2.5 font-semibold whitespace-nowrap ${row.amountCls || "text-gray-800"}`}>{row.amount}</td>
              <td className="px-4 py-2.5">
                {row.status ? <span className={row.statusCls || "text-gray-600"}>{row.status}</span> : <span className="text-gray-300">—</span>}
                {row.note && <span className={`block text-[11px] ${row.noteCls || "text-gray-400"}`}>{row.note}</span>}
              </td>
              <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500 break-all">{row.ref || <span className="text-gray-300">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Everything about one refund / discount refund. The table stays simple; the detail, the money movements and the
// actions (approve, reject, hand back, retry) all live here.
function RefundViewModal({ r, fmt, navigate, onClose, onApprove, onReject, onHandback, handbackMethod, setHandbackMethod, handbackRef, setHandbackRef, busy, onRetry, retrying, onRetryScheduled, onSync, syncing }) {
  const { effectiveRole } = useAuth();
  const canDepositReturn = ["Owner", "Admin", "Supervisor"].includes(effectiveRole);   // deposit retry / hand-back: Supervisor / Admin / Owner
  const disc = isDiscount(r);
  const pv = !disc && r.status === "Pending" ? r.planPreview : null;
  const { tier, kept, hours } = disc ? {} : policyOf(r);
  const w = (disc ? r.refund.state !== "refunded" : r.status === "Approved") ? fmtWaiting(r) : null;
  const due = disc ? 0 : handbackDue(r);
  const stuckOwed = disc ? 0 : scheduledStuckDue(r);   // scheduled send failed: hand-back is offered next to "Retry now"
  const failedOwed = disc ? 0 : (failedDue(r) || stuckOwed);
  const blocked = !disc && discountBlocksApproval(r);
  // Failed discount / deposit refunds get the same hand-back form and button as a failed refund request.
  const discHandback = disc && viaDepositRoutes(r) && r.refund.state === "failed" && canDepositReturn;
  const showHandback = (!disc && (failedOwed > 0 || due > 0)) || discHandback;
  const handbackAmt  = disc ? r.refund.amount : (failedOwed > 0 ? failedOwed : due);
  const handbackFailed = disc ? true : failedOwed > 0;
  const when = hours !== null && hours !== undefined ? `${Math.max(0, Math.round(hours * 10) / 10)} hours before pickup` : null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-6 pt-5 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-bold text-lg text-gray-800">{isDeposit(r) ? "Deposit Return Details" : disc ? "Discount Refund Details" : "Refund Details"}</h2>
              {disc ? <DiscountBadge state={r.refund.state} scheduled={statusKeyOf(r) === "scheduled"} /> : <StatusBadge status={r.status} stage={stageOf(r)} />}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><IconX className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-gray-500 mt-1 truncate">{r.customerName || "—"}</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3">
          <Block title="Booking Details">
            <Line label="Booking ID">{r.bookingID || "—"}</Line>
            <Line label="Customer">{r.customerName || "—"}</Line>
            {r.bookingID && (
              <button onClick={() => navigate(`/bookings?search=${encodeURIComponent(r.bookingID)}`)}
                title="Open this booking in Bookings"
                className="px-3 py-1.5 rounded-xl border text-xs font-semibold text-teal-700 hover:bg-teal-50">
                View Booking →
              </button>
            )}
          </Block>

          {!disc && <CancellationBlock r={r} fmt={fmt} />}

          <Block title="Refund Details">
            <Line label="Type"><TypeBadge r={r} /></Line>
            <Line label="Amount"><span className="font-semibold">{fmt(pv ? pv.total : disc ? r.refund.amount : r.amount)}</span></Line>
            {disc && <Line label="Date">{stampText(toDate(r.createdAt))}</Line>}
            <Line label="Updated">{stampText(updatedOf(r))}</Line>
            {updatedByText(r) && <Line label="Updated by">{updatedByText(r)}</Line>}
            {w && <Line label="Waiting"><span className={w.late ? "font-semibold text-amber-600" : ""}>{w.text}{w.late ? " — worth checking" : ""}</span></Line>}

            {disc ? (
              <>
                <Line wide label={isDeposit(r) ? "Reason" : "Discount reason"}>{isDeposit(r) ? "Security deposit returned after the trip" : (r.ledger ? "Discount credit returned after the trip" : (r.discountReason || "Staff discount"))}</Line>
                {!isDeposit(r) && <Line label="Discount given">{fmt(r.discountAmount)}</Line>}
                <Line wide label={isDeposit(r) ? "Returned to customer" : "Sent back to customer"}>{fmt(r.refund.amount)} {r.refund.via === "in_store" ? "in store" : "via PayMongo"}</Line>
                {r.refund.referenceNumber && r.refund.via === "paymongo" && <Line label="PayMongo ref"><span className="font-mono text-xs">{r.refund.referenceNumber}</span></Line>}
                {r.refund.state === "failed" && <p className="text-xs text-red-600">PayMongo could not complete this refund, so the customer has not received it.{r.refund.errorNote ? ` (${r.refund.errorNote})` : ""}</p>}
                {r.refund.state === "processing" && r.refund.sendAfter && <p className="text-xs text-violet-700">The payment was made today, so PayMongo can't send a partial refund yet. It is scheduled and will be sent automatically on {new Date(r.refund.sendAfter).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" })}. If it can't be sent, it moves to Failed and can be retried or handed back in store.</p>}
                {r.refund.state === "processing" && !r.refund.sendAfter && <p className="text-xs text-blue-700">PayMongo is processing this refund. It can take up to 24 hours.</p>}
                {viaDepositRoutes(r) && r.refund.state === "failed" && <p className="text-xs text-gray-500">{isDeposit(r) ? "The deposit is" : "The trip is"} already settled. Retry the PayMongo refund, or hand the money back in store and record it here. Check your PayMongo payout balance if it keeps failing.</p>}
                {r.refund.state === "awaiting_handback" && <p className="text-xs text-orange-700">Paid in store, so it can't go through PayMongo. Return it in store, then record it on the payment.</p>}
              </>
            ) : (
              <>
                {when && <Line label="Timing">{when}</Line>}
                {(tier || kept > 0) && (
                  <Line wide label="Deposit">
                    {kept > 0
                      ? <span className="font-semibold text-amber-700">{fmt(kept)} kept (48-hour policy)</span>
                      : <span className="text-green-700 font-semibold">Not kept{r.forfeitWaived ? " — forfeit waived" : ""}</span>}
                  </Line>
                )}
                {r.forfeitWaived && r.forfeitWaivedReason && <Line wide label="Waived because">{r.forfeitWaivedReason}</Line>}

                {paidWithList(r).length > 0 && <Line label="Paid with"><PaidWithBadge r={r} /></Line>}
                {((pv && Number(pv.qrphAmount) > 0) || (r.status === "Approved" && paidWithList(r).includes("qrph"))) && (
                  <p className="text-[11px] text-orange-700">{QRPH_NOTE}</p>
                )}
                {pv && Number(pv.heldCredit) > 0 && (
                  <p className="text-[11px] text-gray-500">Includes {fmt(pv.heldCredit)} of discount credit the customer had already paid. It goes back with this refund; nothing is deducted for the discount.</p>
                )}
                {pv && pv.scheduled && pv.sendAfter && (
                  <p className="text-[11px] text-violet-700">The payment was made today, so PayMongo can't send a partial refund yet. If you approve now, the booking is cancelled and the money is sent automatically on {stampText(toDate(pv.sendAfter))}.</p>
                )}
                <MoneyTable r={r} pv={pv} fmt={fmt} />
                {pv && pv.total !== r.amount && <p className="text-[11px] text-gray-400">Was {fmt(r.amount)} when requested.</p>}

                {isScheduled(r) && (
                  <>
                    <Line label="Sends after">{stampText(toDate(r.sendAfter))}</Line>
                    {scheduleLastError(r) && <Line wide label="Last error"><span className="text-red-600">{scheduleLastError(r)}</span></Line>}
                    <p className="text-[11px] text-gray-500">
                      {scheduleLastError(r)
                        ? "The automatic send failed and will not be retried by itself. Fix the cause (for example the PayMongo balance), then press Retry now, or hand the money back in store."
                        : "PayMongo can't partially refund a payment on the day it was made. It is sent automatically by the nightly job; the customer has already been told the date."}
                    </p>
                  </>
                )}

                {r.discount && DISCOUNT_WAIT[r.discount.refund.state] && (
                  <>
                    <Line label="Discount given">{fmt(r.discount.amount)}</Line>
                    <Line label="Discount refund">
                      <button type="button" onClick={() => navigate(`/payments?paymentID=${encodeURIComponent(r.paymentID)}`)} className={`hover:underline ${DISCOUNT_WAIT[r.discount.refund.state].cls}`}>
                        {DISCOUNT_WAIT[r.discount.refund.state].label}
                      </button>
                    </Line>
                  </>
                )}
              </>
            )}

            {r.paymentID && (
              <button onClick={() => navigate(`/payments?paymentID=${encodeURIComponent(r.paymentID)}`)}
                title="Open this payment — receipts, slips and every money movement are there"
                className="px-3 py-1.5 rounded-xl border text-xs font-semibold text-teal-700 hover:bg-teal-50">
                View in Payments →
              </button>
            )}
          </Block>
        </div>

        {/* Hand-back form: pinned with the buttons below, so it never scrolls out of view. */}
        {showHandback && (
          <div className="shrink-0 border-t border-orange-100 bg-orange-50/60 px-6 py-3">
            <p className="text-xs font-semibold text-orange-800">
              {disc ? `Refund failed — ${fmt(handbackAmt)}` : failedOwed > 0 ? `Pay back the failed part — ${fmt(failedOwed)}` : `Hand back in person — ${fmt(due)}`}
            </p>
            <p className="text-[11px] text-gray-500 mb-2">
              {disc
                ? "PayMongo could not complete this refund, so the customer has not received it. Retry it, or hand the money back in store and record it here."
                : stuckOwed > 0
                ? "The scheduled refund could not be sent, so the customer has not received it. Press Retry now, or give it to them yourself and record it here: it will then not be sent again."
                : failedOwed > 0
                ? "PayMongo could not refund this, so the customer has not received it. Give it to them yourself, then record it here. A retry would not help."
                : "Give this to the customer, then record it here."} The reference number is optional.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-500">Method
                <select value={handbackMethod || "Cash"} onChange={(e) => setHandbackMethod(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800">
                  <option>Cash</option><option>GCash</option>{handbackFailed && <option>Maya</option>}<option>Bank Transfer</option>
                </select>
              </label>
              <label className="text-xs text-gray-500 flex-1 min-w-[140px]">Reference no. <span className="text-gray-400">(optional)</span>
                <input type="text" value={handbackRef || ""} onChange={(e) => setHandbackRef(e.target.value)} maxLength={100} placeholder="e.g. GCash ref"
                  className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800 font-mono" />
              </label>
            </div>
          </div>
        )}

        <div className="shrink-0 border-t border-gray-100 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50">Close</button>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {!disc && r.status === "Pending" && (
              <>
                <button onClick={onApprove} disabled={busy || blocked}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
                  <IconCheck /> {busy ? "…" : "Approve"}
                </button>
                <button onClick={onReject} disabled={busy}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50">
                  <IconX /> Reject
                </button>
                {blocked && <span className="text-xs text-blue-700 max-w-[260px]">Approving is on hold until the discount refund is confirmed by PayMongo (or retried on Payments).</span>}
              </>
            )}
            {!disc && r.status === "Approved" && stageOf(r) === "paymongo" && <span className="text-xs text-gray-400 italic">Waiting for PayMongo…</span>}
            {/* If PayMongo already finished but this never updated (missed webhook), ask PayMongo directly. */}
            {((!disc && r.status === "Approved" && stageOf(r) === "paymongo") || (disc && r.refund?.state === "processing")) && r.bookingID && (
              <button onClick={onSync} disabled={busy || syncing} title="Ask PayMongo whether this refund already went through"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50">
                {syncing ? "Checking…" : "Check with PayMongo"}
              </button>
            )}
            {!disc && isScheduled(r) && (
              <>
                <span className="text-xs text-violet-700 italic">Scheduled for {stampText(toDate(r.sendAfter))}</span>
                {scheduleLastError(r) && new Date(toDate(r.sendAfter)).getTime() <= Date.now() && (
                  <button onClick={onRetryScheduled} disabled={busy}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50">
                    {busy ? "…" : "Retry now"}
                  </button>
                )}
              </>
            )}
            {!disc && r.status === "Failed" && <span className="text-xs text-red-500 italic">{failedOwed > 0 ? "Needs manual follow-up — record the hand-back" : "Needs manual follow-up"}</span>}
            {showHandback && (
              <button onClick={onHandback} disabled={busy || retrying} title="Confirm you handed this amount back to the customer"
                className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50">
                <IconCheck /> {busy ? "..." : `Handed back ${fmt(handbackAmt)}`}
              </button>
            )}
            {disc && r.refund.state === "failed" && (!viaDepositRoutes(r) || canDepositReturn) && (
              <button onClick={onRetry} disabled={retrying} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                {retrying ? "…" : `Retry ${fmt(r.refund.amount)} refund`}
              </button>
            )}
            {disc && r.refund.state === "awaiting_handback" && (
              <button onClick={() => navigate(`/payments?paymentID=${encodeURIComponent(r.paymentID)}`)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600">
                Record hand-back →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <th className={`px-4 py-3 text-left select-none ${className}`}>
      <button
        onClick={() => onSort(key)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
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

// Local "YYYY-MM-DD" of a date value — what the Requested / Updated date picker is compared against.
const dayKeyOf = (val) => {
  const d = toDate(val);
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null;
};
// The note shown in the Reason column (same wording), so it can be searched.
const reasonTextOf = (r) => isDeposit(r) ? "Security deposit return"
  : isDiscount(r) ? (r.ledger ? "Discount credit returned after the trip" : (r.discountReason || "Staff discount"))
  : ((r.customerReason !== undefined ? r.customerReason : r.reason) || "");
// "Search by" options — mirror the table's columns. Status (and the Type buttons) have their own controls.
// Booking ID, Payment ID, Request ID and Reason have no column (Reason is in the View window) but stay searchable.
const REFUND_SEARCH_BY = [
  { key: "requested", label: "Requested",  type: "date" },
  { key: "updated",   label: "Updated",    type: "date" },
  { key: "updatedBy", label: "Updated by", type: "text" },
  { key: "customer",  label: "Customer",   type: "text" },
  { key: "bookingID", label: "Booking ID", type: "text" },
  { key: "paymentID", label: "Payment ID", type: "text" },
  { key: "requestID", label: "Request ID", type: "text" },
  { key: "reason",    label: "Reason",     type: "text" },
];

export default function RefundRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [depositReturns, setDepositReturns] = useState([]);   // security deposits sent back through PayMongo
  const [discounts, setDiscounts] = useState([]);           // discount refunds (money a staff discount sent back)
  const [retryingId, setRetryingId] = useState(null);
  const [syncingId, setSyncingId] = useState(null);
  const [viewId, setViewId]   = useState(null);   // refundRequestID of the item open in the View modal
  const [statusF, setStatusF]   = useState("All");
  const [search, setSearch]     = useState("");
  const [searchBy, setSearchBy] = useState("customer");
  const [dateValue, setDateValue] = useState("");   // "YYYY-MM-DD" from the date picker
  const [toast, setToast]       = useState(null);
  const [busyId, setBusyId]     = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // request being rejected
  const [rejectReason, setRejectReason] = useState("");
  // Approving a request that carries a 48-hour deposit forfeit opens a confirmation
  // (with an optional, reason-required "waive the forfeit" override).
  const [approveTarget, setApproveTarget] = useState(null);
  const [waiveForfeit, setWaiveForfeit]   = useState(false);
  const [waiveReason, setWaiveReason]     = useState("");
  // Which method staff picked when handing the in-person part of a refund back, per request id.
  // Method staff pick when they hand the in-person part of a refund back, per request id (default Cash).
  const [handbackMethod, setHandbackMethod] = useState({});
  // Optional reference number staff type when recording an in-person hand-back, per request id.
  const [handbackRef, setHandbackRef] = useState({});
  const [sortKey, setSortKey] = useState(null); // null = default/unsorted (API order: newest request first)
  const [sortDir, setSortDir] = useState("asc");
  const items = useMemo(
    () => [...requests, ...discounts.map(toDiscountItem), ...depositReturns.map(toDepositItem)],
    [requests, discounts, depositReturns]
  );
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "customer" ? "asc" : "desc");   // dates and amounts: newest / biggest first
    }
  };

  const token = localStorage.getItem("token");
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Linked in with ?search=<refundRequestID | paymentID | bookingID> (e.g. Payments' "View refund request"): fills the
  // search bar (and clears the status filter so the request is not hidden by it), then strips the param. It waits for the
  // list to load.
  useEffect(() => {
    const q = searchParams.get("search");
    if (!q) return;
    const hit = items.find((r) => r.refundRequestID === q || r.paymentID === q || r.bookingID === q);
    setSearchBy(hit ? (hit.refundRequestID === q ? "requestID" : hit.paymentID === q ? "paymentID" : "bookingID") : "bookingID");
    setSearch(q);
    if (hit) setStatusF("All");
    else if (loading) return;
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete("search"); return n; }, { replace: true });
  }, [searchParams, items, loading, setSearchParams]);

  const searchByKey = REFUND_SEARCH_BY.some((o) => o.key === searchBy) ? searchBy : "customer";
  const searchOpt = REFUND_SEARCH_BY.find((o) => o.key === searchByKey);

  // Clicking a card filters by that status; clicking the active card clears it.
  const toggleStatus = (key) => setStatusF((cur) => (cur === key ? "All" : key));

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === "error" ? 7000 : 3500);
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
      // Discount refunds ride along; if this part fails the requests still show.
      try {
        const dres = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests/discount-refunds`, { headers: { Authorization: `Bearer ${token}` } });
        const ddata = await dres.json();
        setDiscounts(dres.ok ? (ddata.data || []) : []);
      } catch { setDiscounts([]); }
      // Deposit returns sent through PayMongo ride along the same way.
      try {
        const rres = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests/deposit-returns`, { headers: { Authorization: `Bearer ${token}` } });
        const rdata = await rres.json();
        setDepositReturns(rres.ok ? (rdata.data || []) : []);
      } catch { setDepositReturns([]); }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // A request with a deposit forfeit, or one that will be SCHEDULED for the next day (same-day payment), asks for
  // confirmation first; anything else approves straight away.
  const startApprove = (r) => {
    if (r.planPreview && (r.planPreview.forfeit > 0 || r.planPreview.scheduled)) {
      setApproveTarget(r); setWaiveForfeit(false); setWaiveReason("");
    } else {
      approve(r.refundRequestID);
    }
  };

  const approve = async (id, opts = {}) => {
    setBusyId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(opts.waiveForfeit ? { waiveForfeit: true, waiveReason: opts.waiveReason } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to approve refund.");
      showToast(data.message || "Refund approved and sent to PayMongo.");
      // Approval can now change the amount (recomputed from what the customer has
      // actually paid), split it into PayMongo refunds + a manual part, and cancel the
      // booking — so take the server's version of the request rather than guessing.
      setRequests((prev) => prev.map((r) => r.refundRequestID === id ? { ...r, ...(data.data || {}), status: "Approved", planPreview: undefined } : r));
      setViewId(null);
    } catch (e) { showToast(e.message, "error"); fetchRequests(); }
    finally { setBusyId(null); setApproveTarget(null); }
  };

  // A scheduled (same-day) refund whose automatic send failed: send it again now. The server refuses it before the
  // send time and reports PayMongo's own error, which is shown in the toast and stays in the "Scheduled send" block.
  const retryScheduled = async (r) => {
    const id = r.refundRequestID;
    setBusyId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests/${id}/retry-scheduled`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not send the refund.");
      showToast(data.message || "Refund sent to PayMongo.");
      setViewId(null);
      fetchRequests();
    } catch (e) { showToast(e.message, "error"); fetchRequests(); }
    finally { setBusyId(null); }
  };

  // Staff confirm they physically handed the in-person part back. The backend finishes the
  // request (→ Refunded) once every PayMongo part has also succeeded.
  const markHandedBack = async (r) => {
    const id = r.refundRequestID;
    setBusyId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests/${id}/manual-issued`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ method: handbackMethod[id] || "Cash", referenceNumber: (handbackRef[id] || "").trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to mark the refund as handed back.");
      showToast(data.message || "Marked as handed back.");
      setViewId(null);
      fetchRequests(); // status may have moved to Refunded (history) — take the server's version
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  };

  // PayMongo refused part of a refund request: staff paid that part back themselves and record it. The backend moves the
  // request to Refunded (History) once nothing else is outstanding.
  const markFailedHandedBack = async (r) => {
    const id = r.refundRequestID;
    setBusyId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests/${id}/failed-handback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ method: handbackMethod[id] || "Cash", referenceNumber: (handbackRef[id] || "").trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to record the hand-back.");
      showToast(data.message || "Marked as handed back.");
      setViewId(null);
      fetchRequests();
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  };

  // "Check with PayMongo": the refund may already be done at PayMongo while this screen still says "Waiting for PayMongo"
  // (the confirmation never reached us). The server asks PayMongo for the final result and applies it.
  const syncWithPaymongo = async (r) => {
    setSyncingId(r.refundRequestID);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/refund-requests/booking/${encodeURIComponent(r.bookingID)}/sync-paymongo`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message || "Could not check with PayMongo.");
      showToast(data.message || "Checked with PayMongo.");
      setViewId(null);
      fetchRequests();
    } catch (e) { showToast(e.message, "error"); fetchRequests(); }
    finally { setSyncingId(null); }
  };

  // A discount's PayMongo refund failed: send it again (the failed attempt stays on record).
  const retryDiscount = async (r) => {
    setRetryingId(r.refundRequestID);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/booking/${encodeURIComponent(r.bookingID)}/discount-refund/retry`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not retry the refund.");
      showToast("Refund sent to PayMongo again.");
      setViewId(null);
      fetchRequests();
    } catch (e) { showToast(e.message, "error"); }
    finally { setRetryingId(null); }
  };

  // A deposit return PayMongo refused: send it again (the failed attempt stays on record).
  const retryDeposit = async (r) => {
    setRetryingId(r.refundRequestID);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${encodeURIComponent(r.bookingID)}/deposit-return/retry`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message || "Could not retry the deposit return.");
      showToast("Deposit return sent to PayMongo again.");
      setViewId(null);
      fetchRequests();
    } catch (e) { showToast(e.message, "error"); fetchRequests(); }
    finally { setRetryingId(null); }
  };

  // The online return failed: staff handed the deposit back in store and record it.
  const handBackDeposit = async (r) => {
    const id = r.refundRequestID;
    setBusyId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${encodeURIComponent(r.bookingID)}/deposit-return/handback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ method: handbackMethod[id] || "Cash", referenceNumber: (handbackRef[id] || "").trim() || null }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message || "Could not record the hand-back.");
      showToast("Deposit hand-back recorded.");
      setViewId(null);
      fetchRequests();
    } catch (e) { showToast(e.message, "error"); fetchRequests(); }
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
      setRejectTarget(null); setRejectReason(""); setViewId(null);
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  };

  const filtered = items.filter((r) => {
    const q = search.trim().toLowerCase();
    let matchQ = true;
    if (searchOpt.type === "date") {
      if (dateValue) matchQ = dayKeyOf(searchByKey === "updated" ? updatedOf(r) : toDate(r.createdAt)) === dateValue;
    } else if (q) {
      const hay = {
        customer:  r.customerName,
        bookingID: r.bookingID,
        paymentID: r.paymentID,
        requestID: r.refundRequestID,
        reason:    reasonTextOf(r),
        updatedBy: updatedByText(r),
      }[searchByKey];
      matchQ = String(hay || "").toLowerCase().includes(q);
    }
    return matchQ && statusMatches(statusF, r);
  });

  // Numbered pagination (same shared component as Bookings/Payments). The hook
  // clamps the page if approving/rejecting shrinks the list underneath us.
  // Sort after search/status filtering, before pagination, so Page 1 is the
  // top of whatever sort is active.
  const ms = (d) => { const t = toMillis(d); return Number.isFinite(t) ? t : 0; };   // a pending row has no Updated date
  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) {
      // Default: pending first, then Failed, then in-flight, then finished; newest first inside each group.
      // (A pending request is dated by when it was requested, everything else by its last update.)
      const pa = priorityOf(a), pb = priorityOf(b);
      if (pa !== pb) return pa - pb;
      const when = (r) => (statusKeyOf(r) === "pending" ? ms(toDate(r.createdAt)) : (ms(updatedOf(r)) || waitStartMs(r)));
      return when(b) - when(a);
    }
    if (sortKey === "customer") {
      const c = (a.customerName || "").localeCompare(b.customerName || "", undefined, { sensitivity: "base" });
      return sortDir === "asc" ? c : -c;
    }
    let av, bv;
    if (sortKey === "amount")         { av = Number(a.amount) || 0;             bv = Number(b.amount) || 0; }
    else if (sortKey === "requested") { av = ms(toDate(a.createdAt));           bv = ms(toDate(b.createdAt)); }
    else if (sortKey === "updated")   { av = ms(updatedOf(a));                  bv = ms(updatedOf(b)); }
    else return 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(sorted, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, searchBy, dateValue, statusF, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps


  const countOf = (pred) => items.filter((r) => pred(statusKeyOf(r))).length;
  const pendingCount   = countOf((k) => k === "pending");
  const inProcessCount = countOf((k) => IN_PROCESS.includes(k));
  const failedCount    = countOf((k) => k === "failed");
  const refundedCount  = countOf((k) => k === "refunded");
  const filtersActive  = !!search.trim() || !!dateValue || statusF !== "All";

  return (
    <div className="w-full px-4 space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] max-w-md px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      {/* View: everything about one refund. Approve / reject / hand back / retry happen here. The approve and reject
          dialogs below open on top of it. */}
      {(() => {
        const v = viewId && items.find((x) => x.refundRequestID === viewId);
        if (!v) return null;
        return (
          <RefundViewModal
            r={v} fmt={fmt} navigate={navigate} onClose={() => setViewId(null)}
            onApprove={() => startApprove(v)}
            onReject={() => { setRejectTarget(v); setRejectReason(""); }}
            onHandback={() => (viaDepositRoutes(v) ? handBackDeposit(v) : v.status === "Failed" || scheduledStuckDue(v) > 0 ? markFailedHandedBack(v) : markHandedBack(v))}
            handbackMethod={handbackMethod[v.refundRequestID]}
            setHandbackMethod={(m) => setHandbackMethod((x) => ({ ...x, [v.refundRequestID]: m }))}
            handbackRef={handbackRef[v.refundRequestID]}
            setHandbackRef={(m) => setHandbackRef((x) => ({ ...x, [v.refundRequestID]: m }))}
            busy={busyId === v.refundRequestID}
            onRetry={() => (viaDepositRoutes(v) ? retryDeposit(v) : retryDiscount(v))} retrying={retryingId === v.refundRequestID}
            onRetryScheduled={() => retryScheduled(v)}
            onSync={() => syncWithPaymongo(v)} syncing={syncingId === v.refundRequestID}
          />
        );
      })()}

      {/* Approve confirmation: shows the 48-hour policy outcome + the staff override */}
      {approveTarget && approveTarget.planPreview && (() => {
        const pv = approveTarget.planPreview;
        const hasForfeit = Number(pv.forfeit) > 0;
        const willSchedule = !!(pv.scheduled && pv.sendAfter);
        const when = pv.tier === "no_show" ? "after the pickup time" : pv.hoursBeforePickup !== null && pv.hoursBeforePickup !== undefined ? `${Math.max(0, Math.round(pv.hoursBeforePickup * 10) / 10)} hours before pickup` : "under 48 hours before pickup";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setApproveTarget(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-arl-dark">Approve Refund</h3>
                <button onClick={() => setApproveTarget(null)} className="text-gray-400 hover:text-gray-600"><IconX /></button>
              </div>
              <p className="text-sm text-gray-500">{approveTarget.customerName}</p>
              {willSchedule && !waiveForfeit && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm space-y-1">
                  <p className="text-violet-800 font-semibold">This payment was made today</p>
                  <p className="text-xs text-violet-800">
                    PayMongo can't send a partial refund on the same day as the payment. If you confirm, the booking is cancelled now
                    and the refund is scheduled: it will be sent automatically after midnight, on {stampText(toDate(pv.sendAfter))}.
                  </p>
                </div>
              )}
              {willSchedule && waiveForfeit && (
                <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                  With the forfeit waived the full amount is refunded, which PayMongo can accept on the same day, so it may be sent right away instead of being scheduled.
                </p>
              )}
              <div className={`rounded-xl border p-3 text-sm space-y-1 ${hasForfeit ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                {hasForfeit && <p className="text-amber-800 font-semibold">Requested {when}</p>}
                <div className="flex justify-between"><span className="text-gray-600">Customer paid</span><span className="font-semibold">{fmt(pv.grossPaid)}</span></div>
                {hasForfeit && <div className="flex justify-between text-amber-700"><span>Deposit kept (48-hour policy)</span><span className="font-semibold">-{fmt(waiveForfeit ? 0 : pv.forfeit)}</span></div>}
                {Number(pv.gatewayFeeKept) > 0 && <div className="flex justify-between text-amber-700"><span>Gateway fee kept (deposit returned)</span><span className="font-semibold">-{fmt(waiveForfeit ? 0 : pv.gatewayFeeKept)}</span></div>}
                <div className="flex justify-between border-t border-black/10 pt-1"><span className="font-bold text-gray-800">Refund</span><span className="font-black">{fmt(waiveForfeit ? pv.grossPaid : pv.total)}</span></div>
              </div>
              {Number(pv.qrphAmount) > 0 && (
                <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
                  {QRPH_NOTE} The customer is notified that our staff will hand it back in person.
                </p>
              )}
              {hasForfeit && <p className="text-[11px] text-gray-400">The timing is judged by when the customer sent the request, not by when you approve it.</p>}
              {hasForfeit && <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={waiveForfeit} onChange={(e) => setWaiveForfeit(e.target.checked)} />
                <span>Waive the deposit forfeit and refund the full {fmt(pv.grossPaid)} <span className="text-gray-400">(goodwill, duplicate charge, etc.)</span></span>
              </label>}
              {hasForfeit && waiveForfeit && (
                <textarea
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                  placeholder="Reason for waiving (required, saved in the audit log)"
                  rows={2}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-dark/20"
                />
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setApproveTarget(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button
                  onClick={() => approve(approveTarget.refundRequestID, { waiveForfeit, waiveReason })}
                  disabled={busyId === approveTarget.refundRequestID || (waiveForfeit && !waiveReason.trim())}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  {busyId === approveTarget.refundRequestID ? "Approving..." : (willSchedule && !waiveForfeit ? "Confirm & Schedule" : "Confirm Approve")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
          <h1 className="text-xl font-bold text-arl-dark flex items-center gap-2">Refunds</h1>
          <p className="text-sm text-gray-500">
            {pendingCount > 0 ? `${pendingCount} request${pendingCount > 1 ? "s" : ""} to review` : "No requests to review"}
            {inProcessCount > 0 && <> · {inProcessCount} under process</>}
            {failedCount > 0 && <> · <span className="font-semibold text-red-600">{failedCount} failed</span></>}
          </p>
        </div>
      </div>

      {/* Status cards, same look as Payments / Penalties. Click one to filter the table to it (click the active one again to
          clear). They set the same filter as the status dropdown below. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<IconClock className="w-5 h-5" />} value={pendingCount} label="Request pending" color="yellow"
          hint="Customers asking for a refund. Approve or reject each one. (Deposit returns and discount refunds need no approval, so they never wait here.)"
          active={statusF === "pending"}
          onClick={() => toggleStatus("pending")}
        />
        <StatCard
          icon={<IconHourglass className="w-5 h-5" />} value={inProcessCount} label="Under process" color="blue"
          hint="Approved refunds, deposit returns and discount refunds whose money isn't back with the customer yet. PayMongo can take up to 24 hours."
          active={statusF === "inprocess"}
          onClick={() => toggleStatus("inprocess")}
        />
        <StatCard
          icon={<IconAlertCircle className="w-5 h-5" />} value={failedCount} label="Failed — needs you" color="red"
          hint="PayMongo refused part of the refund. A person has to follow up: retry it or hand the money back in store."
          active={statusF === "failed"}
          onClick={() => toggleStatus("failed")}
        />
        <StatCard
          icon={<IconCheck className="w-5 h-5" />} value={refundedCount} label="Refunded" color="green"
          hint="Finished: the money went back to the customer, online or in store."
          active={statusF === "refunded"}
          onClick={() => toggleStatus("refunded")}
        />
      </div>

      {/* Table card: the search + filters sit on top of the table, like Bookings */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="flex flex-wrap gap-3 items-end p-4 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search by</span>
            <select
              value={searchByKey}
              onChange={(e) => { setSearchBy(e.target.value); setSearch(""); setDateValue(""); }}
              className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white"
            >
              {REFUND_SEARCH_BY.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          {searchOpt.type === "date" ? (
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none"
            />
          ) : (
            <input
              type="text"
              placeholder={`Enter ${searchOpt.label.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none"
            />
          )}
          <select
            value={statusF}
            onChange={(e) => setStatusF(e.target.value)}
            className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white"
          >
            {[{ key: "All", label: "All statuses" }, ...STATUS_OPTIONS].map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button
            onClick={fetchRequests}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            <IconRefresh className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <table className="w-full text-sm">
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t first:border-t-0">
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : error ? (
            <div className="p-10 text-center text-sm text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              {filtersActive ? "Nothing matches these filters." : "No refunds yet."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  <SortableTh label="Requested" sortKey="requested" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Customer" sortKey="customer" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left">Booking</th>
                  <SortableTh label="Amount" sortKey="amount" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Paid with</th>
                  <th className="px-4 py-3 text-left">Via</th>
                  <SortableTh label="Updated" sortKey="updated" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="pl-4 pr-8 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((r) => {
                  const disc = isDiscount(r);
                  return (
                    <tr key={r.refundRequestID} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3"><Stamp date={toDate(r.createdAt)} /></td>
                      <td className="px-4 py-3"><p className="font-medium text-gray-800">{r.customerName || "—"}</p></td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{r.bookingID || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-arl-dark whitespace-nowrap">
                        {fmt(disc ? r.refund.amount : (r.planPreview ? r.planPreview.total : r.amount))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><TypeBadge r={r} /></td>
                      <td className="px-4 py-3"><PaidWithBadge r={r} /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><ViaBadge r={r} /></td>
                      <td className="px-4 py-3"><Stamp date={updatedOf(r)} /></td>
                      <td className="px-4 py-3">
                        {disc ? <DiscountBadge state={r.refund.state} scheduled={statusKeyOf(r) === "scheduled"} /> : <StatusBadge status={r.status} stage={stageOf(r)} />}
                        {sendDateText(r) && (
                          <p className={`mt-1 text-[11px] whitespace-nowrap ${!disc && scheduleLastError(r) ? "text-red-600 font-semibold" : "text-violet-700"}`}>
                            {!disc && scheduleLastError(r) ? "Send failed — open to retry" : `Sends ${sendDateText(r)}`}
                          </p>
                        )}
                      </td>
                      <td className="pl-4 pr-8 py-3 text-right">
                        <button onClick={() => setViewId(r.refundRequestID)}
                          className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>
    </div>
  );
}