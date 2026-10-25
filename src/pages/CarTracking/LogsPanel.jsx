import { useState } from "react";
import { formatCodingRule } from "../../utils/geofenceAlerts";
import { readCodingWarnings, warningsByCity } from "../../utils/codingWarnings";

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
  "trip-dropped-off":    { icon: "📍", label: "Marked dropped off",   color: "text-amber-700 bg-amber-50" },
  "trip-completed":      { icon: "🏁", label: "Booking completed",    color: "text-green-700 bg-green-50" },
  "trip-stolen":         { icon: "🚨", label: "Flagged stolen",       color: "text-red-700 bg-red-50" },
};

const FILTERS = [
  { id: "all",      label: "All" },
  { id: "geofence", label: "Geofence" },
  { id: "coding",   label: "Coding" },
  { id: "trip",     label: "Trip" },
];

/**
 * "Logs" floating panel — right side of the Live map. Reads straight off
 * the focused car's active session: geofenceAlerts (breach/cleared, written
 * by livePing.service.js on every transition) and codingAlerts (MMDA
 * number-coding restriction windows), merged and sorted newest-first.
 *
 * The booking-time coding warning is pinned at the top (it predates the trip and has no time of its
 * own, so it used to sink to the bottom). Alerts that reached the server late (offline flush) say so.
 * `holidayToday` (optional) shows a one-line note that coding is suspended today.
 */
export default function LogsPanel({ sessionInfo, loading, onClose, holidayToday = null }) {
  const [filter, setFilter] = useState("all");
  const hasActiveSession = !!sessionInfo?.hasActiveSession;
  const geofenceEntries = (sessionInfo?.geofenceAlerts || []).map(a => ({
    ...a,
    kind: `geofence-${a.type}`,
    detail: a.type === "breach"
      ? `Nearest zone: ${a.nearestZone || "—"} (${a.distanceMeters ?? "?"} m away)`
      : a.afterDropOff
        ? "Closed at drop-off — geofence alerts stop once the car is dropped off"
        : `Re-entered near ${a.zone || "—"}`,
  }));
  const codingEntries = (sessionInfo?.codingAlerts || []).map(a => ({
    ...a,
    kind: `coding-${a.type}`,
    // Newer alerts carry the rule that fired (saved at the time, so it still
    // reads right after the rules are edited); older ones only have a reason.
    detail: a.type === "restricted"
      ? [
          formatCodingRule(a.rule) ? [formatCodingRule(a.rule), a.city].filter(Boolean).join(" · ") : (a.reason || "Plate under coding restriction"),
          a.plate ? `plate ${a.plate}` : null, // masked at the time it was recorded, e.g. AB****3
        ].filter(Boolean).join(" · ")
      : "Restriction window ended",
  }));
  // Booking-time Number Coding warnings saved by the customer app (codingWarnings): the
  // restrictions found for the plate before the booking. Older trips have none.
  const warnings = warningsByCity(readCodingWarnings(sessionInfo?.codingWarnings));
  // Trip milestones: the dropped-off time is on the live session; completed is only in saved history.
  const tripEntries = [
    sessionInfo?.droppedOffAt && { kind: "trip-dropped-off", at: sessionInfo.droppedOffAt, detail: "Vehicle physically dropped off." },
    sessionInfo?.completedAt  && { kind: "trip-completed",   at: sessionInfo.completedAt,  detail: "Booking marked completed." },
    sessionInfo?.stolenAt     && { kind: "trip-stolen",      at: sessionInfo.stolenAt,     detail: "Car flagged as stolen — tracking continues." },
  ].filter(Boolean);
  const holidays = Array.isArray(sessionInfo?.holidays) ? sessionInfo.holidays : [];

  const all = [...geofenceEntries, ...codingEntries, ...tripEntries];
  const entries = all
    .filter(e => filter === "all" || e.kind.startsWith(`${filter}-`))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const showWarnings = warnings.length > 0 && (filter === "all" || filter === "coding");

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 z-[1001] bg-white rounded-2xl border border-gray-100 shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div>
          <p className="font-bold text-arl-dark text-sm">Trip Logs</p>
          <p className="text-[11px] text-gray-400">Geofence, coding alerts & booking warnings</p>
        </div>
        <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50">✕</button>
      </div>

      {hasActiveSession && !loading && (
        <div className="flex gap-1 px-3 pt-2 shrink-0">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                filter === f.id ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

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
        ) : (
          <>
            {holidayToday && (filter === "all" || filter === "coding") && (
              <div className="rounded-xl p-3 bg-blue-50 text-blue-700">
                <p className="text-xs font-semibold">🎌 Today is a holiday{holidayToday.holidayName ? ` — ${holidayToday.holidayName}` : ""}</p>
                <p className="text-[11px] mt-1 opacity-80">Coding is suspended today, so no coding restriction is raised.</p>
              </div>
            )}

            {showWarnings && (
              <div className="rounded-xl p-3 text-amber-700 bg-amber-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚠️</span>
                  <span className="text-xs font-semibold">Coding warning at booking</span>
                </div>
                {warnings.map((c, i) => (
                  <p key={i} className="text-[11px] mt-1 opacity-80">
                    {[c.city, c.plateLastDigit != null ? `plate ending ${c.plateLastDigit}` : "", c.text].filter(Boolean).join(" · ")}
                  </p>
                ))}
              </div>
            )}

            {entries.length === 0 ? (
              !showWarnings && <p className="text-xs text-gray-400 italic px-1">No alerts logged for this trip yet.</p>
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
                    {entry.afterDropOff && entry.kind === "coding-restricted" && (
                      <p className="text-[10px] mt-0.5 opacity-70">🚗 After drop-off — the car was no longer with the customer</p>
                    )}
                    {entry.delayed && (
                      <p className="text-[10px] mt-0.5 opacity-70">⏱ Received late — reached the server {fmtTime(entry.receivedAt)}</p>
                    )}
                  </div>
                );
              })
            )}

            {holidays.length > 0 && (filter === "all" || filter === "coding") && (
              <div className="rounded-xl p-3 bg-blue-50 text-blue-700">
                <p className="text-xs font-semibold">🎌 Holidays during this trip</p>
                <p className="text-[11px] mt-1 opacity-80">Coding is suspended on holidays.</p>
                {holidays.map((h, i) => (
                  <p key={i} className="text-[11px] mt-1 font-mono opacity-70">{h.date} · {h.name || "Holiday"}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}