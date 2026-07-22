function fmtTime(at) {
  if (!at) return "—";
  const d = new Date(at);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

const ENTRY_STYLES = {
  "geofence-breach":     { icon: "🚨", label: "Left geofence",        color: "text-red-600 bg-red-50" },
  "geofence-cleared":    { icon: "✅", label: "Back inside geofence", color: "text-teal-600 bg-teal-50" },
  "coding-restricted":   { icon: "🚫", label: "Coding restriction",   color: "text-orange-600 bg-orange-50" },
  "coding-cleared":      { icon: "🟢", label: "Coding restriction lifted", color: "text-gray-500 bg-gray-50" },
};

/**
 * "Logs" floating panel — right side of the Live map. Reads straight off
 * the focused car's active session: geofenceAlerts (breach/cleared, written
 * by livePing.service.js on every transition) and codingAlerts (MMDA
 * number-coding restriction windows), merged and sorted newest-first.
 */
export default function LogsPanel({ sessionInfo, loading, onClose }) {
  const hasActiveSession = !!sessionInfo?.hasActiveSession;
  const geofenceEntries = (sessionInfo?.geofenceAlerts || []).map(a => ({
    ...a,
    kind: `geofence-${a.type}`,
    detail: a.type === "breach"
      ? `Nearest zone: ${a.nearestZone || "—"} (${a.distanceMeters ?? "?"} m away)`
      : `Re-entered near ${a.zone || "—"}`,
  }));
  const codingEntries = (sessionInfo?.codingAlerts || []).map(a => ({
    ...a,
    kind: `coding-${a.type}`,
    detail: a.type === "restricted" ? (a.reason || "Plate under coding restriction") : "Restriction window ended",
  }));

  const entries = [...geofenceEntries, ...codingEntries].sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 z-[1001] bg-white rounded-2xl border border-gray-100 shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div>
          <p className="font-bold text-arl-dark text-sm">Trip Logs</p>
          <p className="text-[11px] text-gray-400">Geofence & coding alerts</p>
        </div>
        <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50">✕</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-2">
        {loading ? (
          <p className="text-xs text-gray-400 italic px-1">Loading…</p>
        ) : !hasActiveSession ? (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
            <p className="font-semibold mb-0.5">No active session for this car</p>
            <p className="opacity-80">
              There's no linked GPS session right now, so there's nothing to log —
              this can happen for bookings made before a session was created at
              booking time, or if pickup hasn't actually started tracking yet.
            </p>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-1">No alerts logged for this trip yet.</p>
        ) : (
          entries.map((entry, i) => {
            const style = ENTRY_STYLES[entry.kind] || { icon: "•", label: entry.kind, color: "text-gray-500 bg-gray-50" };
            return (
              <div key={i} className={`rounded-xl p-3 ${style.color}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{style.icon}</span>
                  <span className="text-xs font-semibold">{style.label}</span>
                </div>
                <p className="text-[11px] mt-1 opacity-80">{entry.detail}</p>
                <p className="text-[10px] mt-1 opacity-60 font-mono">{fmtTime(entry.at)}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}