import { useState, useEffect } from "react";

const STATUS_STYLE = {
  approved: "bg-green-50 text-green-700 border border-green-200",
  paid:     "bg-green-50 text-green-700 border border-green-200",
  pending:  "bg-amber-50 text-amber-700 border border-amber-200",
  rejected: "bg-red-50 text-red-600 border border-red-200",
  cancelled:"bg-gray-100 text-gray-500 border border-gray-200",
};

const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const IconArrowRight = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const IconTag = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.59 13.41L11 3.83A2 2 0 009.58 3.24H4a1 1 0 00-1 1v5.58a2 2 0 00.59 1.42l9.58 9.58a2 2 0 002.83 0l4.59-4.59a2 2 0 000-2.82z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * "How much is paid / how much is still owed" breakdown, with optional
 * "Confirm Payment Received", "Mark Balance Received", and "Apply
 * Discount" actions — same shape everywhere it's used: Car Tracking, and
 * the driver's My Trips — all backed by the same computeAmounts() logic
 * on the server, so the numbers can never drift between screens. PayMongo
 * (GCash/Maya/QRPH) payments never need the confirm/collect buttons — the
 * customer-side webhook already confirms those the moment they settle, so
 * paymentStatus arrives here already approved/paid.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} customerName
 * @param {{ totalFee: number, amountPaid: number, balance: number, payType: string, paymentStatus: string, discountAmount?: number }} payment
 * @param {() => void} [onConfirmPayment] - confirm a cash initial payment as received, right here. Omit to hide the button (e.g. read-only views).
 * @param {boolean} [confirming] - shows a busy state on the confirm button while the request is in flight
 * @param {string} [confirmError] - shown under the confirm button if the last attempt failed
 * @param {() => void} [onCollectBalance] - omit to hide the button entirely (read-only view)
 * @param {boolean} [collecting] - shows a busy state on the button while the request is in flight
 * @param {string} [collectError] - shown under the button if the last attempt failed
 * @param {(amount: number, reason: string) => void} [onApplyDiscount] - staff-only. Omit entirely for driver-facing screens (My Trips) — they can see payment.discountAmount reflected in the breakdown, but never get the control to set it.
 * @param {boolean} [applyingDiscount] - shows a busy state on the discount button while the request is in flight
 * @param {string} [discountError] - shown under the discount control if the last attempt failed
 * @param {() => void} [onGoToPayments] - fallback link shown only if onConfirmPayment isn't provided. Omit for roles that can't reach the Payments page (e.g. drivers).
 * @param {string} [pendingApprovalNote] - override the default "must be approved" wording, used only in the onGoToPayments fallback case
 */
export default function PaymentStatusModal({
  open, onClose, customerName, payment,
  onConfirmPayment, confirming, confirmError,
  onCollectBalance, collecting, collectError,
  onApplyDiscount, applyingDiscount, discountError,
  onGoToPayments, pendingApprovalNote,
}) {
  const p = payment || { totalFee: 0, amountPaid: 0, balance: 0, payType: "—", paymentStatus: "—", discountAmount: 0 };

  // Pre-fill with whatever discount is already on the booking — the field
  // sets the total discount, not an incremental add-on-top, so editing it
  // needs to start from the current value rather than blank.
  const [discountInput, setDiscountInput] = useState("");
  const [reasonInput, setReasonInput]     = useState("");
  useEffect(() => {
    if (open) {
      setDiscountInput(p.discountAmount ? String(p.discountAmount) : "");
      setReasonInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p.discountAmount]);

  if (!open) return null;

  const isFullyPaid = p.balance <= 0 && p.totalFee > 0;
  const statusKey = (p.paymentStatus || "").toLowerCase();
  const isConfirmed = statusKey === "approved" || statusKey === "paid";
  // Collecting cash before/at pickup only makes sense once the initial
  // portion is actually confirmed — mirrors the same gate the backend
  // enforces in collectRemainingBalance().
  const canCollect = !!onCollectBalance && !isFullyPaid && p.totalFee > 0 && isConfirmed;
  const needsApprovalFirst = !isFullyPaid && p.totalFee > 0 && !isConfirmed;
  // Cash/in-person initial payment waiting to be confirmed — offer the
  // button right here instead of sending anyone to the Payments page.
  const canConfirm = !!onConfirmPayment && needsApprovalFirst && statusKey !== "rejected" && statusKey !== "cancelled";

  const handleDiscountSubmit = () => {
    const amount = Number(discountInput);
    if (!Number.isFinite(amount) || amount < 0) return;
    onApplyDiscount(amount, reasonInput.trim());
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-arl-dark text-base">Payment Status</h2>
            {customerName && <p className="text-sm text-gray-400">{customerName}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <IconX />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{p.payType}</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[statusKey] || "bg-gray-50 text-gray-500 border border-gray-200"}`}>
              {p.paymentStatus}
            </span>
          </div>

          <div className="space-y-2.5 bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Total Fee</span>
              <span className="font-semibold text-arl-dark">{peso(p.totalFee)}</span>
            </div>
            {p.discountAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1"><IconTag className="w-3.5 h-3.5 text-red-400" /> Discount</span>
                <span className="font-semibold text-red-500">−{peso(p.discountAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Already Paid</span>
              <span className="font-semibold text-green-600">{peso(p.amountPaid)}</span>
            </div>
            <div className="h-px bg-gray-200" />
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-arl-dark">Remaining Balance</span>
              <span className={`font-bold ${isFullyPaid ? "text-green-600" : "text-amber-600"}`}>
                {isFullyPaid ? "Fully Paid" : peso(p.balance)}
              </span>
            </div>
          </div>

          {!isFullyPaid && p.totalFee > 0 && (
            <p className="text-xs text-gray-400">
              Collect the remaining {peso(p.balance)} before or upon completion of the trip, per your team's policy.
            </p>
          )}

          {canCollect && (
            <>
              <button
                onClick={onCollectBalance}
                disabled={collecting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {collecting ? "Marking as paid…" : `Mark ${peso(p.balance)} as Received`}
              </button>
              {collectError && <p className="text-xs text-red-500">{collectError}</p>}
            </>
          )}

          {canConfirm && (
            <>
              <button
                onClick={onConfirmPayment}
                disabled={confirming}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-arl-dark text-white hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {confirming ? "Confirming…" : `Confirm Payment Received`}
              </button>
              {confirmError && <p className="text-xs text-red-500">{confirmError}</p>}
            </>
          )}

          {!canConfirm && !!onCollectBalance && needsApprovalFirst && (
            <div className="space-y-1.5">
              <p className="text-xs text-amber-600">{pendingApprovalNote || "The initial payment must be approved on the Payments page before the remaining balance can be collected."}</p>
              {onGoToPayments && (
                <button
                  onClick={onGoToPayments}
                  className="flex items-center gap-1 text-xs font-semibold text-arl-dark hover:underline"
                >
                  Go to Payments page <IconArrowRight />
                </button>
              )}
            </div>
          )}

          {/* Staff-only — never passed in for drivers (My Trips), who see
              discountAmount reflected above but can't set it themselves. */}
          {onApplyDiscount && (
            <div className="border-t border-gray-100 pt-4 space-y-2.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <IconTag /> {p.discountAmount > 0 ? "Edit Discount" : "Apply Discount"}
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                  <input
                    type="number" min="0" step="1" placeholder="0"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-arl-light"
                  />
                </div>
                <input
                  type="text" placeholder="Reason (optional)"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="flex-[1.3] px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-arl-light"
                />
              </div>
              <button
                onClick={handleDiscountSubmit}
                disabled={applyingDiscount || discountInput === ""}
                className="w-full py-2 rounded-xl text-sm font-semibold border border-arl-dark text-arl-dark hover:bg-arl-light/30 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {applyingDiscount ? "Applying…" : "Apply Discount"}
              </button>
              {discountError && <p className="text-xs text-red-500">{discountError}</p>}
              <p className="text-[11px] text-gray-400">Sets the total discount on this booking — entering a new amount replaces the old one, it doesn't add to it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}