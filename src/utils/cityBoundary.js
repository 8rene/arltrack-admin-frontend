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
export async function fetchAreaBoundary(name) {
  const params = new URLSearchParams({
    format: "json",
    polygon_geojson: "1",
    polygon_threshold: "0.002",
    limit: "5",
    countrycodes: "ph",
    "accept-language": "en",
    q: `${name}, Philippines`,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status} for ${name}`);
  const results = await res.json();
  const isPoly = (r) => r?.geojson && (r.geojson.type === "Polygon" || r.geojson.type === "MultiPolygon");
  const polys = (results || []).filter(isPoly);
  const hit = polys.find((r) => r.class === "boundary") || polys[0];
  return hit ? { geometry: hit.geojson } : null;
}