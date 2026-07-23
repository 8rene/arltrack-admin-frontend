import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import GeofenceBanner from "../../components/GeofenceBanner";

// ── Constants ───────────────────────────────────────────────────────────────
const CAR_IDS = ["car1", "car2", "car3", "car4", "car5", "car6"];
const STEP_SECONDS = 30;      // matches the 30s grid baked into simulate_data/*.json
const DAY_SECONDS = 24 * 3600;
const NUM_POINTS = DAY_SECONDS / STEP_SECONDS; // 2880

// ── Small time/geo helpers ──────────────────────────────────────────────────
function timeToSec(hms) {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}
function secToClock(sec) {
  sec = Math.floor(sec) % DAY_SECONDS;
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlmb = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlmb / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function windowActiveAt(zone, curSec) {
  return curSec >= timeToSec(zone.windowStart) && curSec <= timeToSec(zone.windowEnd);
}
function isViolatingAt(zone, point, curSec) {
  if (!windowActiveAt(zone, curSec)) return false;
  return haversineKm(point.lat, point.lng, zone.lat, zone.lng) <= zone.radius;
}
// Destination arrival isn't time-gated like the coding zone — it's just
// "is the car currently within its destination's radius," any time of day.
function isAtDestination(destination, point) {
  return haversineKm(point.lat, point.lng, destination.lat, destination.lng) <= destination.radius;
}

function makeCarIcon(color, focused, violating) {
  const size = focused ? 40 : 32;
  const ring = violating
    ? `0 0 0 5px #ef444488, 0 0 0 2px white, 0 4px 14px rgba(0,0,0,0.4)`
    : focused
    ? `0 0 0 5px ${color}55, 0 4px 14px rgba(0,0,0,0.4)`
    : `0 0 0 3px ${color}33, 0 2px 8px rgba(0,0,0,0.3)`;
  return L.divIcon({
    className: violating ? "sim-car-violating" : "",
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid white;border-radius:50%;box-shadow:${ring};" />`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
function makeStartIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:12px;height:12px;background:white;border:3px solid ${color};border-radius:50%;" />`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}
function makeZoneLabelIcon(city, color, active) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);transform:translateY(-26px);opacity:${active ? 1 : 0.55}">${city}${active ? " ⏰ ACTIVE" : ""}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
// Destination pin — fixed 30px flag marker, distinct from the round car
// marker and the round zone-label pill, so it reads as "a place" not "a car".
const DESTINATION_ICON_SIZE = 30;
function makeDestinationIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${DESTINATION_ICON_SIZE}px;height:${DESTINATION_ICON_SIZE}px;background:${color};border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:13px;">🏁</span>
    </div>`,
    iconSize: [DESTINATION_ICON_SIZE, DESTINATION_ICON_SIZE],
    iconAnchor: [DESTINATION_ICON_SIZE / 2, DESTINATION_ICON_SIZE],
  });
}

/**
 * Hardcoded, fully client-side "day in the life" simulation of 6 cars — no
 * backend, no DB. Each car's route + restricted-zone/time-window config is
 * baked into /public/simulate_data/{carId}.json (2,880 points, one every
 * 30s, covering 00:00:00–23:59:59). Enter/exit logs are derived live from
 * route × zone geometry as the shared clock advances, never pre-written,
 * so they stay correct at any scrub position or playback speed.
 */
export default function SimulatePanel() {
  const [cars, setCars] = useState([]);           // [{id,name,color,restrictedZone,points}]
  const [loadError, setLoadError] = useState(null);
  const [visible, setVisible] = useState({});
  const [focusedCar, setFocusedCar] = useState(null);
  const [idx, setIdx] = useState(0);               // shared index into every car's points[] (same time grid for all)
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);
  const [showLogs, setShowLogs] = useState(false);
  const [showBookingInfo, setShowBookingInfo] = useState(false);
  const [flyPos, setFlyPos] = useState(null);
  const playRef = useRef(null);

  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const layersRef = useRef({});      // { [carId]: { ghost, active, start, current } }
  const zoneLayersRef = useRef({});  // { [carId]: { circle, label } }
  const destLayersRef = useRef({});  // { [carId]: { circle, marker } } — static, drawn once per car

  // ── Load the 6 hardcoded data files once ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await Promise.all(
          CAR_IDS.map(async id => {
            const url = `${process.env.PUBLIC_URL}/simulate_data/${id}.json`;
            const r = await fetch(url);
            if (!r.ok) throw new Error(`${url} → HTTP ${r.status}. Check the file exists at exactly that path.`);
            const text = await r.text();
            if (!text.trim()) throw new Error(`${url} → file is empty (0 bytes). Re-save/re-copy this file.`);
            try {
              return JSON.parse(text);
            } catch {
              throw new Error(`${url} → not valid JSON (got ${text.slice(0, 60).replace(/\s+/g, " ")}...). Likely the dev server returned index.html — double check the path/filename.`);
            }
          })
        );
        if (cancelled) return;
        setCars(loaded);
        setVisible(Object.fromEntries(loaded.map(c => [c.id, true])));
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Failed to load simulation data.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const curSec = idx * STEP_SECONDS;

  // While a car is focused, every other car (and its zone/destination) is
  // hidden from the map — "select one, follow it, hide the rest."
  function effectiveVisible(carId) {
    return !!visible[carId] && (!focusedCar || focusedCar === carId);
  }

  // ── Derive every enter/exit/arrival log for the full day, once per car load ──
  const [logs, setLogs] = useState([]); // [{id, carId, carName, color, type, sec}]
  useEffect(() => {
    if (!cars.length) return;
    const out = [];
    cars.forEach(car => {
      let wasViolating = false;
      let wasAtDestination = false;
      car.points.forEach((p, i) => {
        const sec = i * STEP_SECONDS;

        const violating = isViolatingAt(car.restrictedZone, p, sec);
        if (violating && !wasViolating) {
          out.push({ id: `${car.id}-enter-${sec}`, carId: car.id, carName: car.name, color: car.color, type: "entered", city: car.restrictedZone.city, sec });
        } else if (!violating && wasViolating) {
          out.push({ id: `${car.id}-exit-${sec}`, carId: car.id, carName: car.name, color: car.color, type: "exited", city: car.restrictedZone.city, sec });
        }
        wasViolating = violating;

        if (car.destination) {
          const atDest = isAtDestination(car.destination, p);
          if (atDest && !wasAtDestination) {
            out.push({ id: `${car.id}-arrived-${sec}`, carId: car.id, carName: car.name, color: car.color, type: "arrived", city: car.destination.label, sec });
          } else if (!atDest && wasAtDestination) {
            out.push({ id: `${car.id}-left-${sec}`, carId: car.id, carName: car.name, color: car.color, type: "left", city: car.destination.label, sec });
          }
          wasAtDestination = atDest;
        }
      });
    });
    out.sort((a, b) => a.sec - b.sec);
    setLogs(out);
  }, [cars]);

  // ── Init Leaflet map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    leafletMap.current = L.map(mapRef.current, { zoomControl: true }).setView([14.58, 121.02], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(leafletMap.current);
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } };
  }, []);

  // ── Playback interval ─────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(playRef.current);
    if (!playing) return;
    // one tick advances the clock by STEP_SECONDS; interval scales with speed
    // so "10x" genuinely plays 10x faster, not just a smaller step.
    playRef.current = setInterval(() => {
      setIdx(i => {
        if (i >= NUM_POINTS - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 1000 / playSpeed);
    return () => clearInterval(playRef.current);
  }, [playing, playSpeed]);

  function handleCarClick(carId) {
    if (focusedCar === carId) { setFocusedCar(null); setFlyPos(null); return; }
    setFocusedCar(carId);
    if (!visible[carId]) setVisible(v => ({ ...v, [carId]: true }));
    const car = cars.find(c => c.id === carId);
    if (car) setFlyPos([car.points[idx].lat, car.points[idx].lng]);
  }

  // Used by the Booking Information panel's "Coding-restricted zone" and
  // "Destination" entries — flies the map to that spot (not the car's
  // current position) and pops its label, same idea as the Traceback tab's
  // onFocusZone. Doesn't touch focusedCar/follow — the car stays followed.
  function flyToPlace(lat, lng, layerEntry) {
    if (!leafletMap.current) return;
    setPlaying(false); // otherwise the next tick's follow-pan snaps straight back to the car
    leafletMap.current.flyTo([lat, lng], 16, { animate: true });
    layerEntry?.circle?.openPopup();
  }


  function jumpToLog(log) {
    setPlaying(false);
    setIdx(Math.round(log.sec / STEP_SECONDS));
    setFocusedCar(log.carId);
    if (!visible[log.carId]) setVisible(v => ({ ...v, [log.carId]: true }));
    const car = cars.find(c => c.id === log.carId);
    if (car) setFlyPos([car.points[Math.round(log.sec / STEP_SECONDS)].lat, car.points[Math.round(log.sec / STEP_SECONDS)].lng]);
  }

  // ── Sync car markers/polylines ────────────────────────────────────────────
  useEffect(() => {
    if (!leafletMap.current || !cars.length) return;

    Object.keys(layersRef.current).forEach(carId => {
      if (!effectiveVisible(carId)) {
        Object.values(layersRef.current[carId]).forEach(l => l?.remove());
        delete layersRef.current[carId];
      }
    });

    cars.forEach(car => {
      if (!effectiveVisible(car.id)) return;
      const positions = car.points.map(p => [p.lat, p.lng]);
      const cur = car.points[idx];
      const violating = isViolatingAt(car.restrictedZone, cur, curSec);
      const isFocused = focusedCar === car.id;

      let entry = layersRef.current[car.id];
      if (!entry) {
        entry = {
          ghost: L.polyline(positions, { color: car.color, weight: 2, opacity: 0.18 }).addTo(leafletMap.current),
          active: L.polyline(positions.slice(0, idx + 1), { color: car.color, weight: 3, opacity: 0.9 }).addTo(leafletMap.current),
          start: L.marker(positions[0], { icon: makeStartIcon(car.color) }).addTo(leafletMap.current).bindPopup(`<b>${car.name}</b><br>Start of day`),
          current: L.marker([cur.lat, cur.lng], { icon: makeCarIcon(car.color, isFocused, violating) })
            .addTo(leafletMap.current)
            .on("click", () => handleCarClick(car.id)),
        };
        entry.ghost.on("click", () => handleCarClick(car.id));
        layersRef.current[car.id] = entry;
      } else {
        entry.active.setLatLngs(positions.slice(0, idx + 1));
        entry.current.setLatLng([cur.lat, cur.lng]);
        entry.current.setIcon(makeCarIcon(car.color, isFocused, violating));
      }
      entry.current.bindPopup(
        `<b>${car.name}</b><br>${cur.time}<br>Speed: ${cur.speed.toFixed(1)} km/h` +
        (violating ? `<br><span style="color:#dc2626;font-weight:600">🚫 Coding-restricted now (${car.restrictedZone.city})</span>` : "") +
        (cur.offline ? `<br><span style="color:#d97706">📦 Offline flush</span>` : "")
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, visible, focusedCar, idx]);

  // ── Sync restricted-zone circles — shown only for effectively-visible cars,
  // clickable to focus/follow that car, style flips active/inactive by time ──
  useEffect(() => {
    if (!leafletMap.current || !cars.length) return;

    Object.keys(zoneLayersRef.current).forEach(carId => {
      if (!effectiveVisible(carId)) {
        Object.values(zoneLayersRef.current[carId]).forEach(l => l?.remove());
        delete zoneLayersRef.current[carId];
      }
    });

    cars.forEach(car => {
      if (!effectiveVisible(car.id)) return;
      const zone = car.restrictedZone;
      const active = windowActiveAt(zone, curSec);
      let entry = zoneLayersRef.current[car.id];
      const style = active
        ? { color: car.color, fillColor: car.color, fillOpacity: 0.28, weight: 3, dashArray: null }
        : { color: car.color, fillColor: car.color, fillOpacity: 0.08, weight: 1.5, dashArray: "5 5" };

      if (!entry) {
        entry = {
          circle: L.circle([zone.lat, zone.lng], { radius: zone.radius * 1000, ...style })
            .addTo(leafletMap.current)
            .on("click", () => handleCarClick(car.id))
            .bindPopup(`<b>${zone.city}</b><br>Coding-restricted ${zone.windowStart.slice(0, 5)}–${zone.windowEnd.slice(0, 5)}`),
          label: L.marker([zone.lat, zone.lng], { icon: makeZoneLabelIcon(zone.city, car.color, active) })
            .addTo(leafletMap.current)
            .on("click", () => handleCarClick(car.id)),
        };
        zoneLayersRef.current[car.id] = entry;
      } else {
        entry.circle.setStyle(style);
        entry.label.setIcon(makeZoneLabelIcon(zone.city, car.color, active));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, curSec, visible, focusedCar]);


  // ── Destination markers + arrival circles — drawn once per car (the
  // destination itself never moves), clickable to focus/follow that car. ──
  useEffect(() => {
    if (!leafletMap.current || !cars.length) return;
    cars.forEach(car => {
      if (!car.destination || destLayersRef.current[car.id]) return;
      const d = car.destination;
      destLayersRef.current[car.id] = {
        circle: L.circle([d.lat, d.lng], {
          radius: d.radius * 1000, color: car.color, fillColor: car.color, fillOpacity: 0.15, weight: 2, dashArray: "2 6",
        }).addTo(leafletMap.current).on("click", () => handleCarClick(car.id)),
        marker: L.marker([d.lat, d.lng], { icon: makeDestinationIcon(car.color) })
          .addTo(leafletMap.current)
          .on("click", () => handleCarClick(car.id))
          .bindPopup(`<b>${car.name} — Destination</b><br>${d.label}<br>Arrival radius: ${Math.round(d.radius * 1000)} m`),
      };
    });
  }, [cars]);

  // Keep destination layers in sync with each car's *effective* visibility —
  // hidden the moment another car is focused, same as the zone/route layers.
  useEffect(() => {
    if (!leafletMap.current) return;
    Object.entries(destLayersRef.current).forEach(([carId, entry]) => {
      const shouldShow = effectiveVisible(carId);
      const onMap = leafletMap.current.hasLayer(entry.circle);
      if (shouldShow && !onMap) { entry.circle.addTo(leafletMap.current); entry.marker.addTo(leafletMap.current); }
      if (!shouldShow && onMap) { entry.circle.remove(); entry.marker.remove(); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, focusedCar]);


  // ── Fit bounds / fly-to (only runs when nothing is focused) ───────────────
  useEffect(() => {
    if (!leafletMap.current) return;
    if (flyPos) { leafletMap.current.flyTo(flyPos, 15, { animate: true }); return; }
    const shown = cars.filter(c => visible[c.id]);
    if (shown.length) {
      const bounds = L.latLngBounds(shown.flatMap(c => c.points.map(p => [p.lat, p.lng])));
      leafletMap.current.fitBounds(bounds, { padding: [40, 40] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars.length, flyPos]);

  // ── Follow: while a car is focused, keep recentering the map on it as it
  // moves, tick by tick — a gentle panTo rather than a fresh flyTo animation
  // every 30s of sim-time, so playback doesn't feel jerky. ─────────────────
  useEffect(() => {
    if (!leafletMap.current || !focusedCar) return;
    const car = cars.find(c => c.id === focusedCar);
    if (!car) return;
    const cur = car.points[idx];
    leafletMap.current.panTo([cur.lat, cur.lng], { animate: true, duration: 0.4 });
  }, [focusedCar, idx, cars]);

  const hasData = cars.length > 0;

  // Same top-center pulsing-pill notification the Live/Traceback tabs use —
  // one entry per currently-visible car that's actually violating its
  // coding-restricted zone right now (window active AND physically inside it).
  const mapBanners = cars
    .filter(car => visible[car.id])
    .filter(car => isViolatingAt(car.restrictedZone, car.points[idx], curSec))
    .map(car => ({ id: `banner-${car.id}`, tone: "restricted", text: `🚫 ${car.name} is coding-restricted (${car.restrictedZone.city})` }));

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-hide">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
          <p className="font-bold text-arl-dark text-sm">Simulate</p>
          <p className="text-xs text-gray-400 mt-0.5">6 hardcoded cars · one full day (00:00–23:59)</p>
          {loadError && <p className="text-xs text-red-500 mt-2">{loadError}</p>}
          {!hasData && !loadError && <p className="text-xs text-gray-400 italic mt-2">Loading simulation data…</p>}
        </div>

        {cars.map(car => {
          const on = visible[car.id];
          const cur = car.points[idx];
          const violating = isViolatingAt(car.restrictedZone, cur, curSec);
          const isFocused = focusedCar === car.id;

          return (
            <button
              key={car.id}
              onClick={() => handleCarClick(car.id)}
              className={`text-left bg-white rounded-2xl border-2 shadow-soft p-3 transition-all ${
                isFocused ? "ring-1" : "border-gray-100 hover:border-teal-300"
              }`}
              style={isFocused ? { borderColor: car.color, background: `${car.color}0d` } : undefined}
            >
              <div className="flex items-center gap-2">
                <span
                  onClick={e => { e.stopPropagation(); setVisible(v => ({ ...v, [car.id]: !v[car.id] })); }}
                  className="w-4 h-4 rounded-full border-2 shrink-0 cursor-pointer"
                  style={{ background: on ? car.color : "transparent", borderColor: car.color }}
                />
                <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{car.name}</span>
                {violating && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">RESTRICTED</span>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-1 ml-6">
                Zone: {car.restrictedZone.city} · {car.restrictedZone.windowStart.slice(0, 5)}–{car.restrictedZone.windowEnd.slice(0, 5)}
              </p>
              {on && (
                <p className="text-[10px] text-gray-500 mt-0.5 ml-6 font-mono">
                  ▶ {cur.time} · {cur.speed.toFixed(1)} km/h
                  {cur.offline && <span className="text-amber-600 ml-1">📦</span>}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Map + scrubber ───────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden relative">
          <div ref={mapRef} className="w-full h-full" style={{ minHeight: "300px" }} />

          <GeofenceBanner banners={mapBanners} />

          <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 items-end">
            <button
              onClick={() => { setShowBookingInfo(v => !v); setShowLogs(false); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm transition-all ${
                showBookingInfo ? "bg-teal-600 text-white" : "bg-white/95 text-gray-700 hover:bg-white"
              }`}
            >
              ℹ Booking Information
            </button>
            <button
              onClick={() => { setShowLogs(v => !v); setShowBookingInfo(false); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm transition-all ${
                showLogs ? "bg-teal-600 text-white" : "bg-white/95 text-gray-700 hover:bg-white"
              }`}
            >
              🗒 Logs {logs.length ? `(${logs.length})` : ""}
            </button>
          </div>

          {showBookingInfo && (
            <div className="absolute top-16 right-4 bottom-4 w-80 z-[1001] bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                <div className="min-w-0">
                  <p className="font-bold text-arl-dark text-sm truncate">
                    {focusedCar ? cars.find(c => c.id === focusedCar)?.name : "Select a car"}
                  </p>
                  <p className="text-[11px] text-gray-400">Booking Information · simulated</p>
                </div>
                <button onClick={() => setShowBookingInfo(false)} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50">✕</button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 space-y-2">
                {!focusedCar && (
                  <p className="text-xs text-gray-400 italic px-1">Click a car (on the map or the sidebar) to see its booking details.</p>
                )}
                {focusedCar && (() => {
                  const car = cars.find(c => c.id === focusedCar);
                  if (!car) return null;
                  const b = car.booking;
                  return (
                    <>
                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-700 truncate">{b?.customerName || "—"}</p>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-blue-50 text-blue-700">
                            {b?.status || "simulated"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{b?.pickupTime} → {b?.returnTime} (full sim day)</p>
                        <p className="text-[11px] text-gray-400 mt-1">Booking ID: {b?.bookingID} · Plate: {b?.plateNumber}</p>
                      </div>

                      <p className="text-[11px] font-semibold text-gray-500 pt-1 px-1">Coding-restricted zone</p>
                      <div
                        onClick={() => flyToPlace(car.restrictedZone.lat, car.restrictedZone.lng, zoneLayersRef.current[car.id])}
                        title="Focus the map on this zone"
                        className="bg-gray-50 rounded-xl border border-gray-100 p-3 cursor-pointer hover:border-teal-300 hover:bg-teal-50/60 transition-all"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ background: car.color }}>1</span>
                          <span className="flex-1 min-w-0 text-xs font-semibold text-gray-700 truncate">{car.restrictedZone.city}</span>
                        </div>
                        <p className="text-[11px] font-mono text-gray-400">{Math.round(car.restrictedZone.radius * 1000)} m radius</p>
                        <p className="text-[11px] text-gray-400 mt-1">Window: {car.restrictedZone.windowStart.slice(0, 5)}–{car.restrictedZone.windowEnd.slice(0, 5)}</p>
                      </div>

                      <p className="text-[11px] font-semibold text-gray-500 pt-1 px-1">Destination</p>
                      <div
                        onClick={() => car.destination && flyToPlace(car.destination.lat, car.destination.lng, destLayersRef.current[car.id])}
                        title="Focus the map on this destination"
                        className="bg-gray-50 rounded-xl border border-gray-100 p-3 cursor-pointer hover:border-teal-300 hover:bg-teal-50/60 transition-all"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">🏁</span>
                          <span className="flex-1 min-w-0 text-xs font-semibold text-gray-700 truncate">{car.destination?.label}</span>
                        </div>
                        <p className="text-[11px] font-mono text-gray-400">{Math.round((car.destination?.radius || 0) * 1000)} m arrival radius</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {showLogs && (
            <div className="absolute top-16 right-4 z-[1000] w-72 max-h-[60%] overflow-y-auto bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-arl-dark">Logs</p>
                <button onClick={() => setShowLogs(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
              </div>
              {!logs.length && <p className="text-[11px] text-gray-400 italic">No events today.</p>}
              {logs.map(log => {
                const occurred = log.sec <= curSec;
                const verb = { entered: "entered", exited: "exited", arrived: "🏁 arrived at", left: "left" }[log.type];
                return (
                  <button
                    key={log.id}
                    onClick={() => jumpToLog(log)}
                    className={`w-full text-left mb-1.5 p-2 rounded-lg text-[11px] transition-all ${occurred ? "bg-gray-50" : "bg-gray-50/40 opacity-50"} hover:bg-gray-100`}
                  >
                    <span className="font-mono text-gray-400 mr-1.5">{secToClock(log.sec)}</span>
                    <span className="font-semibold" style={{ color: log.color }}>{log.carName}</span>
                    <span className="text-gray-600"> {verb} {log.city}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!hasData && !loadError && (
            <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
              <div className="bg-white/95 rounded-2xl border border-gray-100 shadow-lg p-6 text-center max-w-xs">
                <p className="font-semibold text-gray-700 text-sm">Loading 6-car simulation…</p>
              </div>
            </div>
          )}
        </div>

        {hasData && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft shrink-0 px-4 py-3">
            <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
              <span>00:00:00</span>
              <span className="font-mono text-sm text-gray-700 font-semibold">{secToClock(curSec)}</span>
              <span>23:59:30</span>
            </div>
            <input
              type="range" min={0} max={NUM_POINTS - 1} value={idx}
              onChange={e => { setPlaying(false); setIdx(Number(e.target.value)); }}
              className="w-full accent-teal-600"
            />
            <div className="flex items-center justify-center gap-2 mt-2">
              <button onClick={() => { setPlaying(false); setIdx(0); }} className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm">⏮</button>
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm">◀</button>
              <button onClick={() => setPlaying(p => !p)} className="w-10 h-8 rounded-lg bg-teal-600 text-white text-sm font-semibold">{playing ? "⏸" : "▶"}</button>
              <button onClick={() => setIdx(i => Math.min(NUM_POINTS - 1, i + 1))} className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm">▶</button>
              <button onClick={() => { setPlaying(false); setIdx(NUM_POINTS - 1); }} className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm">⏭</button>
              <div className="flex items-center gap-1 ml-2">
                {[1, 5, 10, 60].map(s => (
                  <button
                    key={s}
                    onClick={() => setPlaySpeed(s)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold ${playSpeed === s ? "bg-teal-600 text-white" : "bg-gray-50 text-gray-400 hover:bg-gray-100"}`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}