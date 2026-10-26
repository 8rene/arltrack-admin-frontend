import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import GeofenceBanner from "../../components/GeofenceBanner";
import { isGeofenceBreachedAt, isCodingRestrictedAt, activeAlertAt, formatCodingRule } from "../../utils/geofenceAlerts";
import LogsPanel from "./LogsPanel";
import TracebackBookingInfoPanel from "./TracebackBookingInfoPanel";
import TripSummaryPanel from "./TripSummaryPanel";
import { colorForCar } from "../../utils/carColors";
import { fetchCityBoundary } from "../../utils/cityBoundary";

// The plate shown in Trip Summary. A saved trip file has no trip-level plate (yet); what it does have is the
// masked plate ("AB****3") stamped on every coding-restriction alert, so use the latest of those.
function plateFromZones(za) {
  if (za?.plate) return za.plate;
  const hit = (za?.codingAlerts || [])
    .filter(a => a.type === "restricted" && a.plate)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .pop();
  return hit?.plate || null;
}

const escHtml = (s) => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));

const API = process.env.REACT_APP_API_URL;

// One shared empty list, so a missing `cars` prop doesn't create a new [] (and re-fire effects) on every render.
const NO_CARS = [];

// Palette assigned to cars in order — stable per render since `cars` order is stable.
// Shared with the Live tab (see ../../utils/carColors.js) so the same car
// reads as the same color no matter which tab you're on.

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

// The moments of a trip that are shown as flags on the bar, by TIME -- not as map points. A drop-off at 9:30
// with the last ping at 9:00 sits 30 minutes along the bar with the gap in between, same for completed / stolen.
function buildTripEvents(session, za) {
  const ms = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; };
  return [
    { key: "pickup",    icon: "🚩", label: "Pickup",         ms: ms(session?.startedAt) },
    { key: "dropoff",   icon: "📍", label: "Dropped off",    ms: ms(za?.droppedOffAt || session?.droppedOffAt) },
    { key: "completed", icon: "🏁", label: "Completed",      ms: ms(za?.completedAt  || session?.completedAt) },
    { key: "stolen",    icon: "🚨", label: "Flagged stolen", ms: ms(za?.stolenAt     || session?.stolenAt) },
  ].filter((e) => e.ms !== null);
}

// One trip's zones / alerts / warnings / session meta for a car. A car can have several trips touching the
// same date, so each car holds a LIST of these, and the one that matches the scrubbed time is the one shown.
function makeEntry(session, d) {
  return {
    key: session?.bookingSessionID || "none",
    session: session || null,
    geofenceZones:  d?.geofenceZones  || [],
    geofenceAlerts: d?.geofenceAlerts || [],
    codingAlerts:   d?.codingAlerts   || [],
    codingWarnings: d?.codingWarnings || [],
    // Same review details History shows, now also for a trip still in progress.
    droppedOffAt: session?.droppedOffAt || d?.droppedOffAt || null,
    completedAt:  session?.completedAt  || d?.completedAt  || null,
    stolenAt:     session?.stolenAt     || d?.stolenAt     || null,
    holidays:     d?.holidays || [],
    plate:        d?.plate || null,
    available: true,
  };
}

// The trip that owns instant `ms`: the one whose start..end contains it; between two trips, the one that just
// finished; before the first, the first.
function pickEntry(list, ms) {
  if (!list || !list.length) return null;
  if (list.length === 1) return list[0];
  const startOf = (e) => { const t = e.session?.startedAt ? new Date(e.session.startedAt).getTime() : NaN; return Number.isNaN(t) ? null : t; };
  const endOf   = (e) => { const t = e.session?.endedAt ? new Date(e.session.endedAt).getTime() : NaN; return Number.isNaN(t) ? Infinity : t; };
  let hit = null, lastBefore = null;
  for (const e of list) {
    const st = startOf(e);
    if (st === null) continue;
    if (st <= ms) lastBefore = e;
    if (st <= ms && ms <= endOf(e)) hit = e;
  }
  return hit || lastBefore || list[0];
}

function TimelineBars({ traceData, visible, cars, currentTimeMs, onScrub, focusedCar, globalStartMs, globalEndMs, eventsByCar, mode = "merged", onModeChange }) {
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
    // Pointer Events (not mouse-only) so this drags correctly with touch and
    // trackpad/pen input, not just a physical mouse.
    trackEl.setPointerCapture?.(e.pointerId);
    draggingRef.current = carId;
    onScrub(carId, msFromEvent(e, trackEl));
    const onMove = ev => { if (draggingRef.current === carId) onScrub(carId, msFromEvent(ev, trackEl)); };
    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Merged = ONE row for every visible car (handy with many cars); Each car = one row per car. A selected car
  // always shows just its own row, so the switch only appears while nothing is selected.
  const shown = cars.filter(car => visible[car.id] && (traceData[car.id] || []).length);
  const canToggle = !focusedCar && shown.length > 1;
  const merged = canToggle && mode === "merged";
  const mergedIvs = [];
  if (merged) {
    allSegmentSets.flat().map(seg => [gpsMs(seg[0]), gpsMs(seg[seg.length - 1])]).sort((a, b) => a[0] - b[0])
      .forEach(([st, en]) => {
        const last = mergedIvs[mergedIvs.length - 1];
        if (last && st <= last[1]) last[1] = Math.max(last[1], en); else mergedIvs.push([st, en]);
      });
  }
  const mergedEvs = merged
    ? shown.flatMap(car => (eventsByCar?.[car.id] || []).map(ev => ({ ...ev, carName: car.name, k: `${car.id}-${ev.key}` })))
    : [];

  return (
    <div className="px-3 py-2 border-t border-gray-100">
      {canToggle && (
        <div className="flex justify-end mb-1">
          <div className="inline-flex rounded-lg bg-gray-50 p-0.5 text-[10px] font-semibold">
            {[["merged", "Merged"], ["each", "Each car"]].map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => onModeChange?.(v)}
                className={`px-2 py-0.5 rounded-md transition-all ${mode === v ? "bg-white text-teal-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {merged && (
        <div className={`flex items-center gap-2 mb-1 ${mergedEvs.length ? "pt-3" : ""}`}>
          <span className="text-[10px] w-16 shrink-0 truncate text-gray-500 font-semibold">All cars ({shown.length})</span>
          <div
            onPointerDown={e => handlePointerDown(e, "__all__", e.currentTarget)}
            className="flex-1 h-2 relative bg-gray-100 rounded cursor-pointer"
            style={{ touchAction: "none" }}
          >
            {mergedIvs.map(([st, en], i) => {
              const leftPct = scale.toPct(st), rightPct = scale.toPct(en);
              const widthPct = Math.max(rightPct - leftPct, 1.2);
              const span = Math.max(en - st, 1);
              const inRange = currentTimeMs >= st && currentTimeMs <= en;
              const pastEnd = currentTimeMs > en;
              const fillPct = inRange ? ((currentTimeMs - st) / span) * 100 : pastEnd ? 100 : 0;
              return (
                <div key={i} className="absolute top-0 h-full rounded pointer-events-none" style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: "#0d948844" }}>
                  {(inRange || pastEnd) && <div className="absolute top-0 left-0 h-full rounded" style={{ width: `${fillPct}%`, background: "#0d9488" }} />}
                </div>
              );
            })}
            {mergedEvs.map(ev => (
              <button
                key={ev.k}
                type="button"
                title={`${ev.carName} · ${ev.label} · ${new Date(ev.ms).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                onPointerDown={(e) => { e.stopPropagation(); onScrub("__all__", ev.ms); }}
                className="absolute -top-3 -translate-x-1/2 text-[11px] leading-none z-10 hover:scale-125 transition-transform"
                style={{ left: `${scale.toPct(ev.ms)}%` }}
              >
                {ev.icon}
              </button>
            ))}
          </div>
          <span className="text-[10px] w-14 shrink-0 text-right text-gray-400 font-mono">{fmtTime({ at: new Date(globalStartMs).toISOString() })}</span>
        </div>
      )}
      {!merged && cars.map((car, idx) => {
        const records = traceData[car.id] || [];
        if (!records.length || !visible[car.id]) return null;
        const color = colorForCar(idx);
        const isFocused = focusedCar === car.id;
        const segments = buildSegments(records);
        const evs = eventsByCar?.[car.id] || [];

        return (
          <div key={car.id} className={`flex items-center gap-2 mb-1 ${evs.length ? "pt-3" : ""}`}>
            <span className={`text-[10px] w-16 shrink-0 truncate ${isFocused ? "font-bold" : "text-gray-400"}`} style={{ color: isFocused ? color : undefined }}>
              {car.name}
            </span>
            <div
              onPointerDown={e => handlePointerDown(e, car.id, e.currentTarget)}
              className="flex-1 h-2 relative bg-gray-100 rounded cursor-pointer"
              style={{ boxShadow: isFocused ? `0 0 0 1px ${color}` : "none", touchAction: "none" }}
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
              {evs.map((ev) => (
                <button
                  key={ev.key}
                  type="button"
                  title={`${ev.label} · ${new Date(ev.ms).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                  onPointerDown={(e) => { e.stopPropagation(); onScrub(car.id, ev.ms); }}
                  className="absolute -top-3 -translate-x-1/2 text-[11px] leading-none z-10 hover:scale-125 transition-transform"
                  style={{ left: `${scale.toPct(ev.ms)}%` }}
                >
                  {ev.icon}
                </button>
              ))}
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
export default function TracebackPanel({ cars = NO_CARS, token, reviewData = null, onExitReview = null, refreshTick = 0 }) {
  const isReview = !!reviewData;
  const effectiveCars = (isReview ? reviewData.cars : cars) || NO_CARS;

  const [daysAgo, setDaysAgo] = useState(0);
  const [traceData, setTraceData] = useState({});
  // { [carId]: { geofenceZones, geofenceAlerts, codingAlerts, available } } —
  // powers the top-center pulsing banner at the scrubbed timestamp. Live mode
  // fills this from the traceback endpoint; review mode reads it straight off
  // reviewData.zonesAlerts (set by History/Review from the archive JSON) and
  // marks a car unavailable when that data isn't present.
  const [entriesByCar, setEntriesByCar] = useState({}); // { [carId]: [entry, ...] } oldest trip first
  // { [carId]: { bookingSessionID, bookingID, status, startedAt, endedAt } | null } —
  // whichever session owns the currently-viewed date, per car. Live mode gets
  // this from the traceback endpoint (which already looks the session up for
  // geofence data); review mode reads it off reviewData.sessionMeta (set by
  // HistoryPanel from the archived trip's own record — raw uploaded files
  // won't have this, and that's fine, the panels handle it being absent).
  const [showBookingInfo, setShowBookingInfo] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [visible, setVisible] = useState({});
  const [scrubIdx, setScrubIdx] = useState(0);
  const [dragPct, setDragPct] = useState(null); // slider position (0-100) while being dragged; null = follow playback
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [barMode, setBarMode] = useState("merged"); // timeline rows: "merged" (one bar) | "each" (one per car)
  const [focusedCar, setFocusedCar] = useState(null);
  const [flyPos, setFlyPos] = useState(null);
  const playRef = useRef(null);

  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const layersRef = useRef({}); // { [carId]: { start, current, ghost, active } }
  const zoneLayersRef = useRef([]); // geofence-zone Circle/Marker layers currently drawn
  const codingLayersRef = useRef([]); // coding-restriction area (city outline + label) currently drawn
  const [cityBoundaries, setCityBoundaries] = useState({}); // { [cityLower]: { geometry, lat, lng } | null (lookup failed) }
  const boundaryInFlightRef = useRef(new Set());

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

  const fetchAll = useCallback(async (targetDate, force = false) => {
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
        const forceParam = force ? "&force=true" : "";
        const r = await fetch(`${API}/api/gps/${car.id}/traceback?date=${targetDate}${forceParam}`, { headers: { Authorization: `Bearer ${token}` } });
        const contentType = r.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error(`Backend returned ${r.status} (non-JSON) for ${car.name} — is REACT_APP_API_URL correct and is the backend deployed with the traceback route?`);
        }
        const json = await r.json();
        if (!r.ok) throw new Error(json.message || `Failed to load traceback for ${car.name}.`);
        const d = json?.data || {};
        // New backend: every trip touching this date. Older backend: just the one at the top level.
        const entries = Array.isArray(d.sessions) && d.sessions.length
          ? d.sessions.map(x => makeEntry(x.session, x))
          : [makeEntry(d.session, d)];
        return { id: car.id, records: d.records || [], entries };
      })
    );
    const map = {}, vis = {}, zones = {};
    let firstError = null;
    results.forEach(r => {
      if (r.status === "fulfilled") {
        const sorted = [...r.value.records].sort((a, b) => gpsMs(a) - gpsMs(b));
        map[r.value.id] = sorted;
        vis[r.value.id] = sorted.length > 0;
        zones[r.value.id] = r.value.entries;
      } else if (!firstError) {
        firstError = r.reason?.message || "Failed to load traceback.";
      }
    });
    setTraceData(map);
    setVisible(vis);
    setEntriesByCar(zones);
    if (firstError) setFetchError(firstError);
    setLoading(false);
  }, [cars, token]);

  // `cars` (from CarTracking) is memoized so its identity is stable across
  // unrelated re-renders — otherwise this effect (via fetchAll's own [cars,
  // token] dependency) would refire, and re-hit the Sheets-backed traceback
  // endpoint for every car, on every re-render of the parent page (e.g. the
  // Live tab's location poller ticking in the background), not just on an
  // actual date change or a deliberate click of the Refresh button.
  const prevTickRef = useRef(refreshTick);
  useEffect(() => {
    const isManualRefresh = refreshTick !== prevTickRef.current;
    prevTickRef.current = refreshTick;
    if (!isReview && cars?.length) fetchAll(date, isManualRefresh);
  }, [date, cars?.length, isReview, fetchAll, refreshTick]);

  useEffect(() => {
    if (!isReview) return;
    setScrubIdx(0); setPlaying(false); setFocusedCar(null); setFlyPos(null);
    const map = {}, vis = {}, zones = {};
    effectiveCars.forEach(car => {
      const sorted = [...(reviewData.records[car.id] || [])].sort((a, b) => gpsMs(a) - gpsMs(b));
      map[car.id] = sorted;
      vis[car.id] = sorted.length > 0;
      const carZoneData = reviewData.zonesAlerts?.[car.id];
      const meta = reviewData.sessionMeta?.[car.id] || null;
      const saved = reviewData.sessionsByCar?.[car.id]; // a download made on Traceback can carry several trips
      zones[car.id] = Array.isArray(saved) && saved.length
        ? saved
        : [carZoneData
            ? makeEntry(meta, carZoneData)
            : { ...makeEntry(meta, null), available: false }];
    });
    setTraceData(map);
    setVisible(vis);
    setEntriesByCar(zones);
    // Review always has a car selected (first one with data) so Trip Summary / Logs are right there.
    setFocusedCar(effectiveCars.find(c => map[c.id]?.length)?.id || null);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewData, isReview]);

  function buildAllVisible(data, vis) {
    // One list ordered by TIME across every visible car (not car-by-car) -- the overall bar, playback and the
    // binary search in closestIdx() all rely on it, so a car that ran earlier can't trap the scrubber at its end.
    return Object.entries(data).filter(([id]) => vis[id]).flatMap(([, r]) => r).sort((a, b) => gpsMs(a) - gpsMs(b));
  }

  const allPoints = Object.entries(traceData).filter(([id]) => visible[id]).flatMap(([, r]) => r);
  const allVisible = buildAllVisible(traceData, visible);
  const hasData = allVisible.length > 0;
  // What the timeline bars + the bottom slider cover: the selected car alone when one is selected, otherwise
  // every visible car. (The map keeps using allPoints / allVisible, so deselecting still fits all cars.)
  const inScope = (id) => !!visible[id] && (!focusedCar || id === focusedCar);
  const barVisible = {};
  Object.keys(traceData).forEach(id => { if (inScope(id)) barVisible[id] = true; });
  const allGpsTimes = Object.entries(traceData).filter(([id]) => inScope(id)).flatMap(([, r]) => r).map(gpsMs);
  // Flags per car. A Traceback day only shows that day's pings, so only flags inside that day count there
  // (a pickup three days ago must not stretch today's bar); a saved trip (History / Review) shows the whole
  // trip, so all of its flags count.
  const dayStartMs = !isReview && date ? new Date(`${date}T00:00:00+08:00`).getTime() : null;
  const dayEndMs   = !isReview && date ? new Date(`${date}T23:59:59.999+08:00`).getTime() : null;
  const eventsByCar = {};
  effectiveCars.forEach((car) => {
    if (!inScope(car.id)) return;
    eventsByCar[car.id] = (entriesByCar[car.id] || []).flatMap(e => buildTripEvents(e.session, e))
      .filter((e) => dayStartMs === null || (e.ms >= dayStartMs && e.ms <= dayEndMs));
  });
  const eventTimes = Object.values(eventsByCar).flat().map((e) => e.ms);
  // The bar spans the whole booking: first/last ping AND the flags, so a completion an hour after the last ping
  // shows as an hour of empty bar instead of the bar just stopping at the last ping.
  const boundsMs = [...allGpsTimes, ...eventTimes];
  const globalStartMs = boundsMs.length ? Math.min(...boundsMs) : 0;
  const globalEndMs = boundsMs.length ? Math.max(...boundsMs) : 0;
  const maxLen = focusedCar && traceData[focusedCar]?.length ? traceData[focusedCar].length : allVisible.length;

  const focusedRecs = focusedCar ? (traceData[focusedCar] || []) : null;
  const curRec = focusedRecs?.length ? focusedRecs[Math.min(scrubIdx, focusedRecs.length - 1)] : (allVisible[Math.min(scrubIdx, allVisible.length - 1)] || null);
  const currentTimeMs = curRec ? gpsMs(curRec) : 0;

  // The trip each car is in at the scrubbed instant. Zones, alerts, logs and the summary all follow this,
  // so scrubbing from an earlier booking into a later one on the same day switches everything with it.
  const zonesAlerts = {};
  const sessionByCar = {};
  effectiveCars.forEach(car => {
    const e = pickEntry(entriesByCar[car.id], currentTimeMs);
    if (e) { zonesAlerts[car.id] = e; sessionByCar[car.id] = e.session; }
  });
  const panelCar = focusedCar || (isReview && effectiveCars.length === 1 ? effectiveCars[0].id : null);
  const activeTripKey = effectiveCars.map(c => `${c.id}:${zonesAlerts[c.id]?.key || ""}`).join("|");

  // The slider uses the SAME time scale as the bar above it (gaps squeezed, flags included), so its thumb always
  // sits exactly where the bar is filled, and it scrubs by TIME instead of stepping one ping at a time.
  const barScale = buildTimeScale(
    globalStartMs, globalEndMs,
    effectiveCars.filter(c => inScope(c.id) && (traceData[c.id] || []).length).map(c => buildSegments(traceData[c.id]))
  );
  // Selected car -> its own pings; nothing selected -> every visible car combined.
  const sliderRecs = focusedRecs?.length ? focusedRecs : allVisible;
  const fmtMs = (ms) => (ms ? fmtTime({ at: new Date(ms).toISOString() }) : "—");

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
        // Show the rule that was saved when it fired (when this trip has one).
        const ruleText = formatCodingRule(activeAlertAt(za.codingAlerts, currentTimeMs, "restricted")?.rule);
        entries.push({ id: `restricted-${c.id}`, tone: "restricted", text: `🚫 ${c.name} is coding-restricted${ruleText ? ` — ${ruleText}` : ""}` });
      }
      return entries;
    });
  // Which cars are inside a coding restriction at the scrubbed instant (and which city) -- the map area below
  // only redraws when this changes, not on every scrub tick.
  const codingShapeKey = carsForBanner.map(c => {
    const a = activeAlertAt(zonesAlerts[c.id]?.codingAlerts, currentTimeMs, "restricted");
    return a?.city ? `${c.id}:${a.city}:${a.at}` : "";
  }).join("|");
  // If nobody visible actually has zone/alert data to check (typical for a
  // bare uploaded file with no session context), say so once instead of
  // silently omitting the banner — matches the fallback the plan called for.
  const noZoneDataAtAll = hasData && carsForBanner.length > 0 && carsForBanner.every(c => !zonesAlerts[c.id]?.available);
  const mapBanners = bannerEntries.length
    ? bannerEntries
    : (isReview && noZoneDataAtAll)
      ? [{ id: "unavailable", tone: "unavailable", text: "Geofence status unavailable for this file" }]
      : [];

  // Logs panel: every trip this car had that day, merged into one list (LogsPanel sorts it by time). Only the
  // map layers (zones / coding area) are per-trip. On Traceback a day shows only that day's entries -- a trip
  // that spans several days must not dump the other days' alerts in here; a saved trip (Review) shows all.
  function logsForCar(carId) {
    const entries = entriesByCar[carId] || [];
    const inDay = (at) => {
      if (dayStartMs === null) return true;
      const t = at ? new Date(at).getTime() : NaN;
      return !Number.isNaN(t) && t >= dayStartMs && t <= dayEndMs;
    };
    const seen = new Set();
    const uniq = (list, keyOf) => list.filter(x => { const k = keyOf(x); if (seen.has(k)) return false; seen.add(k); return true; });
    const tripEvents = entries.flatMap(e => buildTripEvents(e.session, e))
      .filter(ev => inDay(new Date(ev.ms).toISOString()))
      .map(ev => ({ at: new Date(ev.ms).toISOString(), title: { pickup: "Picked Up", dropoff: "Dropped Off", completed: "Booking Completed", stolen: "Flagged Stolen" }[ev.key] }));
    return {
      hasActiveSession: entries.some(e => e.available),
      geofenceAlerts: entries.flatMap(e => e.geofenceAlerts || []).filter(a => inDay(a.at)),
      codingAlerts:   entries.flatMap(e => e.codingAlerts   || []).filter(a => inDay(a.at)),
      codingWarnings: entries.flatMap(e => e.codingWarnings || []).filter((w, i, arr) => arr.findIndex(x => JSON.stringify(x) === JSON.stringify(w)) === i),
      tripEvents,
      holidays: uniq(entries.flatMap(e => e.holidays || []), h => h.holidayDate || JSON.stringify(h)),
    };
  }

  // Downloads exactly what's currently loaded (every car's full point set,
  // not just visible/focused ones) as JSON — round-trips straight back in
  // through the Review tab's upload, same as a geo-test/GPS-test export.
  function handleDownload() {
    // A car is selected -> download just that car (points, zones, logs, every trip it had that day).
    // Nothing selected -> every car that has data, as before.
    const carsOut = focusedCar ? effectiveCars.filter(c => c.id === focusedCar) : effectiveCars;
    const records = {}, entries = {}, latest = {}, latestMeta = {};
    carsOut.forEach(c => {
      records[c.id] = traceData[c.id] || [];
      entries[c.id] = entriesByCar[c.id] || [];
      // zonesAlerts / sessionMeta keep the single-trip shape (newest trip); sessionsByCar carries every trip.
      const l = entries[c.id].slice(-1)[0];
      if (l) { latest[c.id] = l; latestMeta[c.id] = l.session; }
    });
    if (!Object.values(records).some(r => r.length)) {
      setDownloadNotice({ ok: false, msg: "No data to download" });
      return;
    }
    const baseLabel = isReview ? (reviewData.label || "traceback-review") : `traceback-${date}`;
    const label = focusedCar && carsOut[0] ? `${baseLabel}-${carsOut[0].name}` : baseLabel;
    const payload = { label, cars: carsOut, records, zonesAlerts: latest, sessionMeta: latestMeta, sessionsByCar: entries };
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
    // Nothing selected: the bar scrubs the COMBINED timeline (earliest ping of any car -> latest ping of any
    // car) and does not pick a car. Only when a car is already selected does touching another car's row switch to it.
    if (!focusedCar) {
      const merged = buildAllVisible(traceData, visible);
      if (merged.length) setScrubIdx(closestIdx(merged, ms));
      return;
    }
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

  // ── Geofence zones (pickup/dropoff/custom, i.e. the designated destination)
  // for the shown car(s) — same circles + numbered markers the Live tab
  // draws, just fed from zonesAlerts instead of sessionInfo. Scoped the same
  // way as the breach/restricted banner: only the focused car if one is
  // focused, otherwise every currently-visible car. ───────────────────────
  useEffect(() => {
    if (!leafletMap.current) return;
    zoneLayersRef.current.forEach(layer => layer.remove());
    zoneLayersRef.current = [];

    const carsToShow = focusedCar ? effectiveCars.filter(c => c.id === focusedCar) : effectiveCars.filter(c => visible[c.id]);
    carsToShow.forEach(car => {
      const zones = zonesAlerts[car.id]?.geofenceZones || [];
      zones.forEach((zone, i) => {
        if (typeof zone.lat !== "number" || typeof zone.lng !== "number") return;
        const circle = L.circle([zone.lat, zone.lng], {
          radius: zone.radius || 500,
          color: "#0d9488",
          fillColor: "#0d9488",
          fillOpacity: 0.12,
          weight: 2,
          dashArray: "6 4",
        }).addTo(leafletMap.current).bindPopup(`<b>${zone.label || `Zone ${i + 1}`}</b><br>Radius: ${zone.radius || 500} m`);

        const numberIcon = L.divIcon({
          className: "",
          html: `<div style="background:#0d9488;color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${i + 1}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const marker = L.marker([zone.lat, zone.lng], { icon: numberIcon }).addTo(leafletMap.current).bindPopup(zone.label || `Zone ${i + 1}`);

        zoneLayersRef.current.push(circle, marker);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTripKey, focusedCar, visible, effectiveCars]);

  // ── Coding-restriction area: fetch the outline of every city this trip was ever restricted in (one at a time,
  // ~1 req/sec for Nominatim's usage policy), so it is ready the moment the scrubber reaches the alert. ──────
  useEffect(() => {
    const cities = new Set();
    effectiveCars.forEach(c => (entriesByCar[c.id] || []).forEach(e => (e.codingAlerts || []).forEach(a => { if (a.type === "restricted" && a.city) cities.add(a.city); })));
    const toFetch = [...cities].filter(city => { const k = city.toLowerCase(); return !(k in cityBoundaries) && !boundaryInFlightRef.current.has(k); });
    if (!toFetch.length) return;
    let cancelled = false;
    (async () => {
      for (const city of toFetch) {
        if (cancelled) return;
        const key = city.toLowerCase();
        boundaryInFlightRef.current.add(key);
        try {
          const boundary = await fetchCityBoundary(city);
          if (!cancelled) setCityBoundaries(z => ({ ...z, [key]: boundary }));
        } catch {
          if (!cancelled) setCityBoundaries(z => ({ ...z, [key]: null }));
        } finally {
          boundaryInFlightRef.current.delete(key); // if cancelled before it landed, the next run retries it
        }
        await new Promise(r => setTimeout(r, 1100));
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesByCar]);

  // ── Coding-restriction area: while the scrubbed time is inside a coding alert, draw that city's whole outline
  // in the car's color (same idea as the Live tab). Until the outline arrives -- or if it can't be found -- a
  // circle around where the alert fired stands in for it. Gone as soon as the alert clears. ───────────────────
  useEffect(() => {
    if (!leafletMap.current) return;
    codingLayersRef.current.forEach(layer => layer.remove());
    codingLayersRef.current = [];

    const carsToShow = focusedCar ? effectiveCars.filter(c => c.id === focusedCar) : effectiveCars.filter(c => visible[c.id]);
    carsToShow.forEach(car => {
      const alert = activeAlertAt(zonesAlerts[car.id]?.codingAlerts, currentTimeMs, "restricted");
      if (!alert?.city) return; // older / fixed-rule alerts have no city, so no area to outline
      const color = colorForCar(effectiveCars.findIndex(c => c.id === car.id));
      const style = { color, fillColor: color, fillOpacity: 0.22, weight: 3, interactive: false };
      const boundary = cityBoundaries[alert.city.toLowerCase()];

      let shape = null, labelLatLng = null;
      if (boundary?.geometry) {
        shape = L.geoJSON(boundary.geometry, { style, interactive: false });
        labelLatLng = [boundary.lat, boundary.lng];
      } else {
        const recs = traceData[car.id] || [];
        if (recs.length) {
          const r = recs[closestIdx(recs, new Date(alert.at).getTime())];
          shape = L.circle([r.lat, r.lng], { radius: 2500, ...style });
          labelLatLng = [r.lat, r.lng];
        }
      }
      if (!shape) return;

      shape.addTo(leafletMap.current);
      shape.bringToBack(); // under the trail, pins and geofence zones
      const label = L.marker(labelLatLng, {
        interactive: false,
        icon: L.divIcon({
          className: "",
          html: `<div style="background:${color};color:white;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);transform:translateY(-26px);">Coding-restricted · ${escHtml(alert.city)}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      }).addTo(leafletMap.current);
      codingLayersRef.current.push(shape, label);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codingShapeKey, cityBoundaries, focusedCar, visible, effectiveCars]);

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
                    if (isReview && focusedCar === car.id) return; // can't hide the selected car in review
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

          {/* Trip Summary / Logs follow the selected car. A saved trip with only one car keeps them available even when
              that car is deselected (nothing else could be meant), so deselecting never hides them there. */}
          <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 items-end">
            {panelCar && (
              <>
                <button
                  onClick={() => { setShowBookingInfo(v => !v); setShowLogs(false); }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm transition-all ${
                    showBookingInfo ? "bg-teal-600 text-white" : "bg-white/95 text-gray-700 hover:bg-white"
                  }`}
                >
                  ℹ {isReview ? "Trip Summary" : "Booking Information"}
                </button>
                <button
                  onClick={() => { setShowLogs(v => !v); setShowBookingInfo(false); }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm transition-all ${
                    showLogs ? "bg-teal-600 text-white" : "bg-white/95 text-gray-700 hover:bg-white"
                  }`}
                >
                  🗒 Logs
                </button>
              </>
            )}
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

          {showBookingInfo && panelCar && (
            isReview ? (
              <TripSummaryPanel
                bookingID={sessionByCar[panelCar]?.bookingID}
                carLabel={effectiveCars.find(c => c.id === panelCar)?.name || panelCar}
                tripLabel={reviewData?.label}
                plate={plateFromZones(zonesAlerts[panelCar])}
                droppedOffAt={zonesAlerts[panelCar]?.droppedOffAt || null}
                completedAt={zonesAlerts[panelCar]?.completedAt || null}
                geofenceAlertCount={(zonesAlerts[panelCar]?.geofenceAlerts || []).length}
                codingAlertCount={(zonesAlerts[panelCar]?.codingAlerts || []).length}
                token={token}
                onClose={() => setShowBookingInfo(false)}
              />
            ) : (
              <TracebackBookingInfoPanel
                carId={panelCar}
                carLabel={effectiveCars.find(c => c.id === panelCar)?.name || panelCar}
                date={date}
                session={sessionByCar[panelCar] || null}
                zones={zonesAlerts[panelCar]?.geofenceZones || []}
                // Traceback is a review/inspection view, not a place to steer an
                // in-progress trip — zone editing (labels, radius, add/remove,
                // Save) now only happens from the Live tab's BookingInfoPanel.
                // Always read-only here, regardless of date or session status.
                canEdit={false}
                currentPosition={(() => {
                  const recs = traceData[panelCar] || [];
                  return recs.length ? { lat: recs[recs.length - 1].lat, lng: recs[recs.length - 1].lng } : null;
                })()}
                token={token}
                onClose={() => setShowBookingInfo(false)}
                onSaved={() => fetchAll(date)}
                onFocusZone={zone => setFlyPos([zone.lat, zone.lng])}
              />
            )
          )}

          {showLogs && panelCar && (
            <LogsPanel
              sessionInfo={logsForCar(panelCar)}
              loading={loading}
              onClose={() => setShowLogs(false)}
            />
          )}

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
              traceData={traceData} visible={barVisible} cars={effectiveCars}
              currentTimeMs={currentTimeMs} onScrub={handleTimelineScrub}
              focusedCar={focusedCar} globalStartMs={globalStartMs} globalEndMs={globalEndMs}
              eventsByCar={eventsByCar}
              mode={barMode} onModeChange={setBarMode}
            />

            <div className="px-4 py-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
                <span>{fmtMs(globalStartMs)}</span>
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
                <span>{fmtMs(globalEndMs)}</span>
              </div>
              <input
                type="range" min={0} max={100} step="any"
                value={dragPct ?? barScale.toPct(currentTimeMs)}
                onChange={e => {
                  const pct = Number(e.target.value);
                  setPlaying(false);
                  setDragPct(pct);
                  if (sliderRecs.length) setScrubIdx(closestIdx(sliderRecs, barScale.toMs(pct)));
                }}
                onPointerUp={() => setDragPct(null)}
                onKeyUp={() => setDragPct(null)}
                onBlur={() => setDragPct(null)}
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