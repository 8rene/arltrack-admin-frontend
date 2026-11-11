import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, GeoJSON, CircleMarker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../../context/ThemeContext";
import { reversePH, isWaterFeature, REASON_TEXT } from "../../utils/phLocation";
import { fetchAreaBoundary } from "../../utils/cityBoundary";

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconPeso = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 4v16M6 4h7a4 4 0 010 8H6m0 3h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconMap = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── SECTION CARD ────────────────────────────────────────────────────────────
// Same grouping as the Bookings details window: a white card with a grey title strip.
function Section({ icon, title, desc, isDark, children }) {
  return (
    <section className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? "bg-[#1A5F7A] border-[#4FC3F7]/20" : "bg-white"}`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${isDark ? "bg-[#212121]/40 border-[#4FC3F7]/20" : "bg-gray-50"}`}>
        {icon}
        <h2 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#F5F5F5]" : "text-gray-600"}`}>{title}</h2>
      </div>
      <div className="p-4 space-y-4">
        {desc && <p className={`text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>{desc}</p>}
        {children}
      </div>
    </section>
  );
}

// ─── FIELD DEFINITIONS ─────────────────────────────────────────────────────
// Keep these in sync BY HAND with backend/models/systemSettings/systemSettings.model.js
// Percentages (0-100), not flat pesos. Computed server-side on every booking:
//   service fee = % of the rental fee only
//   gateway fee = % of everything else (rental + driver's fee + service fee + security deposit)
const FLAT_FEE_FIELDS = [
  { key: "serviceFeePercent", label: "Service Fee (%)", unit: "%", hint: "Percent of the RENTAL FEE only — the driver's fee and security deposit are not included." },
  { key: "gatewayFeePercent", label: "Gateway Fee (%)", unit: "%", hint: "Percent of the whole booking: rental + driver's fee + service fee + security deposit." },
];

// There is no separate "extra fee" setting: being outside the base area just means the higher driver's fee applies.
// The outside fee must be higher than the base fee.
const AREA_FEE_FIELDS = [
  { key: "driversFeeBaseArea", label: "Driver's Fee — Base Area", hint: "Chauffeur fee per day when the pickup and every destination are inside the base area." },
  { key: "driversFeeOutsideArea", label: "Driver's Fee — Outside Area", hint: "Chauffeur fee per day when the pickup or any destination is outside the base area. Must be higher than the base-area fee." },
];

// The real, refundable security deposit + late-return penalty settings.
// These already existed in the backend model with no admin UI at all —
// changing them required editing Firestore directly. This is that UI.
const DEPOSIT_FIELDS = [
  { key: "securityDepositAmount", label: "Security Deposit Amount", hint: "Refundable deposit collected at pickup. Snapshotted onto each booking at the moment it's actually collected, so changing this never affects a deposit already taken." },
  { key: "lateFeeRatePerHour", label: "Late Fee Rate (per hour)", hint: "Charged per billable hour late at return, after the grace period below." },
  { key: "lateFeeGraceMinutes", label: "Late Fee Grace Period (minutes)", hint: "Minutes late that are forgiven before the late fee starts accruing.", unit: "min" },
];

// Penalty settings. penaltyThreshold decides when the online payment (gateway) fee is added to a penalty paid online: only when
// the penalty's own amount is HIGHER than this. At or below it there is no fee. (Was a hardcoded 1,000.)
const PENALTY_FIELDS = [
  { key: "penaltyThreshold", label: "Penalty Fee Threshold", hint: "A penalty above this amount carries the gateway fee when paid online. A penalty at or below it has no fee. 0 = every penalty carries the fee." },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// System Settings — Owner & Admin only (see config/pagePermissions.js).
// Editable booking-fee configuration, backed by the systemSettings
// Firestore collection (backend/services/systemSettings/systemSettings.service.js).
// Each save writes a new doc (systemSettingsID + createdAt) rather than
// mutating one fixed doc — the form always reads back the latest one.
//
// IMPORTANT — this only changes what the ADMIN side stores. The customer
// app's booking quote (arltrack-customer-backend/utils/pricing.js) still
// reads its own hardcoded constants and has NOT been wired up to read from
// this doc yet — that's a deliberate follow-up, not an oversight, so that
// changing a number here doesn't silently start charging customers
// differently before that wiring exists.
//
// Personal account preferences (password, dark mode) live on the Account
// page instead (pages/Account.jsx) since those apply to every role, not
// just Owner/Admin.
//
// NOTE: Car Parts (the vehicle parts catalog) intentionally does NOT
// live here — it has its own page at pages/Inventory.jsx.

// ─── STORE LOCATION CARD ─────────────────────────────────────────────────────
// Powers the customer app's "Pick up in-store" option. Independently edited and
// saved (its own "Edit Location" button, via /api/settings/store), separate from
// the pricing form below. Includes its own map picker and preview map.

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
  const [markerKey,     setMarkerKey]     = useState(0); // bump to remount the pin after a rejected drop

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
    // Only spots on land inside the Philippines are accepted (utils/phLocation.js).
    const r = await reversePH(lat, lng);
    if (!r.ok) {
      setPickError(REASON_TEXT[r.reason]);
      setMarkerKey((k) => k + 1); // snap a dragged pin back to the last valid spot
      setLoading(false);
      return;
    }
    setPickError("");
    setMarkerPos([lat, lng]);
    setAddress(r.label);
    setHasSelected(true);
    setLoading(false);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    const { results, error } = await searchAddress(searchQuery);
    setSearchResults(results.filter((r) => !isWaterFeature(r))); // no bays / seas / rivers
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
            <DraggableMarker key={markerKey} position={markerPos} onDrag={handleLocationChange} />
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

// ── Inline preview map (shows the saved / picked store location) ──────────
// Re-centres whenever the coordinates change, so picking a new spot in the
// modal updates the preview straight away (before saving).
const Recenter = ({ pos }) => {
  const map = useMap();
  useEffect(() => { map.setView(pos, 16, { animate: true }); }, [pos[0], pos[1], map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

const StorePreviewMap = ({ lat, lng, isDark, unsaved }) => (
  <div className="space-y-1">
    {/* relative z-0 keeps Leaflet's internal z-indexes below page modals/toasts */}
    <div
      className={`relative z-0 rounded-xl overflow-hidden border ${isDark ? "border-[#4FC3F7]/20" : "border-gray-200"}`}
      style={{ height: 240 }}
    >
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        minZoom={5}
        maxBounds={PH_BOUNDS}
        maxBoundsViscosity={1.0}
        scrollWheelZoom={false} // don't hijack page scrolling; use the +/− buttons or drag
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[lat, lng]} />
        <Recenter pos={[lat, lng]} />
      </MapContainer>
    </div>
    {unsaved && (
      <p className="text-[11px] text-amber-600">Preview of the new location — press Save Changes to make it live.</p>
    )}
  </div>
);

// ── Main card (was StoreLocationCard.jsx) ──────────────────────────────────

function StoreLocationSettings() {
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
    <section className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? "bg-[#1A5F7A] border-[#4FC3F7]/20" : "bg-white"}`}>
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b ${isDark ? "bg-[#212121]/40 border-[#4FC3F7]/20" : "bg-gray-50"}`}>
        <h2 className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-2 ${isDark ? "text-[#F5F5F5]" : "text-gray-600"}`}>
          <IconPin className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} /> Store Location &amp; Name
        </h2>

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

      <div className="p-4 space-y-4">
      <p className={`text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
        Powers "Pick up in-store" on the customer booking page. Leave blank to hide that option entirely.
      </p>

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
            <label className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#F5F5F5]/70" : "text-gray-400"}`}>Store Name / Label</label>
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
            <label className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#F5F5F5]/70" : "text-gray-400"}`}>Location</label>

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
                      isDark ? "bg-[#4FC3F7] text-[#212121] hover:bg-[#4FC3F7]/90" : "bg-arl-primary text-white hover:bg-[#16526a]"
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

            {storeLat !== null && storeLng !== null && (
              <StorePreviewMap
                lat={storeLat}
                lng={storeLng}
                isDark={isDark}
                unsaved={storeLat !== saved.storeLat || storeLng !== saved.storeLng}
              />
            )}

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
                    isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-primary hover:bg-[#16526a] text-white"
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
                  isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-primary hover:bg-[#16526a] text-white"
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
    </section>
  );
}

// ─── AREA MAP ────────────────────────────────────────────────────────────────
// Shows a list of PH places (cities / provinces) as shaded outlines, with a search
// bar and — when `editable` — click-to-add. Used only by the base-area keywords
// section below. Outlines come from Nominatim (fetched ~1.1 s apart and cached for
// the session). Clicking the map or picking a result only SUGGESTS a name; nothing
// is added until the user confirms it. Only land spots inside the Philippines
// are accepted (utils/phLocation.js).
//   <AreaMap areas={[...]} editable onAdd={(name) => ...} isDark addLabel="base area" />

const boundaryCache = new Map(); // keyword -> { geometry } | null (null = place has no outline)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = process.env.REACT_APP_API_URL;

const PH_CENTER = [12.8, 122.0];

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

function AreaMap({ areas, editable, onAdd, isDark, addLabel = "base area" }) {
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
                        isDark ? "border-[#4FC3F7]/40 text-[#4FC3F7] hover:bg-[#4FC3F7]/10" : "border-arl-primary/20 bg-arl-primary/5 text-arl-primary hover:bg-arl-primary/10"
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
            <button type="button" onClick={() => setFailed(new Set())} className="text-[11px] underline font-medium text-arl-primary">
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { isDark } = useTheme();

  const [form, setForm] = useState(null);       // working copy the user is editing
  const [saved, setSaved] = useState(null);      // last-saved copy, to detect dirty state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false); // fields are read-only until "Edit" is clicked
  const [notice, setNotice] = useState(null);    // { type: "success" | "error", msg }

  const card = `rounded-2xl border p-6 ${
    isDark
      ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]"
      : "bg-white border-gray-100 shadow-soft"
  }`;

  const inputCls = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
    isDark
      ? "bg-[#212121] border-[#4FC3F7]/20 text-[#F5F5F5] focus:ring-[#4FC3F7]/40"
      : "bg-white border-gray-200 text-arl-dark focus:ring-arl-dark/20"
  }`;

  // ── Load current settings ──────────────────────────────────────────────
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/settings/pricing`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load settings.");
      setForm(json.data);
      setSaved(json.data);
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to load settings." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleNumberChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ── Base area keyword chips ─────────────────────────────────────────
  // Normalizes to lowercase + trims — matches how pricing.js itself
  // lower-cases the destination before checking .includes(keyword), so
  // what's shown here is exactly what actually gets matched.
  //
  // Keywords are added from the map (AreaMap below): search for a place or click
  // the map, then press the "+" button for a name it offers. Names come from the
  // PH location list or from OpenStreetMap — never from free typing — so a
  // misspelled keyword can't be saved.
  const addKeywordValue = (value) => {
    const clean = value.trim().toLowerCase();
    if (!clean) return;
    setForm((prev) => {
      if ((prev.baseAreaKeywords || []).includes(clean)) return prev; // no duplicates
      return { ...prev, baseAreaKeywords: [...(prev.baseAreaKeywords || []), clean] };
    });
  };

  const removeKeyword = (word) => {
    setForm((prev) => ({ ...prev, baseAreaKeywords: (prev.baseAreaKeywords || []).filter((k) => k !== word) }));
  };

  // The outside driver's fee must be higher than the base one.
  const outsideFeeInvalid = !!form && !(Number(form.driversFeeOutsideArea) > Number(form.driversFeeBaseArea));

  const arraysEqual = (a = [], b = []) => a.length === b.length && a.every((v, i) => v === b[i]);

  const isDirty = !!(form && saved) && (
    FLAT_FEE_FIELDS.concat(AREA_FEE_FIELDS, DEPOSIT_FIELDS, PENALTY_FIELDS).some(({ key }) => String(form[key]) !== String(saved[key])) ||
    !arraysEqual(form.baseAreaKeywords, saved.baseAreaKeywords)
  );

  // ── Save ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        serviceFeePercent: Number(form.serviceFeePercent),
        gatewayFeePercent: Number(form.gatewayFeePercent),
        driversFeeBaseArea: Number(form.driversFeeBaseArea),
        driversFeeOutsideArea: Number(form.driversFeeOutsideArea),
        securityDepositAmount: Number(form.securityDepositAmount),
        lateFeeRatePerHour: Number(form.lateFeeRatePerHour),
        lateFeeGraceMinutes: Number(form.lateFeeGraceMinutes),
        penaltyThreshold: Number(form.penaltyThreshold ?? 1000),
        baseAreaKeywords: form.baseAreaKeywords || [],
      };

      for (const [key, val] of Object.entries(payload)) {
        if (typeof val === "number" && (!Number.isFinite(val) || val < 0)) {
          throw new Error(`"${key}" must be a valid number.`);
        }
      }
      for (const key of ["serviceFeePercent", "gatewayFeePercent"]) {
        if (payload[key] > 100) throw new Error(`"${key}" must be a percentage between 0 and 100.`);
      }
      if (!(payload.driversFeeOutsideArea > payload.driversFeeBaseArea)) {
        throw new Error("Driver's Fee — Outside Area must be higher than Driver's Fee — Base Area.");
      }
      if (payload.baseAreaKeywords.length === 0) {
        throw new Error("At least one base-area keyword is required.");
      }

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/settings/pricing`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to save settings.");

      setForm(json.data);
      setSaved(json.data);
      setEditMode(false);
      setNotice({ type: "success", msg: "Pricing settings saved." });
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to save settings." });
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 5000);
    }
  };

  const handleReset = () => {
    if (!saved) return;
    setForm(saved);
    setNotice(null);
    setEditMode(false);
  };

  return (
    <div className={`w-full px-4 space-y-5 ${isDark ? "dark" : ""}`}>
      {/* Header */}
      <div>
        <h1 className={`text-2xl font-bold ${isDark ? "text-[#F5F5F5]" : "text-arl-dark"}`}>System Settings</h1>
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

      <StoreLocationSettings />

      {loading || !form ? (
        <div className={card}>
          <p className={`text-sm text-center ${isDark ? "text-[#F5F5F5]/50" : "text-gray-400"}`}>Loading settings…</p>
        </div>
      ) : (
        <>
          {/* Booking Fees */}
          <Section isDark={isDark} icon={<IconPeso className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} />} title="Booking Fees" desc={"Percentage fees added to every booking, shown to the customer at checkout. Bookings already made keep the amounts they were charged."}>
            <div className="grid sm:grid-cols-3 gap-4">
              {FLAT_FEE_FIELDS.map(({ key, label, hint, unit = "%" }) => (
                <div key={key} className="space-y-1">
                  <label className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#F5F5F5]/70" : "text-gray-400"}`}>{label}</label>
                  <div className="relative">
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>{unit}</span>
                    <input
                      type="number" min="0" max="100" step="0.01"
                      value={form[key]}
                      onChange={(e) => handleNumberChange(key, e.target.value)}
                      disabled={!editMode}
                      className={`${inputCls} pr-7`}
                    />
                  </div>
                  <p className={`text-[11px] ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>{hint}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Area & Chauffeur Fees */}
          <Section isDark={isDark} icon={<IconMap className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} />} title="Area & Chauffeur Fees" desc={"Conditional charges based on the drop-off destination and drive type."}>
            <div className="grid sm:grid-cols-3 gap-4">
              {AREA_FEE_FIELDS.map(({ key, label, hint }) => (
                <div key={key} className="space-y-1">
                  <label className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#F5F5F5]/70" : "text-gray-400"}`}>{label}</label>
                  <div className="relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>₱</span>
                    <input
                      type="number" min="0" step="1"
                      value={form[key]}
                      onChange={(e) => handleNumberChange(key, e.target.value)}
                      disabled={!editMode}
                      className={`${inputCls} pl-6`}
                    />
                  </div>
                  <p className={`text-[11px] ${key === "driversFeeOutsideArea" && outsideFeeInvalid ? "text-[#D32F2F]" : isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>
                    {key === "driversFeeOutsideArea" && outsideFeeInvalid ? "The outside fee must be higher than the base-area fee." : hint}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <label className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#F5F5F5]/70" : "text-gray-400"}`}>Base Area Keywords</label>

              {/* Existing keyword chips */}
              <div className="flex flex-wrap gap-2">
                {(form.baseAreaKeywords || []).map((word) => (
                  <span
                    key={word}
                    className={`inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium ${
                      isDark ? "bg-[#212121] text-[#F5F5F5]/80 border border-[#4FC3F7]/20" : "bg-gray-100 text-gray-700 border border-gray-200"
                    }`}
                  >
                    {word}
                    {editMode && (
                      <button
                        type="button"
                        onClick={() => removeKeyword(word)}
                        aria-label={`Remove ${word}`}
                        className={`rounded-full w-4 h-4 flex items-center justify-center leading-none ${
                          isDark ? "hover:bg-[#4FC3F7]/20 text-[#F5F5F5]/50" : "hover:bg-gray-300 text-gray-500"
                        }`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {(form.baseAreaKeywords || []).length === 0 && (
                  <span className={`text-xs italic ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>No keywords yet — add at least one below.</span>
                )}
              </div>

              {/* Shaded map of every base-area keyword (live preview, incl. unsaved edits) + click-to-add */}
              <AreaMap
                areas={form.baseAreaKeywords || []}
                editable={editMode}
                onAdd={addKeywordValue}
                isDark={isDark}
                addLabel="base area"
              />

              <p className={`text-[11px] ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>
                Search above the map or click it, then press the + button to add a place — names come from the map or the PH
                location list, so they can't be misspelled. A destination is still
                treated as "base area" if it <strong>contains</strong> the saved word as text — so short/common names can
                still overlap (e.g. "manila" also matches "New Manila," a Quezon City district). Picking a place
                only prevents typos, it doesn't remove that overlap.
              </p>
            </div>
          </Section>

          {/* Security Deposit & Late Fees */}
          <Section isDark={isDark} icon={<IconPeso className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} />} title="Security Deposit & Late Fees" desc={"The real, refundable deposit collected at pickup, and the late-return penalty rate. Changing these only affects bookings from this point forward — anything already collected keeps its original amount."}>
            <div className="grid sm:grid-cols-3 gap-4">
              {DEPOSIT_FIELDS.map(({ key, label, hint, unit = "₱" }) => (
                <div key={key} className="space-y-1">
                  <label className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#F5F5F5]/70" : "text-gray-400"}`}>{label}</label>
                  <div className="relative">
                    <span className={`absolute ${unit === "₱" ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>{unit}</span>
                    <input
                      type="number" min="0" step="1"
                      value={form[key]}
                      onChange={(e) => handleNumberChange(key, e.target.value)}
                      disabled={!editMode}
                      className={`${inputCls} ${unit === "₱" ? "pl-6" : "pr-10"}`}
                    />
                  </div>
                  <p className={`text-[11px] ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>{hint}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Penalty online fee */}
          <Section isDark={isDark} icon={<IconPeso className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} />} title="Penalties" desc={"When a customer pays a penalty online, the gateway fee is added only if the penalty is above this amount. It is judged on the penalty's own amount, however it is paid. Changing it applies to penalties that are still unpaid; payments already made and their receipts are not affected."}>
            <div className="grid sm:grid-cols-3 gap-4">
              {PENALTY_FIELDS.map(({ key, label, hint, unit = "₱" }) => (
                <div key={key} className="space-y-1">
                  <label className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#F5F5F5]/70" : "text-gray-400"}`}>{label}</label>
                  <div className="relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>{unit}</span>
                    <input
                      type="number" min="0" step="1"
                      value={form[key] ?? 1000}
                      onChange={(e) => handleNumberChange(key, e.target.value)}
                      disabled={!editMode}
                      className={`${inputCls} pl-6`}
                    />
                  </div>
                  <p className={`text-[11px] ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>{hint}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {editMode ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className={`px-6 py-2.5 rounded-xl shadow text-sm font-medium disabled:opacity-50 transition-all ${
                    isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-primary hover:bg-[#16526a] text-white"
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
                  isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-primary hover:bg-[#16526a] text-white"
                }`}
              >
                Edit Settings
              </button>
            )}
            {form.createdAt && (
              <span className={`text-[11px] ml-auto ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>
                Last updated {form.updatedBy?.name ? `by ${form.updatedBy.name}` : ""}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}