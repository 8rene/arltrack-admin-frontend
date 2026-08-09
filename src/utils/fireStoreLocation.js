// firestoreLocation.js
// Region → Province → Municipality → Barangay reference data, served by
// the admin backend at /api/location/* (same Firestore collections the
// customer signup flow already relies on — see
// arltrack-customer-frontend/src/utils/firestoreLocation.js for the
// original of this file).

const BASE_URL = `${process.env.REACT_APP_API_URL}/api/location`;

// ── Simple in-memory cache so repeated renders don't re-fetch ──
const cache = {};

const fetchCached = async (key, url, token) => {
  if (cache[key]) return cache[key];
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const data = await res.json();
  cache[key] = data;
  return data;
};

/** Fetch all regions (sorted by name) */
export const fetchRegions = (token) =>
  fetchCached("regions", `${BASE_URL}/regions`, token);

/** Fetch provinces for a given regionID */
export const fetchProvinces = (regionID, token) =>
  regionID
    ? fetchCached(`provinces_${regionID}`, `${BASE_URL}/provinces?regionID=${regionID}`, token)
    : Promise.resolve([]);

/** Fetch municipalities for a given provinceID */
export const fetchMunicipalities = (provinceID, token) =>
  provinceID
    ? fetchCached(
        `municipalities_${provinceID}`,
        `${BASE_URL}/municipalities?provinceID=${provinceID}`,
        token
      )
    : Promise.resolve([]);

/** Fetch barangays for a given municipalityID */
export const fetchBarangays = (municipalityID, token) =>
  municipalityID
    ? fetchCached(
        `barangays_${municipalityID}`,
        `${BASE_URL}/barangays?municipalityID=${municipalityID}`,
        token
      )
    : Promise.resolve([]);