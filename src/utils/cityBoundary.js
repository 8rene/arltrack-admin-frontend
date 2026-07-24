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