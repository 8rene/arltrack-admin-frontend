import { useState, useEffect } from "react";
import PlaceLabel from "../components/PlaceLabel";

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
 *  - Geofence zones, in two modes:
 *     - Active trip: edits THIS session's zones (PATCH /api/gps/:carId/geofence)
 *       — what's saved here only ever applies to the trip in progress.
 *     - No active trip: edits the CAR's standing default zones
 *       (PATCH /api/gps/:carId/geofence-defaults) — these aren't tied to any
 *       session, can be set up anytime, and auto-copy onto the next new
 *       session's own zones at pickup (unless that session already has zones
 *       of its own — see bookingSession.service.js's markSessionActive).
 */
export default function BookingInfoPanel({ carId, carLabel, sessionInfo, lastKnownPosition, ongoingBooking, upcomingBookings = [], token, onClose, onSaved, onFocusZone, onZonesChange }) {
  const hasActiveSession = !!sessionInfo?.hasActiveSession;
  const [zones, setZones]     = useState(sessionInfo?.geofenceZones || []);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [saved, setSaved]     = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  // Active-trip zones come along with sessionInfo already. Default zones
  // don't — sessionInfo doesn't carry them — so fetch them ourselves
  // whenever there's no active trip for this car.
  useEffect(() => {
    setSaved(false);
    setError(null);
    if (hasActiveSession) {
      setZones(sessionInfo?.geofenceZones || []);
      return;
    }
    if (!carId || !API) return;
    setLoadingDefaults(true);
    fetch(`${API}/api/gps/${carId}/geofence-defaults`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(json => setZones(json?.data?.zones || []))
      .catch(() => setError("Failed to load this car's default zones."))
      .finally(() => setLoadingDefaults(false));
  }, [carId, hasActiveSession, sessionInfo, token]);

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
    setSaving(true);
    setError(null);
    try {
      const endpoint = hasActiveSession ? "geofence" : "geofence-defaults";
      const res  = await fetch(`${API}/api/gps/${carId}/${endpoint}`, {
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
          <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
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
              <div key={b.id} className="bg-blue-50 border border-blue-100 rounded-xl p-2.5">
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
          {hasActiveSession ? "Geofence zones — this trip" : "Geofence zones — car default"}
        </p>

        {!hasActiveSession && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
            <p className="font-semibold mb-0.5">No trip in progress</p>
            <p className="opacity-80">
              You're editing this car's default zones instead — they aren't tied to any
              particular trip, so you can set them up anytime. They'll automatically
              carry over onto the next trip's own zones the moment it's picked up,
              unless that trip already has zones set some other way.
            </p>
          </div>
        )}

        {loadingDefaults && (
          <p className="text-xs text-gray-400 italic px-1">Loading default zones…</p>
        )}

        {!loadingDefaults && zones.length === 0 && (
          <p className="text-xs text-gray-400 italic px-1">
            {hasActiveSession ? "No zones set for this trip yet." : "No default zones set for this car yet."}
          </p>
        )}
        {!loadingDefaults && zones.length > 0 && (
          <p className="text-[11px] text-gray-400 italic px-1 -mt-1">Tap a zone to focus the map on it.</p>
        )}

        {!loadingDefaults && zones.map((zone, i) => (
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

        {!loadingDefaults && (
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
          disabled={saving || loadingDefaults}
          className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : `Save ${hasActiveSession ? "Trip" : "Default"} Zones (${zones.length})`}
        </button>
      </div>
    </div>
  );
}