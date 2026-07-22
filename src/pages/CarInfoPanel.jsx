import { useState, useEffect } from "react";

const API = process.env.REACT_APP_API_URL;

/**
 * "Car Information" floating panel — right side of the Live map.
 * Lets an admin resize/rename/remove each geofence zone on the focused
 * car's active trip, and add a new zone centered on the car's current
 * live position. Saves the whole zones array in one PATCH — matches
 * how the backend's updateCarGeofence expects it (wholesale overwrite).
 */
export default function CarInfoPanel({ carId, carLabel, sessionInfo, token, onClose, onSaved, onFocusZone }) {
  const hasActiveSession = !!sessionInfo?.hasActiveSession;
  const [zones, setZones]     = useState(sessionInfo?.geofenceZones || []);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    setZones(sessionInfo?.geofenceZones || []);
    setSaved(false);
  }, [sessionInfo]);

  function updateZone(i, field, value) {
    setZones(prev => prev.map((z, idx) => (idx === i ? { ...z, [field]: value } : z)));
    setSaved(false);
  }
  function removeZone(i) {
    setZones(prev => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  }
  function addZoneAtCurrentPosition() {
    const pos = sessionInfo?.currentPosition;
    if (!pos?.lat || !pos?.lng) {
      setError("No live position yet for this car — can't place a new zone.");
      return;
    }
    setZones(prev => [...prev, { label: `Zone ${prev.length + 1}`, lat: pos.lat, lng: pos.lng, radius: 500 }]);
    setSaved(false);
  }

  async function handleSave() {
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
          <p className="text-[11px] text-gray-400">Geofence zones</p>
        </div>
        <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50">✕</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-2">
        {!hasActiveSession && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
            <p className="font-semibold mb-0.5">No active session for this car</p>
            <p className="opacity-80">
              This car has no linked GPS session right now, so there are no zones to show or
              edit — this can happen for bookings made before a session was created at
              booking time, or if pickup hasn't actually started tracking yet.
            </p>
          </div>
        )}

        {hasActiveSession && zones.length === 0 && (
          <p className="text-xs text-gray-400 italic px-1">No zones set for this trip yet.</p>
        )}
        {hasActiveSession && zones.length > 0 && (
          <p className="text-[11px] text-gray-400 italic px-1 -mt-1">Tap a zone to focus the map on it.</p>
        )}

        {hasActiveSession && zones.map((zone, i) => (
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
          </div>
        ))}

        {hasActiveSession && (
          <button
            onClick={addZoneAtCurrentPosition}
            className="w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-all"
          >
            + Add zone at car's current position
          </button>
        )}

        {error && <p className="text-xs text-red-500 px-1">{error}</p>}
      </div>

      <div className="p-3 border-t border-gray-100 shrink-0">
        <button
          onClick={handleSave}
          disabled={saving || !hasActiveSession}
          className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : hasActiveSession ? `Save Zones (${zones.length})` : "No session to save to"}
        </button>
      </div>
    </div>
  );
}