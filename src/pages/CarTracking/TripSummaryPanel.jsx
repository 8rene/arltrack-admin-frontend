import { useState, useEffect } from "react";

const API = process.env.REACT_APP_API_URL;

function fmtDateTime(val) {
  if (!val) return "—";
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

function fmtMoney(n) {
  if (typeof n !== "number") return "—";
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;
}

const STATUS_STYLES = {
  ended:     "bg-teal-50 text-teal-700",
  stolen:    "bg-red-50 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  active:    "bg-blue-50 text-blue-700",
  completed: "bg-teal-50 text-teal-700",
  approved:  "bg-blue-50 text-blue-700",
  pending:   "bg-amber-50 text-amber-700",
};

/**
 * "Trip Summary" floating panel — History/Review's read-only counterpart to
 * BookingInfoPanel/TracebackBookingInfoPanel. Nothing here is editable: it's
 * a receipt for a trip that's already over (or a bare uploaded archive with
 * no live session behind it), so there's no geofence editing, no Pickup/
 * Return/Stolen actions — just what happened.
 *
 * There's no GET /api/bookings/:id endpoint yet, so this looks the booking
 * up client-side out of the existing GET /api/bookings list (per the plan:
 * "a dedicated get-by-id endpoint would be cleaner but isn't strictly
 * required to start"). If bookingID is missing entirely (legacy archive with
 * no session metadata) this just falls back to the trip label passed in.
 */
export default function TripSummaryPanel({ bookingID, carLabel, tripLabel, token, onClose }) {
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setBooking(null);
    setError(null);
    if (!bookingID || !API) return;
    setLoading(true);
    fetch(`${API}/api/bookings?status=all`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(json => {
        const list = json?.data || [];
        const match = list.find(b => b.bookingID === bookingID || b.id === bookingID);
        if (!match) {
          setError("This booking's original record couldn't be found (it may have since been archived or deleted).");
          return;
        }
        setBooking(match);
      })
      .catch(() => setError("Failed to load this trip's booking details."))
      .finally(() => setLoading(false));
  }, [bookingID, token]);

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 z-[1001] bg-white rounded-2xl border border-gray-100 shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="min-w-0">
          <p className="font-bold text-arl-dark text-sm truncate">{carLabel}</p>
          <p className="text-[11px] text-gray-400">Trip Summary</p>
        </div>
        <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50">✕</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-2">
        {tripLabel && (
          <p className="text-[11px] text-gray-400 px-1">{tripLabel}</p>
        )}

        {!bookingID ? (
          <p className="text-xs text-gray-400 italic px-1">
            No booking is linked to this archive — it was likely uploaded from a bare GPS file with no session metadata.
          </p>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-red-500 px-1">{error}</p>
        ) : booking ? (
          <>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-700 truncate">{booking.customerName || "—"}</p>
                {booking.status && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[booking.status] || "bg-gray-100 text-gray-500"}`}>
                    {booking.status}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Booking ID: {booking.bookingID || bookingID}</p>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-500">Pickup</p>
              <p className="text-xs text-gray-700">{fmtDateTime(booking.startDateTime)}</p>
              <p className="text-[11px] font-semibold text-gray-500 pt-1">Return</p>
              <p className="text-xs text-gray-700">{fmtDateTime(booking.endDateTime)}</p>
              {booking.location && (
                <>
                  <p className="text-[11px] font-semibold text-gray-500 pt-1">Location</p>
                  <p className="text-xs text-gray-700">{booking.location}</p>
                </>
              )}
            </div>

            {(booking.totalFee || booking.rentalFee) && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Rental fee</span>
                  <span className="text-gray-700 font-mono">{fmtMoney(booking.rentalFee)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Deposit</span>
                  <span className="text-gray-700 font-mono">{fmtMoney(booking.depositFee)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Service fee</span>
                  <span className="text-gray-700 font-mono">{fmtMoney(booking.serviceFee)}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100 font-semibold">
                  <span className="text-gray-600">Total</span>
                  <span className="text-gray-800 font-mono">{fmtMoney(booking.totalFee)}</span>
                </div>
              </div>
            )}

            {booking.notesAdmin && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-amber-700 mb-0.5">Admin notes</p>
                <p className="text-xs text-amber-700 opacity-90">{booking.notesAdmin}</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}