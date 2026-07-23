// Client-side reverse geocoding via Nominatim (OpenStreetMap) — no backend
// involved at all, purely a browser-side lookup. Two things exist here
// specifically to respect Nominatim's public-usage policy (max ~1 request/
// second, no bulk/automated use):
//
//  - a cache keyed by coordinates rounded to 4 decimals (~11m) — a car idling
//    at a red light for two minutes shouldn't trigger a fresh lookup on every
//    GPS-jitter-sized coordinate change
//  - a single shared queue enforcing ~1.1s between actual network calls, no
//    matter how many labels (sidebar rows, zone list, bottom panel) are
//    asking at once — one shared pace limiter for the whole app, not one
//    per caller
//
// Nominatim's docs ask for a custom User-Agent identifying the app, but
// browsers block JS from setting that header on outgoing requests (a
// browser-level restriction, not specific to Nominatim) — the Referer header
// the browser sends automatically covers the same identification purpose in
// practice, which is why purely client-side use like this is workable.

const cache = new Map();   // roundKey -> resolved label string | null (null = failed, don't retry this session)
const pending = new Map(); // roundKey -> in-flight Promise, so simultaneous callers share one request instead of firing twice

let queueTail = Promise.resolve();
const MIN_SPACING_MS = 1100;

export function roundKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function formatAddress(json) {
  if (!json) return null;
  const a = json.address || {};
  const primary  = a.road || a.pedestrian || a.neighbourhood || a.suburb || a.village || a.town || a.city_district;
  const locality = a.city || a.town || a.municipality || a.county;
  if (primary && locality && primary !== locality) return `${primary}, ${locality}`;
  return primary || locality || json.display_name?.split(",").slice(0, 2).join(",").trim() || null;
}

function scheduleCall(fn) {
  const run = queueTail.then(() => new Promise((resolve) => setTimeout(resolve, MIN_SPACING_MS))).then(fn);
  queueTail = run.catch(() => {}); // one failed lookup shouldn't jam the queue for everyone after it
  return run;
}

/**
 * Resolves { lat, lng } to a short human-readable place label, e.g.
 * "Ayala Ave, Makati" — or null if it couldn't be resolved. Never throws.
 */
export function reverseGeocode(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return Promise.resolve(null);
  const key = roundKey(lat, lng);

  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (pending.has(key)) return pending.get(key);

  const promise = scheduleCall(() =>
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const label = formatAddress(json);
        cache.set(key, label);
        return label;
      })
      .catch(() => {
        cache.set(key, null);
        return null;
      })
      .finally(() => pending.delete(key))
  );

  pending.set(key, promise);
  return promise;
}