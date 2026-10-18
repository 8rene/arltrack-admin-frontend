import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";
import PaymentEntriesPanel from "../components/shared/PaymentEntriesPanel";
import { useCurrency } from "../context/CurrencyContext";

const API_URL = process.env.REACT_APP_API_URL;
const PAGE_SIZE = 15;

// ─── PAGINATION (same pattern as Bookings.jsx / Payments.jsx / Maintenance.jsx) ───
function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
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

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconAlertCircle = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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
    <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconBan = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <line x1="5.5" y1="18.5" x2="18.5" y2="5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
const IconX = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const IconPlus = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const toDate = (val) => {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val?._seconds) return new Date(val._seconds * 1000);
  return new Date(val);
};
const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;

// ─── SORT HEADER — same clickable <th> as Bookings/Payments/Maintenance ───
const IconChevronsUpDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSortArrow = ({ dir, className = "w-3.5 h-3.5" }) => (
  <svg className={`${className} transition-transform ${dir === "desc" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

// Order used when sorting the Status column — most urgent first when ascending.
const SETTLEMENT_RANK = { "Under Review": -1, Pending: 0, "Partially Paid": 1, Paid: 2, Waived: 3, Voided: 4 };

// One predicate per stat card, shared by the card's count AND the row
// highlight/default sort, so the number on a card can never silently
// drift from what clicking it actually shows.
//
// "review" = penalties a driver noted that no supervisor has confirmed yet
// (status UnderReview): the customer hasn't been told about them and they
// don't count toward anything. "pending" only ever looks at Confirmed ones,
// so it already covers both "confirmed but the booking hasn't been settled
// yet" and "settled but the deposit didn't fully cover it" — settleBooking()
// sets paidAmount below amount whenever the deposit runs out partway through
// a penalty, so a single paidAmount < amount check catches both cases
// without needing to look at the payment's own deposit.settlement.status.
const STAT_FILTERS = {
  review:        { predicate: (p) => p.status === "UnderReview" },
  pending:       { predicate: (p) => p.status === "Confirmed" && (p.paidAmount || 0) < (p.amount || 0) },
  settled:       { predicate: (p) => p.status === "Confirmed" && (p.paidAmount || 0) >= (p.amount || 0) },
  voidedWaived:  { predicate: (p) => p.status === "Voided" || p.status === "Waived" },
};

// Badge for the computed `settlementStatus` field (Pending / Partially
// Paid / Paid / Voided / Waived) — same dot + pill look as Payments.jsx's
// StatusBadge. The raw lifecycle status (Confirmed/Voided/Waived) still
// drives which actions the View modal offers; it just isn't its own badge.
const SETTLEMENT_DOT = {
  "Under Review":   "bg-amber-400",
  Pending:          "bg-red-500",
  "Partially Paid": "bg-orange-400",
  Paid:             "bg-green-500",
  Voided:           "bg-gray-400",
  Waived:           "bg-purple-500",
};
const SETTLEMENT_BG = {
  "Under Review":   "bg-amber-50 border border-amber-200",
  Pending:          "bg-red-50 border border-red-200",
  "Partially Paid": "bg-orange-50 border border-orange-200",
  Paid:             "bg-green-50 border border-green-200",
  Voided:           "bg-gray-100 border border-gray-200",
  Waived:           "bg-purple-50 border border-purple-200",
};

function SettlementBadge({ status }) {
  const dot = SETTLEMENT_DOT[status] || "bg-gray-400";
  const bg  = SETTLEMENT_BG[status]  || "bg-gray-50 border border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-black whitespace-nowrap ${bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {status || "—"}
    </span>
  );
}

// Same card as Payments.jsx's StatCard (clickable filter shortcut).
function StatCard({ icon, value, label, color, onClick, active }) {
  const bgColors = { gray: "bg-gray-100 text-gray-600", amber: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-500", green: "bg-green-50 text-green-600", purple: "bg-purple-50 text-purple-600" };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      title={active ? "Click to clear this filter" : `Filter by ${label}`}
      className={`bg-white rounded-2xl shadow-soft p-4 flex items-center gap-4 text-left w-full transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-arl-light ${active ? "ring-2 ring-arl-light" : ""}`}
    >
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${bgColors[color] || "bg-gray-100 text-gray-600"}`}>{icon}</div>
      <div>
        <div className="text-xl font-bold text-arl-dark">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </button>
  );
}

// ─── LATE-FEE SUGGESTION ───────────────────────────────────────────────────
const fmtWhen = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

/**
 * Read-only "when was it due vs. when did it come back" panel shown above the
 * penalty fields (admin Penalties form and the driver's "Note a penalty"
 * form). `info` is the payload from GET /api/penalties/late-fee-preview/:id.
 *
 * It only SUGGESTS — nothing here fills in or adds a charge. Whoever is
 * noting the penalty types the amount themselves; this is just the system
 * remembering the end time and drop-off time so a late return isn't missed.
 */
function LateFeeSuggestion({ info, loading = false }) {
  if (!info) {
    return loading ? <p className="text-xs text-gray-400">Checking end time and drop-off…</p> : null;
  }

  const { scheduledEndAt, actualReturnAt, lateMinutes, billableHours, graceMinutes, ratePerHour, computedAmount } = info;

  let suggestion;
  let tone = "text-gray-600";
  if (!actualReturnAt) {
    suggestion = "Not dropped off yet — nothing to suggest.";
  } else if (billableHours > 0) {
    suggestion = `${billableHours} hour${billableHours === 1 ? "" : "s"} late: ${peso(computedAmount)}`;
    tone = "text-amber-700 font-semibold";
  } else if (lateMinutes > 0) {
    suggestion = `${lateMinutes} min past the end time, within the ${graceMinutes}-min grace — no late fee.`;
  } else {
    suggestion = "Returned on time — no late fee.";
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs space-y-1">
      <div className="flex justify-between gap-3">
        <span className="text-gray-400">Booking ends</span>
        <span className="text-gray-700">{fmtWhen(scheduledEndAt)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-gray-400">Dropped off</span>
        <span className="text-gray-700">{fmtWhen(actualReturnAt)}</span>
      </div>
      <div className="flex justify-between gap-3 pt-1 border-t border-gray-100">
        <span className="text-gray-400">Suggestion</span>
        <span className={`text-right ${tone}`}>{suggestion}</span>
      </div>
      {billableHours > 0 && (
        <p className="text-[11px] text-gray-400 text-right">
          {lateMinutes} min past the end time · {graceMinutes}-min grace · {peso(ratePerHour)}/hr
        </p>
      )}
    </div>
  );
}

// ─── DEPOSIT NOTICE ────────────────────────────────────────────────────────
// Tells staff how a penalty on this booking gets paid, from the `deposit` the late-fee preview returns:
//   deposit already returned (settled / refunded / forfeited / waived, or none held)
//       -> it can't be deducted; the customer will be asked to pay it online
//   deposit still held
//       -> it is deducted from the deposit when the deposit is settled (any part the deposit can't cover is paid online)
// `acknowledged` / `onAcknowledge` add a required "confirm the deduction" tick (the New Penalty form); without them
// it is information only (the confirm step on a penalty under review).
function DepositNotice({ deposit, amount = 0, acknowledged = false, onAcknowledge = null }) {
  if (!deposit) return null;
  const amt = Number(amount) || 0;

  if (deposit.returned) {
    const why = !deposit.exists
      ? "There is no security deposit held on this booking."
      : deposit.reason === "settled"
        ? "The security deposit was already settled and returned."
        : `The security deposit was ${String(deposit.status || "closed").toLowerCase()}.`;
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs space-y-0.5">
        <p className="font-semibold text-blue-800">Deposit already returned — pay online</p>
        <p className="text-blue-700">
          {why} This penalty can't be deducted from it, so the customer will be asked to pay{amt > 0 ? ` ${peso(amt)}` : " it"} online.
        </p>
      </div>
    );
  }

  const available = Number(deposit.availableForNew) || 0;
  const deducted = Math.min(amt, available);
  const online = Math.max(0, amt - deducted);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs space-y-1.5">
      <p className="font-semibold text-amber-800">Deposit not returned yet — deducted from it</p>
      <div className="space-y-0.5 text-amber-800">
        <div className="flex justify-between gap-3"><span>Deposit held</span><span>{peso(deposit.amount)}</span></div>
        {deposit.alreadyClaimed > 0 && (
          <div className="flex justify-between gap-3"><span>Already taken by other penalties</span><span>− {peso(deposit.alreadyClaimed)}</span></div>
        )}
        <div className="flex justify-between gap-3 font-semibold"><span>Left for this penalty</span><span>{peso(available)}</span></div>
      </div>
      {amt > 0 && (
        <p className="text-amber-700">
          {peso(deducted)} is deducted from the deposit right away and this penalty is marked Paid
          {online > 0 ? `; the other ${peso(online)} is more than the deposit has left, so the customer will be asked to pay that online.` : "."}
        </p>
      )}
      {onAcknowledge && deducted > 0 && (
        <label className="flex items-start gap-2 pt-1 cursor-pointer text-amber-900">
          <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} className="mt-0.5" />
          <span>I confirm {peso(deducted)} is deducted from the customer's deposit.</span>
        </label>
      )}
    </div>
  );
}

// ─── CREATE PENALTY MODAL ──────────────────────────────────────────────────
//
// Every charge is typed by hand as a line item. Above the fields, the
// booking's end time, its drop-off time and a suggestion ("3 hours late:
// ₱300") are shown for reference only — nothing is auto-filled, so staff
// decide what to charge and can't miss a late return.
//
// Submitting this confirms the penalty immediately and notifies the
// customer — there's no Draft step to review it first anymore, so double-
// check the amount before hitting Create.
function CreatePenaltyModal({ token, onClose, onCreated, initialBookingID = "" }) {
  const [bookingID, setBookingID] = useState(initialBookingID);
  // Opened via Bookings.jsx's "Note a Penalty" button (see goToNotePenalty
  // there) — the bookingID arrives pre-filled via ?bookingID= and is kept
  // locked so the penalty this creates is guaranteed to link back to the
  // exact booking staff came from, not whatever they might retype here.
  const linkedFromBooking = !!initialBookingID;
  const [lineItems, setLineItems] = useState([{ description: "", amount: "" }]);
  const [preview, setPreview] = useState(null); // end time / drop-off time / suggestion for this booking
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ackDeduction, setAckDeduction] = useState(false); // staff ticked "I confirm it's deducted from the deposit"

  const computedTotal = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  // What this penalty will be once created: the override if there is one, else the line-item total.
  const penaltyAmount = overrideAmount.trim() !== "" ? (Number(overrideAmount) || 0) : computedTotal;
  const depositInfo = preview?.deposit || null;
  // Only a deposit that is still held can be deducted from; that needs a tick before the penalty is created.
  const needsAck = !!depositInfo && !depositInfo.returned && Math.min(penaltyAmount, Number(depositInfo.availableForNew) || 0) > 0;

  const updateLineItem = (i, field, value) =>
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, [field]: value } : li)));
  const addLineItem = () => setLineItems((items) => [...items, { description: "", amount: "" }]);
  const removeLineItem = (i) => setLineItems((items) => items.filter((_, idx) => idx !== i));

  // Look the booking up as soon as there's an ID (right away when linked from
  // Booking Details, shortly after typing otherwise) — this is what feeds the
  // end time / drop-off / suggestion panel below. A failed lookup just hides it.
  useEffect(() => {
    const id = bookingID.trim();
    setAckDeduction(false);   // a different booking means a different deposit: the tick doesn't carry over
    if (!id) { setPreview(null); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/penalties/late-fee-preview/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) setPreview(res.ok ? json.data : null);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [bookingID, token]);

  const handleSubmit = async () => {
    setError("");
    if (!bookingID.trim()) { setError("Booking ID is required."); return; }
    const cleanItems = lineItems
      .map((li) => ({ description: li.description.trim(), amount: Number(li.amount) || 0 }))
      .filter((li) => li.description);
    if (cleanItems.length === 0) { setError("Add at least one line item with a description."); return; }
    if (cleanItems.some((li) => !(li.amount > 0))) { setError("Every charge needs an amount greater than ₱0."); return; }

    const computed = cleanItems.reduce((s, li) => s + li.amount, 0);
    const finalAmount = overrideAmount.trim() !== "" ? Number(overrideAmount) : computed;
    if (finalAmount !== computed && !overrideReason.trim()) {
      setError("A reason is required when the amount is adjusted from the computed total.");
      return;
    }
    if (needsAck && !ackDeduction) {
      setError("Confirm the deduction from the customer's deposit first.");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        bookingID: bookingID.trim(),
        lineItems: cleanItems,
        computedAmount: computed,
        amount: finalAmount,
        overrideReason: overrideReason.trim(),
      };
      const res = await fetch(`${API_URL}/api/penalties`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to create penalty.");
      onCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-arl-dark">New Penalty</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX /></button>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500">Booking ID</label>
          <div className="flex gap-2 mt-1">
            <input type="text" value={bookingID} onChange={(e) => setBookingID(e.target.value)}
              placeholder="e.g. BK123" readOnly={linkedFromBooking}
              className={`flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light ${
                linkedFromBooking ? "bg-gray-50 border-gray-200 text-gray-500" : "border-gray-200"
              }`} />
          </div>
          {linkedFromBooking && (
            <p className="text-xs text-teal-600 mt-1">Linked to the booking — this penalty will be tied to booking {bookingID}.</p>
          )}
          <div className="mt-2">
            <LateFeeSuggestion info={preview} loading={previewLoading} />
          </div>
          {depositInfo && (
            <div className="mt-2">
              <DepositNotice deposit={depositInfo} amount={penaltyAmount} acknowledged={ackDeduction} onAcknowledge={setAckDeduction} />
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500">Charges</label>
          <div className="space-y-2 mt-1">
            {lineItems.map((li, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input type="text" value={li.description} onChange={(e) => updateLineItem(i, "description", e.target.value)}
                  placeholder="Description (e.g. Missing floor mat)"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
                <input type="number" value={li.amount} onChange={(e) => updateLineItem(i, "amount", e.target.value)}
                  placeholder="₱0"
                  className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
                <button onClick={() => removeLineItem(i)} disabled={lineItems.length === 1}
                  className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300">
                  <IconX className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addLineItem} className="mt-2 text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1">
            <IconPlus className="w-3.5 h-3.5" /> Add line item
          </button>
        </div>

        <div className="flex items-baseline justify-between text-sm border-t border-gray-100 pt-3">
          <span className="text-gray-500">Computed total</span>
          <span className="font-semibold text-gray-700">{peso(computedTotal)}</span>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500">Override amount (optional)</label>
          <input type="number" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)}
            placeholder={String(computedTotal)}
            className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
        </div>

        {overrideAmount.trim() !== "" && Number(overrideAmount) !== computedTotal && (
          <div>
            <label className="text-xs font-semibold text-gray-500">Reason for override (required)</label>
            <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={2}
              className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-dark/20" />
          </div>
        )}

        {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {submitting ? "Creating…" : "Create & Notify Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VOID / WAIVE REASON MODAL ──────────────────────────────────────────────
function ReasonModal({ action, underReview = false, onClose, onSubmit, submitting }) {
  const [reason, setReason] = useState("");
  const label = action === "Waived" ? "Waive Penalty" : underReview ? "Discard Penalty" : "Void Penalty";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-arl-dark">{label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX /></button>
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder={action === "Waived"
            ? "Reason for waiving (shown to customer via notification)"
            : underReview
              ? "Why is this being discarded? The customer won't be notified — they never saw it."
              : "Reason for voiding (the customer will be notified it was removed)"}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-dark/20" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button onClick={() => onSubmit(reason)} disabled={submitting || !reason.trim()}
            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${
              action === "Waived" ? "bg-purple-600 hover:bg-purple-700" : "bg-red-500 hover:bg-red-600"
            }`}>
            {submitting ? "Saving…" : `Confirm ${action === "Waived" ? "Waive" : underReview ? "Discard" : "Void"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── IN-STORE PAYMENT MODAL ───────────────────────────────────────────────
//
// Penalties are meant to be paid ONLINE by the customer. This is the exception: the customer chose to
// pay at the store, and a Supervisor / Admin / Owner records it here (the server enforces that role too).
// A proper record is required: payment mode, the reference number (for anything but cash; cash may carry
// an official-receipt number), who received it and when.
//
// Wired to recordShortfallPayment(), which applies the amount across the customer's unpaid Confirmed
// penalties oldest-first -- not just this one row -- so a partial amount can end up settling an older
// penalty before this one if there's more than one outstanding.
const SHORTFALL_METHODS = [
  { value: "InStore",      label: "Cash" },
  { value: "GCash",        label: "GCash" },
  { value: "Maya",         label: "Maya" },
  { value: "BankTransfer", label: "Bank Transfer" },
];

function MarkPaidModal({ penalty, maxAmount = 0, onClose, onSubmit, submitting }) {
  const owed = Math.max(0, (penalty.amount || 0) - (penalty.paidAmount || 0));
  // The most that can be recorded: everything this customer still owes in
  // penalties (this one is paid first, the rest spills onto their others).
  // Typing is clamped to it and the button is disabled above it; the server
  // rejects anything higher too (recordShortfallPayment).
  const limit = Math.max(owed, maxAmount || 0);
  // Deliberately NOT pre-filled with the full owed amount: this form records what staff actually took, so
  // they always have to consciously enter or confirm the real amount. "Full amount" is a shortcut only.
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(SHORTFALL_METHODS[0].value);
  const [referenceNumber, setReferenceNumber] = useState("");
  const isCash = method === "InStore";
  const modeLabel = SHORTFALL_METHODS.find((m) => m.value === method)?.label || method;
  const receivedBy = (() => {
    try { const u = JSON.parse(localStorage.getItem("user")); return u?.name || u?.username || u?.email || "You"; } catch { return "You"; }
  })();
  const missingRef = !isCash && !referenceNumber.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-arl-dark">Record In-Store Payment</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX /></button>
        </div>
        <p className="text-xs text-gray-500">
          Penalties are normally paid online by the customer. Use this only because they chose to pay at the store.
        </p>
        <p className="text-xs text-gray-400">
          {penalty.customerName || "This customer"} still owes {peso(owed)} on this penalty.
          This penalty is paid first; anything extra goes to their other unpaid penalties, oldest first.
          {limit > owed && ` They owe ${peso(limit)} across all their penalties.`} You can't record more than what's owed.
        </p>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-500">Amount received</label>
            <button type="button" onClick={() => setAmount(String(owed))}
              className="text-[11px] font-semibold text-teal-600 hover:text-teal-700">
              Full amount ({peso(owed)})
            </button>
          </div>
          <input type="number" min={1} max={limit} step={1} value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") { setAmount(""); return; }
              const n = Number(v);
              if (Number.isNaN(n) || n < 0) return;          // no negatives
              setAmount(n > limit ? String(limit) : v);      // can't type past what's owed
            }}
            placeholder={String(owed)}
            className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
          <p className="text-[11px] text-gray-400 mt-1">Maximum {peso(limit)}.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Payment mode</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light">
            {SHORTFALL_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">
            {isCash ? "Official receipt no. (optional)" : "Reference number (required)"}
          </label>
          <input type="text" maxLength={64} value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder={isCash ? "Receipt number" : `${modeLabel} reference number`}
            className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
        </div>
        <div className="flex justify-between text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
          <span>Received by</span>
          <span className="font-semibold text-gray-700">{receivedBy}</span>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ amount: Number(amount), method, referenceNumber: referenceNumber.trim() })}
            disabled={submitting || !(Number(amount) > 0) || Number(amount) > limit || missingRef}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? "Recording…" : "Record Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PENALTY DETAILS MODAL ───────────────────────────────────────────────
//
// Opened from the table's "View" action — shows everything about one
// penalty (line items, computed vs. charged amount, late-fee math if it's
// a late fee, payment status, who did what and when) without leaving this
// page. "View Booking →" at the bottom is the only thing that still
// navigates away, and it's opt-in now instead of being the row's only
// action.
function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 text-right">{value}</span>
    </div>
  );
}

// ─── BOOKING SIDE PANEL ──────────────────────────────────────────────────
//
// Read-only summary of the penalty's booking, shown beside the penalty
// details so staff don't have to leave this page. There is no single-booking
// endpoint, so it reads the same list Bookings.jsx does (/api/bookings?status=all)
// and picks the booking out of it; the list is cached for 30s so toggling the
// panel on several penalties in a row doesn't re-download everything.
let bookingsCache = { at: 0, data: null };

const fmtBookingDate = (val) => {
  const d = toDate(val);
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : null;
};
const BOOKING_DOT = { "to pay": "bg-orange-400", upcoming: "bg-yellow-400", ongoing: "bg-blue-500", completed: "bg-green-500", cancelled: "bg-red-500", stolen: "bg-red-700" };
const BOOKING_BG  = { "to pay": "bg-orange-50 border border-orange-200", upcoming: "bg-yellow-50 border border-yellow-200", ongoing: "bg-blue-50 border border-blue-200", completed: "bg-green-50 border border-green-200", cancelled: "bg-red-50 border border-red-200", stolen: "bg-red-100 border border-red-300" };

function BookingSidePanel({ bookingID, token, fmt, onClose, onOpenFull }) {
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(""); setBooking(null);
      try {
        if (!bookingsCache.data || Date.now() - bookingsCache.at > 30000) {
          const res = await fetch(`${API_URL}/api/bookings?status=all`, { headers: { Authorization: `Bearer ${token}` } });
          const json = await res.json();
          if (!res.ok) throw new Error(json.message || "Failed to load booking.");
          bookingsCache = { at: Date.now(), data: json.data || [] };
        }
        const found = bookingsCache.data.find((b) => (b.bookingID || b.id) === bookingID || b.id === bookingID);
        if (cancelled) return;
        if (found) setBooking(found);
        else setError("Booking not found — it may have been archived or deleted.");
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load booking.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bookingID, token]);

  const b = booking;
  const st = (b?.status || "").toLowerCase();
  const deposit = !b ? null
    : b.paymentStatus === "Refunded" && b.securityDeposit > 0 ? `${fmt(b.securityDeposit)} · Refunded`
    : b.deposit ? (b.deposit.status === "Waived" ? "Waived" : `${fmt(b.deposit.amount)} · ${b.deposit.status || "Held"}`)
    : Number(b.securityDeposit) > 0 ? `${fmt(b.securityDeposit)} · Awaiting payment`
    : "Not collected";

  return (
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 md:max-h-[90vh] md:overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-arl-dark">Booking</h3>
          <p className="text-xs text-gray-400 font-mono">{bookingID}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Hide booking"><IconX /></button>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />)}
        </div>
      )}
      {!loading && error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

      {b && (
        <>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${BOOKING_BG[st] || "bg-gray-50 border border-gray-200"}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${BOOKING_DOT[st] || "bg-gray-400"}`} />
            {(b.status || "—").replace("_", " ")}
          </span>

          <div className="rounded-xl border border-gray-100 p-3 space-y-0.5">
            <DetailRow label="Customer" value={b.customerName} />
            <DetailRow label="Phone" value={b.phone} />
            <DetailRow label="Vehicle" value={b.vehicleName} />
            <DetailRow label="Service type" value={b.serviceTypeName} />
            <DetailRow label="Driving" value={b.modeOfDriving} />
            <DetailRow label="Location" value={b.location} />
          </div>

          <div className="rounded-xl border border-gray-100 p-3 space-y-0.5">
            <DetailRow label="Start" value={fmtBookingDate(b.startDateTime)} />
            <DetailRow label="End" value={fmtBookingDate(b.endDateTime)} />
            <DetailRow label="Duration" value={b.totalDays != null ? `${b.totalDays} day${b.totalDays > 1 ? "s" : ""}` : null} />
            <DetailRow label="Created" value={fmtBookingDate(b.createdAt)} />
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-0.5">
            <DetailRow label="Rental fee" value={fmt(b.rentalFee)} />
            <DetailRow label="Service fee" value={fmt(b.serviceFee)} />
            {Number(b.gatewayFee) > 0 && <DetailRow label="Gateway fee" value={fmt(b.gatewayFee)} />}
            <DetailRow label="Extra fee" value={fmt(b.extraFee)} />
            {Number(b.driversFee) > 0 && <DetailRow label="Driver's fee" value={fmt(b.driversFee)} />}
            <DetailRow label="Security deposit" value={deposit} />
            <DetailRow label="Total fee" value={<span className="font-semibold">{fmt(b.totalFee)}</span>} />
            <DetailRow label="Payment" value={b.paymentMethod} />
          </div>
        </>
      )}

      <div className="flex justify-end">
        <button onClick={onOpenFull} className="text-xs font-semibold text-teal-600 hover:text-teal-700">
          Open in Bookings page →
        </button>
      </div>
    </div>
  );
}

// --- BOOKING PENALTIES MODAL -------------------------------------------------
// Everything noted on ONE booking, in a window: totals on top, then each penalty (open it to see / edit / confirm /
// void it), and a button to add another penalty to this booking whatever state the existing ones are in.
function BookingPenaltiesModal({ bookingID, penalties, canAdd, onClose, onViewPenalty, onAddPenalty, onViewBooking }) {
  const { fmt } = useCurrency();
  const list = [...penalties].sort((a, b) => {
    const aR = a.status === "UnderReview", bR = b.status === "UnderReview";
    if (aR !== bR) return aR ? -1 : 1;   // waiting for review first
    return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
  });
  const first = list[0];
  const live = list.filter((p) => p.status === "Confirmed");
  const charged = live.reduce((n, p) => n + (p.amount || 0), 0);
  const paid = live.reduce((n, p) => n + Math.min(p.paidAmount || 0, p.amount || 0), 0);
  const inReview = list.filter((p) => p.status === "UnderReview");
  const reviewAmount = inReview.reduce((n, p) => n + (p.amount || 0), 0);
  const voidedAmount = list.filter((p) => p.status === "Voided").reduce((n, p) => n + (p.amount || 0), 0);
  const waivedAmount = list.filter((p) => p.status === "Waived").reduce((n, p) => n + (p.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-arl-dark">Penalties on this booking</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{bookingID}</p>
            {first && (
              <p className="text-xs text-gray-500 mt-0.5">
                {first.customerName || "--"}{first.brandName !== "--" || first.modelName !== "--" ? ` · ${first.brandName} ${first.modelName}` : ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX /></button>
        </div>

        {onViewBooking && (
          <button onClick={onViewBooking}
            className="w-full px-4 py-2 rounded-xl text-sm font-semibold border border-teal-200 text-teal-700 bg-teal-50/50 hover:bg-teal-50">
            View booking →
          </button>
        )}

        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Total charged</span><span className="font-semibold text-gray-800">{fmt(charged)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="font-semibold text-gray-800">{fmt(paid)}</span></div>
          <div className="flex justify-between border-t border-gray-100 pt-1">
            <span className="text-gray-500">Still owed</span>
            <span className={`font-semibold ${charged - paid > 0 ? "text-red-500" : "text-green-600"}`}>{fmt(Math.max(0, charged - paid))}</span>
          </div>
          {reviewAmount > 0 && (
            <p className="text-amber-700 pt-1">+ {fmt(reviewAmount)} still under review — not counted until a supervisor confirms it.</p>
          )}
          {(voidedAmount > 0 || waivedAmount > 0) && (
            <div className="border-t border-gray-100 pt-1 space-y-1">
              {voidedAmount > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Voided</span><span className="font-semibold text-gray-400 line-through">{fmt(voidedAmount)}</span></div>
              )}
              {waivedAmount > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Waived</span><span className="font-semibold text-purple-600">{fmt(waivedAmount)}</span></div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {list.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No penalties on this booking.</p>}
          {list.map((p) => (
            <div key={p.id}
              className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${p.status === "UnderReview" ? "border-amber-200 bg-amber-50/40" : "border-gray-100"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-800 truncate" title={(p.lineItems || []).map((li) => li.description).join(", ")}>
                  {(p.lineItems || []).map((li) => li.description).join(", ") || "--"}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {toDate(p.createdAt) ? toDate(p.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "--"}
                  {p.status === "UnderReview" && p.createdByName ? ` · noted by ${p.createdByName}` : ""}
                  {p.status === "Confirmed" && p.paidAmount > 0 ? ` · ${fmt(p.paidAmount)} paid` : ""}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className={`text-xs font-semibold ${p.status === "Confirmed" || p.status === "UnderReview" ? "text-gray-800" : "text-gray-400 line-through"}`}>{fmt(p.amount)}</p>
                <SettlementBadge status={p.settlementStatus} />
              </div>
              <button onClick={() => onViewPenalty(p)} className="px-3 py-1 border rounded-lg text-xs hover:bg-gray-50 shrink-0">View</button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {canAdd ? (
            <button onClick={onAddPenalty}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50">
              + New penalty
            </button>
          ) : <span />}
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">Close</button>
        </div>
      </div>
    </div>
  );
}

function PenaltyDetailsModal({ penalty: p, token, canRecordInStore, busy, onClose, onViewBookingPage, onMarkPaid, onWaive, onVoid, onConfirm, onSaveEdit, onAddPenalty }) {
  const { fmt } = useCurrency();
  const [showBooking, setShowBooking] = useState(false);

  // ── Review-step state. A penalty a driver noted is UnderReview: supervisors can edit it (descriptions, amounts, add /
  // remove items) and confirm it, which notifies the customer and locks it. Everything below is inert for other statuses.
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [editOverride, setEditOverride] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [armConfirm, setArmConfirm] = useState(false); // first click arms it, second click confirms + notifies
  const [depositInfo, setDepositInfo] = useState(null);  // how this penalty would be paid (deposit still held vs already returned)
  useEffect(() => {
    if (p.status !== "UnderReview" || !p.bookingID) { setDepositInfo(null); return undefined; }
    let cancelled = false;
    fetch(`${API_URL}/api/penalties/late-fee-preview/${encodeURIComponent(p.bookingID)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setDepositInfo(j?.data?.deposit || null); })
      .catch(() => { if (!cancelled) setDepositInfo(null); });
    return () => { cancelled = true; };
  }, [p.id, p.status, p.bookingID, token]);

  const startEdit = () => {
    setEditItems((p.lineItems || []).map((li) => ({ description: li.description || "", amount: String(li.amount ?? "") })));
    setEditOverride(p.amount !== p.computedAmount ? String(p.amount) : "");
    setEditReason(p.overrideReason || "");
    setEditError("");
    setArmConfirm(false);
    setEditing(true);
  };
  const editTotal = editItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  const setEditItem = (i, patch) => setEditItems((items) => items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));

  const saveEdit = async () => {
    setEditError("");
    const clean = editItems
      .map((li) => ({ description: li.description.trim(), amount: Number(li.amount) || 0 }))
      .filter((li) => li.description || li.amount);
    if (clean.length === 0) { setEditError("Keep at least one line item."); return; }
    if (clean.some((li) => !li.description)) { setEditError("Every line item needs a description."); return; }
    if (clean.some((li) => !(li.amount > 0))) { setEditError("Every charge needs an amount greater than ₱0."); return; }
    const computed = clean.reduce((sum, li) => sum + li.amount, 0);
    const finalAmount = editOverride.trim() !== "" ? Number(editOverride) : computed;
    if (finalAmount !== computed && !editReason.trim()) { setEditError("A reason is required when the amount is adjusted from the computed total."); return; }
    setSaving(true);
    try {
      await onSaveEdit({ lineItems: clean, amount: finalAmount, overrideReason: editReason.trim() });
      setEditing(false);
    } catch (e) {
      setEditError(e.message || "Couldn't save the changes.");
    } finally {
      setSaving(false);
    }
  };
  const fmtDate = (v) => {
    const d = toDate(v);
    return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  };
  const owed = (p.amount || 0) - (p.paidAmount || 0);
  const isLateFee = p.lateMinutes !== null && p.lateMinutes !== undefined;
  const isOverridden = p.amount !== p.computedAmount;

  // Same rules the table's Actions column used to apply:
  //  - in-store payment: Confirmed, not fully paid, and a Supervisor/Admin/Owner
  //  - Waive / Void: Confirmed and nothing paid yet (the server refuses both once
  //    money has been paid — reversing money needs its own flow, not a status flip)
  //  - Edit / Confirm: only while UnderReview (a driver's penalty nobody has confirmed), Supervisor/Admin/Owner.
  //    Confirming notifies the customer and locks the penalty for good.
  //  - Void on an UnderReview penalty is "Discard" (silent: the customer never saw it); Waive doesn't apply to it.
  const isConfirmed  = p.status === "Confirmed";
  const isReview     = p.status === "UnderReview";
  const canPayInStore = isConfirmed && p.settlementStatus !== "Paid" && canRecordInStore;
  const canWaive      = isConfirmed && !(p.paidAmount > 0);
  const canVoid       = (isConfirmed && !(p.paidAmount > 0)) || (isReview && canRecordInStore);
  const canEdit       = isReview && canRecordInStore;
  const canConfirm    = isReview && canRecordInStore;
  const hasActions    = canPayInStore || canWaive || canVoid || canEdit || canConfirm;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex flex-col md:flex-row items-stretch justify-center gap-3 w-full max-h-[90vh] overflow-y-auto md:overflow-visible">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 md:max-h-[90vh] md:overflow-y-auto">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-arl-dark">Penalty Details</h3>
              <p className="text-xs text-gray-400">Booking {p.bookingID || "—"}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX /></button>
          </div>

          <div className="flex items-center gap-2">
            <SettlementBadge status={p.settlementStatus} />
            <span className="text-[11px] text-gray-400">Lifecycle: {isReview ? "Under review" : p.status}</span>
          </div>

          {isReview && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-0.5">
              <p className="text-xs font-semibold text-amber-800">Waiting for review — the customer hasn't been notified</p>
              <p className="text-xs text-amber-700">
                {p.createdByName ? `${p.createdByName} noted this on the trip. ` : "A driver noted this on the trip. "}
                It isn't counted against the deposit or shown to the customer yet. You can still edit it. Once you confirm it, the customer is
                notified and it can't be edited anymore.
              </p>
            </div>
          )}

          {/* Charges */}
          {editing ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-600">Edit charges</p>
              <div className="space-y-2">
                {editItems.map((li, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input type="text" value={li.description} onChange={(e) => setEditItem(i, { description: e.target.value })}
                      placeholder="Description (e.g. Missing floor mat)"
                      className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light" />
                    <input type="number" value={li.amount} onChange={(e) => setEditItem(i, { amount: e.target.value })}
                      placeholder="₱0"
                      className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light" />
                    <button onClick={() => setEditItems((items) => items.filter((_, idx) => idx !== i))} disabled={editItems.length === 1}
                      className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300" title="Remove this item">
                      <IconX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setEditItems((items) => [...items, { description: "", amount: "" }])}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                <IconPlus className="w-3.5 h-3.5" /> Add line item
              </button>
              <div className="flex items-baseline justify-between text-sm border-t border-amber-100 pt-2">
                <span className="text-gray-500">Computed total</span>
                <span className="font-semibold text-gray-700">{peso(editTotal)}</span>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Override amount (optional)</label>
                <input type="number" value={editOverride} onChange={(e) => setEditOverride(e.target.value)}
                  placeholder={String(editTotal)}
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-light" />
              </div>
              {editOverride.trim() !== "" && Number(editOverride) !== editTotal && (
                <div>
                  <label className="text-xs font-semibold text-gray-500">Reason for override (required)</label>
                  <textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} rows={2}
                    className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-arl-dark/20" />
                </div>
              )}
              {editError && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{editError}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditing(false); setEditError(""); }} disabled={saving}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Charges</p>
              <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                {(p.lineItems || []).map((li, i) => (
                  <div key={i} className="flex justify-between px-3 py-2 text-xs">
                    <span className="text-gray-600">{li.description}</span>
                    <span className="text-gray-700 font-medium">{fmt(li.amount)}</span>
                  </div>
                ))}
              </div>
              {isLateFee && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Late fee: {p.lateMinutes} min late (after {p.graceMinutes}-min grace) at {fmt(p.rateAtCreation)}/hr.
                </p>
              )}
              {isConfirmed && (
                <p className="text-[11px] text-gray-400 mt-1.5">Locked — the customer has been notified, so the charges can't be edited. Void or waive it instead if it's wrong.</p>
              )}
            </div>
          )}

          {/* Amount + payment status */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-0.5">
            <DetailRow label="Computed total" value={fmt(p.computedAmount)} />
            <DetailRow label="Amount charged" value={fmt(p.amount)} />
            {isOverridden && <DetailRow label="Override reason" value={p.overrideReason || "—"} />}
            <DetailRow label="Paid so far" value={fmt(p.paidAmount)} />
            {p.gatewayFeeRate != null && p.gatewayFeeRate > 0 && (
              <DetailRow label="Online payment fee" value={`${p.gatewayFeeRate}% on top, only if paid online`} />
            )}
            {p.gatewayFeePaid > 0 && <DetailRow label="Online fee paid" value={fmt(p.gatewayFeePaid)} />}
            {owed > 0 && isConfirmed && (
              <DetailRow label="Still owed" value={<span className="text-red-600 font-semibold">{fmt(owed)}</span>} />
            )}
            <DetailRow label="Payment mode" value={p.paymentMethod || null} />
            <DetailRow label="Reference #" value={p.referenceNumber || null} />
            <DetailRow label="Paid at" value={fmtDate(p.paidAt)} />
          </div>

          {/* Every payment made on this penalty (each instalment: how, ref, who) — the penalty itself only keeps the running total. */}
          <PaymentEntriesPanel query={{ penaltyID: p.penaltyID }} title="Payments on this penalty" />

          {(p.status === "Voided" || p.status === "Waived") && p.statusReason && (
            <div className="rounded-xl bg-purple-50 border border-purple-100 p-3">
              <p className="text-xs font-semibold text-purple-700">{p.status} — reason</p>
              <p className="text-xs text-purple-600 mt-0.5">{p.statusReason}</p>
            </div>
          )}

          {/* Who / when */}
          <div className="rounded-xl border border-gray-100 p-3 space-y-0.5">
            <DetailRow label="Customer" value={p.customerName} />
            <DetailRow label="Car" value={p.brandName !== "—" || p.modelName !== "—" ? `${p.brandName} ${p.modelName} (${p.plateNumber})` : p.plateNumber} />
            <DetailRow label="Noted by" value={p.createdByName} />
            <DetailRow label="Created" value={fmtDate(p.createdAt)} />
            <DetailRow label="Last edited" value={fmtDate(p.editedAt)} />
            <DetailRow label="Confirmed" value={isReview ? "Not yet" : fmtDate(p.confirmedAt)} />
          </div>

          {/* Actions — moved here from the table. Hidden while editing, so an unsaved edit can't be lost by a stray click. */}
          {hasActions && !editing && (
            <div className="rounded-xl border border-gray-100 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500">Actions</p>
              {armConfirm ? (
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 space-y-2">
                  <p className="text-xs text-green-800">
                    Confirm {fmt(p.amount)} and notify {p.customerName && p.customerName !== "—" ? p.customerName : "the customer"}? They'll see the charge
                    right away, and it can't be edited after this.
                  </p>
                  <DepositNotice deposit={depositInfo} amount={p.amount} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setArmConfirm(false)} disabled={busy}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-white disabled:opacity-40">
                      Back
                    </button>
                    <button onClick={onConfirm} disabled={busy}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
                      {busy ? "Confirming…" : "Yes, confirm & notify"}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {canConfirm && (
                  <button onClick={() => setArmConfirm(true)} disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 font-semibold">
                    Confirm penalty
                  </button>
                )}
                {canEdit && (
                  <button onClick={startEdit} disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-700 disabled:opacity-40 font-medium">
                    Edit
                  </button>
                )}
                {canPayInStore && (
                  <button onClick={onMarkPaid} disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-40 font-medium">
                    In-store payment
                  </button>
                )}
                {canWaive && (
                  <button onClick={onWaive} disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 font-medium">
                    Waive
                  </button>
                )}
                {canVoid && (
                  <button onClick={onVoid} disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-40 font-medium">
                    {isReview ? "Discard" : "Void"}
                  </button>
                )}
              </div>
              )}
              {isConfirmed && p.paidAmount > 0 && (
                <p className="text-[11px] text-gray-400">Waive and Void aren't available once a payment has been recorded.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
              Close
            </button>
            {canRecordInStore && p.bookingID && onAddPenalty && !editing && (
              <button onClick={onAddPenalty}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50">
                + New penalty
              </button>
            )}
            {p.bookingID && (
              <button onClick={() => setShowBooking((v) => !v)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700">
                {showBooking ? "Hide Booking" : "View Booking"}
              </button>
            )}
          </div>
        </div>

        {showBooking && p.bookingID && (
          <BookingSidePanel
            bookingID={p.bookingID}
            token={token}
            fmt={fmt}
            onClose={() => setShowBooking(false)}
            onOpenFull={onViewBookingPage}
          />
        )}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// Lists every penalty in the system, and is also where staff create new
// penalties (auto-confirmed and notified on submit), review the ones drivers
// noted (edit + confirm, or discard — see PenaltyDetailsModal), and void/waive
// confirmed ones —
// see CreatePenaltyModal / ReasonModal above. (This used to be read-only
// with a comment pointing staff at a per-booking panel in Bookings.jsx for
// those actions — no such panel exists there, so that flow had no UI
// anywhere. This page is now
// the one place that does it.)
export default function Penalties() {
  const token = localStorage.getItem("token");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [toast, setToast]     = useState(null);
  const [activeStatFilter, setActiveStatFilter] = useState(null); // null | "review" | "pending" | "settled" | "voidedWaived"
  const [showCreate, setShowCreate] = useState(false);
  const [prefillBookingID, setPrefillBookingID] = useState(""); // set via ?bookingID= (Bookings.jsx's "Note a Penalty" button)
  const [busyId, setBusyId] = useState(null); // penaltyID currently being confirmed/voided/waived
  const [reasonModal, setReasonModal] = useState(null); // { penaltyID, action: "Voided" | "Waived" }
  const [markPaidModal, setMarkPaidModal] = useState(null); // the penalty record being paid off
  const [detailsModal, setDetailsModal] = useState(null); // the penalty record being viewed in detail
  const { effectiveRole } = useAuth();
  const { fmt } = useCurrency();
  const canRecordInStore = [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR].includes(effectiveRole);

  // Deep-link from Bookings.jsx's "Note a Penalty" button: opens the
  // create-penalty modal straight away with the bookingID already filled in
  // and locked (see CreatePenaltyModal's linkedFromBooking), same pattern
  // as Bookings.jsx's own ?open= handling for notification deep-links —
  // runs once, strips the param afterward so refreshing doesn't re-open it.
  useEffect(() => {
    const bID = searchParams.get("bookingID");
    if (!bID) return;
    setPrefillBookingID(bID);
    setShowCreate(true);
    setSearchParams((prev) => { prev.delete("bookingID"); return prev; }, { replace: true });
  }, [searchParams, setSearchParams]);

  const [sortKey, setSortKey] = useState(null); // null = default (newest first; active stat card's rows on top)
  const [sortDir, setSortDir] = useState("asc");
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleStatFilter = (key) => {
    setActiveStatFilter((v) => {
      const next = v === key ? null : key;
      if (next) { setSortKey(null); setSortDir("asc"); } // card's "matching rows on top" needs the default order
      return next;
    });
  };

  const showToast = (msg, type = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const submitVoidOrWaive = async (reason) => {
    const { penaltyID, action } = reasonModal;
    setBusyId(penaltyID);
    try {
      const res = await fetch(`${API_URL}/api/penalties/${penaltyID}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: action, statusReason: reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || `Failed to ${action.toLowerCase()} penalty.`);
      showToast(reasonModal.underReview ? "Penalty discarded — the customer was never notified." : `Penalty ${action.toLowerCase()}.`, "success");
      setReasonModal(null);
      fetchAll();
    } catch (e) {
      showToast(e.message || `Failed to ${action.toLowerCase()} penalty.`);
    } finally {
      setBusyId(null);
    }
  };

  // Confirm a penalty that was UnderReview: this is what notifies the customer, and it locks the penalty.
  const submitConfirm = async (penaltyID) => {
    setBusyId(penaltyID);
    try {
      const res = await fetch(`${API_URL}/api/penalties/${penaltyID}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to confirm penalty.");
      showToast("Penalty confirmed — customer notified.", "success");
      setDetailsModal(null);
      fetchAll();
    } catch (e) {
      showToast(e.message || "Failed to confirm penalty.");
      fetchAll();   // it may have been confirmed / discarded by someone else meanwhile
    } finally {
      setBusyId(null);
    }
  };

  // Save edits to a penalty that is still UnderReview. Throws on failure so the modal can show the message in place.
  const submitEdit = async (penaltyID, body) => {
    const res = await fetch(`${API_URL}/api/penalties/${penaltyID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      fetchAll();   // e.g. someone confirmed it first: refresh so the modal stops offering Edit
      throw new Error(json.message || "Failed to save changes.");
    }
    showToast("Changes saved.", "success");
    const list = await fetchAll();
    const fresh = list.find((r) => r.id === penaltyID);
    if (fresh) setDetailsModal(fresh);
  };

  const submitMarkPaid = async ({ amount, method, referenceNumber }) => {
    const penaltyID = markPaidModal.id;
    setBusyId(penaltyID);
    try {
      const res = await fetch(`${API_URL}/api/penalties/shortfall-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userID: markPaidModal.userID, penaltyID, amount, method, referenceNumber }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to record payment.");
      showToast("Payment recorded.", "success");
      setMarkPaidModal(null);
      fetchAll();
    } catch (e) {
      showToast(e.message || "Failed to record payment.");
    } finally {
      setBusyId(null);
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/penalties`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load penalties.");
      setRecords(json.data || []);
      return json.data || [];
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to load penalties.");
      return [];
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Deep-link from a notification ("A penalty needs review"): open that penalty's details once the list has loaded.
  // Runs once, strips the param afterward so refreshing doesn't re-open it.
  const openID = searchParams.get("open");
  useEffect(() => {
    if (!openID || loading) return;
    const found = records.find((r) => r.id === openID || r.penaltyID === openID);
    if (found) setDetailsModal(found);
    else showToast("That penalty couldn't be found — it may have been archived.");
    setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
  }, [openID, loading, records, setSearchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const review       = records.filter(STAT_FILTERS.review.predicate).length;
  const pending      = records.filter(STAT_FILTERS.pending.predicate).length;
  const settled      = records.filter(STAT_FILTERS.settled.predicate).length;
  const voidedWaived = records.filter(STAT_FILTERS.voidedWaived.predicate).length;

  // Matching rows float to the top when a stat card is active — nothing
  // is filtered out of the list, same interaction as Maintenance.jsx.
  const sorted = [...records].sort((a, b) => {
    // A clicked column header wins over the default order.
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      const text = (x, y) => (x || "").toString().localeCompare((y || "").toString(), undefined, { sensitivity: "base", numeric: true }) * dir;
      switch (sortKey) {
        case "date":     return ((toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0)) * dir;
        case "charges":  return text((a.lineItems || []).map((i) => i.description).join(", "), (b.lineItems || []).map((i) => i.description).join(", "));
        case "booking":  return text(a.bookingID, b.bookingID);
        case "customer": return text(a.customerName, b.customerName);
        case "car":      return text(`${a.brandName} ${a.modelName}`, `${b.brandName} ${b.modelName}`);
        case "amount":   return ((a.amount || 0) - (b.amount || 0)) * dir;
        case "paid":     return ((a.paidAmount || 0) - (b.paidAmount || 0)) * dir;
        case "status":   return ((SETTLEMENT_RANK[a.settlementStatus] ?? 99) - (SETTLEMENT_RANK[b.settlementStatus] ?? 99)) * dir;
        default: break;
      }
    }
    if (activeStatFilter) {
      const pred = STAT_FILTERS[activeStatFilter].predicate;
      const aM = pred(a), bM = pred(b);
      if (aM !== bM) return aM ? -1 : 1;
    }
    // Default order: penalties waiting for review first (they're the to-do list), then newest first.
    const aR = STAT_FILTERS.review.predicate(a), bR = STAT_FILTERS.review.predicate(b);
    if (aR !== bR) return aR ? -1 : 1;
    return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
  });

  const filtered = sorted.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (p.customerName || "").toLowerCase().includes(q) ||
      (p.plateNumber  || "").toLowerCase().includes(q) ||
      (p.bookingID    || "").toLowerCase().includes(q) ||
      (p.lineItems || []).some((i) => (i.description || "").toLowerCase().includes(q))
    );
  });

  // `groups` (defined below, after renderRow) when grouped by booking: pages hold whole bookings, so a booking's
  // penalties are never split across two pages.
  const [groupByBooking, setGroupByBooking] = useState(true);
  const [bookingModalID, setBookingModalID] = useState(null); // bookingID whose penalties are listed in the booking window

  // Bookings.jsx doesn't yet auto-open a specific booking's panel from a
  // URL param — this gets staff to the right page with the bookingID
  // visible, but they still search/select it themselves once there.
  const viewBooking = (bookingID) => navigate(`/bookings?bookingID=${encodeURIComponent(bookingID)}`);

  // One penalty row.
  const renderRow = (p, i) => {
    const statMatch = activeStatFilter && STAT_FILTERS[activeStatFilter].predicate(p);
    const rowClass = statMatch ? "bg-red-50/40 ring-1 ring-inset ring-red-100"
      : p.status === "UnderReview" ? "bg-amber-50/40"
      : i % 2 === 1 ? "bg-gray-50/30" : "";
    const chargesText = (p.lineItems || []).map((li) => li.description).join(", ");
    return (
        <tr key={p.id} className={`border-b border-gray-50 last:border-0 hover:bg-arl-light/30 transition-colors ${rowClass}`}>
          <td className="px-4 py-3 text-xs whitespace-nowrap">
            {toDate(p.createdAt) ? (
              <>
                <span className="text-gray-700">{toDate(p.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>
                <span className="mx-1.5 text-gray-300">|</span>
                <span className="text-gray-500">{toDate(p.createdAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span>
              </>
            ) : "—"}
          </td>
          <td className="px-4 py-3 text-xs text-gray-700">
            <div className="max-w-[220px] truncate" title={(p.lineItems || []).map((li) => `${li.description}: ${fmt(li.amount)}`).join(", ")}>
              {chargesText || "—"}
            </div>
          </td>
          <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">{p.bookingID || "—"}</td>
          <td className="px-4 py-3"><div className="font-semibold text-gray-800 text-xs">{p.customerName || "—"}</div></td>
          <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
            {p.brandName !== "—" || p.modelName !== "—" ? `${p.brandName} ${p.modelName}` : "—"}
          </td>
          <td className="px-4 py-3 text-xs font-semibold text-gray-800 whitespace-nowrap">{fmt(p.amount)}</td>
          <td className="px-4 py-3 text-xs font-semibold text-gray-800 whitespace-nowrap">{fmt(p.paidAmount)}</td>
          <td className="px-4 py-3"><SettlementBadge status={p.settlementStatus} /></td>
          <td className="px-4 py-3">
            <button onClick={() => setDetailsModal(p)}
              className="px-3 py-1 border rounded-lg text-xs hover:bg-gray-50">View</button>
          </td>
        </tr>
    );
  };

  // ── Group by booking ─────────────────────────────────────────────────────────────────────────────────────────────
  // One header row per booking that has more than one penalty (a booking with a single penalty stays a plain row), with
  // its penalties underneath. Groups are built from the already searched / sorted / stat-filtered list, so the group
  // order follows the first penalty of each booking in that order (e.g. a booking with something under review is on
  // top by default). Totals count CONFIRMED penalties only, like Total charged on the Payments page: under review,
  // waived and voided ones are not money owed.
  const groups = (() => {
    const byKey = new Map();
    filtered.forEach((p) => {
      const key = p.bookingID && p.bookingID !== "—" ? p.bookingID : `__${p.id}`;
      if (!byKey.has(key)) byKey.set(key, { key, items: [] });
      byKey.get(key).items.push(p);
    });
    return [...byKey.values()].map((g) => {
      const live = g.items.filter((x) => x.status === "Confirmed");
      const inReview = g.items.filter((x) => x.status === "UnderReview");
      const rank = (x) => SETTLEMENT_RANK[x.settlementStatus] ?? 99;
      return {
        ...g,
        first: g.items[0],
        amount: live.reduce((n, x) => n + (x.amount || 0), 0),
        paid: live.reduce((n, x) => n + Math.min(x.paidAmount || 0, x.amount || 0), 0),
        reviewCount: inReview.length,
        reviewAmount: inReview.reduce((n, x) => n + (x.amount || 0), 0),
        // The most urgent status in the group: under review, then still owed, then partly paid, paid, waived, voided.
        worst: g.items.reduce((best, x) => (rank(x) < rank(best) ? x : best), g.items[0]).settlementStatus,
        latest: g.items.reduce((m, x) => Math.max(m, toDate(x.createdAt)?.getTime() || 0), 0),
      };
    });
  })();
  // A booking with several penalties is one row; View opens a window listing them all (BookingPenaltiesModal).
  const renderGroup = (g, gi) => {
    if (g.items.length === 1) return renderRow(g.items[0], gi);
    const d = g.latest ? new Date(g.latest) : null;
    return (
      <tr key={g.key} onClick={() => setBookingModalID(g.first.bookingID)}
        className={`border-b border-gray-100 cursor-pointer hover:bg-arl-light/30 transition-colors ${g.reviewCount > 0 ? "bg-amber-50/50" : "bg-gray-50/70"}`}>
        <td className="px-4 py-3 text-xs whitespace-nowrap text-gray-500">
          {d ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "--"}
        </td>
        <td className="px-4 py-3 text-xs">
          <span className="font-semibold text-gray-800">{g.items.length} penalties</span>
          {g.reviewCount > 0 && (
            <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {g.reviewCount} under review
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-700 font-mono whitespace-nowrap">{g.first.bookingID || "--"}</td>
        <td className="px-4 py-3"><div className="font-semibold text-gray-800 text-xs">{g.first.customerName || "--"}</div></td>
        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
          {g.first.brandName !== "--" || g.first.modelName !== "--" ? `${g.first.brandName} ${g.first.modelName}` : "--"}
        </td>
        <td className="px-4 py-3 text-xs font-semibold text-gray-800 whitespace-nowrap">
          {fmt(g.amount)}
          {g.reviewAmount > 0 && <div className="text-[10px] font-medium text-amber-700">+ {fmt(g.reviewAmount)} under review</div>}
        </td>
        <td className="px-4 py-3 text-xs font-semibold text-gray-800 whitespace-nowrap">{fmt(g.paid)}</td>
        <td className="px-4 py-3 text-xs text-gray-300">—</td>
        <td className="px-4 py-3">
          <button onClick={(e) => { e.stopPropagation(); setBookingModalID(g.first.bookingID); }}
            className="px-3 py-1 border rounded-lg text-xs hover:bg-white">View</button>
        </td>
      </tr>
    );
  };

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(groupByBooking ? groups : filtered, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, activeStatFilter, sortKey, sortDir, groupByBooking]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="w-full px-4 space-y-5">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium border ${
          toast.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* First of the windows, so every other one (a penalty's details, New Penalty, void / waive, mark paid) opens on top of it. */}
      {bookingModalID && (
        <BookingPenaltiesModal
          bookingID={bookingModalID}
          penalties={records.filter((r) => r.bookingID === bookingModalID)}
          canAdd={canRecordInStore}
          onClose={() => setBookingModalID(null)}
          onViewPenalty={(p) => setDetailsModal(p)}
          onViewBooking={() => { const id = bookingModalID; setBookingModalID(null); viewBooking(id); }}
          onAddPenalty={() => { const id = bookingModalID; setBookingModalID(null); setPrefillBookingID(id); setShowCreate(true); }}
        />
      )}

      {showCreate && (
        <CreatePenaltyModal
          token={token}
          initialBookingID={prefillBookingID}
          onClose={() => { setShowCreate(false); setPrefillBookingID(""); }}
          onCreated={() => { setShowCreate(false); setPrefillBookingID(""); showToast("Penalty created — customer notified.", "success"); fetchAll(); }}
        />
      )}

      {reasonModal && (
        <ReasonModal
          action={reasonModal.action}
          underReview={!!reasonModal.underReview}
          submitting={busyId === reasonModal.penaltyID}
          onClose={() => setReasonModal(null)}
          onSubmit={submitVoidOrWaive}
        />
      )}

      {markPaidModal && (
        <MarkPaidModal
          penalty={markPaidModal}
          maxAmount={records
            .filter((r) => r.userID === markPaidModal.userID && r.status === "Confirmed")
            .reduce((sum, r) => sum + Math.max(0, (r.amount || 0) - (r.paidAmount || 0)), 0)}
          submitting={busyId === markPaidModal.id}
          onClose={() => setMarkPaidModal(null)}
          onSubmit={submitMarkPaid}
        />
      )}

      {detailsModal && (
        <PenaltyDetailsModal
          penalty={detailsModal}
          token={token}
          canRecordInStore={canRecordInStore}
          busy={busyId === detailsModal.id}
          onClose={() => setDetailsModal(null)}
          onViewBookingPage={() => { setDetailsModal(null); viewBooking(detailsModal.bookingID); }}
          onMarkPaid={() => { setMarkPaidModal(detailsModal); setDetailsModal(null); }}
          onWaive={() => { setReasonModal({ penaltyID: detailsModal.id, action: "Waived" }); setDetailsModal(null); }}
          onVoid={() => { setReasonModal({ penaltyID: detailsModal.id, action: "Voided", underReview: detailsModal.status === "UnderReview" }); setDetailsModal(null); }}
          onConfirm={() => submitConfirm(detailsModal.id)}
          onSaveEdit={(body) => submitEdit(detailsModal.id, body)}
          // Works whether this penalty is under review or not: opens New Penalty with this booking filled in.
          onAddPenalty={() => { const id = detailsModal.bookingID; setDetailsModal(null); setBookingModalID(null); setPrefillBookingID(id); setShowCreate(true); }}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Penalties</h1>
          <p className="text-xs text-gray-400 mt-0.5">{loading ? "Loading…" : `${records.length} penalties`}</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 flex items-center gap-1.5 self-start sm:self-auto">
          <IconPlus className="w-4 h-4" /> New Penalty
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={<IconClock className="w-5 h-5" />} value={review} label="Under Review" color="amber"
          onClick={() => toggleStatFilter("review")} active={activeStatFilter === "review"} />
        <StatCard icon={<IconAlertCircle className="w-5 h-5" />} value={pending} label="Pending" color="red"
          onClick={() => toggleStatFilter("pending")} active={activeStatFilter === "pending"} />
        <StatCard icon={<IconCheck className="w-5 h-5" />} value={settled} label="Settled" color="green"
          onClick={() => toggleStatFilter("settled")} active={activeStatFilter === "settled"} />
        <StatCard icon={<IconBan className="w-5 h-5" />} value={voidedWaived} label="Voided / Waived" color="purple"
          onClick={() => toggleStatFilter("voidedWaived")} active={activeStatFilter === "voidedWaived"} />
      </div>
      {review > 0 && activeStatFilter !== "review" && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 -mt-1">
          <p className="text-xs text-amber-800">
            <span className="font-semibold">{review} penalt{review === 1 ? "y" : "ies"} waiting for review.</span>{" "}
            Drivers noted {review === 1 ? "it" : "them"} — the customer hasn't been told yet.
          </p>
          <button onClick={() => toggleStatFilter("review")}
            className="text-xs font-semibold text-amber-800 hover:underline whitespace-nowrap">Show →</button>
        </div>
      )}
      {activeStatFilter === "review" && (
        <p className="text-xs text-gray-400 px-1 -mt-2">
          Penalties drivers noted that no one has confirmed yet. Open one to edit it and confirm it — that's when the customer is notified.
        </p>
      )}
      {activeStatFilter === "pending" && (
        <p className="text-xs text-gray-400 px-1 -mt-2">
          Pending includes both confirmed penalties still awaiting settlement, and settled penalties the deposit didn't fully cover.
        </p>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-soft flex flex-wrap gap-3 items-center">
        <input type="text" placeholder="Search by customer, booking, charges…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
        <button onClick={fetchAll} disabled={loading}
          className="px-4 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 disabled:opacity-50">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-arl-dark">
            All Penalty Records{" "}
            <span className="text-gray-400 text-sm font-normal">
              ({groupByBooking ? `${groups.length} booking${groups.length === 1 ? "" : "s"} · ${filtered.length} penalties` : `${filtered.length} results`})
            </span>
          </h2>
          {/* One row per booking (its penalties underneath), or every penalty on its own row. */}
          <div className="inline-flex rounded-xl border border-gray-200 p-0.5 text-xs font-semibold">
            {[[true, "By booking"], [false, "All penalties"]].map(([val, label]) => (
              <button key={label} onClick={() => setGroupByBooking(val)}
                className={`px-3 py-1.5 rounded-[10px] transition-colors ${groupByBooking === val ? "bg-teal-600 text-white" : "text-gray-500 hover:text-gray-700"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <SortableTh label="Created At" sortKey="date"     sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Charges"    sortKey="charges"  sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Booking ID" sortKey="booking"  sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Customer"   sortKey="customer" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Car"        sortKey="car"      sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Amount"     sortKey="amount"   sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Paid"       sortKey="paid"     sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh label="Status"     sortKey="status"   sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-16 text-gray-400 text-sm">
                {search || activeStatFilter ? "No penalties match your filters." : "No penalties found."}
              </td></tr>
            ) : groupByBooking
              ? paginated.map((g, gi) => renderGroup(g, gi))
              : paginated.map((p, i) => renderRow(p, i))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>
    </div>
  );
}