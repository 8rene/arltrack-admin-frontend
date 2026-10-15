// Reads the booking-time Number Coding warnings the CUSTOMER app saves on the trip
// session as `codingWarnings` — the restrictions found for the car's plate BEFORE the
// booking was made. A FLAT array, one entry per matched coding rule:
//   { city, plateLastDigit, ruleID, dayOfWeek, startTime, endTime }
// It is a snapshot: everything needed to show it is copied in, so nothing here looks
// anything up in codingRules (the rule may have been edited or deleted since). ruleID is
// only a trace of which rule matched. Older bookings have none, so everything below
// returns [] and callers show nothing extra.

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function readCodingWarnings(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((w) => w && typeof w === "object")
    .map((w) => ({
      city: String(w.city || "").trim(),
      plateLastDigit: w.plateLastDigit ?? null,
      ruleID: w.ruleID ?? null,
      dayOfWeek: Number(w.dayOfWeek) || null,
      startTime: String(w.startTime || "").trim(),
      endTime: String(w.endTime || "").trim(),
    }));
}

// Groups the flat list by city for display:
//   [{ city, plateLastDigit, text: "Mon 7:00 AM – 8:00 PM; Fri 7:00 AM – 10:00 AM, 3:00 PM – 7:00 PM" }]
// Duplicate day/time rows (same rule hit by two stops in one city) are shown once.
export function warningsByCity(warnings) {
  const cities = new Map();
  for (const w of warnings || []) {
    if (!cities.has(w.city)) cities.set(w.city, { city: w.city, plateLastDigit: w.plateLastDigit, rows: [] });
    cities.get(w.city).rows.push(w);
  }
  return [...cities.values()].map(({ city, plateLastDigit, rows }) => {
    const seen = new Set();
    const byDay = new Map();
    [...rows]
      .sort((a, b) => (a.dayOfWeek || 9) - (b.dayOfWeek || 9))
      .forEach((r) => {
        const win = r.startTime && r.endTime ? `${r.startTime} – ${r.endTime}` : "";
        const key = `${r.dayOfWeek}|${win}`;
        if (seen.has(key)) return;
        seen.add(key);
        const day = r.dayOfWeek >= 1 && r.dayOfWeek <= 7 ? DAY_NAMES[r.dayOfWeek - 1] : "";
        if (!byDay.has(day)) byDay.set(day, []);
        if (win) byDay.get(day).push(win);
      });
    const text = [...byDay.entries()].map(([d, wins]) => [d, wins.join(", ")].filter(Boolean).join(" ")).join("; ");
    return { city, plateLastDigit, text };
  });
}