import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../context/ThemeContext";

// ─────────────────────────────────────────────────────────────────────────
// StoreLocationSettings.jsx
//
// Single flat file — lives at components/StoreLocationSettings.jsx, no
// subfolder, matching every other file in this directory (Sidebar.jsx,
// TripMapCard.jsx, etc. are all flat). Previously this was split across
// components/settings/StoreLocationCard.jsx and
// components/shared/StoreLocationMapPicker.jsx, which introduced the only
// two subfolders in an otherwise flat components/ tree. Merged back into
// one file since the map picker is only ever used by this card and isn't
// shared anywhere else.
//
// Powers the customer app's "Pick up in-store" option (Booking.jsx /
// BookingDetails.jsx). Backed by the same systemSettings doc as the
// pricing form on this page (see backend/models/systemSettings/
// systemSettings.model.js), through its own /api/settings/store endpoint.
//
// Kept as its own independently-editable card (separate "Edit Location"
// button, separate save) rather than folded into the pricing form:
//   - different save cadence — pricing writes a new versioned doc that
//     isn't read by the customer app yet; this one is read live, in
//     real time, no redeploy needed.
//   - a map picker doesn't fit the pricing form's plain numeric-input
//     layout.
// The button is labeled "Edit Location" (not "Edit Settings", which the
// pricing card above already uses) specifically so it's visually obvious
// these are two separate, independently-saved sections on the same page.
// ─────────────────────────────────────────────────────────────────────────

// Fix default marker icon (Leaflet + webpack issue) — same fix used by
// this app's CarTracking.jsx and the customer app's MapPicker.jsx.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const DEFAULT_COORDS = [14.7619, 120.9603]; // just where the map centers on open
const PH_BOUNDS = L.latLngBounds([4.5, 116.0], [21.5, 127.0]);

const IconPin = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 21s7-7.05 7-12a7 7 0 10-14 0c0 4.95 7 12 7 12z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

// ── Map picker internals (was StoreLocationMapPicker.jsx) ─────────────────

const MapClickHandler = ({ onLocationChange }) => {
  useMapEvents({ click(e) { onLocationChange(e.latlng.lat, e.latlng.lng); } });
  return null;
};

const MapFlyTo = ({ coords }) => {
  const map = useMap();
  useEffect(() => { if (coords) map.flyTo(coords, 15, { animate: true }); }, [coords, map]);
  return null;
};

const DraggableMarker = ({ position, onDrag }) => {
  const markerRef = useRef(null);
  const eventHandlers = {
    dragend() {
      const m = markerRef.current;
      if (m) { const latlng = m.getLatLng(); onDrag(latlng.lat, latlng.lng); }
    },
  };
  return <Marker draggable position={position} ref={markerRef} eventHandlers={eventHandlers} />;
};

const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);
    const data = await res.json();
    return { label: data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, address: data.address || null, error: false };
  } catch (err) {
    console.error("[StoreLocationSettings] reverseGeocode failed:", err.message);
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
    return { results: await res.json(), error: false };
  } catch (err) {
    console.error("[StoreLocationSettings] searchAddress failed:", err.message);
    return { results: [], error: true };
  }
};

const StoreLocationMapPicker = ({ isOpen, onClose, onConfirm, initialLabel = "", initialCoords = null }) => {
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
    if (error) { setPickError("Couldn't look up that location — check your connection and try again."); setLoading(false); return; }

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

  const handleConfirm = () => { if (hasSelected) onConfirm({ address, lat: markerPos[0], lng: markerPos[1] }); };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm sm:text-lg font-black text-arl-primary">📍 Set Store Location</h3>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Search, click the map, or drag the pin</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm transition flex-shrink-0">
            ✕
          </button>
        </div>

        <div className="px-4 py-2.5 sm:px-6 sm:py-3 border-b border-gray-100">
          <div className="flex gap-1.5 sm:gap-2">
            <input
              type="text"
              className="flex-1 min-w-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary text-xs sm:text-sm"
              placeholder="Search address in Philippines…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setHasSearched(false); setSearchResults([]); setSearchError(""); }}
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
                  <button key={i} onClick={() => handleSearchSelect(r)}
                    className="w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-gray-700 hover:bg-arl-primary/5 border-b border-gray-100 last:border-0 transition">
                    <span className="font-semibold text-arl-primary">{parts[0]}</span>
                    {parts.length > 1 && <span className="text-gray-400 text-[10px] sm:text-xs block">{parts.slice(1).join(", ")}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {searchError && !searching && <p className="text-[10px] sm:text-xs text-red-500 mt-2 px-1">⚠ {searchError}</p>}
          {!searchError && hasSearched && searchResults.length === 0 && !searching && (
            <p className="text-[10px] sm:text-xs text-gray-400 mt-2 px-1">No results. Try a different keyword.</p>
          )}
        </div>

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
            <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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

        <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] sm:text-xs text-gray-400 mb-1">Selected location:</p>
          <p className={`text-xs sm:text-sm font-semibold mb-2.5 sm:mb-3 line-clamp-2 ${hasSelected ? "text-arl-dark" : "text-gray-400 italic"}`}>
            {loading ? "Getting address…" : (hasSelected ? address : "Tap the map, drag the pin, or search to choose a location")}
          </p>
          {pickError && <p className="text-[10px] sm:text-xs text-red-500 mb-2.5 sm:mb-3">⚠ {pickError}</p>}
          <div className="flex gap-2 sm:gap-3">
            <button onClick={onClose} className="flex-1 py-2 sm:py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 text-xs sm:text-sm font-semibold hover:border-gray-300 transition">
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

// ── Main card (was StoreLocationCard.jsx) ──────────────────────────────────

export default function StoreLocationSettings() {
  const { isDark } = useTheme();

  const [storeName, setStoreName] = useState("");
  const [storeLat,  setStoreLat]  = useState(null);
  const [storeLng,  setStoreLng]  = useState(null);
  const [saved,     setSaved]     = useState({ storeName: "", storeLat: null, storeLng: null });

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [notice,  setNotice]  = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const card = `rounded-2xl border p-6 ${
    isDark ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]" : "bg-white border-gray-100 shadow-soft"
  }`;

  const inputCls = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
    isDark ? "bg-[#212121] border-[#4FC3F7]/20 text-[#F5F5F5] focus:ring-[#4FC3F7]/40" : "bg-white border-gray-200 text-arl-dark focus:ring-arl-dark/20"
  }`;

  const fetchStore = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/settings/store`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load store location.");
      setStoreName(json.data.storeName || "");
      setStoreLat(json.data.storeLat);
      setStoreLng(json.data.storeLng);
      setSaved(json.data);
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to load store location." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStore(); }, []);

  const isDirty = storeName !== (saved.storeName || "") || storeLat !== saved.storeLat || storeLng !== saved.storeLng;
  const isConfigured = !!storeName && storeLat !== null && storeLng !== null;

  const handlePickerConfirm = ({ address, lat, lng }) => {
    setStoreName(address);
    setStoreLat(lat);
    setStoreLng(lng);
    setPickerOpen(false);
  };

  const handleClear = () => { setStoreName(""); setStoreLat(null); setStoreLng(null); };

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/settings/store`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ storeName, storeLat, storeLng }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to save store location.");

      setStoreName(json.data.storeName || "");
      setStoreLat(json.data.storeLat);
      setStoreLng(json.data.storeLng);
      setSaved(json.data);
      setEditMode(false);
      setNotice({ type: "success", msg: "Store location saved — live on the customer app now." });
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to save store location." });
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 5000);
    }
  };

  const handleReset = () => {
    setStoreName(saved.storeName || "");
    setStoreLat(saved.storeLat);
    setStoreLng(saved.storeLng);
    setNotice(null);
    setEditMode(false);
  };

  return (
    <div className={`${card} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={`font-semibold text-sm flex items-center gap-2 ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>
            <IconPin className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} /> Store Location &amp; Name
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
            Powers "Pick up in-store" on the customer booking page. Leave blank to hide that option entirely.
          </p>
        </div>

        {/* Status badge — makes the live/hidden state visible without reading the fine print below */}
        {!loading && (
          <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
            isConfigured
              ? isDark ? "bg-[#4FC3F7]/15 text-[#4FC3F7]" : "bg-green-50 text-green-700"
              : isDark ? "bg-[#F5F5F5]/10 text-[#F5F5F5]/50" : "bg-gray-100 text-gray-400"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConfigured ? (isDark ? "bg-[#4FC3F7]" : "bg-green-500") : "bg-gray-400"}`} />
            {isConfigured ? "Live on customer app" : "Hidden — not set"}
          </span>
        )}
      </div>

      {notice && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm ${
          notice.type === "success"
            ? isDark ? "bg-[#1A5F7A] text-[#4FC3F7] border-[#4FC3F7]/30" : "bg-green-50 text-green-700 border-green-200"
            : "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/30"
        }`}>
          {notice.msg}
        </div>
      )}

      {loading ? (
        <p className={`text-sm ${isDark ? "text-[#F5F5F5]/50" : "text-gray-400"}`}>Loading…</p>
      ) : (
        <>
          <div className="space-y-1">
            <label className={`text-xs font-medium ${isDark ? "text-[#F5F5F5]/70" : "text-gray-600"}`}>Store Name / Label</label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              disabled={!editMode}
              placeholder="e.g. ARL Car Rental — Malolos Branch"
              className={inputCls}
            />
            <p className={`text-[11px] ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>
              Shown to customers as the pickup label — pick a name that's clear on its own, not just an address.
            </p>
          </div>

          <div className="space-y-2">
            <label className={`text-xs font-medium ${isDark ? "text-[#F5F5F5]/70" : "text-gray-600"}`}>Location</label>

            <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${
              isDark ? "bg-[#212121] border-[#4FC3F7]/20" : "bg-gray-50 border-gray-200"
            }`}>
              <div className="min-w-0">
                {storeLat !== null && storeLng !== null ? (
                  <>
                    <p className={`text-xs font-mono truncate ${isDark ? "text-[#F5F5F5]/70" : "text-gray-600"}`}>
                      {storeLat.toFixed(5)}, {storeLng.toFixed(5)}
                    </p>
                    <a
                      href={`https://www.google.com/maps?q=${storeLat},${storeLng}`}
                      target="_blank"
                      rel="noreferrer"
                      className={`text-[11px] underline underline-offset-2 ${isDark ? "text-[#4FC3F7]/80 hover:text-[#4FC3F7]" : "text-arl-primary/80 hover:text-arl-primary"}`}
                    >
                      View on Google Maps ↗
                    </a>
                  </>
                ) : (
                  <p className={`text-xs italic ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>No location set</p>
                )}
              </div>
              {editMode && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isDark ? "bg-[#4FC3F7] text-[#212121] hover:bg-[#4FC3F7]/90" : "bg-arl-primary text-white hover:bg-arl-secondary"
                    }`}
                  >
                    📍 {storeLat !== null ? "Change on Map" : "Pick on Map"}
                  </button>
                  {(storeName || storeLat !== null) && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isDark ? "border-[#4FC3F7]/20 text-[#F5F5F5]/60 hover:bg-[#4FC3F7]/10" : "border-gray-200 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {!isConfigured && !editMode && (
              <p className={`text-[11px] ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>
                "Pick up in-store" is currently hidden on the customer app — set both a name and a location to enable it.
              </p>
            )}
          </div>

          {/* Actions — deliberately its own "Edit Location" button, separate from
              the pricing card's "Edit Settings" above, so it's visually clear
              these are two independent, independently-saved sections. */}
          <div className="flex items-center gap-3 pt-1">
            {editMode ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className={`px-6 py-2.5 rounded-xl shadow text-sm font-medium disabled:opacity-50 transition-all ${
                    isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-dark hover:opacity-90 text-white"
                  }`}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className={`px-6 py-2.5 rounded-xl border text-sm font-medium disabled:opacity-50 transition-all ${
                    isDark ? "border-[#4FC3F7]/20 text-[#F5F5F5]/70 hover:bg-[#212121]/40" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {isDirty ? "Discard Changes" : "Cancel"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className={`px-6 py-2.5 rounded-xl shadow text-sm font-medium transition-all ${
                  isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-dark hover:opacity-90 text-white"
                }`}
              >
                Edit Location
              </button>
            )}
          </div>
        </>
      )}

      <StoreLocationMapPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handlePickerConfirm}
        initialLabel={storeName}
        initialCoords={storeLat !== null && storeLng !== null ? { lat: storeLat, lng: storeLng } : null}
      />
    </div>
  );
}