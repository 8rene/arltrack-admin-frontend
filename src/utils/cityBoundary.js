// Fetches a city/municipality's real boundary polygon from Nominatim
// (OpenStreetMap's public geocoder) for drawing the actual coding-restricted
// area on the Live map, instead of an arbitrary circle. Same public endpoint
// admin-backend/services/gps/reverseGeocode.service.js uses server-side —
// this is the client-side counterpart, used only to fetch the *shape*, not
// to resolve which city a ping is in (that stays server-side, where a real
// User-Agent header can be set per Nominatim's usage policy).
//
// Browsers can't set a custom User-Agent (a browser-level restriction), so
// this relies on the auto-sent Referer for identification, same tradeoff
// SimulatePanel.jsx and reverseGeocode.js already make elsewhere in this app.
export async function fetchCityBoundary(cityName) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&limit=1&q=${encodeURIComponent(`${cityName}, Philippines`)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status} for ${cityName}`);
  const results = await res.json();
  const hit = results?.[0];
  if (!hit?.geojson || (hit.geojson.type !== "Polygon" && hit.geojson.type !== "MultiPolygon")) {
    throw new Error(`No polygon boundary found for ${cityName}`);
  }
  return { geometry: hit.geojson, lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), displayName: hit.display_name };
}

// Boundary lookup for the Settings "Base Area" map. Same endpoint as above, but:
//  - asks for several hits and takes the first real Polygon/MultiPolygon
//    (limit=1 often returns a point/node for ambiguous names), preferring
//    administrative boundaries
//  - polygon_threshold simplifies the outline so a whole province stays light
// Returns { geometry } — or null if the place simply has no outline.
// THROWS on a network/HTTP failure so the caller can tell "no outline" from "try again".
export async function fetchAreaBoundary(name, hint = "") {
  const params = new URLSearchParams({
    format: "json",
    polygon_geojson: "1",
    polygon_threshold: "0.002",
    limit: "5",
    countrycodes: "ph",
    "accept-language": "en",
    q: hint ? `${name}, ${hint}, Philippines` : `${name}, Philippines`, // hint (province) disambiguates e.g. "Santa Maria"
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status} for ${name}`);
  const results = await res.json();
  const isPoly = (r) => r?.geojson && (r.geojson.type === "Polygon" || r.geojson.type === "MultiPolygon");
  const polys = (results || []).filter(isPoly);
  const hit = polys.find((r) => r.class === "boundary") || polys[0];
  return hit ? { geometry: hit.geojson } : null;
}

// ── Shared outline cache (session-wide) ─────────────────────────────────────
// Used by CityMapPicker (picker) and CityLocationMap (view modal) so a city that
// was already outlined never triggers a second Nominatim request.
//   peekAreaOutline → undefined = not fetched yet, null = place has no outline, { geometry } = outline
const outlineCache = new Map();
const outlineKey = (name, hint = "") => `${String(name).trim().toLowerCase()}|${String(hint).trim().toLowerCase()}`;

export const peekAreaOutline = (name, hint = "") => outlineCache.get(outlineKey(name, hint));
export const cacheAreaOutline = (name, hint, value) => { outlineCache.set(outlineKey(name, hint), value); };

// THROWS on a network/HTTP failure (nothing cached), so callers can tell "no outline" from "try again".
export async function getAreaOutline(name, hint = "") {
  const k = outlineKey(name, hint);
  if (outlineCache.has(k)) return outlineCache.get(k);
  const o = await fetchAreaBoundary(name, hint);
  outlineCache.set(k, o);
  return o;
}

// A single { lat, lng } for a place name — fallback pin when the map has no outline. null if not found.
export async function fetchPlacePoint(name) {
  const params = new URLSearchParams({
    format: "jsonv2", limit: "1", countrycodes: "ph", "accept-language": "en", q: `${name}, Philippines`,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status} for ${name}`);
  const hit = (await res.json())?.[0];
  const lat = parseFloat(hit?.lat), lng = parseFloat(hit?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}