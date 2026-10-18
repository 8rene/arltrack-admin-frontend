import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

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

function toMs(val) {
  if (!val) return null;
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    const t = d.getTime();
    return isNaN(t) ? null : t;
  } catch { return null; }
}

// "1h 20m" / "35m" / "2d 3h"
function fmtSpan(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
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
export default function TripSummaryPanel({
  bookingID, carLabel, tripLabel, token, onClose,
  droppedOffAt = null, completedAt = null, geofenceAlertCount = 0, codingAlertCount = 0,
}) {
  const navigate = useNavigate();
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

            {/* What actually happened on the trip (money lives on Payments / Penalties, not here). */}
            {(() => {
              const dropMs = toMs(droppedOffAt || booking.droppedOffTime);
              const doneMs = toMs(completedAt || booking.completedAt);
              const endMs  = toMs(booking.endDateTime);
              const backMs = doneMs ?? dropMs;
              const lateMs = backMs != null && endMs != null ? backMs - endMs : null;
              return (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-1.5">
                  <p className="text-[11px] font-semibold text-gray-500">Dropped off</p>
                  <p className="text-xs text-gray-700">{fmtDateTime(droppedOffAt || booking.droppedOffTime)}</p>
                  <p className="text-[11px] font-semibold text-gray-500 pt-1">Completed</p>
                  <p className="text-xs text-gray-700">{fmtDateTime(completedAt || booking.completedAt)}</p>
                  {lateMs != null && (
                    <p className={`text-xs font-semibold pt-1 ${lateMs > 60000 ? "text-red-600" : "text-green-700"}`}>
                      {lateMs > 60000 ? `Returned ${fmtSpan(lateMs)} late` : "Returned on time"}
                    </p>
                  )}
                  <div className="flex gap-1.5 flex-wrap pt-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${geofenceAlertCount ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                      {geofenceAlertCount} geofence alert{geofenceAlertCount === 1 ? "" : "s"}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${codingAlertCount ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                      {codingAlertCount} coding alert{codingAlertCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              );
            })()}

            {booking.driverName && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-500">Driver</p>
                <p className="text-xs text-gray-700">{booking.driverName}</p>
              </div>
            )}

            {booking.deposit?.status === "Held" && !booking.depositSettled && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-amber-700">Security deposit still held</p>
                <p className="text-[11px] text-amber-700 opacity-90">Return it from Payments.</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-1.5 pt-1">
              {(() => {
                const key = encodeURIComponent(booking.bookingID || bookingID);
                const btn = "w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 text-left";
                return (
                  <>
                    <button className={btn} onClick={() => navigate(`/bookings?open=${key}`)}>View booking →</button>
                    <button className={btn} onClick={() => navigate(`/payments?bookingID=${key}`)}>View payments →</button>
                    <button className={btn} onClick={() => navigate(`/penalties?viewBooking=${key}`)}>View penalties →</button>
                  </>
                );
              })()}
            </div>

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