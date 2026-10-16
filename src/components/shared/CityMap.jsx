import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getAreaOutline, peekAreaOutline, cacheAreaOutline, fetchPlacePoint } from "../../utils/cityBoundary";
import { reversePH, REASON_TEXT } from "../../utils/phLocation";

// ─── CityMap ───────────────────────────────────────────────────────────
// ONE component, two modes (this file replaces the old CityMapPicker +
// CityLocationMap pair):
//
// 1) PICK mode (default) — picks the city for a number-coding schedule from the
//    MAP, not from typing.
//
//      <CityMap
//        value={name}                 // committed city ("" until one is confirmed)
//        onChange={setName}           // called with the confirmed name
//        takenCities={[...]}          // cities that already have rules (shaded grey, can't be picked)
//        autoFocus
//      />
//
// 2) VIEW mode — read-only map of one existing city, shown above its rules table.
//
//      <CityMap readOnly value={city} />
//
//    Zooms to the city and shades the area its rules apply to. If the map has no
//    outline it drops a pin; if it can't find the name at all it warns that the
//    name may never match a car's GPS position; a failed load shows a Retry link.
//    Mouse-wheel zoom is off so scrolling the modal doesn't zoom the map.
//
// WHY A MAP: the live GPS check compares a rule's city with the name Nominatim
// returns for the car's position — an EXACT (case-insensitive) match of
//   address.city || town || municipality || county
// (see admin-backend/services/gps/reverseGeocode.service.js). A name typed by
// hand can be a letter off and then never match any car, silently. Here, a
// click on the map (or a picked search result) is reverse-geocoded the SAME
// way, so the name shown is the name the live check will compare against, and
// the city's outline is drawn so the admin can see what area the rule covers.
//
// Nothing is committed until the admin presses "Use <city>".
//
// Nominatim's public limit is ~1 request/second: searches are debounced, the
// outline lookup waits ~1 s after the name lookup, and existing-city outlines
// are fetched one at a time.

const PH_CENTER = [12.8, 122.0];
const PH_BOUNDS = L.latLngBounds([4.5, 116.0], [21.5, 127.0]);
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const MAX_TAKEN_OUTLINES = 30; // outlines are decoration — don't hammer Nominatim for huge lists

const STYLE_TAKEN   = { color: "#64748b", weight: 1.5, fillColor: "#94a3b8", fillOpacity: 0.25 };
const STYLE_PICKED  = { color: "#b45309", weight: 2.5, fillColor: "#f59e0b", fillOpacity: 0.3 };
const STYLE_CHOSEN  = { color: "#0d9488", weight: 2.5, fillColor: "#14b8a6", fillOpacity: 0.35 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inputCls =
  "w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400";

// Same name the backend's live check resolves a position to.
const cityNameOfAddress = (a = {}) => a.city || a.town || a.municipality || a.county || null;

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (target.bbox) map.flyToBounds(target.bbox, { padding: [24, 24], maxZoom: 12 });
    else map.flyTo([target.lat, target.lng], target.zoom || 11);
  }, [target, map]);
  return null;
}

function ClickCatcher({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// ═════════════════════════════════════════════════════════════════════════════
// VIEW mode
// ═════════════════════════════════════════════════════════════════════════════
function CityView({ city }) {
  // status: loading | outline | pin | notfound | error
  const [state, setState] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0); // bump to retry after a failed load

  useEffect(() => {
    if (!city) return undefined;
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        let o = peekAreaOutline(city);
        if (o === undefined) o = await getAreaOutline(city); // throws on network failure
        if (cancelled) return;
        if (o?.geometry) {
          setState({ status: "outline", geometry: o.geometry, bbox: L.geoJSON(o.geometry).getBounds() });
          return;
        }
        // The map has no outline for this name — fall back to a pin.
        const p = await fetchPlacePoint(city);
        if (cancelled) return;
        setState(p ? { status: "pin", point: p } : { status: "notfound" });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => { cancelled = true; };
  }, [city, attempt]);

  const fly =
    state.status === "outline" ? { bbox: state.bbox }
    : state.status === "pin" ? { lat: state.point.lat, lng: state.point.lng, zoom: 12 }
    : null;

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-gray-200" style={{ height: 220 }}>
        <MapContainer
          key={city}
          center={PH_CENTER}
          zoom={6}
          minZoom={5}
          maxBounds={PH_BOUNDS}
          maxBoundsViscosity={1.0}
          scrollWheelZoom={false} // the modal scrolls — don't hijack the wheel
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILES} />
          {state.status === "outline" && (
            <GeoJSON
              key={`view-${city}`}
              data={state.geometry}
              style={STYLE_CHOSEN}
              onEachFeature={(_, layer) => layer.bindTooltip(`${city} — rules apply in this area`, { sticky: true })}
            />
          )}
          {state.status === "pin" && (
            <CircleMarker
              center={[state.point.lat, state.point.lng]}
              radius={8}
              pathOptions={{ color: "#0d9488", fillColor: "#14b8a6", fillOpacity: 0.9 }}
            />
          )}
          <FlyTo target={fly} />
        </MapContainer>
        {state.status === "loading" && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/50 pointer-events-none">
            <span className="text-xs text-gray-500 bg-white px-3 py-1 rounded-full shadow">Loading map…</span>
          </div>
        )}
      </div>

      {state.status === "pin" && (
        <p className="text-xs text-gray-400">The map has no outline for “{city}”, so only its location is shown.</p>
      )}
      {state.status === "notfound" && (
        <p className="text-xs text-amber-600">
          ⚠ The map can't find a place called “{city}”. This name may never match a car's GPS position —
          consider renaming the city by picking it on the map.
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-red-500">
          Couldn't load the map.{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline font-medium hover:text-red-700">
            Retry
          </button>
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PICK mode
// ═════════════════════════════════════════════════════════════════════════════
function CityPicker({
  value,
  onChange,
  takenCities = [],
  autoFocus = false,
  placeholder = "Search a city, then confirm it on the map…",
}) {
  // ── Search box (forward geocode, PH settlements only) ────────────────────
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  // ── Map state ────────────────────────────────────────────────────────────
  const [pick, setPick] = useState(null);       // the spot being looked at (not yet committed)
  const [fly, setFly] = useState(null);
  const [typed, setTyped] = useState(false);    // committed value came from the "as typed" fallback
  const [outlineTick, redraw] = useReducer((x) => x + 1, 0); // bumps when a new outline lands in the cache
  const seq = useRef(0);

  const takenKey = takenCities.join("|");
  const isTaken = (n) => takenCities.some((c) => c.trim().toLowerCase() === String(n).trim().toLowerCase());

  // Outlines for the committed city + cities that already have rules (sequential, cached).
  useEffect(() => {
    const names = [...(value ? [value] : []), ...takenCities.slice(0, MAX_TAKEN_OUTLINES)];
    const missing = names.filter((n) => peekAreaOutline(n) === undefined);
    if (missing.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      for (const n of missing) {
        if (cancelled) return;
        if (peekAreaOutline(n) !== undefined) continue;
        try {
          await getAreaOutline(n);
          if (!cancelled) redraw();
        } catch { /* decoration only — leave it uncached so a later open can retry */ }
        await sleep(1100);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, takenKey]);

  // Fly to the committed city's outline once when the picker opens on an existing value (rename).
  // Re-runs when the outline arrives (outlineTick); the ref makes sure it only flies once.
  const flewToValue = useRef(false);
  useEffect(() => {
    if (flewToValue.current || !value) return;
    const o = peekAreaOutline(value);
    if (!o?.geometry) return;
    flewToValue.current = true;
    setFly({ bbox: L.geoJSON(o.geometry).getBounds(), stamp: Date.now() });
  }, [value, outlineTick]);

  // ── Search ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setOptions([]);
      setSearching(false);
      return undefined;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          format: "jsonv2", addressdetails: "1", countrycodes: "ph",
          featureType: "settlement", limit: "8", "accept-language": "en", q,
        });
        const res = await fetch(`${NOMINATIM_SEARCH}?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("search failed");
        const rows = await res.json();
        const seen = new Set();
        const out = [];
        for (const r of rows) {
          const a = r.address || {};
          const name = cityNameOfAddress(a) || r.name;
          if (!name) continue;
          const sub = a.province || a.county || a.state || "";
          const key = `${name}|${sub}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const bb = (r.boundingbox || []).map(parseFloat); // [south, north, west, east]
          out.push({
            name, sub,
            lat: parseFloat(r.lat), lng: parseFloat(r.lon),
            bbox: bb.length === 4 && bb.every(Number.isFinite) ? [[bb[0], bb[2]], [bb[1], bb[3]]] : null,
          });
        }
        setOptions(out);
        setSearchFailed(false);
      } catch (e) {
        if (e.name !== "AbortError") { setOptions([]); setSearchFailed(true); }
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  // ── Look up a spot: the name the live check would see + the city outline ──
  const resolve = useCallback(async (latlng) => {
    const my = ++seq.current;
    setPick({ status: "loading", latlng });

    const r = await reversePH(latlng.lat, latlng.lng);
    if (my !== seq.current) return; // a newer click/search superseded this one
    if (!r.ok) {
      setPick(r.reason === "error" ? { status: "error", latlng } : { status: "blocked", latlng, reason: r.reason });
      return;
    }
    const name = cityNameOfAddress(r.address);
    if (!name) {
      setPick({ status: "noname", latlng });
      return;
    }
    const sub = r.address.province || r.address.state || "";
    setPick({ status: "done", latlng, name, sub, outline: undefined }); // undefined = outline still loading

    await sleep(1100); // stay under Nominatim's 1 req/s
    if (my !== seq.current) return;
    let geometry = null;
    try { geometry = (await getAreaOutline(name, sub))?.geometry || null; } catch { /* name is still valid without an outline */ }
    if (my !== seq.current) return;
    setPick((p) => (p && p.status === "done" && p.name === name ? { ...p, outline: geometry } : p));
    if (geometry) setFly({ bbox: L.geoJSON(geometry).getBounds(), stamp: Date.now() });
  }, []);

  const selectOption = (o) => {
    setQuery(o.name);
    setOpen(false);
    setFly(o.bbox ? { bbox: o.bbox, stamp: Date.now() } : { lat: o.lat, lng: o.lng, stamp: Date.now() });
    resolve({ lat: o.lat, lng: o.lng });
  };

  const confirm = () => {
    if (pick?.status !== "done") return;
    // Remember the outline under the plain name too, so the committed city keeps its shading.
    if (pick.outline) cacheAreaOutline(pick.name, "", { geometry: pick.outline });
    setTyped(false);
    onChange(pick.name);
    setPick(null);
  };

  const useTyped = () => {
    const t = query.trim();
    if (!t) return;
    setTyped(true);
    setOpen(false);
    setPick(null);
    onChange(t);
  };

  const typedText = query.trim();
  const showList = open && typedText.length >= 3;
  const chosenOutline = value ? peekAreaOutline(value)?.geometry : null;

  return (
    <div className="space-y-2 relative z-0">
      {/* Search — finds a place and drops a pin on it; you still confirm below */}
      <div className="relative">
        <input
          autoFocus={autoFocus}
          className={inputCls}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && options[0]) { e.preventDefault(); selectOption(options[0]); }
            if (e.key === "Escape") setOpen(false);
          }}
        />
        {showList && (
          <div className="absolute z-[1000] mt-1 w-full max-h-56 overflow-y-auto border border-gray-100 rounded-xl bg-white shadow-lg">
            {searching && <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>}
            {!searching && searchFailed && (
              <p className="px-3 py-2 text-xs text-red-500">Couldn't reach the map search. Try again, or click the map.</p>
            )}
            {!searching && !searchFailed && options.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No matching city found. Try the map instead.</p>
            )}
            {options.map((o) => (
              <button
                key={`${o.name}|${o.sub}|${o.lat}`}
                type="button"
                onClick={() => selectOption(o)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 flex items-baseline justify-between gap-3 border-t border-gray-50 first:border-t-0"
              >
                <span className="font-medium text-gray-800">{o.name}</span>
                {o.sub && <span className="text-xs text-gray-400">{o.sub}</span>}
              </button>
            ))}
            {!searching && (
              <button
                type="button"
                onClick={useTyped}
                className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100"
              >
                Not a city on the map (e.g. “Clark”)? Use “{typedText}” as typed…
              </button>
            )}
          </div>
        )}
      </div>

      {/* The map */}
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 300 }}>
        <MapContainer
          center={PH_CENTER}
          zoom={6}
          minZoom={5}
          maxBounds={PH_BOUNDS}
          maxBoundsViscosity={1.0}
          scrollWheelZoom
          style={{ height: "100%", width: "100%", cursor: "crosshair" }}
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILES} />
          {/* Cities that already have rules */}
          {takenCities.slice(0, MAX_TAKEN_OUTLINES).map((c) => {
            const o = peekAreaOutline(c);
            return o?.geometry && c.toLowerCase() !== String(value || "").toLowerCase() ? (
              <GeoJSON
                key={`taken-${c}`}
                data={o.geometry}
                style={STYLE_TAKEN}
                onEachFeature={(_, layer) => layer.bindTooltip(`${c} (already has rules)`, { sticky: true })}
              />
            ) : null;
          })}
          {/* The committed city */}
          {chosenOutline && (
            <GeoJSON
              key={`chosen-${value}`}
              data={chosenOutline}
              style={STYLE_CHOSEN}
              onEachFeature={(_, layer) => layer.bindTooltip(`${value} (selected)`, { sticky: true })}
            />
          )}
          {/* The spot being looked at */}
          {pick?.status === "done" && pick.outline && (
            <GeoJSON key={`pick-${pick.name}-${pick.sub}`} data={pick.outline} style={STYLE_PICKED} />
          )}
          {pick?.latlng && pick.status !== "blocked" && (
            <CircleMarker center={pick.latlng} radius={6} pathOptions={{ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.9 }} />
          )}
          <FlyTo target={fly} />
          <ClickCatcher onClick={resolve} />
        </MapContainer>
      </div>

      {/* What the last click / search resolved to */}
      {!pick && !value && (
        <p className="text-xs text-gray-400">Search above or click the map. You'll see the exact city name and its outline before you confirm.</p>
      )}
      {pick?.status === "loading" && <p className="text-xs text-gray-400">Looking up that spot…</p>}
      {pick?.status === "blocked" && <p className="text-xs text-red-500">{REASON_TEXT[pick.reason]}</p>}
      {pick?.status === "error" && <p className="text-xs text-red-500">Couldn't look up that spot — try again.</p>}
      {pick?.status === "noname" && (
        <p className="text-xs text-amber-600">
          That spot has no city or municipality on the map (only a smaller area). Click closer to the city, or use the search.
        </p>
      )}
      {pick?.status === "done" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-gray-700 space-y-1.5">
          <p>
            That spot is in <strong>{pick.name}</strong>{pick.sub ? <span className="text-gray-500"> ({pick.sub})</span> : null}.
            {pick.outline === undefined && <span className="text-gray-400"> Drawing its outline…</span>}
            {pick.outline === null && <span className="text-gray-400"> No outline found on the map — the name is still what GPS will match.</span>}
          </p>
          {isTaken(pick.name) ? (
            <p className="text-amber-700 font-medium">“{pick.name}” already has coding rules — pick another city, or open it from the list.</p>
          ) : pick.name === value ? (
            <p className="text-green-600 font-medium">✓ Already selected.</p>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={confirm}
                className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
              >
                Use {pick.name}
              </button>
              <span className="text-gray-400">Cars are matched to this exact name.</span>
            </div>
          )}
        </div>
      )}

      {/* The committed choice */}
      {value && !typed && <p className="text-xs text-green-600">✓ Selected: <strong>{value}</strong></p>}
      {value && typed && (
        <p className="text-xs text-amber-600">
          ⚠ “{value}” was typed, not picked from the map. It only works if the GPS lookup returns exactly this name —
          confirm a spot on the map instead if you can.
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Public component — picks the mode (kept as a wrapper so each mode keeps its
// own hooks and they never switch mid-lifetime).
// ═════════════════════════════════════════════════════════════════════════════
export default function CityMap({ readOnly = false, ...props }) {
  return readOnly ? <CityView city={props.value} /> : <CityPicker {...props} />;
}