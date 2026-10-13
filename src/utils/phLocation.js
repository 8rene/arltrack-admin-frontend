// Shared "is this spot on land in the Philippines?" check, used by every map
// picker on the System Settings page (store-location picker + base-area map).
//
// Uses one Nominatim reverse lookup at street level (zoom 18) and rejects a
// spot when:
//   - nothing is mapped there at all (open sea / empty water),
//   - it resolves to a water feature (bay, strait, sea, river, lake, …),
//   - it resolves to another country, or
//   - it has no place name (no city / town / village / barangay …).
//
// Known limit: a point in the water only a few metres off the shore can snap to
// the nearest mapped feature on land and be accepted. Open water and bays are
// rejected; the shoreline edge can't be perfect without a land-polygon dataset.
//
// Browsers can't set a custom User-Agent, so this relies on the auto-sent
// Referer, same as the other client-side Nominatim calls in this app.

const WATER_NATURAL = new Set([
  "bay", "strait", "sea", "water", "coastline", "reef", "shoal", "cape_water", "wetland",
]);

/** True for a Nominatim result (search or reverse) that is a water feature. */
export function isWaterFeature(r) {
  const c = r?.category || r?.class;
  const t = r?.type;
  return (
    c === "waterway" ||
    c === "water" ||
    (c === "natural" && WATER_NATURAL.has(t)) ||
    (c === "place" && (t === "sea" || t === "ocean"))
  );
}

export const REASON_TEXT = {
  "not-land": "That spot is in the water — pick a location on land inside the Philippines.",
  "outside-ph": "That spot is outside the Philippines — pick a location inside the Philippines.",
  error: "Couldn't look up that location — check your connection and try again.",
};

/**
 * Resolves lat/lng. Never throws.
 *   ok:true  → { ok, label, address, json }
 *   ok:false → { ok, reason: "not-land" | "outside-ph" | "error" }
 */
export async function reversePH(lat, lng) {
  try {
    const params = new URLSearchParams({
      format: "jsonv2", lat, lon: lng, zoom: "18", addressdetails: "1", "accept-language": "en",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!res.ok) return { ok: false, reason: "error" };
    const json = await res.json();

    if (json.error) return { ok: false, reason: "not-land" }; // nothing mapped here
    const address = json.address || {};
    if (address.country_code !== "ph") return { ok: false, reason: "outside-ph" };
    if (isWaterFeature(json)) return { ok: false, reason: "not-land" };

    const hasLocality = !!(
      address.city || address.town || address.village || address.municipality ||
      address.suburb || address.county || address.hamlet || address.neighbourhood
    );
    if (!hasLocality) return { ok: false, reason: "not-land" };

    return { ok: true, json, address, label: json.display_name || `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` };
  } catch {
    return { ok: false, reason: "error" };
  }
}