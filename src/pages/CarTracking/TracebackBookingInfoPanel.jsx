import { useState, useEffect } from "react";
import PlaceLabel from "../../components/PlaceLabel";

const API = process.env.REACT_APP_API_URL;

function fmtDateTime(val) {
  if (!val) return "—";
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

const STATUS_STYLES = {
  ended:     "bg-teal-50 text-teal-700",
  stolen:    "bg-red-50 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  active:    "bg-blue-50 text-blue-700",
};

/**
 * "Booking Information" floating panel for the Traceback tab — the
 * Traceback-aware sibling of BookingInfoPanel (which only ever looks at the
 * Live map's current session).
 *
 * Two modes, decided by the caller via `canEdit` (today's date + an active
 * session, per TracebackPanel):
 *  - canEdit: same zone-editing UI as BookingInfoPanel — PATCH
 *    /api/gps/:carId/geofence, live-position-anchored "add zone" button.
 *  - !canEdit (any past day, or today with no active session): fully
 *    read-only. Zones are still listed (click to focus the map, same as
 *    everywhere else) but there's no add/remove/edit/save — you're looking
 *    at history, not steering a trip in progress.
 *
 * The booking's customer/location details aren't in `session` (that only
 * carries bookingSessionID/bookingID/status/pickupTime/returnTime), so this
 * looks the rest up client-side out of GET /api/bookings, same approach as
 * TripSummaryPanel — there's no GET /api/bookings/:id endpoint yet.
 */
export default function TracebackBookingInfoPanel({
  carId, carLabel, date, session, zones: initialZones = [], canEdit,
  currentPosition, token, onClose, onSaved, onFocusZone,
}) {
  const [booking, setBooking]         = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [zones, setZones]             = useState(initialZones);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);
  const [saved, setSaved]             = useState(false);

  // Re-sync local zone state whenever the caller hands us a different car,
  // date, or fresh zones (e.g. after onSaved triggers a refetch upstream).
  useEffect(() => {
    setZones(initialZones);
    setSaved(false);
    setError(null);
  }, [carId, date, initialZones]);

  useEffect(() => {
    setBooking(null);
    if (!session?.bookingID || !API) return;
    setBookingLoading(true);
    fetch(`${API}/api/bookings?status=all`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(json => {
        const list = json?.data || [];
        const match = list.find(b => b.bookingID === session.bookingID || b.id === session.bookingID);
        if (match) setBooking(match);
      })
      .catch(() => {})
      .finally(() => setBookingLoading(false));
  }, [session?.bookingID, token]);

  function updateZone(i, field, value) {
    if (!canEdit) return;
    setZones(prev => prev.map((z, idx) => (idx === i ? { ...z, [field]: value } : z)));
    setSaved(false);
  }
  function removeZone(i) {
    if (!canEdit) return;
    setZones(prev => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  }
  function addZoneAtCurrentPosition() {
    if (!canEdit) return;
    if (!currentPosition?.lat || !currentPosition?.lng) {
      setError("No live position yet for this car — can't place a new zone.");
      return;
    }
    setZones(prev => [...prev, { label: `Zone ${prev.length + 1}`, lat: currentPosition.lat, lng: currentPosition.lng, radius: 500 }]);
    setSaved(false);
  }

  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch(`${API}/api/gps/${carId}/geofence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ zones }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to save geofence.");
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 z-[1001] bg-white rounded-2xl border border-gray-100 shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="min-w-0">
          <p className="font-bold text-arl-dark text-sm truncate">{carLabel}</p>
          <p className="text-[11px] text-gray-400">{canEdit ? "Booking Information" : "Trip Details"}</p>
        </div>
        <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50">✕</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-2">
        {/* ── Read-only trip summary ─────────────────────────────────────── */}
        {!session ? (
          <p className="text-xs text-gray-400 italic px-1">No booking session found for {date}.</p>
        ) : (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-700 truncate">
                {bookingLoading ? "Loading…" : booking?.customerName || "—"}
              </p>
              {session.status && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[session.status] || "bg-blue-50 text-blue-700"}`}>
                  {session.status}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {fmtDateTime(session.pickupTime)} → {fmtDateTime(session.returnTime)}
            </p>
            {session.bookingID && (
              <p className="text-[11px] text-gray-400 mt-1">Booking ID: {session.bookingID}</p>
            )}
          </div>
        )}

        <p className="text-[11px] font-semibold text-gray-500 pt-1 px-1">
          Geofence zones{canEdit ? " — this trip" : ""}
        </p>

        {!canEdit && (
          <p className="text-[11px] text-gray-400 italic px-1 -mt-1">
            Read-only — viewing a past day. Tap a zone to focus the map on it.
          </p>
        )}
        {canEdit && zones.length > 0 && (
          <p className="text-[11px] text-gray-400 italic px-1 -mt-1">Tap a zone to focus the map on it.</p>
        )}

        {zones.length === 0 && (
          <p className="text-xs text-gray-400 italic px-1">No zones were set for this trip.</p>
        )}

        {zones.map((zone, i) => (
          <div
            key={i}
            onClick={() => onFocusZone?.(zone)}
            title="Focus the map on this zone"
            className="bg-gray-50 rounded-xl border border-gray-100 p-3 cursor-pointer hover:border-teal-300 hover:bg-teal-50/60 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              {canEdit ? (
                <input
                  value={zone.label || ""}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updateZone(i, "label", e.target.value)}
                  placeholder={`Zone ${i + 1}`}
                  className="flex-1 min-w-0 text-xs font-semibold bg-white border border-gray-200 rounded-lg px-2 py-1"
                />
              ) : (
                <span className="flex-1 min-w-0 text-xs font-semibold text-gray-700 truncate">{zone.label || `Zone ${i + 1}`}</span>
              )}
              {canEdit && (
                <button onClick={e => { e.stopPropagation(); removeZone(i); }} className="shrink-0 text-gray-300 hover:text-red-500 text-sm">✕</button>
              )}
            </div>
            {canEdit ? (
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <input
                  type="range" min={100} max={3000} step={50}
                  value={zone.radius ?? 500}
                  onChange={e => updateZone(i, "radius", Number(e.target.value))}
                  className="flex-1 accent-teal-600"
                />
                <span className="text-[11px] font-mono text-gray-500 w-14 text-right shrink-0">{zone.radius ?? 500} m</span>
              </div>
            ) : (
              <p className="text-[11px] font-mono text-gray-400">{zone.radius ?? 500} m radius</p>
            )}
            {typeof zone.lat === "number" && typeof zone.lng === "number" && (
              <p className="text-[11px] text-gray-400 mt-1.5" onClick={e => e.stopPropagation()}>
                <PlaceLabel lat={zone.lat} lng={zone.lng} />
              </p>
            )}
          </div>
        ))}

        {canEdit && (
          <button
            onClick={addZoneAtCurrentPosition}
            className="w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-all"
          >
            + Add zone at car's current position
          </button>
        )}

        {error && <p className="text-xs text-red-500 px-1">{error}</p>}
      </div>

      {canEdit && (
        <div className="p-3 border-t border-gray-100 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : `Save Trip Zones (${zones.length})`}
          </button>
        </div>
      )}
    </div>
  );
}