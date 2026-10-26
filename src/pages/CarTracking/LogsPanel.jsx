import { useMemo } from "react";

// Accepts an ISO string, a Date, a Firestore Timestamp, or a serialized { _seconds } timestamp.
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

// "12:44:00 AM | 08/10"
function fmtStamp(ms) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const date = d.toLocaleDateString("en-PH", { month: "2-digit", day: "2-digit" });
  return `${time} | ${date}`;
}

// "Monday 7:00 AM to 8:00 PM" -- the window only; which plate digits are banned is not shown here.
function fmtRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  const window = rule.start && rule.end ? `${rule.start} to ${rule.end}` : null;
  return [rule.day, window].filter(Boolean).join(" ") || null;
}

// Flattens every log source on the session into one chronological list.
function buildEntries(info) {
  const out = [];
  const add = (at, title, detail = null, notes = []) => {
    const ms = toMs(at);
    if (ms === null) return;
    const text = [detail, ...notes].filter(Boolean).join(" · ");
    out.push({ ms, title, text });
  };
  const notesOf = (a) => [a.delayed ? "delayed" : null, a.afterDropOff ? "after drop-off" : null];

  (info.geofenceAlerts || []).forEach((a) => {
    if (a.type === "breach") {
      const near = a.nearestZone ? `Nearest zone: ${a.nearestZone}` : null;
      const dist = typeof a.distanceMeters === "number" ? `${Math.round(a.distanceMeters)} m away` : null;
      add(a.at, "Left Zone", [near, dist].filter(Boolean).join(" · "), notesOf(a));
    } else {
      add(a.at, "Back Inside Zone", a.zone ? `Zone: ${a.zone}` : null, notesOf(a));
    }
  });

  (info.codingAlerts || []).forEach((a) => {
    if (a.type === "restricted") {
      // "Marilao Monday 7:00 AM to 8:00 PM" then "Plate NB***4"
      const where = [a.city, fmtRule(a.rule) || a.reason].filter(Boolean).join(" ");
      const detail = [where, a.plate ? `Plate ${a.plate}` : null].filter(Boolean).join("\n");
      add(a.at, "Coding Restriction Started", detail, notesOf(a));
    } else {
      add(a.at, "Coding Restriction Ended", a.city, notesOf(a));
    }
  });

  (info.tripEvents || []).forEach((ev) => add(ev.at, ev.title)); // several trips merged (Traceback)
  add(info.droppedOffAt, "Dropped Off");
  add(info.completedAt, "Booking Completed");
  add(info.stolenAt, "Flagged Stolen");

  return out.sort((a, b) => a.ms - b.ms);
}

/**
 * "Logs" floating panel — shared by the Live tab and by Traceback / History review.
 * sessionInfo: { hasActiveSession, geofenceAlerts, codingAlerts, codingWarnings,
 *                droppedOffAt, completedAt, stolenAt, tripEvents: [{ at, title }], holidays } — every field optional.
 */
export default function LogsPanel({ sessionInfo, loading = false, holidayToday = null, onClose }) {
  const info = useMemo(() => sessionInfo || {}, [sessionInfo]);
  const entries = useMemo(() => buildEntries(info), [info]);
  const warnings = Array.isArray(info.codingWarnings) ? info.codingWarnings : [];
  const holidays = Array.isArray(info.holidays) ? info.holidays : [];
  const hasAnything = entries.length > 0 || warnings.length > 0 || holidays.length > 0;

  const row = "px-1 py-4";

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 z-[1001] bg-white rounded-2xl border border-gray-100 shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <p className="font-bold text-gray-900 text-base">Logs</p>
        <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50">✕</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 pb-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : !info.hasActiveSession && !hasAnything && !holidayToday ? (
          <p className="text-sm text-gray-400">No logs to show.</p>
        ) : (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {holidayToday && (
              <div className={row}>
                <p className="text-sm font-semibold text-gray-900">{holidayToday.holidayName || "Holiday"}</p>
                <p className="text-sm text-gray-500 mt-1">Holiday today · coding suspended</p>
              </div>
            )}

            {!hasAnything && !holidayToday && (
              <p className={`${row} text-sm text-gray-400`}>No alerts or events recorded.</p>
            )}

            {entries.map((e, i) => (
              <div key={`${e.ms}-${i}`} className={row}>
                <p className="text-sm font-semibold text-gray-900">{fmtStamp(e.ms)}</p>
                <p className="text-sm text-gray-600 mt-1">{e.title}</p>
                {e.text && <p className="text-xs text-gray-400 mt-1 leading-relaxed whitespace-pre-line">{e.text}</p>}
              </div>
            ))}

            {warnings.map((w, i) => (
              <div key={w.ruleID || `w${i}`} className={row}>
                <p className="text-sm text-gray-600">Coding warning at booking</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  {[
                    w.city,
                    [w.dayOfWeek, w.startTime && w.endTime ? `${w.startTime}–${w.endTime}` : null].filter(Boolean).join(" "),
                    w.plateLastDigit !== undefined && w.plateLastDigit !== null ? `plate ending ${w.plateLastDigit}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}

            {holidays.map((h, i) => (
              <div key={h.holidayDate || `h${i}`} className={row}>
                <p className="text-sm text-gray-600">{h.holidayName || "Holiday"}</p>
                <p className="text-xs text-gray-400 mt-1">{h.holidayDate || "—"} · coding suspended</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}