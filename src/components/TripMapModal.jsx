import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── ICONS ───────────────────────────────────────────────────────────────
const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const IconPin = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-7.75 7-13a7 7 0 10-14 0c0 5.25 7 13 7 13z" />
    <circle cx="12" cy="8" r="2.5" />
  </svg>
);
const IconFlag = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" strokeLinecap="round" />
  </svg>
);
const IconLocate = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);
const IconNav = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-8-8 18-2-8-8-2z" />
  </svg>
);
const IconExpand = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H4v4M16 3h4v4M8 21H4v-4M16 21h4v-4" />
  </svg>
);

// ─── Stop type styling — single source of truth for color/icon so the
// list, the map markers, and the legend can never drift out of sync ──────
const STOP_STYLE = {
  pickup:  { color: "#4f46e5", label: "Pickup",  Icon: IconPin,  shape: "50% 50% 50% 0", rotate: "-45deg" },
  dropoff: { color: "#f59e0b", label: "Dropoff", Icon: IconFlag, shape: "50% 50% 50% 0", rotate: "-45deg" },
};

function stopDivIcon(type) {
  const s = STOP_STYLE[type] || STOP_STYLE.pickup;
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:${s.shape};background:${s.color};transform:rotate(${s.rotate});border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,.4)"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

const driverDivIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#10b981;border:2px solid white;box-shadow:0 0 0 4px rgba(16,185,129,.25)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function buildDirectionsUrl(dest, driverPos) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${dest.lat},${dest.lng}`,
    travelmode: "driving",
  });
  if (driverPos) params.set("origin", `${driverPos.lat},${driverPos.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Full-size map modal for a trip's stops (pickup / dropoff).
 *
 * Layout mirrors CarTracking: a left list of stops (click to focus) next
 * to a big Leaflet map. Selecting a stop — from the list OR by tapping its
 * marker — zooms the map to just that stop and opens a detail card with
 * the address and a "Get Directions" handoff to Google Maps. A legend
 * pins down what each marker color means, and "Fit all" returns to the
 * overview framing when stops are far apart.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} title
 * @param {Array<{ key: string, type: "pickup"|"dropoff", address?: string, lat: number, lng: number }>} stops
 */
export default function TripMapModal({ open, onClose, title = "Trip Route", stops = [] }) {
  const mapElRef      = useRef(null);
  const mapRef        = useRef(null);
  const markersRef    = useRef({});   // { [stopKey]: L.Marker }
  const driverMarkerRef = useRef(null);

  const [selectedKey, setSelectedKey] = useState(null);
  const [driverPos, setDriverPos]     = useState(null);
  const [locStatus, setLocStatus]     = useState("idle"); // idle | loading | granted | denied | unsupported

  const validStops = stops.filter(s => typeof s.lat === "number" && typeof s.lng === "number");
  const selectedStop = validStops.find(s => s.key === selectedKey) || null;

  // ── Init map once the modal is open and the container exists ──────────
  useEffect(() => {
    if (!open || !mapElRef.current || mapRef.current || validStops.length === 0) return;

    mapRef.current = L.map(mapElRef.current, {
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapRef.current);

    // Leaflet measures its tile grid off the container's size AT INIT TIME.
    // Inside a modal that just mounted, the browser hasn't necessarily
    // finished layout/paint yet, so the container can report 0×0 (or a
    // stale size) right here — resulting in exactly what you saw: zoom
    // controls render (they're just fixed UI), but tiles never paint
    // because Leaflet computed the wrong grid. invalidateSize() forces a
    // re-measure once the modal is actually laid out. requestAnimationFrame
    // covers "next paint"; the 150ms fallback covers the CSS transition/
    // backdrop-blur cases where layout settles a beat later than that.
    requestAnimationFrame(() => mapRef.current?.invalidateSize());
    const settleTimer = setTimeout(() => mapRef.current?.invalidateSize(), 150);

    const onResize = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", onResize);

    validStops.forEach(stop => {
      const marker = L.marker([stop.lat, stop.lng], { icon: stopDivIcon(stop.type) }).addTo(mapRef.current);
      marker.on("click", () => setSelectedKey(stop.key));
      markersRef.current[stop.key] = marker;
    });

    // fitAll() also depends on the container's real size (fitBounds does
    // its own pixel math) — run it after the same settle window as
    // invalidateSize rather than immediately.
    requestAnimationFrame(() => fitAll());

    return () => {
      clearTimeout(settleTimer);
      window.removeEventListener("resize", onResize);
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
      driverMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fitAll = useCallback(() => {
    if (!mapRef.current) return;
    const pts = validStops.map(s => [s.lat, s.lng]);
    if (driverPos) pts.push([driverPos.lat, driverPos.lng]);
    if (pts.length === 1) {
      mapRef.current.setView(pts[0], 15, { animate: true });
    } else if (pts.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
    }
    setSelectedKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverPos]);

  const focusStop = (stop) => {
    setSelectedKey(stop.key);
    mapRef.current?.flyTo([stop.lat, stop.lng], 16, { animate: true });
  };

  // ── Driver's live position — requested once when the modal opens ──────
  const locateMe = useCallback(() => {
    if (!("geolocation" in navigator)) { setLocStatus("unsupported"); return; }
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("granted");
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => { if (open) locateMe(); }, [open, locateMe]);

  useEffect(() => {
    if (!mapRef.current || !driverPos) return;
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverPos.lat, driverPos.lng]);
    } else {
      driverMarkerRef.current = L.marker([driverPos.lat, driverPos.lng], { icon: driverDivIcon }).addTo(mapRef.current);
    }
  }, [driverPos]);

  // Reset selection state each time the modal is (re)opened for a new trip
  useEffect(() => { if (!open) setSelectedKey(null); }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[82vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-arl-dark text-sm">{title}</h2>
            <p className="text-xs text-gray-400">{validStops.length} stop{validStops.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <IconX />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* ── Stop list ── */}
          <div className="w-64 shrink-0 border-r border-gray-100 flex flex-col overflow-y-auto">
            <div className="p-3 space-y-2">
              {validStops.map(stop => {
                const s = STOP_STYLE[stop.type] || STOP_STYLE.pickup;
                const isSelected = selectedKey === stop.key;
                return (
                  <button
                    key={stop.key}
                    onClick={() => focusStop(stop)}
                    className={`w-full text-left rounded-xl border p-3 transition-all ${
                      isSelected ? "border-indigo-300 ring-1 ring-indigo-100 bg-indigo-50/40" : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white"
                        style={{ backgroundColor: s.color }}
                      >
                        <s.Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-sm font-semibold text-arl-dark">{s.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{stop.address || "—"}</p>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-auto p-3 border-t border-gray-100 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Legend</p>
              {Object.entries(STOP_STYLE).map(([key, s]) => (
                <div key={key} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.label}
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-3 h-3 rounded-full shrink-0 bg-green-500" />
                Your location
              </div>
            </div>
          </div>

          {/* ── Map ── */}
          <div className="flex-1 relative">
            <div ref={mapElRef} className="absolute inset-0" />

            {/* Fit-all control */}
            <button
              onClick={fitAll}
              title="Fit all stops in view"
              className="absolute top-3 right-3 z-[500] flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold bg-white/95 shadow-lg hover:bg-white"
            >
              <IconExpand /> Fit all
            </button>

            {/* Locate-me control */}
            {locStatus !== "granted" && locStatus !== "loading" && (
              <button
                onClick={locateMe}
                title="Show my location"
                className="absolute top-3 right-[110px] z-[500] flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold bg-white/95 shadow-lg hover:bg-white"
              >
                <IconLocate /> Locate me
              </button>
            )}

            {/* Detail panel for the selected stop */}
            {selectedStop && (
              <div className="absolute bottom-3 left-3 right-3 z-[500] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: STOP_STYLE[selectedStop.type]?.color }}>
                    {STOP_STYLE[selectedStop.type]?.label}
                  </p>
                  <p className="text-sm text-gray-600 truncate">{selectedStop.address || "—"}</p>
                  {locStatus === "loading" && <p className="text-xs text-gray-400 mt-0.5">Locating you…</p>}
                  {locStatus === "denied" && <p className="text-xs text-gray-400 mt-0.5">Location off — directions still work.</p>}
                </div>
                <a
                  href={buildDirectionsUrl(selectedStop, driverPos)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <IconNav /> Get Directions
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}