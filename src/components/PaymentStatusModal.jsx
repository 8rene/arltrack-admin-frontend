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

/**
 * "How much is paid / how much is still owed" breakdown, with optional
 * "Confirm Payment Received" and "Mark Balance Received" actions for
 * confirming cash/in-person payments on the spot — same shape everywhere
 * it's used: Car Tracking, and the driver's My Trips — all backed by the
 * same computeAmounts() logic on the server, so the numbers can never
 * drift between screens. PayMongo (GCash/Maya/QRPH) payments never need
 * either button — the customer-side webhook already confirms those the
 * moment they settle, so paymentStatus arrives here already
 * approved/paid.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} customerName
 * @param {{ totalFee: number, amountPaid: number, balance: number, payType: string, paymentStatus: string }} payment
 * @param {() => void} [onConfirmPayment] - confirm a cash initial payment as received, right here. Omit to hide the button (e.g. read-only views).
 * @param {boolean} [confirming] - shows a busy state on the confirm button while the request is in flight
 * @param {string} [confirmError] - shown under the confirm button if the last attempt failed
 * @param {() => void} [onCollectBalance] - omit to hide the button entirely (read-only view)
 * @param {boolean} [collecting] - shows a busy state on the button while the request is in flight
 * @param {string} [collectError] - shown under the button if the last attempt failed
 * @param {() => void} [onGoToPayments] - fallback link shown only if onConfirmPayment isn't provided. Omit for roles that can't reach the Payments page (e.g. drivers).
 * @param {string} [pendingApprovalNote] - override the default "must be approved" wording, used only in the onGoToPayments fallback case
 */
export default function PaymentStatusModal({
  open, onClose, customerName, payment,
  onConfirmPayment, confirming, confirmError,
  onCollectBalance, collecting, collectError,
  onGoToPayments, pendingApprovalNote,
}) {
  if (!open) return null;

  const p = payment || { totalFee: 0, amountPaid: 0, balance: 0, payType: "—", paymentStatus: "—" };
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

  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-arl-dark text-sm">Payment Status</h2>
            {customerName && <p className="text-xs text-gray-400">{customerName}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <IconX />
          </button>
        </div>

        <div className="p-5 space-y-4">
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
        </div>
      </div>
    </div>
  );
}