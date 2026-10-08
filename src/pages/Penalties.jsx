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
// There's no Draft stat anymore — every penalty is confirmed the moment
// it's created (see CreatePenaltyModal), so "pending" already covers both
// "confirmed but the booking hasn't been settled yet" and "settled but
// the deposit didn't fully cover it" — settleBooking() sets paidAmount
// below amount whenever the deposit runs out partway through a penalty,
// so a single paidAmount < amount check catches both cases without
// needing to look at the payment's own deposit.settlement.status.
const STAT_FILTERS = {
  pending:       { predicate: (p) => p.status === "Confirmed" && (p.paidAmount || 0) < (p.amount || 0) },
  settled:       { predicate: (p) => p.status === "Confirmed" && (p.paidAmount || 0) >= (p.amount || 0) },
  voidedWaived:  { predicate: (p) => p.status === "Voided" || p.status === "Waived" },
};

// Badge for the computed `settlementStatus` field (Pending / Partially
// Paid / Paid / Voided / Waived) — this is what every row displays now.
// The raw lifecycle status (Confirmed/Voided/Waived) still drives which
// action buttons show (see the Actions column below), it's just not
// shown as its own badge.
const SETTLEMENT_BADGE = {
  Pending:          "bg-red-50 text-red-600 border border-red-200",
  "Partially Paid": "bg-amber-50 text-amber-700 border border-amber-200",
  Paid:             "bg-green-50 text-green-700 border border-green-200",
  Voided:           "bg-gray-100 text-gray-500 border border-gray-200",
  Waived:           "bg-purple-50 text-purple-600 border border-purple-200",
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

  const computedTotal = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);

  const updateLineItem = (i, field, value) =>
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, [field]: value } : li)));
  const addLineItem = () => setLineItems((items) => [...items, { description: "", amount: "" }]);
  const removeLineItem = (i) => setLineItems((items) => items.filter((_, idx) => idx !== i));

  // Look the booking up as soon as there's an ID (right away when linked from
  // Booking Details, shortly after typing otherwise) — this is what feeds the
  // end time / drop-off / suggestion panel below. A failed lookup just hides it.
  useEffect(() => {
    const id = bookingID.trim();
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
            <p className="text-xs text-teal-600 mt-1">Linked from Booking Details — this penalty will be tied to booking {bookingID}.</p>
          )}
          <div className="mt-2">
            <LateFeeSuggestion info={preview} loading={previewLoading} />
          </div>
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
          placeholder={action === "Waived" ? "Reason for waiving (shown to customer via notification)" : "Reason for voiding (the customer will be notified it was removed)"}
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
// In-person only: nothing in the customer app pays a penalty online, so there is no PayMongo option here.
const SHORTFALL_METHODS = ["InStore", "GCash", "Maya", "BankTransfer"];

function MarkPaidModal({ penalty, maxAmount = 0, onClose, onSubmit, submitting }) {
  const owed = Math.max(0, (penalty.amount || 0) - (penalty.paidAmount || 0));
  // The most that can be recorded: everything this customer still owes in
  // penalties (this one is paid first, the rest spills onto their others).
  // Typing is clamped to it and the button is disabled above it; the server
  // rejects anything higher too (recordShortfallPayment), so nothing typed
  // here can ever exceed what is actually needed.
  const limit = Math.max(owed, maxAmount || 0);
  // Deliberately NOT pre-filled with the full owed amount. This form
  // records what staff actually took from the customer — if it defaulted
  // to the full balance, clicking Record Payment without looking would
  // silently mark the whole thing Paid even on a partial in-store
  // payment. Left blank (with the owed amount only shown as a
  // placeholder/hint) so staff always has to consciously enter or
  // confirm the real amount received; "Full amount" below is a shortcut
  // for the common case, not a default.
  const [amount, setAmount] = useState("");
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
            disabled={submitting || !(Number(amount) > 0) || Number(amount) > limit}
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

function PenaltyDetailsModal({ penalty: p, onClose, onViewBooking }) {
  const fmtDate = (v) => {
    const d = toDate(v);
    return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  };
  const owed = (p.amount || 0) - (p.paidAmount || 0);
  const isLateFee = p.lateMinutes !== null && p.lateMinutes !== undefined;
  const isOverridden = p.amount !== p.computedAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-arl-dark">Penalty Details</h3>
            <p className="text-xs text-gray-400">Booking {p.bookingID || "—"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX /></button>
        </div>

        <div className="flex items-center gap-2">
          <SettlementBadge status={p.settlementStatus} />
          <span className="text-[11px] text-gray-400">Lifecycle: {p.status}</span>
        </div>

        {/* Charges */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">Charges</p>
          <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
            {(p.lineItems || []).map((li, i) => (
              <div key={i} className="flex justify-between px-3 py-2 text-xs">
                <span className="text-gray-600">{li.description}</span>
                <span className="text-gray-700 font-medium">{peso(li.amount)}</span>
              </div>
            ))}
          </div>
          {isLateFee && (
            <p className="text-[11px] text-gray-400 mt-1.5">
              Late fee: {p.lateMinutes} min late (after {p.graceMinutes}-min grace) at ₱{p.rateAtCreation}/hr.
            </p>
          )}
        </div>

        {/* Amount + payment status */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-0.5">
          <DetailRow label="Computed total" value={peso(p.computedAmount)} />
          <DetailRow label="Amount charged" value={peso(p.amount)} />
          {isOverridden && <DetailRow label="Override reason" value={p.overrideReason || "—"} />}
          <DetailRow label="Paid so far" value={peso(p.paidAmount)} />
          {owed > 0 && p.status === "Confirmed" && (
            <DetailRow label="Still owed" value={<span className="text-red-600 font-semibold">{peso(owed)}</span>} />
          )}
          <DetailRow label="Payment method" value={p.paymentMethod || null} />
          <DetailRow label="Reference #" value={p.referenceNumber || null} />
          <DetailRow label="Paid at" value={fmtDate(p.paidAt)} />
        </div>

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
          <DetailRow label="Created" value={fmtDate(p.createdAt)} />
          <DetailRow label="Confirmed" value={fmtDate(p.confirmedAt)} />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
            Close
          </button>
          {p.bookingID && (
            <button onClick={onViewBooking}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700">
              View Booking →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// Lists every penalty in the system, and is also where staff create new
// penalties (auto-confirmed and notified on submit) and void/waive them —
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
  const [activeStatFilter, setActiveStatFilter] = useState(null); // null | "pending" | "settled" | "voidedWaived"
  const [showCreate, setShowCreate] = useState(false);
  const [prefillBookingID, setPrefillBookingID] = useState(""); // set via ?bookingID= (Bookings.jsx's "Note a Penalty" button)
  const [busyId, setBusyId] = useState(null); // penaltyID currently being confirmed/voided/waived
  const [reasonModal, setReasonModal] = useState(null); // { penaltyID, action: "Voided" | "Waived" }
  const [markPaidModal, setMarkPaidModal] = useState(null); // the penalty record being paid off
  const [detailsModal, setDetailsModal] = useState(null); // the penalty record being viewed in detail

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

  const toggleStatFilter = (key) => setActiveStatFilter((v) => (v === key ? null : key));

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
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to load penalties.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const pending      = records.filter(STAT_FILTERS.pending.predicate).length;
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
          onCreated={() => { setShowCreate(false); setPrefillBookingID(""); showToast("Penalty created — customer notified.", "success"); fetchAll(); }}
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
          onClose={() => setDetailsModal(null)}
          onViewBooking={() => { setDetailsModal(null); viewBooking(detailsModal.bookingID); }}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard icon={<IconAlertCircle className="w-5 h-5" />} value={pending} label="Pending" color="red"
          onClick={() => toggleStatFilter("pending")} active={activeStatFilter === "pending"} />
        <StatCard icon={<IconCheck className="w-5 h-5" />} value={settled} label="Settled" color="green"
          onClick={() => toggleStatFilter("settled")} active={activeStatFilter === "settled"} />
        <StatCard icon={<IconBan className="w-5 h-5" />} value={voidedWaived} label="Voided / Waived" color="purple"
          onClick={() => toggleStatFilter("voidedWaived")} active={activeStatFilter === "voidedWaived"} />
      </div>
      {activeStatFilter === "pending" && (
        <p className="text-xs text-gray-400 px-1 -mt-2">
          Pending includes both confirmed penalties still awaiting settlement, and settled penalties the deposit didn't fully cover.
        </p>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: "8%" }} /><col style={{ width: "6%" }} /><col style={{ width: "16%" }} />
            <col style={{ width: "11%" }} /><col style={{ width: "11%" }} /><col style={{ width: "11%" }} />
            <col style={{ width: "7%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">Date</th>
              <th className="px-4 py-3 text-left font-semibold">Time</th>
              <th className="px-4 py-3 text-left font-semibold">Charges</th>
              <th className="px-4 py-3 text-left font-semibold">Booking ID</th>
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
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-16 text-gray-400 text-sm">No penalties found.</td></tr>
            ) : paginated.map((p, i) => {
              const statMatch = activeStatFilter && STAT_FILTERS[activeStatFilter].predicate(p);
              const rowClass = statMatch ? "bg-red-50/40 ring-1 ring-inset ring-red-100" : i % 2 === 1 ? "bg-gray-50/20" : "";
              return (
                <tr key={p.id} className={`border-b border-gray-50 last:border-0 ${rowClass}`}>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {toDate(p.createdAt)?.toLocaleDateString(undefined, { dateStyle: "medium" }) || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {toDate(p.createdAt)?.toLocaleTimeString(undefined, { timeStyle: "short" }) || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 truncate" title={(p.lineItems || []).map((i) => `${i.description}: ${peso(i.amount)}`).join(", ")}>
                    {(p.lineItems || []).map((i) => i.description).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono truncate" title={p.bookingID || ""}>
                    {p.bookingID || "—"}
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
                      {p.status === "Confirmed" && (
                        <>
                          {p.settlementStatus !== "Paid" && (
                            <button onClick={() => setMarkPaidModal(p)} disabled={busyId === p.id}
                              className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-40 font-medium">
                              Mark Paid
                            </button>
                          )}
                          {/* Void/Waive both refuse once anything's been paid against a
                              penalty (see voidOrWaivePenalty) — once partially or fully
                              paid, only Mark Paid stays available; reversing money needs
                              its own flow, not a status flip. */}
                          {!(p.paidAmount > 0) && (
                            <>
                              <button onClick={() => setReasonModal({ penaltyID: p.id, action: "Waived" })} disabled={busyId === p.id}
                                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 font-medium">
                                {busyId === p.id ? "…" : "Waive"}
                              </button>
                              <button onClick={() => setReasonModal({ penaltyID: p.id, action: "Voided" })} disabled={busyId === p.id}
                                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 disabled:opacity-40 font-medium">
                                {busyId === p.id ? "…" : "Void"}
                              </button>
                            </>
                          )}
                        </>
                      )}
                      <button onClick={() => setDetailsModal(p)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors font-medium">
                        View
                      </button>
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