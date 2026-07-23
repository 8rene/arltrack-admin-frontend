import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import GeofenceBanner from "../components/GeofenceBanner";
import { isGeofenceBreachedAt, isCodingRestrictedAt } from "../utils/geofenceAlerts";

const API = process.env.REACT_APP_API_URL;

// Palette assigned to cars in order — stable per render since `cars` order is stable.
const CAR_COLORS = ["#0d9488", "#2563eb", "#f97316", "#db2777", "#7c3aed", "#65a30d", "#dc2626", "#0891b2"];
function colorForCar(idx) {
  return CAR_COLORS[idx % CAR_COLORS.length];
}

function makeCarIcon(color, focused = false) {
  const size = focused ? 40 : 32;
  const ring = focused
    ? `0 0 0 5px ${color}55, 0 4px 14px rgba(0,0,0,0.4)`
    : `0 0 0 3px ${color}33, 0 2px 8px rgba(0,0,0,0.3)`;
  return L.divIcon({
    className: "",
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

// Records come from the backend as { lat, lng, at } — `at` is a plain ISO string.
function gpsMs(record) {
  return new Date(record.at).getTime();
}

function fmtTime(record) {
  if (!record?.at) return "—";
  return new Date(record.at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// YYYY-MM-DD, N days ago, computed in Philippine Time (UTC+8) — must match
// the backend's phtDateFromInstant() so the requested date lines up with
// which archive day-doc actually holds today's points.
function getDateDaysAgo(n) {
  const nowUtc = new Date();
  const phtMs = nowUtc.getTime() + 8 * 60 * 60 * 1000;
  const phtDate = new Date(phtMs);
  phtDate.setUTCDate(phtDate.getUTCDate() - n);
  return phtDate.toISOString().split("T")[0];
}

function closestIdx(records, targetMs) {
  if (!records.length) return 0;
  let lo = 0, hi = records.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (gpsMs(records[mid]) < targetMs) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(gpsMs(records[lo - 1]) - targetMs) < Math.abs(gpsMs(records[lo]) - targetMs)) return lo - 1;
  return lo;
}

const GAP_THRESHOLD_MS = 20 * 60 * 1000; // 20 min gap breaks a segment
function buildSegments(records) {
  if (!records.length) return [];
  const segments = [];
  let start = 0;
  for (let i = 1; i < records.length; i++) {
    if (gpsMs(records[i]) - gpsMs(records[i - 1]) > GAP_THRESHOLD_MS) {
      segments.push(records.slice(start, i));
      start = i;
    }
  }
  segments.push(records.slice(start));
  return segments;
}

const GAP_BUDGET_FRACTION = 0.3;
// Piecewise time<->percent mapping shared by every car's timeline row, so
// dead time nobody has data for gets compressed instead of dominating the bar.
function buildTimeScale(globalStartMs, globalEndMs, allSegmentSets) {
  const intervals = allSegmentSets.flat()
    .map(seg => [gpsMs(seg[0]), gpsMs(seg[seg.length - 1])])
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [s, e] of intervals) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else merged.push([s, e]);
  }

  const pieces = [];
  let cursor = globalStartMs;
  for (const [s, e] of merged) {
    if (s > cursor) pieces.push({ start: cursor, end: s, isGap: true });
    pieces.push({ start: Math.max(s, cursor), end: e, isGap: false });
    cursor = Math.max(cursor, e);
  }
  if (cursor < globalEndMs) pieces.push({ start: cursor, end: globalEndMs, isGap: true });

  const activeTotal = pieces.filter(p => !p.isGap).reduce((s, p) => s + (p.end - p.start), 0);
  const gapPieces = pieces.filter(p => p.isGap);
  const sqrtSum = gapPieces.reduce((s, p) => s + Math.sqrt(p.end - p.start), 0);
  const gapBudget = activeTotal > 0 && sqrtSum > 0 ? activeTotal * (GAP_BUDGET_FRACTION / (1 - GAP_BUDGET_FRACTION)) : 0;

  let acc = 0;
  const totalWeight = activeTotal + gapBudget || 1;
  const cum = pieces.map(p => {
    const weight = p.isGap ? (sqrtSum > 0 ? gapBudget * (Math.sqrt(p.end - p.start) / sqrtSum) : 0) : (p.end - p.start);
    const startPct = (acc / totalWeight) * 100;
    acc += weight;
    return { ...p, startPct, endPct: (acc / totalWeight) * 100 };
  });

  function toPct(ms) {
    if (!cum.length || ms <= globalStartMs) return 0;
    if (ms >= globalEndMs) return 100;
    for (const p of cum) {
      if (ms >= p.start && ms <= p.end) {
        const span = Math.max(p.end - p.start, 1);
        return p.startPct + ((ms - p.start) / span) * (p.endPct - p.startPct);
      }
    }
    return 100;
  }
  function toMs(pct) {
    if (!cum.length) return globalStartMs;
    const clamped = Math.min(Math.max(pct, 0), 100);
    for (const p of cum) {
      if (clamped >= p.startPct && clamped <= p.endPct) {
        const span = Math.max(p.endPct - p.startPct, 1e-9);
        return p.start + ((clamped - p.startPct) / span) * (p.end - p.start);
      }
    }
    return globalEndMs;
  }
  return { toPct, toMs };
}

function TimelineBars({ traceData, visible, cars, currentTimeMs, onScrub, focusedCar, globalStartMs, globalEndMs }) {
  const allSegmentSets = cars
    .filter(car => visible[car.id] && (traceData[car.id] || []).length)
    .map(car => buildSegments(traceData[car.id]));
  const scale = buildTimeScale(globalStartMs, globalEndMs, allSegmentSets);
  const draggingRef = useRef(null);

  function msFromEvent(e, trackEl) {
    const rect = trackEl.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    return scale.toMs(rect.width ? (x / rect.width) * 100 : 0);
  }
  function handlePointerDown(e, carId, trackEl) {
    draggingRef.current = carId;
    onScrub(carId, msFromEvent(e, trackEl));
    const onMove = ev => { if (draggingRef.current === carId) onScrub(carId, msFromEvent(ev, trackEl)); };
    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="px-3 py-2 border-t border-gray-100">
      {cars.map((car, idx) => {
        const records = traceData[car.id] || [];
        if (!records.length || !visible[car.id]) return null;
        const color = colorForCar(idx);
        const isFocused = focusedCar === car.id;
        const segments = buildSegments(records);
        let trackEl = null;

        return (
          <div key={car.id} className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] w-16 shrink-0 truncate ${isFocused ? "font-bold" : "text-gray-400"}`} style={{ color: isFocused ? color : undefined }}>
              {car.name}
            </span>
            <div
              ref={el => { trackEl = el; }}
              onMouseDown={e => handlePointerDown(e, car.id, e.currentTarget)}
              className="flex-1 h-2 relative bg-gray-100 rounded cursor-pointer"
              style={{ boxShadow: isFocused ? `0 0 0 1px ${color}` : "none" }}
            >
              {segments.map((seg, segIdx) => {
                const segStartMs = gpsMs(seg[0]), segEndMs = gpsMs(seg[seg.length - 1]);
                const leftPct = scale.toPct(segStartMs), rightPct = scale.toPct(segEndMs);
                const widthPct = Math.max(rightPct - leftPct, 1.2);
                const segSpan = Math.max(segEndMs - segStartMs, 1);
                const inRange = currentTimeMs >= segStartMs && currentTimeMs <= segEndMs;
                const pastEnd = currentTimeMs > segEndMs;
                const fillPct = inRange ? ((currentTimeMs - segStartMs) / segSpan) * 100 : pastEnd ? 100 : 0;
                return (
                  <div key={segIdx} className="absolute top-0 h-full rounded pointer-events-none" style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: `${color}44` }}>
                    {(inRange || pastEnd) && <div className="absolute top-0 left-0 h-full rounded" style={{ width: `${fillPct}%`, background: color }} />}
                  </div>
                );
              })}
            </div>
            <span className="text-[10px] w-14 shrink-0 text-right text-gray-400 font-mono">{fmtTime(records[0])}</span>
          </div>
        );
      })}
    </div>
  );
}

const DAY_BUTTONS = [
  { label: "Today", daysAgo: 0 },
  { label: "Yesterday", daysAgo: 1 },
  { label: "2 Days Ago", daysAgo: 2 },
];

/**
 * Multi-car traceback with a shared scrubber + playback, modeled on the
 * geo-test reference's TracebackTab.jsx.
 *
 * Two modes:
 *  - Live (default): fetches /api/gps/:carId/traceback?date= per car for the
 *    selected day.
 *  - Review (reviewData set): skips fetching entirely and reads straight
 *    from a pre-loaded { cars, records } object — used by HistoryPanel when
 *    the user clicks "Review" on an archived trip.
 */
export default function TracebackPanel({ cars, token, reviewData = null, onExitReview = null, refreshTick = 0 }) {
  const isReview = !!reviewData;
  const effectiveCars = isReview ? reviewData.cars : cars;

  const [daysAgo, setDaysAgo] = useState(0);
  const [traceData, setTraceData] = useState({});
  // { [carId]: { geofenceZones, geofenceAlerts, codingAlerts, available } } —
  // powers the top-center pulsing banner at the scrubbed timestamp. Live mode
  // fills this from the traceback endpoint; review mode reads it straight off
  // reviewData.zonesAlerts (set by History/Review from the archive JSON) and
  // marks a car unavailable when that data isn't present.
  const [zonesAlerts, setZonesAlerts] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [visible, setVisible] = useState({});
  const [scrubIdx, setScrubIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [focusedCar, setFocusedCar] = useState(null);
  const [flyPos, setFlyPos] = useState(null);
  const playRef = useRef(null);

  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const layersRef = useRef({}); // { [carId]: { start, current, ghost, active } }

  const date = getDateDaysAgo(daysAgo);

  // ── Floating download confirmation — a small pill that rises and fades,
  // matching the "Car Information" / "Logs" floating-button language instead
  // of a banner notice. ────────────────────────────────────────────────────
  const [downloadNotice, setDownloadNotice] = useState(null); // { ok, msg } | null
  useEffect(() => {
    if (!downloadNotice) return;
    const t = setTimeout(() => setDownloadNotice(null), 1800);
    return () => clearTimeout(t);
  }, [downloadNotice]);

  // ── Init Leaflet map ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    leafletMap.current = L.map(mapRef.current, { zoomControl: true }).setView([14.5995, 120.9842], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(leafletMap.current);
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } };
  }, []);

  const fetchAll = useCallback(async (targetDate) => {
    setLoading(true);
    setFetchError(null);
    setScrubIdx(0); setPlaying(false); setFocusedCar(null); setFlyPos(null);

    if (!API) {
      setFetchError("REACT_APP_API_URL is not set — check your .env and restart the dev server.");
      setLoading(false);
      return;
    }

    const results = await Promise.allSettled(
      cars.map(async car => {
        const r = await fetch(`${API}/api/gps/${car.id}/traceback?date=${targetDate}`, { headers: { Authorization: `Bearer ${token}` } });
        const contentType = r.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error(`Backend returned ${r.status} (non-JSON) for ${car.name} — is REACT_APP_API_URL correct and is the backend deployed with the traceback route?`);
        }
        const json = await r.json();
        if (!r.ok) throw new Error(json.message || `Failed to load traceback for ${car.name}.`);
        return {
          id: car.id,
          records: json?.data?.records || [],
          geofenceZones:  json?.data?.geofenceZones  || [],
          geofenceAlerts: json?.data?.geofenceAlerts || [],
          codingAlerts:   json?.data?.codingAlerts   || [],
        };
      })
    );
    const map = {}, vis = {}, zones = {};
    let firstError = null;
    results.forEach(r => {
      if (r.status === "fulfilled") {
        const sorted = [...r.value.records].sort((a, b) => gpsMs(a) - gpsMs(b));
        map[r.value.id] = sorted;
        vis[r.value.id] = sorted.length > 0;
        zones[r.value.id] = {
          geofenceZones:  r.value.geofenceZones,
          geofenceAlerts: r.value.geofenceAlerts,
          codingAlerts:   r.value.codingAlerts,
          available: true,
        };
      } else if (!firstError) {
        firstError = r.reason?.message || "Failed to load traceback.";
      }
    });
    setTraceData(map);
    setVisible(vis);
    setZonesAlerts(zones);
    if (firstError) setFetchError(firstError);
    setLoading(false);
  }, [cars, token]);

  useEffect(() => { if (!isReview && cars.length) fetchAll(date); }, [date, cars.length, isReview, fetchAll, refreshTick]);

  useEffect(() => {
    if (!isReview) return;
    setScrubIdx(0); setPlaying(false); setFocusedCar(null); setFlyPos(null);
    const map = {}, vis = {}, zones = {};
    effectiveCars.forEach(car => {
      const sorted = [...(reviewData.records[car.id] || [])].sort((a, b) => gpsMs(a) - gpsMs(b));
      map[car.id] = sorted;
      vis[car.id] = sorted.length > 0;
      const carZoneData = reviewData.zonesAlerts?.[car.id];
      zones[car.id] = carZoneData
        ? { ...carZoneData, available: true }
        : { geofenceZones: [], geofenceAlerts: [], codingAlerts: [], available: false };
    });
    setTraceData(map);
    setVisible(vis);
    setZonesAlerts(zones);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewData, isReview]);

  function buildAllVisible(data, vis) {
    return Object.entries(data).filter(([id]) => vis[id]).flatMap(([, r]) => [...r].sort((a, b) => gpsMs(a) - gpsMs(b)));
  }

  const allPoints = Object.entries(traceData).filter(([id]) => visible[id]).flatMap(([, r]) => r);
  const allVisible = buildAllVisible(traceData, visible);
  const hasData = allVisible.length > 0;
  const allGpsTimes = allPoints.map(gpsMs);
  const globalStartMs = allGpsTimes.length ? Math.min(...allGpsTimes) : 0;
  const globalEndMs = allGpsTimes.length ? Math.max(...allGpsTimes) : 0;
  const maxLen = focusedCar && traceData[focusedCar]?.length ? traceData[focusedCar].length : allVisible.length;

  const focusedRecs = focusedCar ? (traceData[focusedCar] || []) : null;
  const curRec = focusedRecs?.length ? focusedRecs[Math.min(scrubIdx, focusedRecs.length - 1)] : (allVisible[Math.min(scrubIdx, allVisible.length - 1)] || null);
  const currentTimeMs = curRec ? gpsMs(curRec) : 0;
  const firstRec = allVisible[0] || null;
  const lastRec = allVisible[allVisible.length - 1] || null;

  // ── Geofence / coding-restriction banner at the scrubbed instant ─────────
  // Only consider visible cars (matches what's actually drawn on the map).
  // If focused on one car, show just that car's state; otherwise show every
  // visible car currently breached/restricted, same stacking behavior as Live.
  const carsForBanner = focusedCar ? effectiveCars.filter(c => c.id === focusedCar) : effectiveCars.filter(c => visible[c.id]);
  const bannerEntries = carsForBanner
    .filter(c => zonesAlerts[c.id]?.available)
    .flatMap(c => {
      const za = zonesAlerts[c.id];
      const entries = [];
      if (isGeofenceBreachedAt(za.geofenceAlerts, currentTimeMs)) {
        entries.push({ id: `breach-${c.id}`, tone: "breach", text: `🚨 ${c.name} is outside its zone` });
      }
      if (isCodingRestrictedAt(za.codingAlerts, currentTimeMs)) {
        entries.push({ id: `restricted-${c.id}`, tone: "restricted", text: `🚫 ${c.name} is coding-restricted` });
      }
      return entries;
    });
  // If nobody visible actually has zone/alert data to check (typical for a
  // bare uploaded file with no session context), say so once instead of
  // silently omitting the banner — matches the fallback the plan called for.
  const noZoneDataAtAll = hasData && carsForBanner.length > 0 && carsForBanner.every(c => !zonesAlerts[c.id]?.available);
  const mapBanners = bannerEntries.length
    ? bannerEntries
    : (isReview && noZoneDataAtAll)
      ? [{ id: "unavailable", tone: "unavailable", text: "Geofence status unavailable for this file" }]
      : [];

  // Downloads exactly what's currently loaded (every car's full point set,
  // not just visible/focused ones) as JSON — round-trips straight back in
  // through the Review tab's upload, same as a geo-test/GPS-test export.
  function handleDownload() {
    const hasAnyRecords = Object.values(traceData).some(r => r.length);
    if (!hasAnyRecords) {
      setDownloadNotice({ ok: false, msg: "No data to download" });
      return;
    }
    const label = isReview ? (reviewData.label || "traceback-review") : `traceback-${date}`;
    const payload = { label, cars: effectiveCars, records: traceData, zonesAlerts };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(label).replace(/[^a-z0-9-_]+/gi, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloadNotice({ ok: true, msg: "Downloaded" });
  }

  function currentRecordFor(records) {
    if (!records.length || currentTimeMs < gpsMs(records[0])) return null;
    let result = records[0];
    for (const r of records) { if (gpsMs(r) <= currentTimeMs) result = r; else break; }
    return result;
  }
  function playedCountFor(records) {
    let count = 0;
    for (const r of records) { if (gpsMs(r) <= currentTimeMs) count++; else break; }
    return count;
  }

  useEffect(() => {
    clearInterval(playRef.current);
    if (!playing) return;
    playRef.current = setInterval(() => {
      setScrubIdx(i => { if (i >= maxLen - 1) { setPlaying(false); return i; } return i + 1; });
    }, 1000 / playSpeed);
    return () => clearInterval(playRef.current);
  }, [playing, playSpeed, maxLen]);

  function handleCarClick(carId) {
    if (focusedCar === carId) {
      const merged = buildAllVisible(traceData, visible);
      setScrubIdx(merged.length ? closestIdx(merged, currentTimeMs) : 0);
      setFocusedCar(null); setFlyPos(null);
    } else {
      setFocusedCar(carId);
      if (!visible[carId]) setVisible(v => ({ ...v, [carId]: true }));
      const recs = traceData[carId];
      if (recs?.length) {
        const idx = closestIdx(recs, currentTimeMs);
        setScrubIdx(idx);
        setFlyPos([recs[idx].lat, recs[idx].lng]);
      }
    }
  }
  function handleCarPlay(e, carId) {
    e.stopPropagation();
    if (focusedCar === carId && playing) { setPlaying(false); return; }
    setFocusedCar(carId);
    if (!visible[carId]) setVisible(v => ({ ...v, [carId]: true }));
    const recs = traceData[carId];
    if (recs?.length) {
      const idx = closestIdx(recs, currentTimeMs);
      setScrubIdx(idx);
      setFlyPos([recs[idx].lat, recs[idx].lng]);
    }
    setPlaying(true);
  }
  function handleTimelineScrub(carId, ms) {
    setPlaying(false);
    if (focusedCar !== carId) setFocusedCar(carId);
    if (!visible[carId]) setVisible(v => ({ ...v, [carId]: true }));
    const recs = traceData[carId];
    if (recs?.length) {
      const idx = closestIdx(recs, ms);
      setScrubIdx(idx);
      setFlyPos([recs[idx].lat, recs[idx].lng]);
    }
  }

  // ── Sync Leaflet layers ────────────────────────────────────────────────
  useEffect(() => {
    if (!leafletMap.current) return;

    // Remove layers for cars no longer visible/present
    Object.keys(layersRef.current).forEach(carId => {
      if (!visible[carId] || !(traceData[carId] || []).length) {
        Object.values(layersRef.current[carId]).forEach(layer => layer?.remove());
        delete layersRef.current[carId];
      }
    });

    effectiveCars.forEach((car, idx) => {
      const records = traceData[car.id] || [];
      if (!visible[car.id] || !records.length) return;
      const color = colorForCar(idx);
      const isFocused = focusedCar === car.id;
      const positions = records.map(r => [r.lat, r.lng]);
      const cur = currentRecordFor(records);
      const played = playedCountFor(records);

      let entry = layersRef.current[car.id];
      if (!entry) {
        entry = {
          ghost: L.polyline(positions, { color, weight: 2, opacity: 0.2 }).addTo(leafletMap.current),
          active: L.polyline(played > 1 ? positions.slice(0, played) : [], { color, weight: 3, opacity: 0.9 }).addTo(leafletMap.current),
          start: L.marker(positions[0], { icon: makeStartIcon(color) }).addTo(leafletMap.current).bindPopup(`<b>${car.name}</b><br>Start: ${fmtTime(records[0])}`),
          current: null,
        };
        entry.ghost.on("click", () => handleCarClick(car.id));
        layersRef.current[car.id] = entry;
      } else {
        entry.ghost.setLatLngs(positions);
        entry.active.setLatLngs(played > 1 ? positions.slice(0, played) : []);
        entry.start.setLatLng(positions[0]);
      }

      if (cur && currentTimeMs >= gpsMs(records[0])) {
        if (entry.current) {
          entry.current.setLatLng([cur.lat, cur.lng]);
          entry.current.setIcon(makeCarIcon(color, isFocused));
        } else {
          entry.current = L.marker([cur.lat, cur.lng], { icon: makeCarIcon(color, isFocused) })
            .addTo(leafletMap.current)
            .on("click", () => handleCarClick(car.id));
        }
        entry.current.bindPopup(
          `<b>${car.name}</b><br>${fmtTime(cur)}<br>` +
          `Speed: ${typeof cur.speed === "number" ? cur.speed.toFixed(1) : "0.0"} km/h` +
          (cur.offline ? `<br><span style="color:#d97706">📦 Offline flush</span>` : "")
        );
      } else if (entry.current) {
        entry.current.remove();
        entry.current = null;
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceData, visible, focusedCar, currentTimeMs, effectiveCars]);

  // ── Fit bounds / fly-to ─────────────────────────────────────────────────
  useEffect(() => {
    if (!leafletMap.current) return;
    if (flyPos) { leafletMap.current.flyTo(flyPos, 16, { animate: true }); return; }
    if (hasData && allPoints.length) {
      const bounds = L.latLngBounds(allPoints.map(p => [p.lat, p.lng]));
      leafletMap.current.fitBounds(bounds, { padding: [40, 40] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, flyPos]);

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* ── Sidebar: per-car toggles + play buttons ──────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-hide">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="font-bold text-arl-dark text-sm">{isReview ? "Review" : "Traceback"}</p>
            {isReview && (
              <button onClick={onExitReview} className="text-xs font-semibold text-gray-400 hover:text-gray-600">
                ✕ Exit review
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-3">{isReview ? (reviewData.label || "Archived trip") : "Up to 2 days ago"}</p>

          {!isReview && (
            <div className="flex gap-1.5 mb-2">
              {DAY_BUTTONS.map(btn => (
                <button
                  key={btn.daysAgo}
                  onClick={() => setDaysAgo(btn.daysAgo)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    daysAgo === btn.daysAgo ? "bg-teal-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
          {loading && <p className="text-xs text-gray-400 italic">Loading…</p>}
          {fetchError && <p className="text-xs text-red-500 mt-1">{fetchError}</p>}
        </div>

        {effectiveCars.map((car, idx) => {
          const records = traceData[car.id] || [];
          const color = colorForCar(idx);
          const on = visible[car.id];
          const cur = records.length ? currentRecordFor(records) : null;
          const isFocused = focusedCar === car.id;
          const isPlaying = isFocused && playing;

          return (
            <button
              key={car.id}
              onClick={() => records.length > 0 && handleCarClick(car.id)}
              disabled={!records.length}
              className={`text-left bg-white rounded-2xl border-2 shadow-soft p-3 transition-all ${
                isFocused ? "ring-1" : "border-gray-100 hover:border-teal-300"
              }`}
              style={isFocused ? { borderColor: color, background: `${color}0d` } : undefined}
            >
              <div className="flex items-center gap-2">
                <span
                  onClick={e => {
                    e.stopPropagation();
                    const turningOff = visible[car.id];
                    const nextVis = { ...visible, [car.id]: !visible[car.id] };
                    setVisible(nextVis);
                    if (turningOff && focusedCar === car.id) {
                      const merged = buildAllVisible(traceData, nextVis);
                      setScrubIdx(merged.length ? closestIdx(merged, currentTimeMs) : 0);
                      setFocusedCar(null); setFlyPos(null);
                    }
                  }}
                  className="w-4 h-4 rounded-full border-2 shrink-0 cursor-pointer"
                  style={{ background: on ? color : "transparent", borderColor: color }}
                />
                <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{car.name}</span>
                <span className="text-[10px] text-gray-400">{records.length} pts</span>
                {records.length > 0 && (
                  <button
                    onClick={e => handleCarPlay(e, car.id)}
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                    style={{ background: isPlaying ? color : "transparent", color: isPlaying ? "white" : color, border: `1px solid ${color}` }}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                )}
              </div>
              {records.length > 0 ? (
                <p className="text-[10px] text-gray-400 mt-1 ml-6 font-mono">
                  {fmtTime(records[0])} → {fmtTime(records[records.length - 1])}
                </p>
              ) : (
                <p className="text-[10px] text-gray-300 italic mt-1 ml-6">No data for this date</p>
              )}
              {on && cur && (
                <p className="text-[10px] text-gray-500 mt-0.5 ml-6 font-mono">
                  ▶ {fmtTime(cur)} · {typeof cur.speed === "number" ? cur.speed.toFixed(1) : "0.0"} km/h
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
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm bg-white/95 text-gray-700 hover:bg-white transition-all"
            >
              ⬇ Download
            </button>
            {downloadNotice && (
              <span
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-lg backdrop-blur-sm animate-float-fade ${
                  downloadNotice.ok ? "bg-teal-600/95 text-white" : "bg-red-500/95 text-white"
                }`}
              >
                {downloadNotice.ok ? "✓ Downloaded" : downloadNotice.msg}
              </span>
            )}
          </div>

          {!hasData && !loading && (
            <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
              <div className="bg-white/95 rounded-2xl border border-gray-100 shadow-lg p-6 text-center max-w-xs">
                <p className="font-semibold text-gray-700 text-sm">
                  {isReview ? "No data found in this archive" : `No traceback data for ${date}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {hasData && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft shrink-0">
            <TimelineBars
              traceData={traceData} visible={visible} cars={effectiveCars}
              currentTimeMs={currentTimeMs} onScrub={handleTimelineScrub}
              focusedCar={focusedCar} globalStartMs={globalStartMs} globalEndMs={globalEndMs}
            />

            <div className="px-4 py-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
                <span>{fmtTime(firstRec)}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-sm text-gray-700 font-semibold">{fmtTime(curRec)}</span>
                  {curRec && (
                    <span className="font-mono text-gray-500">
                      {typeof curRec.speed === "number" ? curRec.speed.toFixed(1) : "0.0"} km/h
                    </span>
                  )}
                  {curRec?.offline && (
                    <span className="text-amber-600 font-medium">📦 Offline flush</span>
                  )}
                </span>
                <span>{fmtTime(lastRec)}</span>
              </div>
              <input
                type="range" min={0} max={Math.max(maxLen - 1, 0)} value={scrubIdx}
                onChange={e => { setPlaying(false); setScrubIdx(Number(e.target.value)); }}
                className="w-full accent-teal-600"
              />
              <div className="flex items-center justify-center gap-2 mt-2">
                <button onClick={() => { setPlaying(false); setScrubIdx(0); }} className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm">⏮</button>
                <button onClick={() => setScrubIdx(i => Math.max(0, i - 1))} className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm">◀</button>
                <button onClick={() => setPlaying(p => !p)} className="w-10 h-8 rounded-lg bg-teal-600 text-white text-sm font-semibold">{playing ? "⏸" : "▶"}</button>
                <button onClick={() => setScrubIdx(i => Math.min(maxLen - 1, i + 1))} className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm">▶</button>
                <button onClick={() => { setPlaying(false); setScrubIdx(maxLen - 1); }} className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm">⏭</button>
                <div className="flex items-center gap-1 ml-2">
                  {[1, 2, 5, 10].map(s => (
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
          </div>
        )}
      </div>
    </div>
  );
}