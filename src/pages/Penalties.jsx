import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

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

const IconClock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
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

// One predicate per stat card, shared by the card's count AND the row
// highlight/default sort, so the number on a card can never silently
// drift from what clicking it actually shows.
//
// "Unpaid" already covers both "confirmed but the booking hasn't been
// settled yet" and "settled but the deposit didn't fully cover it" —
// settleBooking() sets paidAmount below amount whenever the deposit runs
// out partway through a penalty, so a single paidAmount < amount check
// catches both cases without needing to look at the payment's own
// deposit.settlement.status.
const STAT_FILTERS = {
  draft:         { predicate: (p) => p.status === "Draft" },
  unpaid:        { predicate: (p) => p.status === "Confirmed" && (p.paidAmount || 0) < (p.amount || 0) },
  settled:       { predicate: (p) => p.status === "Confirmed" && (p.paidAmount || 0) >= (p.amount || 0) },
  voidedWaived:  { predicate: (p) => p.status === "Voided" || p.status === "Waived" },
};

// Badge for the computed `settlementStatus` field (Unpaid / Partially Paid
// / Paid) — this is what every row displays now. The raw lifecycle status
// (Draft/Confirmed/Voided/Waived) still drives which action buttons show
// (see the Actions column below), it's just not shown as its own badge.
const SETTLEMENT_BADGE = {
  Unpaid:         "bg-red-50 text-red-600 border border-red-200",
  "Partially Paid": "bg-amber-50 text-amber-700 border border-amber-200",
  Paid:           "bg-green-50 text-green-700 border border-green-200",
};

function SettlementBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${SETTLEMENT_BADGE[status] || "bg-gray-100 text-gray-600"}`}>
      {status || "—"}
    </span>
  );
}

function StatCard({ icon, value, label, color, onClick, active }) {
  const colors = { gray: "text-gray-600", red: "text-red-500", green: "text-green-600", purple: "text-purple-600" };
  const bgColors = { gray: "bg-gray-100 text-gray-600", red: "bg-red-50 text-red-500", green: "bg-green-50 text-green-600", purple: "bg-purple-50 text-purple-600" };
  const activeRing = {
    gray: "border-gray-300 ring-2 ring-gray-100",
    red: "border-red-300 ring-2 ring-red-100",
    green: "border-green-300 ring-2 ring-green-100",
    purple: "border-purple-300 ring-2 ring-purple-100",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`w-full text-left bg-white rounded-2xl border shadow-soft p-4 flex items-center gap-3 transition-all cursor-pointer hover:border-gray-200 hover:shadow-md ${
        active ? activeRing[color] : "border-gray-100"
      }`}
    >
      <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${bgColors[color]}`}>{icon}</div>
      <div>
        <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </button>
  );
}

// ─── CREATE PENALTY MODAL ──────────────────────────────────────────────────
//
// Two ways in, matching how the backend actually models a draft:
// "Late fee" pulls a computed suggestion from previewLateFeeForBooking and
// carries lateMinutes/graceMinutes/ratePerHour with it (that's what lets
// buildPenaltyID dedupe it to one-per-booking on the backend). "Custom
// charge" is a free-typed lineItems list with no such fields — nothing
// stops staff from also adding extra custom lines alongside a late-fee
// suggestion in the same draft, the total is just the sum either way.
function CreatePenaltyModal({ token, onClose, onCreated, initialBookingID = "" }) {
  const [bookingID, setBookingID] = useState(initialBookingID);
  // Opened via Bookings.jsx's "Note a Penalty" button (see goToNotePenalty
  // there) — the bookingID arrives pre-filled via ?bookingID= and is kept
  // locked so the draft this creates is guaranteed to link back to the
  // exact booking staff came from, not whatever they might retype here.
  const linkedFromBooking = !!initialBookingID;
  const [lineItems, setLineItems] = useState([{ description: "", amount: "" }]);
  const [lateInfo, setLateInfo] = useState(null); // { lateMinutes, graceMinutes, ratePerHour } once a late-fee line is added
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const computedTotal = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);

  const updateLineItem = (i, field, value) =>
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, [field]: value } : li)));
  const addLineItem = () => setLineItems((items) => [...items, { description: "", amount: "" }]);
  const removeLineItem = (i) => setLineItems((items) => items.filter((_, idx) => idx !== i));

  const suggestLateFee = async () => {
    if (!bookingID.trim()) { setError("Enter a booking ID first."); return; }
    setLoadingPreview(true); setError("");
    try {
      const res = await fetch(`${API_URL}/api/penalties/late-fee-preview/${encodeURIComponent(bookingID.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not look up this booking.");
      const { lateMinutes, graceMinutes, ratePerHour, computedAmount } = json.data;
      setLateInfo({ lateMinutes, graceMinutes, ratePerHour });
      setLineItems((items) => {
        const withoutOldLate = items.filter((li) => li.description !== "Late return");
        return [{ description: "Late return", amount: String(computedAmount) }, ...withoutOldLate];
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (!bookingID.trim()) { setError("Booking ID is required."); return; }
    const cleanItems = lineItems
      .map((li) => ({ description: li.description.trim(), amount: Number(li.amount) || 0 }))
      .filter((li) => li.description);
    if (cleanItems.length === 0) { setError("Add at least one line item with a description."); return; }

    const computed = cleanItems.reduce((s, li) => s + li.amount, 0);
    const finalAmount = overrideAmount.trim() !== "" ? Number(overrideAmount) : computed;
    if (finalAmount !== computed && !overrideReason.trim()) {
      setError("A reason is required when the amount is adjusted from the computed total.");
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
      if (lateInfo) {
        body.lateMinutes = lateInfo.lateMinutes;
        body.graceMinutes = lateInfo.graceMinutes;
        body.rateAtCreation = lateInfo.ratePerHour;
      }
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
          <h3 className="font-bold text-arl-dark">New Penalty (Draft)</h3>
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
            <button onClick={suggestLateFee} disabled={loadingPreview}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap">
              {loadingPreview ? "Checking…" : "Suggest late fee"}
            </button>
          </div>
          {linkedFromBooking && (
            <p className="text-xs text-teal-600 mt-1">Linked from Booking Details — this draft will be tied to booking {bookingID}.</p>
          )}
          {lateInfo && (
            <p className="text-xs text-gray-400 mt-1">
              {lateInfo.lateMinutes > 0
                ? `${lateInfo.lateMinutes} min late (after ${lateInfo.graceMinutes}-min grace) at ₱${lateInfo.ratePerHour}/hr.`
                : "Not actually late per current records — line added at ₱0, adjust or remove it."}
            </p>
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
            {submitting ? "Creating…" : "Create Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VOID / WAIVE REASON MODAL ──────────────────────────────────────────────
function ReasonModal({ action, onClose, onSubmit, submitting }) {
  const [reason, setReason] = useState("");
  const label = action === "Waived" ? "Waive Penalty" : "Void Penalty";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-arl-dark">{label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX /></button>
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder={action === "Waived" ? "Reason for waiving (shown to customer via notification)" : "Reason for voiding"}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-dark/20" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button onClick={() => onSubmit(reason)} disabled={submitting || !reason.trim()}
            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${
              action === "Waived" ? "bg-purple-600 hover:bg-purple-700" : "bg-red-500 hover:bg-red-600"
            }`}>
            {submitting ? "Saving…" : `Confirm ${action === "Waived" ? "Waive" : "Void"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MARK PAID MODAL ─────────────────────────────────────────────────────
//
// Records a payment against a Confirmed penalty's remaining balance — for
// money collected outside the automatic deposit deduction at Return (e.g.
// staff took cash in store, or the customer paid online for an "owed by
// customer" negative-deposit balance). Wired to recordShortfallPayment(),
// which applies the amount across the customer's unpaid Confirmed
// penalties oldest-first — not just this one row — so a partial amount
// can end up settling an older penalty before this one if there's more
// than one outstanding.
const SHORTFALL_METHODS = ["InStore", "GCash", "Maya", "BankTransfer", "PayMongo"];

function MarkPaidModal({ penalty, onClose, onSubmit, submitting }) {
  const owed = (penalty.amount || 0) - (penalty.paidAmount || 0);
  const [amount, setAmount] = useState(String(owed));
  const [method, setMethod] = useState(SHORTFALL_METHODS[0]);
  const [referenceNumber, setReferenceNumber] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-arl-dark">Mark Paid</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX /></button>
        </div>
        <p className="text-xs text-gray-400">
          {penalty.customerName || "This customer"} still owes {peso(owed)} on this penalty.
          If they have other unpaid penalties too, payment applies to the oldest one first.
        </p>
        <div>
          <label className="text-xs font-semibold text-gray-500">Amount received</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light">
            {SHORTFALL_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Reference number (optional)</label>
          <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
            className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ amount: Number(amount), method, referenceNumber: referenceNumber.trim() })}
            disabled={submitting || !(Number(amount) > 0)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? "Recording…" : "Record Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// Lists every penalty in the system, and is also where staff draft new
// penalties and confirm/void/waive them — see CreatePenaltyModal /
// ReasonModal above. (This used to be read-only with a comment pointing
// staff at a per-booking panel in Bookings.jsx for those actions — no such
// panel exists there, so that flow had no UI anywhere. This page is now
// the one place that does it.)
export default function Penalties() {
  const token = localStorage.getItem("token");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [toast, setToast]     = useState(null);
  const [activeStatFilter, setActiveStatFilter] = useState(null); // null | "draft" | "unpaid" | "settled" | "voidedWaived"
  const [showCreate, setShowCreate] = useState(false);
  const [prefillBookingID, setPrefillBookingID] = useState(""); // set via ?bookingID= (Bookings.jsx's "Note a Penalty" button)
  const [busyId, setBusyId] = useState(null); // penaltyID currently being confirmed/voided/waived
  const [reasonModal, setReasonModal] = useState(null); // { penaltyID, action: "Voided" | "Waived" }
  const [markPaidModal, setMarkPaidModal] = useState(null); // the penalty record being paid off

  // Deep-link from Bookings.jsx's "Note a Penalty" button: opens the
  // create-draft modal straight away with the bookingID already filled in
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

  const toggleStatFilter = (key) => setActiveStatFilter((v) => (v === key ? null : key));

  const showToast = (msg, type = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleConfirm = async (penaltyID) => {
    setBusyId(penaltyID);
    try {
      const res = await fetch(`${API_URL}/api/penalties/${penaltyID}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to confirm penalty.");
      showToast("Penalty confirmed.", "success");
      fetchAll();
    } catch (e) {
      showToast(e.message || "Failed to confirm penalty.");
    } finally {
      setBusyId(null);
    }
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
      showToast(`Penalty ${action.toLowerCase()}.`, "success");
      setReasonModal(null);
      fetchAll();
    } catch (e) {
      showToast(e.message || `Failed to ${action.toLowerCase()} penalty.`);
    } finally {
      setBusyId(null);
    }
  };

  const submitMarkPaid = async ({ amount, method, referenceNumber }) => {
    const penaltyID = markPaidModal.id;
    setBusyId(penaltyID);
    try {
      const res = await fetch(`${API_URL}/api/penalties/shortfall-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userID: markPaidModal.userID, amount, method, referenceNumber }),
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
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to load penalties.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const draft        = records.filter(STAT_FILTERS.draft.predicate).length;
  const unpaid       = records.filter(STAT_FILTERS.unpaid.predicate).length;
  const settled      = records.filter(STAT_FILTERS.settled.predicate).length;
  const voidedWaived = records.filter(STAT_FILTERS.voidedWaived.predicate).length;

  // Matching rows float to the top when a stat card is active — nothing
  // is filtered out of the list, same interaction as Maintenance.jsx.
  const sorted = [...records].sort((a, b) => {
    if (activeStatFilter) {
      const pred = STAT_FILTERS[activeStatFilter].predicate;
      const aM = pred(a), bM = pred(b);
      if (aM !== bM) return aM ? -1 : 1;
    }
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

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(filtered, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, activeStatFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bookings.jsx doesn't yet auto-open a specific booking's panel from a
  // URL param — this gets staff to the right page with the bookingID
  // visible, but they still search/select it themselves once there.
  const viewBooking = (bookingID) => navigate(`/bookings?bookingID=${encodeURIComponent(bookingID)}`);

  return (
    <div className="w-full px-4 space-y-5">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium border ${
          toast.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {toast.msg}
        </div>
      )}

      {showCreate && (
        <CreatePenaltyModal
          token={token}
          initialBookingID={prefillBookingID}
          onClose={() => { setShowCreate(false); setPrefillBookingID(""); }}
          onCreated={() => { setShowCreate(false); setPrefillBookingID(""); showToast("Draft penalty created.", "success"); fetchAll(); }}
        />
      )}

      {reasonModal && (
        <ReasonModal
          action={reasonModal.action}
          submitting={busyId === reasonModal.penaltyID}
          onClose={() => setReasonModal(null)}
          onSubmit={submitVoidOrWaive}
        />
      )}

      {markPaidModal && (
        <MarkPaidModal
          penalty={markPaidModal}
          submitting={busyId === markPaidModal.id}
          onClose={() => setMarkPaidModal(null)}
          onSubmit={submitMarkPaid}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Penalties</h1>
          <p className="text-xs text-gray-400 mt-0.5">{loading ? "Loading…" : `${records.length} penalties`}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="text" placeholder="Search customer, plate, booking, type…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light w-64" />
          <button onClick={fetchAll} disabled={loading}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            ↺
          </button>
          <button onClick={() => setShowCreate(true)}
            className="px-3 py-2 text-sm rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 flex items-center gap-1.5">
            <IconPlus className="w-4 h-4" /> New Penalty
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={<IconClock className="w-5 h-5" />} value={draft} label="Draft" color="gray"
          onClick={() => toggleStatFilter("draft")} active={activeStatFilter === "draft"} />
        <StatCard icon={<IconAlertCircle className="w-5 h-5" />} value={unpaid} label="Unpaid" color="red"
          onClick={() => toggleStatFilter("unpaid")} active={activeStatFilter === "unpaid"} />
        <StatCard icon={<IconCheck className="w-5 h-5" />} value={settled} label="Settled" color="green"
          onClick={() => toggleStatFilter("settled")} active={activeStatFilter === "settled"} />
        <StatCard icon={<IconBan className="w-5 h-5" />} value={voidedWaived} label="Voided / Waived" color="purple"
          onClick={() => toggleStatFilter("voidedWaived")} active={activeStatFilter === "voidedWaived"} />
      </div>
      {activeStatFilter === "unpaid" && (
        <p className="text-xs text-gray-400 px-1 -mt-2">
          Unpaid includes both confirmed penalties still awaiting settlement, and settled penalties the deposit didn't fully cover.
        </p>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: "24%" }} /><col style={{ width: "16%" }} /><col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "8%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">Charges</th>
              <th className="px-4 py-3 text-left font-semibold">Customer</th>
              <th className="px-4 py-3 text-left font-semibold">Car</th>
              <th className="px-4 py-3 text-left font-semibold">Amount</th>
              <th className="px-4 py-3 text-left font-semibold">Paid</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-16 text-gray-400 text-sm">No penalties found.</td></tr>
            ) : paginated.map((p, i) => {
              const statMatch = activeStatFilter && STAT_FILTERS[activeStatFilter].predicate(p);
              const rowClass = statMatch ? "bg-red-50/40 ring-1 ring-inset ring-red-100" : i % 2 === 1 ? "bg-gray-50/20" : "";
              return (
                <tr key={p.id} className={`border-b border-gray-50 last:border-0 ${rowClass}`}>
                  <td className="px-4 py-3 text-xs text-gray-700 truncate" title={(p.lineItems || []).map((i) => `${i.description}: ${peso(i.amount)}`).join(", ")}>
                    {(p.lineItems || []).map((i) => i.description).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 truncate">{p.customerName || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 truncate">
                    {p.brandName !== "—" || p.modelName !== "—" ? `${p.brandName} ${p.modelName}` : "—"}
                    <div className="text-[10px] text-gray-400">{p.plateNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">{peso(p.amount)}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">{peso(p.paidAmount)}</td>
                  <td className="px-4 py-3"><SettlementBadge status={p.settlementStatus} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.status === "Draft" && (
                        <>
                          <button onClick={() => handleConfirm(p.id)} disabled={busyId === p.id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-40 font-medium">
                            {busyId === p.id ? "…" : "Confirm"}
                          </button>
                          <button onClick={() => setReasonModal({ penaltyID: p.id, action: "Voided" })} disabled={busyId === p.id}
                            className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 disabled:opacity-40 font-medium">
                            Void
                          </button>
                        </>
                      )}
                      {p.status === "Confirmed" && (
                        <>
                          {p.settlementStatus !== "Paid" && (
                            <button onClick={() => setMarkPaidModal(p)} disabled={busyId === p.id}
                              className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-40 font-medium">
                              Mark Paid
                            </button>
                          )}
                          <button onClick={() => setReasonModal({ penaltyID: p.id, action: "Waived" })} disabled={busyId === p.id}
                            className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 font-medium">
                            {busyId === p.id ? "…" : "Waive"}
                          </button>
                        </>
                      )}
                      {p.bookingID && (
                        <button onClick={() => viewBooking(p.bookingID)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors font-medium">
                          View
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>
    </div>
  );
}