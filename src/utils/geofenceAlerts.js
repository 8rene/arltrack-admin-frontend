// Shared across the Live map badges/banner and the Traceback/History/Review
// scrubber. geofenceAlerts / codingAlerts are append-only transition logs —
// each entry is only written when the state actually changes (see the
// backend's livePing.service.js), e.g.
//   geofenceAlerts: [{ type: "breach", at }, { type: "cleared", at }, ...]
//   codingAlerts:   [{ type: "restricted", at }, { type: "cleared", at }, ...]
// So "is this car currently in state X" at any timestamp (live "now", or a
// scrubbed historical instant) means: find the last entry at or before that
// timestamp, and check whether it's the active-type entry.

/** True if the most recent alert at/before `atMs` has `type === activeType`. */
export function isActiveAtTime(alerts, atMs, activeType) {
  if (!alerts || !alerts.length) return false;
  const sorted = [...alerts].sort((a, b) => new Date(a.at) - new Date(b.at));
  let cur = false;
  for (const a of sorted) {
    const t = new Date(a.at).getTime();
    if (t > atMs) break;
    cur = a.type === activeType;
  }
  return cur;
}

export const isGeofenceBreachedAt  = (geofenceAlerts, atMs) => isActiveAtTime(geofenceAlerts, atMs, "breach");
export const isCodingRestrictedAt  = (codingAlerts, atMs)   => isActiveAtTime(codingAlerts, atMs, "restricted");

/** Convenience for "right now" (Live tab) — same logic, current instant. */
export const isGeofenceBreachedNow = (geofenceAlerts) => isGeofenceBreachedAt(geofenceAlerts, Date.now());
export const isCodingRestrictedNow = (codingAlerts)   => isCodingRestrictedAt(codingAlerts, Date.now());

/**
 * Same "last one at/before this instant wins" logic as isActiveAtTime, but
 * returns the alert object itself (not just true/false) when it's the
 * active type — so callers can read extra fields on it, like the
 * codingAlerts "restricted" entry's `city`, which the boolean check throws away.
 */
export function activeAlertAt(alerts, atMs, activeType) {
  if (!alerts || !alerts.length) return null;
  const sorted = [...alerts].sort((a, b) => new Date(a.at) - new Date(b.at));
  let cur = null;
  for (const a of sorted) {
    const t = new Date(a.at).getTime();
    if (t > atMs) break;
    cur = a.type === activeType ? a : null;
  }
  return cur;
}
/** Convenience for "right now" — the currently-active coding-restriction alert, if any, so its `city` can be read. */
export const activeCodingAlertNow = (codingAlerts) => activeAlertAt(codingAlerts, Date.now(), "restricted");

/**
 * One-line, human text for the coding rule saved on a "restricted" alert
 * ({ id, city, day, start, end, digits }) — e.g.
 *   "Monday 7:00 AM–10:00 AM · plates ending 1, 2"
 * Returns null for older alerts that never saved a rule, so callers can fall
 * back to the alert's reason text.
 */
export function formatCodingRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  const when = [rule.day, rule.start && rule.end ? `${rule.start}–${rule.end}` : null].filter(Boolean).join(" ");
  const digits = Array.isArray(rule.digits) && rule.digits.length ? `plates ending ${rule.digits.join(", ")}` : null;
  const text = [when, digits].filter(Boolean).join(" · ");
  return text || null;
}