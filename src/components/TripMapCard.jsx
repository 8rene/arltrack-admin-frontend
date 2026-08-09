import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── ICONS (kept local, same stroke style as MyTrips.jsx) ─────────────────
const IconLocate = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

const IconNav = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-8-8 18-2-8-8-2z" />
  </svg>
);

const destIcon = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#4f46e5;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

const driverIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#10b981;border:2px solid white;box-shadow:0 0 0 3px rgba(16,185,129,.25)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/**
 * Builds a Google Maps directions URL. If driver coords are available they're
 * passed as `origin` so the link opens already-routed; otherwise Google Maps
 * falls back to its own current-location detection, which is why `origin`
 * is safe to omit rather than something we need to block the button on.
 */
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
 * Preview map for a single trip's destination (pickup or dropoff point).
 * Shows the destination pin always; adds the driver's live position on top
 * once/if they grant location permission. Routing itself is deliberately
 * NOT built in-app — "Get Directions" just hands off to Google Maps, which
 * already does traffic-aware routing far better than anything we'd build
 * here. This component only answers "where am I relative to where I need
 * to be", not "how do I get there".
 *
 * @param {{ address?: string, lat: number, lng: number }} destination
 * @param {string} label - "Pickup" | "Dropoff" etc, shown above the map
 */
export default function TripMapCard({ destination, label = "Location" }) {
  const mapElRef   = useRef(null);
  const mapRef     = useRef(null);
  const destMarker = useRef(null);
  const driverMarker = useRef(null);

  const [driverPos, setDriverPos]   = useState(null);
  const [locStatus, setLocStatus]   = useState("idle"); // idle | loading | granted | denied | unsupported

  const hasDest = destination && typeof destination.lat === "number" && typeof destination.lng === "number";

  // Init map once
  useEffect(() => {
    if (!hasDest || !mapElRef.current || mapRef.current) return;

    mapRef.current = L.map(mapElRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
    }).setView([destination.lat, destination.lng], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(mapRef.current);

    destMarker.current = L.marker([destination.lat, destination.lng], { icon: destIcon }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDest, destination?.lat, destination?.lng]);

  // Ask for the driver's current position — called lazily (button tap or
  // on-mount, see below), not chained to anything that would repeatedly
  // re-prompt. One shot per card, cached in state.
  const locateMe = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocStatus("unsupported");
      return;
    }
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverPos(p);
        setLocStatus("granted");
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  // Auto-request once on mount — a single permission prompt per card,
  // not on every render/refresh. If the driver denies it, we don't ask
  // again; the "Get Directions" button still works without it.
  useEffect(() => { locateMe(); }, [locateMe]);

  // Drop/refresh the driver marker + fit bounds once we have a position
  useEffect(() => {
    if (!mapRef.current || !driverPos) return;
    if (driverMarker.current) {
      driverMarker.current.setLatLng([driverPos.lat, driverPos.lng]);
    } else {
      driverMarker.current = L.marker([driverPos.lat, driverPos.lng], { icon: driverIcon }).addTo(mapRef.current);
    }
    if (hasDest) {
      const bounds = L.latLngBounds([
        [destination.lat, destination.lng],
        [driverPos.lat, driverPos.lng],
      ]);
      mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    }
  }, [driverPos, hasDest, destination?.lat, destination?.lng]);

  if (!hasDest) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100">
      <div ref={mapElRef} className="w-full h-36" />

      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 text-xs">
        <div className="min-w-0">
          <p className="font-semibold text-arl-dark">{label}</p>
          <p className="text-gray-400 truncate">{destination.address || "—"}</p>
          {locStatus === "loading" && <p className="text-gray-400 mt-0.5">Locating you…</p>}
          {locStatus === "denied" && <p className="text-gray-400 mt-0.5">Location off — directions still work.</p>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {locStatus !== "granted" && locStatus !== "loading" && (
            <button
              onClick={locateMe}
              title="Show my location"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-white"
            >
              <IconLocate />
            </button>
          )}
          <a
            href={buildDirectionsUrl(destination, driverPos)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <IconNav /> Get Directions
          </a>
        </div>
      </div>
    </div>
  );
}