import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon (Leaflet webpack issue) — same fix as the
// customer app's MapPicker.jsx and this app's CarTracking.jsx.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Just where the map visually centers on open — never a submitted value.
const DEFAULT_COORDS = [14.7619, 120.9603];

// Rough bounding box around the Philippine archipelago — stops the map
// from being panned/zoomed out to other countries. Ported from the
// customer app's MapPicker.jsx; kept here too since the store is
// presumably always within PH. Unlike the customer picker, there's no
// separate "allowed service region" restriction on top of this — an
// admin choosing the store's own address isn't limited to a booking
// service area.
const PH_BOUNDS = L.latLngBounds([4.5, 116.0], [21.5, 127.0]);

const MapClickHandler = ({ onLocationChange }) => {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const MapFlyTo = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo(coords, 15, { animate: true });
  }, [coords, map]);
  return null;
};

const DraggableMarker = ({ position, onDrag }) => {
  const markerRef = useRef(null);
  const eventHandlers = {
    dragend() {
      const m = markerRef.current;
      if (m) {
        const latlng = m.getLatLng();
        onDrag(latlng.lat, latlng.lng);
      }
    },
  };
  return <Marker draggable position={position} ref={markerRef} eventHandlers={eventHandlers} />;
};

// Reverse geocode using Nominatim (free, no API key) — same source as the
// customer app's picker, so addresses read the same way in both places.
const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);
    const data = await res.json();
    return {
      label:   data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      address: data.address || null,
      error:   false,
    };
  } catch (err) {
    console.error("[StoreLocationMapPicker] reverseGeocode failed:", err.message);
    return { label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, address: null, error: true };
  }
};

const searchAddress = async (query) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&countrycodes=ph&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const results = await res.json();
    return { results, error: false };
  } catch (err) {
    console.error("[StoreLocationMapPicker] searchAddress failed:", err.message);
    return { results: [], error: true };
  }
};

// ── StoreLocationMapPicker modal ─────────────────────────────────────────
// `initialCoords`: { lat, lng } to center on immediately when opening.
// `initialLabel`: address text already saved (e.g. from a previous save).
// onConfirm({ address, lat, lng })
// `title` / `subtitle`: header text. Default to the store-location wording so the
// Settings page is unchanged; Bookings.jsx passes its own for the destination.
const StoreLocationMapPicker = ({ isOpen, onClose, onConfirm, initialLabel = "", initialCoords = null, title = "📍 Set Store Location", subtitle = "Search, click the map, or drag the pin" }) => {
  const [markerPos,     setMarkerPos]     = useState(DEFAULT_COORDS);
  const [address,       setAddress]       = useState(initialLabel);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [searchError,   setSearchError]   = useState("");
  const [hasSearched,   setHasSearched]   = useState(false);
  const [flyTarget,     setFlyTarget]     = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [pickError,     setPickError]     = useState("");
  const [hasSelected,   setHasSelected]   = useState(!!initialLabel);

  useEffect(() => {
    if (isOpen) {
      const startPos = initialCoords ? [initialCoords.lat, initialCoords.lng] : DEFAULT_COORDS;
      setMarkerPos(startPos);
      setAddress(initialLabel);
      setHasSelected(!!initialLabel);
      setSearchQuery("");
      setSearchResults([]);
      setSearchError("");
      setHasSearched(false);
      setFlyTarget(initialCoords ? startPos : null);
      setPickError("");
    }
  }, [isOpen, initialLabel, initialCoords]);

  const handleLocationChange = useCallback(async (lat, lng) => {
    setLoading(true);
    const { label, address, error } = await reverseGeocode(lat, lng);

    if (error) {
      setPickError("Couldn't look up that location — check your connection and try again.");
      setLoading(false);
      return;
    }

    // Same open-water guard as the customer picker: a bare "Philippines"
    // country match with no locality field usually means open sea/bay.
    const hasLocality = !!(
      address?.city || address?.town || address?.village ||
      address?.municipality || address?.suburb || address?.county ||
      address?.hamlet || address?.neighbourhood
    );

    if (!address || address.country_code !== "ph" || !hasLocality) {
      setPickError("Please pick a location within the Philippines (on land).");
      setLoading(false);
      return;
    }

    setPickError("");
    setMarkerPos([lat, lng]);
    setAddress(label);
    setHasSelected(true);
    setLoading(false);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    const { results, error } = await searchAddress(searchQuery);
    setSearchResults(results);
    if (error) setSearchError("Search failed — check your connection and try again.");
    setHasSearched(true);
    setSearching(false);
  };

  const handleSearchSelect = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setPickError("");
    setMarkerPos([lat, lng]);
    setFlyTarget([lat, lng]);
    setAddress(result.display_name);
    setHasSelected(true);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handleConfirm = () => {
    if (!hasSelected) return;
    onConfirm({ address, lat: markerPos[0], lng: markerPos[1] });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm sm:text-lg font-black text-arl-primary">{title}</h3>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm transition flex-shrink-0">
            ✕
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2.5 sm:px-6 sm:py-3 border-b border-gray-100">
          <div className="flex gap-1.5 sm:gap-2">
            <input
              type="text"
              className="flex-1 min-w-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary text-xs sm:text-sm"
              placeholder="Search address in Philippines…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHasSearched(false);
                setSearchResults([]);
                setSearchError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-arl-primary text-white text-xs sm:text-sm font-semibold hover:bg-arl-secondary transition disabled:opacity-50 flex-shrink-0"
            >
              {searching ? "…" : "Search"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-lg max-h-48 sm:max-h-60 overflow-y-auto">
              {searchResults.map((r, i) => {
                const a = r.address || {};
                const parts = [
                  r.name || r.display_name.split(",")[0],
                  a.road || a.suburb || a.neighbourhood,
                  a.city || a.municipality || a.town || a.village,
                  a.province || a.state,
                ].filter(Boolean);
                return (
                  <button key={i}
                    onClick={() => handleSearchSelect(r)}
                    className="w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-gray-700 hover:bg-arl-primary/5 border-b border-gray-100 last:border-0 transition">
                    <span className="font-semibold text-arl-primary">{parts[0]}</span>
                    {parts.length > 1 && (
                      <span className="text-gray-400 text-[10px] sm:text-xs block">{parts.slice(1).join(", ")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {searchError && !searching && (
            <p className="text-[10px] sm:text-xs text-red-500 mt-2 px-1">⚠ {searchError}</p>
          )}
          {!searchError && hasSearched && searchResults.length === 0 && !searching && (
            <p className="text-[10px] sm:text-xs text-gray-400 mt-2 px-1">No results. Try a different keyword.</p>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative" style={{ minHeight: "240px" }}>
          <MapContainer
            center={DEFAULT_COORDS}
            zoom={15}
            minZoom={5}
            maxBounds={PH_BOUNDS}
            maxBoundsViscosity={1.0}
            style={{ height: "100%", width: "100%", minHeight: "240px" }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onLocationChange={handleLocationChange} />
            {flyTarget && <MapFlyTo coords={flyTarget} />}
            <DraggableMarker position={markerPos} onDrag={handleLocationChange} />
          </MapContainer>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-[500]">
              <div className="text-xs sm:text-sm text-arl-primary font-semibold animate-pulse">Getting address…</div>
            </div>
          )}
        </div>

        {/* Selected address + confirm */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] sm:text-xs text-gray-400 mb-1">Selected location:</p>
          <p className={`text-xs sm:text-sm font-semibold mb-2.5 sm:mb-3 line-clamp-2 ${hasSelected ? "text-arl-dark" : "text-gray-400 italic"}`}>
            {loading ? "Getting address…" : (hasSelected ? address : "Tap the map, drag the pin, or search to choose a location")}
          </p>
          {pickError && (
            <p className="text-[10px] sm:text-xs text-red-500 mb-2.5 sm:mb-3">⚠ {pickError}</p>
          )}
          <div className="flex gap-2 sm:gap-3">
            <button onClick={onClose}
              className="flex-1 py-2 sm:py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 text-xs sm:text-sm font-semibold hover:border-gray-300 transition">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={loading || !hasSelected}
              className="flex-1 py-2 sm:py-2.5 rounded-xl bg-arl-primary text-white text-xs sm:text-sm font-semibold hover:bg-arl-secondary transition disabled:opacity-50">
              ✓ Use this location
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default StoreLocationMapPicker;