import PaymentEntriesPanel from "./shared/PaymentEntriesPanel";

const STATUS_STYLE = {
  approved: "bg-green-50 text-green-700 border border-green-200",
  paid:     "bg-green-50 text-green-700 border border-green-200",
  completed:"bg-green-50 text-green-700 border border-green-200",
  partial:  "bg-orange-50 text-orange-700 border border-orange-200",
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
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.59 13.41L11 3.83A2 2 0 009.58 3.24H4a1 1 0 00-1 1v5.58a2 2 0 00.59 1.42l9.58 9.58a2 2 0 002.83 0l4.59-4.59a2 2 0 000-2.83z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * Read-only "how much is paid / how much is still owed" view, used on Car Tracking and the driver's My Trips.
 *
 * It only SHOWS information. Nothing is settled here any more: every payment goes through PayMongo,
 * and the few things staff do by hand (remind the customer, record an in-store payment, give the one-time
 * discount, receive a penalty) all live on the Payments and Penalties pages. This screen just points there.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} customerName
 * @param {{ totalFee: number, amountPaid: number, balance: number, payType: string, paymentStatus: string, paymentStage?: string, discountAmount?: number, refundDue?: number, depositAmount?: number, depositStatus?: string, confirmedPenaltyTotal?: number, amountToReturn?: number, depositSettled?: boolean }} payment
 * @param {() => void} [onGoToPayments]  opens this booking on the Payments page. Omit for roles that can't reach it (drivers).
 * @param {() => void} [onGoToPenalties] opens the Penalties page for this booking. Omit for drivers.
 * @param {() => void} [onNotePenalty]   records a penalty against the trip (the return checklist); recording one is not the same as paying it.
 * @param {() => void} [onReturnDeposit] opens the return checklist where the security deposit is settled.
 * @param {string} [bookingID]           staff screens pass this to list every money movement; the driver screen leaves it out.
 */
export default function PaymentStatusModal({
  open, onClose, customerName, payment, bookingID,
  onGoToPayments, onGoToPenalties, onNotePenalty, onReturnDeposit,
}) {
  const p = payment || { totalFee: 0, amountPaid: 0, balance: 0, payType: "—", paymentStatus: "—", discountAmount: 0, refundDue: 0, depositAmount: 0, depositStatus: "—", confirmedPenaltyTotal: 0, amountToReturn: 0, depositSettled: false };

  if (!open) return null;

  const isFullyPaid = p.balance <= 0 && p.totalFee > 0;
  const statusKey = (p.paymentStatus || "").toLowerCase();
  const isConfirmed = statusKey === "approved" || statusKey === "paid";
  // Orange = the first payment is in but part of the fee is still owed.
  const stage = p.paymentStage && p.paymentStage !== "—" ? p.paymentStage : p.paymentStatus;
  const stageKey = String(stage || "").toLowerCase();

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
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[stageKey] || "bg-gray-50 text-gray-500 border border-gray-200"}`}>
              {stage}
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
              <span className={`font-bold ${isFullyPaid ? "text-green-600" : "text-orange-600"}`}>
                {isFullyPaid ? "Fully Paid" : peso(p.balance)}
              </span>
            </div>
          </div>

          {/* What to do about it -- always "go to Payments", never settled here. */}
          {!isFullyPaid && p.totalFee > 0 && (
            <p className="text-xs text-gray-500">
              {isConfirmed
                ? `The remaining ${peso(p.balance)} is paid online through PayMongo from the customer's booking. To remind the customer, or to record an in-store payment, use the Payments page.`
                : "The first payment hasn't come in yet. It is marked as paid automatically when the customer pays through PayMongo."}
            </p>
          )}

          {p.refundDue > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-red-700 flex items-center gap-1.5">
                  <IconTag className="w-3.5 h-3.5" /> Refund Due to Customer
                </span>
                <span className="font-bold text-red-700">{peso(p.refundDue)}</span>
              </div>
              <p className="text-xs text-red-600">
                This was paid in store, so it is returned in store. A Supervisor, Admin or Owner records it on the Payments page.
              </p>
            </div>
          )}

          {/* Security deposit vs. confirmed penalties — the same math settleBooking() runs at Return,
              shown as a live preview. */}
          {p.depositStatus && p.depositStatus !== "—" && (
            <div className="space-y-2.5 bg-blue-50/60 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Security Deposit <span className="text-[11px] text-gray-400">({p.depositStatus})</span></span>
                <span className="font-semibold text-arl-dark">{peso(p.depositAmount)}</span>
              </div>
              {p.confirmedPenaltyTotal > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Confirmed Penalties (unpaid)</span>
                  <span className="font-semibold text-red-500">−{peso(p.confirmedPenaltyTotal)}</span>
                </div>
              )}
              <div className="h-px bg-blue-200" />
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-arl-dark">
                  {p.amountToReturn < 0 ? "Owed by Customer" : "Return to Customer"}
                </span>
                <span className={`font-bold ${p.amountToReturn < 0 ? "text-red-600" : "text-blue-700"}`}>
                  {peso(Math.abs(p.amountToReturn))}
                </span>
              </div>
              {onNotePenalty && !p.depositSettled && (
                <button
                  onClick={onNotePenalty}
                  className="w-full py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-all"
                >
                  + Note a penalty
                </button>
              )}
              {onReturnDeposit && p.depositStatus === "Held" && !p.depositSettled && (
                <button
                  onClick={onReturnDeposit}
                  className="w-full py-2 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.99] transition-all"
                >
                  {p.amountToReturn > 0 ? `Return ${peso(p.amountToReturn)} deposit` : "Settle deposit"}
                </button>
              )}
              {p.depositSettled && (
                <p className="text-xs font-medium text-green-600">✓ Deposit settled</p>
              )}
            </div>
          )}

          {/* The only way forward: the pages where payments and penalties are actually handled. */}
          {(onGoToPayments || onGoToPenalties) ? (
            <div className="flex flex-wrap gap-2">
              {onGoToPayments && (
                <button
                  onClick={onGoToPayments}
                  className="flex-1 min-w-[9rem] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition"
                >
                  Open in Payments <IconArrowRight />
                </button>
              )}
              {onGoToPenalties && (
                <button
                  onClick={onGoToPenalties}
                  className="flex-1 min-w-[9rem] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                >
                  Open in Penalties <IconArrowRight />
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">
              Payments are made online through PayMongo. Anything paid at the store is recorded by a Supervisor, Admin or Owner.
            </p>
          )}

          {bookingID && (
            <div className="pt-3 border-t border-gray-100">
              <PaymentEntriesPanel
                key={`${bookingID}-${p.paymentStatus}-${p.amountPaid}-${p.refundIssued}`}
                query={{ bookingID }}
                title="Money movements"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
