const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const fmtDateTimeLong = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const IconMap = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path strokeLinecap="round" d="M9 4v14M15 6v14" />
  </svg>
);

const IconArrowRight = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function Row({ label, value, bold, color }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? "font-bold" : "font-semibold"} ${color || "text-arl-dark"}`}>{value}</span>
    </div>
  );
}

// Read-only Good/Has Damage summary for one side (before or after) of the
// vehicle condition check — no edit controls, matches what VehicleDocs.jsx
// records but never lets this screen touch it.
function ConditionSummary({ title, snapshot }) {
  if (!snapshot) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-500">{title}</p>
        <p className="text-xs text-gray-400 mt-1">Not recorded yet.</p>
      </div>
    );
  }
  const hasDamage = snapshot.overallStatus === "has damage" || (snapshot.damageParts || []).length > 0;
  return (
    <div className={`rounded-xl border p-3 space-y-1.5 ${hasDamage ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600">{title}</p>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${hasDamage ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
          {hasDamage ? "Has Damage" : "Good"}
        </span>
      </div>
      {hasDamage && (
        <ul className="text-xs text-red-700 space-y-0.5 pl-1">
          {(snapshot.damageParts || []).map((p, i) => (
            <li key={p.carPartID || i}>• {p.carPartName || "Unnamed part"}{p.status ? ` — ${p.status}` : ""}</li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-gray-400">{fmtDateTimeLong(snapshot.recordedAt)}</p>
    </div>
  );
}

/**
 * Read-only "View" modal for a completed trip in My Trips' History tab —
 * consolidates what used to be a bare "Show Map" button into one place:
 * who booked it and when, the payment breakdown (including mode of
 * payment, now that confirm/collect capture it), the before/after vehicle
 * condition snapshot, a link to the full inspection history, and Show Map
 * at the bottom. Nothing here is editable — corrections happen on Vehicle
 * Documentation (staff) or Payments (staff), not from this screen.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {object} trip - shaped trip object from /my-trips/history
 * @param {() => void} onShowMap - opens TripMapModal for this trip
 * @param {() => void} [onViewHistory] - navigates to Vehicle Documentation, deep-linked + scrolled to this booking's row. Omitted if the trip has no carID to link to.
 */
export default function TripDetailModal({ open, onClose, trip, onShowMap, onViewHistory }) {
  if (!open || !trip) return null;

  const p = trip.payment || {};
  const hasStops = !!(trip.pickupLocation || trip.dropoffLocation);
  const inv = trip.inventory || { before: null, after: null };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-arl-dark text-base">Booking Details</h2>
            {trip.customerName && <p className="text-sm text-gray-400">{trip.customerName}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <IconX />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Booking info — who booked it and when, distinct from the trip's
              own start/end dates. */}
          <div className="space-y-2.5 bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Booking Info</p>
            <Row label="Booked by" value={trip.customerName || "—"} />
            <Row label="Phone" value={trip.customerPhone || "—"} />
            <Row label="Booked on" value={fmtDateTimeLong(trip.bookingCreatedAt)} />
            <div className="h-px bg-gray-200" />
            <Row label="Trip dates" value={`${fmtDateTimeLong(trip.startDateTime)} → ${fmtDateTimeLong(trip.endDateTime)}`} />
            <Row label="Vehicle" value={trip.vehicleName || "—"} />
          </div>

          {/* Payment breakdown — same numbers as PaymentStatusModal, plus
              the mode of payment, read-only (no confirm/collect actions
              here; this trip has already completed). */}
          <div className="space-y-2.5 bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Payment</p>
            <Row label="Total Fee" value={peso(p.totalFee)} />
            {p.discountAmount > 0 && <Row label="Discount" value={`−${peso(p.discountAmount)}`} color="text-red-500" />}
            <Row label="Amount Paid" value={peso(p.amountPaid)} />
            <Row label="Balance" value={p.balance > 0 ? peso(p.balance) : "Fully Paid"} color={p.balance > 0 ? "text-amber-600" : "text-green-600"} bold />
            <div className="h-px bg-gray-200" />
            <Row label="Mode of Payment" value={p.paymentMethod || "—"} />
            <Row label="Status" value={p.paymentStatus || "—"} />
          </div>

          {/* Vehicle condition — read-only Good/Has Damage snapshot for
              before and after; no edit controls anywhere on this screen. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehicle Condition</p>
              {onViewHistory && (
                <button
                  onClick={onViewHistory}
                  className="flex items-center gap-1 text-xs font-semibold text-arl-dark hover:underline"
                >
                  View Full Inspection <IconArrowRight />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ConditionSummary title="Before Trip" snapshot={inv.before} />
              <ConditionSummary title="After Trip" snapshot={inv.after} />
            </div>
          </div>

          {hasStops && (
            <button
              onClick={onShowMap}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active:scale-[0.99] transition-all"
            >
              <IconMap /> Show Map
            </button>
          )}
        </div>
      </div>
    </div>
  );
}