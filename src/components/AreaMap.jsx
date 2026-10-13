import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchAreaBoundary } from "../utils/cityBoundary";
import { reversePH, isWaterFeature, REASON_TEXT } from "../utils/phLocation";

// ─── AreaMap (shared) ───────────────────────────────────────────────────────
// Shows a list of PH places (cities / provinces) as shaded outlines on a map,
// with a search bar, and — when `editable` — click-to-add.
//
//   <AreaMap
//     areas={["manila", "bulacan"]}   // place names to shade (any case)
//     editable={editMode}             // enables click / search-to-add
//     onAdd={(name) => ...}           // called with the PH-list name the user confirms
//     isDark={isDark}
//     addLabel="base area"            // wording only: "Add to {addLabel}:"
//   />
//
// Used by the System Settings page (base-area keywords) only. Only spots on
// LAND inside the Philippines can be picked — see utils/phLocation.js.
//
//  - Outlines come from Nominatim (same source as the Live-map coding zones).
//    They're fetched one at a time, ~1.1 s apart, to respect Nominatim's
//    public-usage limit, and cached for the session (shared by every AreaMap on
//    screen) so removing/re-adding an area or discarding changes never refetches.
//  - Outlines follow `areas` as it changes, so unsaved edits preview live.
//  - Clicking the map or picking a search result only SUGGESTS names, and
//    nothing is added until the user presses its button — so no misspelled
//    name gets in.
//
// The map is a visual aid only; whatever consumes `areas` decides how they're
// matched (e.g. the booking check matches base-area keywords as TEXT inside the
// destination, so "manila" also matches "New Manila").

const boundaryCache = new Map(); // keyword -> { geometry } | null (null = place has no outline)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = process.env.REACT_APP_API_URL;

const PH_CENTER = [12.8, 122.0];
const PH_BOUNDS = L.latLngBounds([4.5, 116.0], [21.5, 127.0]);

const AREA_STYLE = { color: "#0d9488", weight: 2, fillColor: "#14b8a6", fillOpacity: 0.35 };

// "City of Manila" / "Manila City" / "Bulacan Province" → "manila" / "manila" / "bulacan"
const norm = (n) =>
  String(n || "")
    .toLowerCase()
    .replace(/^city of\s+/, "")
    .replace(/\s+city$/, "")
    .replace(/\s+province$/, "")
    .trim();

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function FitBounds({ bounds }) {
  const map = useMap();
  const key = bounds ? bounds.toBBoxString() : "";
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

// Pans/zooms the map to a searched place (uses its bounding box when it has one,
// so a whole province fits on screen instead of zooming to its centre point).
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (target.bbox) map.flyToBounds(target.bbox, { padding: [24, 24], maxZoom: 12 });
    else map.flyTo([target.lat, target.lng], 11);
  }, [target, map]);
  return null;
}

function ClickCatcher({ enabled, onClick }) {
  useMapEvents({
    click(e) {
      if (enabled) onClick(e.latlng);
    },
  });
  return null;
}

export default function AreaMap({ areas, editable, onAdd, isDark, addLabel = "base area" }) {
  const [shapes, setShapes] = useState(() => Object.fromEntries(boundaryCache));
  const [failed, setFailed] = useState(() => new Set()); // areas whose lookup errored (retryable)
  const [pick, setPick] = useState(null);
  const pickSeq = useRef(0);

  // Search bar state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [flyTarget, setFlyTarget] = useState(null);

  const kwKey = areas.join("|");

  // ── Fetch outlines for areas we don't have yet, sequentially ──────────
  useEffect(() => {
    const missing = areas.filter((k) => !boundaryCache.has(k) && !failed.has(k));
    if (missing.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      for (const k of missing) {
        if (cancelled) return;
        if (boundaryCache.has(k)) continue;
        try {
          boundaryCache.set(k, await fetchAreaBoundary(k));
          if (!cancelled) setShapes(Object.fromEntries(boundaryCache));
        } catch {
          if (!cancelled) setFailed((f) => new Set(f).add(k));
        }
        await sleep(1100);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kwKey, failed]);

  // ── Search bar: debounced Nominatim lookup (PH only, ≤1 req/s) ───────────
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          format: "jsonv2", countrycodes: "ph", limit: "6", addressdetails: "0", "accept-language": "en", q,
        });
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("search failed");
        setResults((await res.json()).filter((r) => !isWaterFeature(r)));
        setSearchFailed(false);
        setListOpen(true);
      } catch (e) {
        if (e.name !== "AbortError") { setResults([]); setSearchFailed(true); setListOpen(true); }
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const bounds = useMemo(() => {
    let b = null;
    for (const k of areas) {
      const s = shapes[k];
      if (!s) continue;
      const lb = L.geoJSON(s.geometry).getBounds();
      b = b ? b.extend(lb) : lb;
    }
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kwKey, shapes]);

  // ── Click the map → suggest matching PH-list names ───────────────────────
  // `seed` = the place a search result is about ({ name, kind }). It is always
  // offered first, even when its centre point falls on water (a bay, a province
  // centroid …) — the place itself is real, only a raw map CLICK gets the
  // land check.
  const resolveClick = useCallback(async (latlng, seed = null) => {
    const seq = ++pickSeq.current;
    setPick({ status: "loading", latlng });

    const r = await reversePH(latlng.lat, latlng.lng);
    if (seq !== pickSeq.current) return; // a newer click superseded this one
    if (!r.ok && !seed) {
      setPick(r.reason === "error" ? { status: "error", latlng } : { status: "blocked", latlng, reason: r.reason });
      return;
    }

    try {
      const a = r.ok ? r.address : {};

      // Candidate names, most specific first. Barangay-level names are skipped.
      const candidates = [];
      const seen = new Set();
      const add = (name, kind) => {
        const clean = String(name || "").trim();
        const key = clean.toLowerCase();
        if (!clean || seen.has(key)) return;
        seen.add(key);
        candidates.push({ name: clean, kind });
      };
      if (seed) add(seed.name, seed.kind);
      [a.city, a.town, a.municipality, a.county, a.province, a.state].forEach((n) =>
        add(n, n && n === a.state ? "region" : "area")
      );

      // A name found in the PH location list uses the list's own spelling and
      // type (City / Province); otherwise it's offered as the map's name
      // (e.g. "Metro Manila", "Makati", which the list doesn't have).
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const found = await Promise.all(
        candidates.map(async (c) => {
          try {
            const res = await fetch(`${API}/api/settings/pricing/area-options?q=${encodeURIComponent(norm(c.name))}`, { headers });
            const j = await res.json();
            const hit = (j.data || []).find((o) => norm(o.name) === norm(c.name));
            if (hit) return { id: hit.id, name: hit.name, type: hit.type };
          } catch { /* fall back to the map's own name below */ }
          return { id: c.name, name: c.name, type: c.kind };
        })
      );
      if (seq !== pickSeq.current) return;
      const options = found.filter((o, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === o.name.toLowerCase()) === i);
      setPick({ status: "done", latlng, where: candidates[0]?.name || "that spot", options });
    } catch {
      if (seq === pickSeq.current) setPick({ status: "error", latlng });
    }
  }, []);

  // Picking a search result flies there; in edit mode it also looks up which
  // PH-list names (city / province) are at that spot, same as clicking the map.
  const selectResult = (r) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    const bb = (r.boundingbox || []).map(parseFloat); // [south, north, west, east]
    setFlyTarget({
      lat, lng,
      bbox: bb.length === 4 && bb.every(Number.isFinite) ? [[bb[0], bb[2]], [bb[1], bb[3]]] : null,
      stamp: Date.now(),
    });
    setQuery(String(r.display_name || "").split(",").slice(0, 2).join(",").trim());
    setListOpen(false);
    if (editable) {
      resolveClick(
        { lat, lng },
        {
          name: String(r.name || String(r.display_name || "").split(",")[0] || "").trim(),
          kind: r.addresstype === "state" || r.addresstype === "region" ? "region" : "area",
        }
      );
    }
  };

  // ── Styling ──────────────────────────────────────────────────────────────
  const muted = isDark ? "text-[#F5F5F5]/50" : "text-gray-400";
  const inputCls = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${
    isDark
      ? "bg-[#212121] border-[#4FC3F7]/20 text-[#F5F5F5] focus:ring-[#4FC3F7]/40"
      : "bg-white border-gray-200 text-arl-dark focus:ring-arl-dark/20"
  }`;
  const inBase = (name) => areas.some((a) => a.trim().toLowerCase() === name.trim().toLowerCase());

  const statusOf = (k) => {
    if (failed.has(k)) return "error";
    if (!(k in shapes) && !boundaryCache.has(k)) return "loading";
    return shapes[k] ? "ok" : "none";
  };

  return (
    <div className="space-y-2 relative z-0">
      {/* Search bar — finds a place and flies the map to it */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setListOpen(true); }}
          onFocus={() => query.trim().length >= 3 && setListOpen(true)}
          onBlur={() => setTimeout(() => setListOpen(false), 150)} // lets a click on a result register first
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) { e.preventDefault(); selectResult(results[0]); }
            if (e.key === "Escape") setListOpen(false);
          }}
          placeholder="Search a city, province or region…"
          autoComplete="off"
          className={inputCls}
        />
        {listOpen && query.trim().length >= 3 && (
          <div className={`absolute z-[1000] mt-1 w-full max-h-56 overflow-y-auto rounded-xl border shadow-lg ${
            isDark ? "bg-[#212121] border-[#4FC3F7]/20" : "bg-white border-gray-200"
          }`}>
            {searching ? (
              <p className={`px-3 py-2 text-xs ${muted}`}>Searching…</p>
            ) : searchFailed ? (
              <p className="px-3 py-2 text-xs text-[#D32F2F]">Couldn't reach the map search. Try again.</p>
            ) : results.length === 0 ? (
              <p className={`px-3 py-2 text-xs ${muted}`}>No places found.</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.place_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectResult(r)}
                  className={`w-full text-left px-3 py-2 text-sm border-t first:border-t-0 ${
                    isDark ? "border-[#4FC3F7]/10 text-[#F5F5F5] hover:bg-[#4FC3F7]/10" : "border-gray-50 text-arl-dark hover:bg-gray-50"
                  }`}
                >
                  <span className="block truncate">{String(r.display_name).split(",").slice(0, 3).join(",")}</span>
                  <span className={`text-[10px] uppercase tracking-wide ${muted}`}>{String(r.type || r.addresstype || "").replace(/_/g, " ")}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className={`rounded-xl overflow-hidden border ${isDark ? "border-[#4FC3F7]/20" : "border-gray-200"}`} style={{ height: 340 }}>
        <MapContainer
          center={PH_CENTER}
          zoom={6}
          minZoom={5}
          maxBounds={PH_BOUNDS}
          maxBoundsViscosity={1.0}
          scrollWheelZoom
          style={{ height: "100%", width: "100%", cursor: editable ? "crosshair" : undefined }}
        >
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {areas.map((k) =>
            shapes[k] ? (
              <GeoJSON
                key={k}
                data={shapes[k].geometry}
                style={AREA_STYLE}
                onEachFeature={(_, layer) => layer.bindTooltip(titleCase(k), { sticky: true })}
              />
            ) : null
          )}
          {pick?.latlng && pick.status !== "blocked" && (
            <CircleMarker center={pick.latlng} radius={6} pathOptions={{ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.9 }} />
          )}
          <FitBounds bounds={bounds} />
          <FlyTo target={flyTarget} />
          <ClickCatcher enabled={editable} onClick={resolveClick} />
        </MapContainer>
      </div>

      {/* Result of the last map click */}
      {editable && !pick && (
        <p className={`text-[11px] ${muted}`}>Search above or click anywhere on the map to add a city, province or region to the {addLabel}.</p>
      )}
      {editable && pick?.status === "loading" && <p className={`text-[11px] ${muted}`}>Looking up that spot…</p>}
      {editable && pick?.status === "blocked" && (
        <p className="text-[11px] text-[#D32F2F]">{REASON_TEXT[pick.reason]}</p>
      )}
      {editable && pick?.status === "error" && (
        <p className="text-[11px] text-[#D32F2F]">Couldn't look up that spot — try again.</p>
      )}
      {editable && pick?.status === "done" && (
        <div className={`rounded-xl border px-3 py-2 text-xs space-y-1.5 ${isDark ? "border-[#4FC3F7]/20 text-[#F5F5F5]/80" : "border-gray-200 text-gray-600"}`}>
          {pick.options.length === 0 ? (
            <p>
              Couldn't find a named place at that spot. Try the search box above, or click a different spot.
            </p>
          ) : (
            <>
              <p>You clicked in <strong>{pick.where}</strong>. Add to {addLabel}:</p>
              <div className="flex flex-wrap gap-2">
                {pick.options.map((o) => {
                  const added = inBase(o.name);
                  return (
                    <button
                      key={`${o.type}-${o.id}`}
                      type="button"
                      disabled={added}
                      onClick={() => onAdd(o.name)}
                      className={`px-3 py-1 rounded-full border text-xs font-semibold transition disabled:opacity-50 ${
                        isDark ? "border-[#4FC3F7]/40 text-[#4FC3F7] hover:bg-[#4FC3F7]/10" : "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100"
                      }`}
                    >
                      {added ? `✓ ${o.name}` : `+ ${o.name}`}
                      <span className="ml-1.5 text-[10px] uppercase opacity-60">
                        {{ province: "Province", region: "Region", area: "Area" }[o.type] || "City"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Outline status per keyword */}
      {areas.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {areas.map((k) => {
            const st = statusOf(k);
            return (
              <span key={k} className={`inline-flex items-center gap-1.5 text-[11px] ${muted}`}>
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: st === "ok" ? AREA_STYLE.fillColor : "transparent", border: `1px solid ${st === "ok" ? AREA_STYLE.color : "#9ca3af"}` }}
                />
                {titleCase(k)}
                {st === "loading" && " — outlining…"}
                {st === "none" && " — no outline found"}
                {st === "error" && " — lookup failed"}
              </span>
            );
          })}
          {failed.size > 0 && (
            <button type="button" onClick={() => setFailed(new Set())} className="text-[11px] underline font-medium text-teal-600">
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}