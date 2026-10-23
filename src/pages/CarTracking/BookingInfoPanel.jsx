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

/**
 * "Booking Information" floating panel — right side of the Live map.
 * (Renamed from "Car Information" — this is genuinely about the car's
 * booking-related data, not the car as a physical object; that's what
 * Fleet Management covers.)
 *
 * Two sections:
 *  - Read-only summary of the current/upcoming booking(s) for this car —
 *    same data the bottom panel shows, just without the Pickup/Return/
 *    Stolen buttons, which stay put there since those are frequent,
 *    always-visible actions that shouldn't require an extra click to reach.
 *  - Geofence zones of ONE trip. Zones live only on the trip's bookingSessions doc (the car keeps none):
 *    the customer backend creates them at booking, and this panel is where staff change them afterwards.
 *    Which trip is being edited is picked by clicking its card above: the current trip (when the car is on
 *    one) or any upcoming booking. Every save is PATCH /api/gps/:carId/geofence with that trip's
 *    bookingSessionID. With no active or upcoming trip there is nothing to edit.
 */
export default function BookingInfoPanel({ carId, carLabel, sessionInfo, lastKnownPosition, ongoingBooking, upcomingBookings = [], token, onClose, onSaved, onFocusZone, onZonesChange }) {
  const hasActiveSession = !!sessionInfo?.hasActiveSession;
  const activeSessionID  = hasActiveSession ? (sessionInfo?.bookingSessionID || null) : null;
  // Upcoming bookings that have a trip session. The bookings list already carries each one's
  // bookingSessionID and geofenceZones, so no extra fetch is needed to load their zones.
  const upcomingTrips = upcomingBookings.filter(b => b.bookingSessionID);
  const upcomingKey   = upcomingTrips.map(b => b.bookingSessionID).join(",");

  // The trip being edited, as a bookingSessionID: the active trip's, or an upcoming booking's.
  const [targetID, setTargetID] = useState(null);
  const [zones, setZones]     = useState([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [saved, setSaved]     = useState(false);

  // Default to the current trip, else the nearest upcoming one; keep the pick while it is still valid.
  useEffect(() => {
    setTargetID(prev => {
      const stillValid = prev && (prev === activeSessionID || upcomingTrips.some(b => b.bookingSessionID === prev));
      return stillValid ? prev : (activeSessionID || upcomingTrips[0]?.bookingSessionID || null);
    });
  }, [carId, activeSessionID, upcomingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isActiveTarget = !!targetID && targetID === activeSessionID;
  const targetBooking  = isActiveTarget ? null : (upcomingTrips.find(b => b.bookingSessionID === targetID) || null);
  const sourceZones    = isActiveTarget ? (sessionInfo?.geofenceZones || []) : (targetBooking?.geofenceZones || []);
  const sourceKey      = JSON.stringify(sourceZones);
  const targetLabel    = isActiveTarget
    ? "this trip"
    : targetBooking ? `${targetBooking.customerName || "upcoming booking"}'s trip` : null;
  const canPickTrip    = (activeSessionID ? 1 : 0) + upcomingTrips.length > 1;

  // Load the picked trip's zones. Keyed on the zones' content, not object identity, so a background
  // refresh that changes nothing doesn't wipe edits that haven't been saved yet.
  useEffect(() => {
    setSaved(false);
    setError(null);
    setZones(sourceZones);
  }, [carId, targetID, sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push every edit (drag, type, add, remove) up to the map immediately —
  // this is what makes the circle on the Live map resize in real time as
  // the radius slider moves, instead of only jumping to the new size once
  // Save is clicked.
  useEffect(() => {
    onZonesChange?.(zones);
  }, [zones]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateZone(i, field, value) {
    setZones(prev => prev.map((z, idx) => (idx === i ? { ...z, [field]: value } : z)));
    setSaved(false);
  }
  function removeZone(i) {
    setZones(prev => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  }
  function addZoneAtCurrentPosition() {
    const pos = sessionInfo?.currentPosition?.lat ? sessionInfo.currentPosition : lastKnownPosition;
    if (!pos?.lat || !pos?.lng) {
      setError(hasActiveSession
        ? "No live position yet for this car — can't place a new zone."
        : "This car has no known GPS location yet — can't place a new zone. Try again once it's reported a location at least once.");
      return;
    }
    setZones(prev => [...prev, { label: `Zone ${prev.length + 1}`, lat: pos.lat, lng: pos.lng, radius: 500 }]);
    setSaved(false);
  }

  async function handleSave() {
    if (!targetID) return;
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch(`${API}/api/gps/${carId}/geofence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ zones, bookingSessionID: targetID }),
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
          <p className="text-[11px] text-gray-400">Booking Information</p>
        </div>
        <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50">✕</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-2">
        {/* Read-only booking summary — same data as the bottom Pickup/Return/
            Stolen panel, just without the action buttons, which stay down
            there since they're frequent enough to want always-visible,
            no-extra-click access. */}
        {ongoingBooking ? (
          <div
            onClick={() => activeSessionID && setTargetID(activeSessionID)}
            className={`bg-teal-50 border border-teal-100 rounded-xl p-3 ${activeSessionID ? "cursor-pointer" : ""} ${isActiveTarget ? "ring-2 ring-teal-400" : ""}`}
          >
            <p className="text-xs font-semibold text-teal-800 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              Current trip — {ongoingBooking.customerName || "—"}
            </p>
            <p className="text-xs text-teal-600 mt-1">
              {fmtDateTime(ongoingBooking.startDateTime)} → {fmtDateTime(ongoingBooking.endDateTime)}
            </p>
          </div>
        ) : upcomingBookings.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-1">No upcoming bookings for this car.</p>
        ) : (
          <div className="space-y-1.5">
            {upcomingBookings.slice(0, 3).map((b) => (
              <div
                key={b.id}
                onClick={() => b.bookingSessionID && setTargetID(b.bookingSessionID)}
                className={`bg-blue-50 border border-blue-100 rounded-xl p-2.5 ${b.bookingSessionID ? "cursor-pointer" : ""} ${b.bookingSessionID && b.bookingSessionID === targetID ? "ring-2 ring-blue-400" : ""}`}
              >
                <p className="text-xs font-semibold text-blue-800 truncate">{b.customerName || "—"}</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {fmtDateTime(b.startDateTime)} → {fmtDateTime(b.endDateTime)}
                </p>
              </div>
            ))}
            {upcomingBookings.length > 3 && (
              <p className="text-[11px] text-gray-400 italic px-1">+{upcomingBookings.length - 3} more — see the panel below to pick up.</p>
            )}
          </div>
        )}

        <p className="text-[11px] font-semibold text-gray-500 pt-1 px-1">
          {targetLabel ? `Geofence zones — ${targetLabel}` : "Geofence zones"}
        </p>

        {!targetID && (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-500">
            <p className="font-semibold mb-0.5">No trip to set zones on</p>
            <p className="opacity-80">
              Zones belong to a trip. Once this car has an upcoming or current booking, it shows up above
              and you can set its zones here.
            </p>
          </div>
        )}

        {targetID && canPickTrip && (
          <p className="text-[11px] text-gray-400 italic px-1 -mt-1">Tap a booking above to switch which trip you're editing.</p>
        )}

        {!!targetID && zones.length === 0 && (
          <p className="text-xs text-gray-400 italic px-1">No zones set for this trip yet.</p>
        )}
        {!!targetID && zones.length > 0 && (
          <p className="text-[11px] text-gray-400 italic px-1 -mt-1">Tap a zone to focus the map on it.</p>
        )}

        {!!targetID && zones.map((zone, i) => (
          <div
            key={i}
            onClick={() => onFocusZone?.(zone)}
            title="Focus the map on this zone"
            className="bg-gray-50 rounded-xl border border-gray-100 p-3 cursor-pointer hover:border-teal-300 hover:bg-teal-50/60 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <input
                value={zone.label || ""}
                onClick={e => e.stopPropagation()}
                onChange={e => updateZone(i, "label", e.target.value)}
                placeholder={`Zone ${i + 1}`}
                className="flex-1 min-w-0 text-xs font-semibold bg-white border border-gray-200 rounded-lg px-2 py-1"
              />
              <button onClick={e => { e.stopPropagation(); removeZone(i); }} className="shrink-0 text-gray-300 hover:text-red-500 text-sm">✕</button>
            </div>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <input
                type="range" min={100} max={3000} step={50}
                value={zone.radius ?? 500}
                onChange={e => updateZone(i, "radius", Number(e.target.value))}
                className="flex-1 accent-teal-600"
              />
              <span className="text-[11px] font-mono text-gray-500 w-14 text-right shrink-0">{zone.radius ?? 500} m</span>
            </div>
            {typeof zone.lat === "number" && typeof zone.lng === "number" && (
              <p className="text-[11px] text-gray-400 mt-1.5" onClick={e => e.stopPropagation()}>
                <PlaceLabel lat={zone.lat} lng={zone.lng} />
              </p>
            )}
          </div>
        ))}

        {!!targetID && (
          <button
            onClick={addZoneAtCurrentPosition}
            className="w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-all"
          >
            {hasActiveSession ? "+ Add zone at car's current position" : "+ Add zone at car's last known position"}
          </button>
        )}

        {error && <p className="text-xs text-red-500 px-1">{error}</p>}
      </div>

      <div className="p-3 border-t border-gray-100 shrink-0">
        <button
          onClick={handleSave}
          disabled={saving || !targetID}
          className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : `Save Trip Zones (${zones.length})`}
        </button>
      </div>
    </div>
  );
}