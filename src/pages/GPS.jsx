import { useEffect, useState, useCallback, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../fireabase";

// ── Fix Leaflet default marker icons ─────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const Icons = {
  Car: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 11l2-4h10l2 4M3 11h18v8H3v-8zm4 8v2m10-2v2" />
      <circle cx="7.5" cy="15" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="16.5" cy="15" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  Satellite: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="12" rx="3" ry="3" />
      <path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4M3.5 3.5a13 13 0 000 17M20.5 3.5a13 13 0 010 17" />
    </svg>
  ),
  MapPin: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Map: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  ),
  Refresh: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Clock: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  AlertTriangle: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Plus: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Signal: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" />
    </svg>
  ),
  Navigation: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  ),
};

// Car SVG string for the Leaflet divIcon (can't use React components there)
const CAR_SVG = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="20" height="20">
  <path d="M5 11l2-4h10l2 4M3 11h18v8H3v-8zm4 8v2m10-2v2"/>
  <circle cx="7.5" cy="15" r="1.5"/>
  <circle cx="16.5" cy="15" r="1.5"/>
</svg>`);

const POLL_MS = 10_000;
const API     = process.env.REACT_APP_API_URL;

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function makeCarIcon(active = false) {
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${active ? "#0f766e" : "#0d9488"};
      color:white;border-radius:50%;width:36px;height:36px;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 10px rgba(0,0,0,${active ? "0.5" : "0.3"});
      border:${active ? "3px solid #134e4a" : "2px solid transparent"};
      transition:all .2s">
      <img src="data:image/svg+xml,${CAR_SVG}" width="20" height="20" style="display:block" />
    </div>`,
    iconSize:   [36, 36],
    iconAnchor: [18, 18],
    popupAnchor:[0, -22],
  });
}

export default function GPSTracking() {
  const [allCars,      setAllCars]      = useState([]);
  const [brandMap,     setBrandMap]     = useState({});
  const [modelMap,     setModelMap]     = useState({});
  const [gpsDevices,   setGpsDevices]   = useState([]);
  const [locationMap,  setLocationMap]  = useState({});
  const [selected,     setSelected]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [applyingId,   setApplyingId]   = useState(null);
  const [lastPoll,     setLastPoll]     = useState(null);
  const [notice,       setNotice]       = useState(null);
  const [addingDevice, setAddingDevice] = useState(false);
  const [activeTab,    setActiveTab]    = useState("cars");

  const [assignCarID,    setAssignCarID]    = useState("");
  const [assignDeviceID, setAssignDeviceID] = useState("");
  const [savingAssign,   setSavingAssign]   = useState(false);

  const mapRef     = useRef(null);
  const leafletMap = useRef(null);
  const activeMarker = useRef(null);
  const token      = localStorage.getItem("token");

  // ── Init Leaflet map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    leafletMap.current = L.map(mapRef.current, { zoomControl: true })
      .setView([14.5995, 120.9842], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(leafletMap.current);
    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        activeMarker.current = null;
      }
    };
  }, []);

  // ── Fetch all cars + brand/model from Firestore ───────────────────────────
  const fetchAllCars = useCallback(async () => {
    try {
      const [carsSnap, brandSnap, modelSnap] = await Promise.all([
        getDocs(collection(db, "cars")),
        getDocs(collection(db, "brand")),
        getDocs(collection(db, "model")),
      ]);
      setAllCars(carsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setBrandMap(Object.fromEntries(brandSnap.docs.map(d => [d.id, d.data().brandName || ""])));
      setModelMap(Object.fromEntries(modelSnap.docs.map(d => [d.id, d.data().modelName || ""])));
    } catch (e) {
      console.error("[GPS] Firestore fetch error:", e);
    }
  }, []);

  useEffect(() => { fetchAllCars(); }, [fetchAllCars]);

  // ── Fetch GPS devices ─────────────────────────────────────────────────────
  const fetchGpsDevices = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/gps/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setGpsDevices(json.data || []);
    } catch (e) {
      console.error("[GPS] fetchGpsDevices error:", e);
    }
  }, [token]);

  useEffect(() => { fetchGpsDevices(); }, [fetchGpsDevices]);

  // ── Fetch location for a single device ───────────────────────────────────
  const fetchOneLocation = useCallback(async (deviceId) => {
    try {
      const res  = await fetch(`${API}/api/gps/${deviceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.lat && json.lng) return json;
    } catch (e) {
      console.error("[GPS] fetchOneLocation error:", e);
    }
    return null;
  }, [token]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(false);
  }, []);

  // ── When selected car changes: load its location + update map ─────────────
  useEffect(() => {
    if (!selected) {
      if (activeMarker.current) {
        activeMarker.current.remove();
        activeMarker.current = null;
      }
      return;
    }

    const device = gpsDevices.find(d => d.carID === selected && d.assigned);
    if (!device) {
      if (activeMarker.current) {
        activeMarker.current.remove();
        activeMarker.current = null;
      }
      return;
    }

    (async () => {
      const loc = await fetchOneLocation(device.gpsDeviceID);
      setLocationMap(prev => ({ ...prev, [selected]: loc || null }));
      setLastPoll(new Date());

      if (!leafletMap.current) return;
      if (activeMarker.current) {
        activeMarker.current.remove();
        activeMarker.current = null;
      }
      if (loc?.lat && loc?.lng) {
        activeMarker.current = L.marker([loc.lat, loc.lng], { icon: makeCarIcon(true) })
          .addTo(leafletMap.current)
          .bindPopup(`<b>Device: ${device.gpsName}</b><br>${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}<br>
            ${loc.lastLocation ? `<span style="font-size:11px">${loc.lastLocation}</span><br>` : ""}
            <span style="color:#9ca3af;font-size:11px">${timeAgo(loc.updatedAt)}</span>`)
          .openPopup();
        leafletMap.current.setView([loc.lat, loc.lng], 15, { animate: true });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, gpsDevices]);

  // ── Poll selected car location every POLL_MS ──────────────────────────────
  useEffect(() => {
    if (!selected) return;
    const interval = setInterval(async () => {
      const device = gpsDevices.find(d => d.carID === selected && d.assigned);
      if (!device) return;
      const loc = await fetchOneLocation(device.gpsDeviceID);
      setLocationMap(prev => ({ ...prev, [selected]: loc || null }));
      setLastPoll(new Date());
      if (loc?.lat && loc?.lng && leafletMap.current) {
        if (activeMarker.current) {
          activeMarker.current.setLatLng([loc.lat, loc.lng]);
        } else {
          activeMarker.current = L.marker([loc.lat, loc.lng], { icon: makeCarIcon(true) })
            .addTo(leafletMap.current)
            .bindPopup(`<b>Device: ${device.gpsName}</b><br>${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
        }
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [selected, gpsDevices, fetchOneLocation]);

  // ── Apply GPS Location ────────────────────────────────────────────────────
  const applyGps = async (carId) => {
    const device = gpsDevices.find(d => d.carID === carId && d.assigned);
    if (!device) {
      setNotice({ type: "warn", msg: "Please apply a device first to show the data." });
      return;
    }

    setApplyingId(carId);
    setNotice(null);
    try {
      const res  = await fetch(`${API}/api/gps/${device.gpsDeviceID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const live = await res.json();

      if (!live.lat || !live.lng) {
        setNotice({ type: "warn", msg: "GPS device has not reported a location yet." });
        return;
      }

      await fetch(`${API}/api/gps`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ device_id: device.gpsDeviceID, lat: live.lat, lng: live.lng }),
      });

      const updated = await fetchOneLocation(device.gpsDeviceID);
      setLocationMap(prev => ({ ...prev, [carId]: updated || null }));
      setLastPoll(new Date());
      setSelected(carId);
      setNotice({ type: "ok", msg: "GPS location applied." });
    } catch (e) {
      setNotice({ type: "error", msg: "Failed to apply GPS location." });
    } finally {
      setApplyingId(null);
    }
  };

  // ── Add GPS device ────────────────────────────────────────────────────────
  const handleAddDevice = async () => {
    setAddingDevice(true);
    try {
      const res = await fetch(`${API}/api/gps/devices`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.status === "ok") {
        await fetchGpsDevices();
        setNotice({ type: "ok", msg: `${json.data.gpsName} added successfully.` });
      }
    } catch (e) {
      setNotice({ type: "error", msg: "Failed to add GPS device." });
    } finally {
      setAddingDevice(false);
    }
  };

  // ── Assign car to GPS device ──────────────────────────────────────────────
  const handleAssign = async (deviceId) => {
    if (!assignCarID) return;
    setSavingAssign(true);
    try {
      const res = await fetch(`${API}/api/gps/devices/${deviceId}/assign`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ carID: assignCarID }),
      });
      const json = await res.json();
      if (json.status === "ok") {
        await fetchGpsDevices();
        setAssignDeviceID("");
        setAssignCarID("");
        setNotice({ type: "ok", msg: "Car assigned to GPS device." });
      }
    } catch (e) {
      setNotice({ type: "error", msg: "Failed to assign car." });
    } finally {
      setSavingAssign(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getCarLabel = (car) =>
    [brandMap[car.brandID], modelMap[car.modelID]].filter(Boolean).join(" ") || car.id;

  const assignedDevices   = gpsDevices.filter(d => d.assigned === true);
  const unassignedDevices = gpsDevices.filter(d => !d.assigned);
  const assignedCarIDs    = new Set(gpsDevices.filter(d => d.assigned).map(d => d.carID));
  const availableCars     = allCars.filter(c => !assignedCarIDs.has(c.id));

  const selectedLoc = selected ? (locationMap[selected] ?? undefined) : undefined;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-4 min-h-0">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-hide">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold text-arl-dark text-sm">GPS Tracking</h2>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${loading ? "bg-yellow-400 animate-pulse" : "bg-green-500"}`} />
              <span className="text-xs text-gray-400">{loading ? "Syncing…" : "Live"}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            {allCars.length} car{allCars.length !== 1 ? "s" : ""} total
            {lastPoll && ` · Updated ${timeAgo(lastPoll.toISOString())}`}
          </p>
          <button
            onClick={() => {
              if (selected) {
                const device = gpsDevices.find(d => d.carID === selected && d.assigned);
                if (device) {
                  fetchOneLocation(device.gpsDeviceID).then(loc => {
                    setLocationMap(prev => ({ ...prev, [selected]: loc || null }));
                    setLastPoll(new Date());
                  });
                }
              }
            }}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
          >
            <Icons.Refresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Notice */}
        {notice && (
          <div className={`rounded-2xl px-4 py-3 text-xs font-medium border flex items-start gap-2 ${
            notice.type === "ok"    ? "bg-green-50 border-green-200 text-green-700" :
            notice.type === "warn"  ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
            notice.type === "info"  ? "bg-blue-50 border-blue-200 text-blue-700" :
            "bg-red-50 border-red-200 text-red-700"
          }`}>
            <Icons.AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {notice.msg}
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab("cars")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === "cars" ? "bg-teal-50 text-teal-700 border-b-2 border-teal-500" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icons.Car className="w-3.5 h-3.5" />
              Cars ({allCars.length})
            </button>
            <button
              onClick={() => setActiveTab("devices")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === "devices" ? "bg-teal-50 text-teal-700 border-b-2 border-teal-500" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icons.Satellite className="w-3.5 h-3.5" />
              Devices ({assignedDevices.length})
            </button>
          </div>
        </div>

        {/* ── Cars Tab ─────────────────────────────────────────────────── */}
        {activeTab === "cars" && (
          loading && allCars.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-24 animate-pulse" />
            ))
          ) : allCars.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6 text-center">
              <div className="flex justify-center mb-2">
                <Icons.Car className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 font-semibold">No cars in database</p>
            </div>
          ) : (
            allCars.map(car => {
              const isSelected = selected === car.id;
              const isApplying = applyingId === car.id;
              const device     = gpsDevices.find(d => d.carID === car.id && d.assigned);
              const loc        = isSelected ? selectedLoc : undefined;

              return (
                <button
                  key={car.id}
                  onClick={() => {
                    setSelected(car.id);
                    setNotice(null);
                    if (!device) {
                      setNotice({ type: "warn", msg: "Please apply a device first to show the data." });
                    }
                  }}
                  className={`w-full text-left bg-white rounded-2xl border-2 shadow-soft p-4 transition-all ${
                    isSelected ? "border-teal-500 ring-1 ring-teal-200" : "border-gray-100 hover:border-teal-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected && loc ? "bg-teal-50 text-teal-600" : "bg-gray-50 text-gray-400"
                    }`}>
                      <Icons.Car className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{getCarLabel(car)}</p>

                      {/* Device badge */}
                      {device ? (
                        <p className="text-xs text-teal-600 font-medium mt-0.5 flex items-center gap-1">
                          <Icons.Satellite className="w-3 h-3" />
                          {device.gpsName}
                        </p>
                      ) : (
                        <p className="text-xs text-red-400 mt-0.5 italic flex items-center gap-1">
                          <Icons.AlertTriangle className="w-3 h-3" />
                          No GPS device assigned
                        </p>
                      )}

                      {/* Location — only for selected car */}
                      {isSelected ? (
                        loc ? (
                          <>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                              {parseFloat(loc.lat).toFixed(5)}, {parseFloat(loc.lng).toFixed(5)}
                            </p>
                            {loc.lastLocation && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1" title={loc.lastLocation}>
                                <Icons.MapPin className="w-3 h-3 shrink-0" />
                                {loc.lastLocation}
                              </p>
                            )}
                            <p className="text-xs text-green-500 mt-0.5 font-medium flex items-center gap-1">
                              <Icons.Clock className="w-3 h-3" />
                              {timeAgo(loc.updatedAt)}
                            </p>
                          </>
                        ) : (
                          device ? (
                            <p className="text-xs text-gray-400 mt-0.5 italic">No GPS location stored yet</p>
                          ) : null
                        )
                      ) : null}
                    </div>
                  </div>

                  {/* Apply / Update button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); applyGps(car.id); }}
                    disabled={isApplying}
                    className={`mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isApplying
                        ? "bg-gray-100 text-gray-400 cursor-wait"
                        : !device
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-teal-600 text-white hover:bg-teal-700 active:scale-95"
                    }`}
                  >
                    {isApplying ? (
                      <>
                        <Icons.Refresh className="w-3 h-3 animate-spin" />
                        Applying…
                      </>
                    ) : (
                      <>
                        <Icons.Navigation className="w-3 h-3" />
                        {isSelected && loc ? "Update GPS Location" : "Apply GPS Location"}
                      </>
                    )}
                  </button>
                </button>
              );
            })
          )
        )}

        {/* ── Devices Tab ──────────────────────────────────────────────── */}
        {activeTab === "devices" && (
          <div className="flex flex-col gap-3">

            {/* Add Device button */}
            <button
              onClick={handleAddDevice}
              disabled={addingDevice}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-2xl text-xs font-semibold hover:bg-teal-700 active:scale-95 transition-all disabled:opacity-50"
            >
              <Icons.Plus className="w-3.5 h-3.5" />
              {addingDevice ? "Adding…" : "Add GPS Device"}
            </button>

            {/* Assign section */}
            {unassignedDevices.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
                <p className="text-xs font-bold text-gray-700 mb-2">Assign Car to Device</p>

                <select
                  value={assignDeviceID}
                  onChange={(e) => { setAssignDeviceID(e.target.value); setAssignCarID(""); }}
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 mb-2 focus:outline-none focus:border-teal-400"
                >
                  <option value="">— Select GPS Device —</option>
                  {unassignedDevices.map(d => (
                    <option key={d.id} value={d.id}>{d.gpsName}</option>
                  ))}
                </select>

                <select
                  value={assignCarID}
                  onChange={(e) => setAssignCarID(e.target.value)}
                  disabled={!assignDeviceID}
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 mb-2 focus:outline-none focus:border-teal-400 disabled:opacity-40"
                >
                  <option value="">— Select Car —</option>
                  {availableCars.map(car => (
                    <option key={car.id} value={car.id}>{getCarLabel(car)}</option>
                  ))}
                </select>

                <button
                  onClick={() => handleAssign(assignDeviceID)}
                  disabled={!assignDeviceID || !assignCarID || savingAssign}
                  className="w-full py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 disabled:opacity-40 transition-all"
                >
                  {savingAssign ? "Assigning…" : "Assign"}
                </button>
              </div>
            )}

            {/* Assigned devices list */}
            {assignedDevices.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6 text-center">
                <div className="flex justify-center mb-2">
                  <Icons.Satellite className="w-10 h-10 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 font-semibold">No assigned devices yet</p>
                <p className="text-xs text-gray-400 mt-1">Add a device, then assign a car to it.</p>
              </div>
            ) : (
              assignedDevices.map(device => {
                const assignedCar = allCars.find(c => c.id === device.carID);
                return (
                  <div key={device.id} className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icons.Satellite className="w-4 h-4 text-teal-600" />
                      <p className="font-bold text-gray-800 text-sm">{device.gpsName}</p>
                    </div>
                    {assignedCar ? (
                      <p className="text-xs text-teal-600 font-medium flex items-center gap-1">
                        <Icons.Car className="w-3 h-3" />
                        {getCarLabel(assignedCar)}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-300 italic">Car not found</p>
                    )}
                    <p className="text-xs text-gray-300 mt-1 font-mono">{device.gpsDeviceID}</p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Map ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden relative">
        <div ref={mapRef} className="w-full h-full" style={{ minHeight: "500px" }} />

        <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-500 shadow-sm space-y-1">
          <p className="font-semibold text-gray-700 mb-1">Map Legend</p>
          <p className="flex items-center gap-1.5">
            <Icons.Car className="w-3.5 h-3.5 text-teal-600" />
            Selected car location
          </p>
          <p className="text-gray-400">Select a car from the list to view its location.</p>
        </div>

        {/* Empty state — no car selected */}
        {!selected && (
          <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
            <div className="bg-white/95 rounded-2xl border border-gray-100 shadow-lg p-6 text-center max-w-xs">
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
                  <Icons.Map className="w-7 h-7 text-gray-400" />
                </div>
              </div>
              <p className="font-semibold text-gray-700 text-sm">No car selected</p>
              <p className="text-xs text-gray-400 mt-1">
                Select a car from the list to view its GPS location on the map.
              </p>
            </div>
          </div>
        )}

        {/* Selected car has no location */}
        {selected && selectedLoc === null && (
          <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
            <div className="bg-white/95 rounded-2xl border border-gray-100 shadow-lg p-6 text-center max-w-xs">
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center">
                  <Icons.Satellite className="w-7 h-7 text-teal-500" />
                </div>
              </div>
              <p className="font-semibold text-gray-700 text-sm">No GPS location stored</p>
              <p className="text-xs text-gray-400 mt-1">
                Press "Apply GPS Location" on this car to record its position.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}