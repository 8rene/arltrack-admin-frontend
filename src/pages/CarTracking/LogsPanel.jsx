import { useEffect, useMemo, useState } from "react";

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

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

// "12:44:00 AM", or "Oct 28, 12:44:00 AM" when the date isn't already shown elsewhere.
function fmtClock(ms, withDate) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  return withDate ? `${d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}, ${time}` : time;
}

// "Just now" / "3 minutes ago" / "2 hours ago" / "4 days ago"
function fmtAgo(ms, now) {
  const min = Math.floor(Math.max(0, now - ms) / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function dayLabel(ms, now) {
  if (sameDay(ms, now)) return "Today";
  if (sameDay(ms, now - 24 * 60 * 60 * 1000)) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

// "Monday 7:00 AM to 8:00 PM" -- the window only; which plate digits are banned is not shown here.
function fmtRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  const window = rule.start && rule.end ? `${rule.start} to ${rule.end}` : null;
  return [rule.day, window].filter(Boolean).join(" ") || null;
}

// Dot color per kind of entry, so a column of logs can be scanned instead of read line by line.
const KIND = {
  "Left Zone": "bad",
  "Flagged Stolen": "bad",
  "Entered coding restricted area": "warn",
  "Back Inside Zone": "ok",
  "Left coding restricted area": "ok",
  "Coding window ended": "ok",
  "Booking Completed": "ok",
  "Picked Up": "info",
  "Dropped Off": "muted",
};
const DOT = { bad: "bg-red-500", warn: "bg-orange-500", ok: "bg-emerald-500", info: "bg-sky-500", muted: "bg-gray-300" };

// Flattens every log source on the session into one list, most recent first.
function buildEntries(info) {
  const out = [];
  const add = (at, title, detail = null, notes = []) => {
    const ms = toMs(at);
    if (ms === null) return;
    const text = [detail, ...notes].filter(Boolean).join(" · ");
    out.push({ ms, title, text, kind: KIND[title] || "muted" });
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
      add(a.at, "Entered coding restricted area", detail, notesOf(a));
    } else {
      add(a.at, a.windowEnded ? "Coding window ended" : "Left coding restricted area", a.city, notesOf(a));
    }
  });

  (info.tripEvents || []).forEach((ev) => add(ev.at, ev.title)); // several trips merged (Traceback)
  add(info.droppedOffAt, "Dropped Off");
  add(info.completedAt, "Booking Completed");
  add(info.stolenAt, "Flagged Stolen");

  return out.sort((a, b) => b.ms - a.ms);
}

/**
 * "Logs" floating panel — shared by the Live tab and by Traceback / History review.
 * Most recent first. Every entry comes from a booking (zone / coding alerts and pickup / drop-off / completed /
 * stolen are all recorded on the booking session), so a car with no booking has no logs at all.
 * sessionInfo: { hasActiveSession, geofenceAlerts, codingAlerts, codingWarnings,
 *                droppedOffAt, completedAt, stolenAt, tripEvents: [{ at, title }], holidays } — every field optional.
 */
export default function LogsPanel({ sessionInfo, loading = false, holidayToday = null, onClose }) {
  const info = useMemo(() => sessionInfo || {}, [sessionInfo]);
  const entries = useMemo(() => buildEntries(info), [info]);
  const warnings = Array.isArray(info.codingWarnings) ? info.codingWarnings : [];
  const holidays = Array.isArray(info.holidays) ? info.holidays : [];
  const hasAnything = entries.length > 0 || warnings.length > 0 || holidays.length > 0;
  const atBooking = warnings.length > 0 || holidays.length > 0;

  // Keeps "3 minutes ago" honest while the panel stays open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Day headers only when the entries cross midnight; otherwise they'd just repeat "Today".
  const multiDay = entries.length > 1 && !sameDay(entries[0].ms, entries[entries.length - 1].ms);

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 z-[1001] bg-white rounded-2xl border border-gray-100 shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-gray-900 text-base">Booking Logs</p>
          {entries.length > 0 && <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{entries.length}</span>}
        </div>
        <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50">✕</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 pb-4 border-t border-gray-100">
        {loading ? (
          <p className="text-sm text-gray-400 pt-4">Loading…</p>
        ) : !info.hasActiveSession && !hasAnything && !holidayToday ? (
          <div className="pt-4">
            <p className="text-sm font-semibold text-gray-700">No booking found</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">Logs record a booking's zone and coding alerts and its pickup, drop-off and completion, so there is nothing to show without one.</p>
          </div>
        ) : (
          <>
            {holidayToday && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                <p className="text-sm font-semibold text-amber-800">{holidayToday.holidayName || "Holiday"}</p>
                <p className="text-xs text-amber-700 mt-0.5">Holiday today · coding suspended</p>
              </div>
            )}

            {!hasAnything && !holidayToday && (
              <p className="text-sm text-gray-400 pt-4">No alerts or events recorded.</p>
            )}

            {entries.length > 0 && (
              <ul>
                {entries.map((e, i) => {
                  const newDay = multiDay && (i === 0 || !sameDay(entries[i - 1].ms, e.ms));
                  return (
                    <li key={`${e.ms}-${i}`}>
                      {newDay && (
                        <p className="sticky top-0 z-10 bg-white pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{dayLabel(e.ms, now)}</p>
                      )}
                      <div className={`flex gap-3 py-3 ${i > 0 && !newDay ? "border-t border-gray-100" : ""} ${i === 0 && !newDay ? "mt-1" : ""}`}>
                        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[e.kind]}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">{e.title}</p>
                          {e.text && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed whitespace-pre-line">{e.text}</p>}
                          <p className="text-xs text-gray-400 mt-1">
                            <span className="font-medium text-gray-500">{fmtAgo(e.ms, now)}</span>
                            {" · "}
                            {fmtClock(e.ms, !multiDay && !sameDay(e.ms, now))}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {atBooking && (
              <div className="mt-2">
                <p className="sticky top-0 z-10 bg-white pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">At booking</p>
                {warnings.map((w, i) => (
                  <div key={w.ruleID || `w${i}`} className={`py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                    <p className="text-sm font-semibold text-gray-900">Coding warning</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      {[
                        w.city,
                        [w.dayOfWeek, w.startTime && w.endTime ? `${w.startTime}–${w.endTime}` : null].filter(Boolean).join(" "),
                        w.plateLastDigit !== undefined && w.plateLastDigit !== null ? `plate ending ${w.plateLastDigit}` : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                ))}
                {holidays.map((h, i) => (
                  <div key={h.holidayDate || `h${i}`} className={`py-3 ${warnings.length > 0 || i > 0 ? "border-t border-gray-100" : ""}`}>
                    <p className="text-sm font-semibold text-gray-900">{h.holidayName || "Holiday"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{h.holidayDate || "—"} · coding suspended</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}