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
      font-size:20px;
      box-shadow:0 2px 10px rgba(0,0,0,${active ? "0.5" : "0.3"});
      border:${active ? "3px solid #134e4a" : "2px solid transparent"};
      transition:all .2s">🚗</div>`,
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
  // locationMap: { [carID]: { lat, lng, updatedAt, lastLocation } }
  const [locationMap,  setLocationMap]  = useState({});
  const [selected,     setSelected]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [applyingId,   setApplyingId]   = useState(null);
  const [lastPoll,     setLastPoll]     = useState(null);
  const [notice,       setNotice]       = useState(null);
  const [addingDevice, setAddingDevice] = useState(false);
  const [activeTab,    setActiveTab]    = useState("cars");

  // Device-tab assign state
  const [assignCarID,    setAssignCarID]    = useState("");
  const [assignDeviceID, setAssignDeviceID] = useState("");
  const [savingAssign,   setSavingAssign]   = useState(false);

  const mapRef     = useRef(null);
  const leafletMap = useRef(null);
  // Only ONE marker at a time (the selected car)
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

  // ── Fetch location for a single device by deviceID → return location obj ──
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

  // ── Load/refresh location for the currently selected car only ─────────────
  const loadSelectedCarLocation = useCallback(async (carId, devices) => {
    if (!carId) return;
    const device = devices.find(d => d.carID === carId && d.assigned);
    if (!device) return;

    const loc = await fetchOneLocation(device.gpsDeviceID);
    setLocationMap(prev => ({
      ...prev,
      [carId]: loc || null,
    }));
    setLastPoll(new Date());
    setLoading(false);

    // Update map marker — remove old, add new if location exists
    if (!leafletMap.current) return;
    if (activeMarker.current) {
      activeMarker.current.remove();
      activeMarker.current = null;
    }
    if (loc?.lat && loc?.lng) {
      const label = ""; // will be set by caller
      activeMarker.current = L.marker([loc.lat, loc.lng], { icon: makeCarIcon(true) })
        .addTo(leafletMap.current);
    }
  }, [fetchOneLocation]);

  // ── Initial load: just mark loading done ─────────────────────────────────
  useEffect(() => {
    setLoading(false);
  }, []);

  // ── When selected car changes: load its location + update map ─────────────
  useEffect(() => {
    if (!selected) {
      // Clear marker when nothing selected
      if (activeMarker.current) {
        activeMarker.current.remove();
        activeMarker.current = null;
      }
      return;
    }

    const device = gpsDevices.find(d => d.carID === selected && d.assigned);
    if (!device) {
      // No device assigned — clear marker, show notice
      if (activeMarker.current) {
        activeMarker.current.remove();
        activeMarker.current = null;
      }
      return;
    }

    // Load location for this car
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

    // Guard: no device assigned
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

      // Refresh only this car's location
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

  // Location of the currently selected car only
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
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Notice */}
        {notice && (
          <div className={`rounded-2xl px-4 py-3 text-xs font-medium border ${
            notice.type === "ok"    ? "bg-green-50 border-green-200 text-green-700" :
            notice.type === "warn"  ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
            notice.type === "info"  ? "bg-blue-50 border-blue-200 text-blue-700" :
            "bg-red-50 border-red-200 text-red-700"
          }`}>
            {notice.msg}
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab("cars")}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === "cars" ? "bg-teal-50 text-teal-700 border-b-2 border-teal-500" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              🚗 Cars ({allCars.length})
            </button>
            <button
              onClick={() => setActiveTab("devices")}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === "devices" ? "bg-teal-50 text-teal-700 border-b-2 border-teal-500" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              📡 Devices ({assignedDevices.length})
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
              <div className="text-3xl mb-2">🚗</div>
              <p className="text-sm text-gray-500 font-semibold">No cars in database</p>
            </div>
          ) : (
            allCars.map(car => {
              const isSelected = selected === car.id;
              const isApplying = applyingId === car.id;
              const device     = gpsDevices.find(d => d.carID === car.id && d.assigned);
              // Only show location if THIS car is selected and has location data
              const loc        = isSelected ? selectedLoc : undefined;

              return (
                <button
                  key={car.id}
                  onClick={() => {
                    setSelected(car.id);
                    setNotice(null);
                    // If no device assigned, show warning immediately
                    if (!device) {
                      setNotice({ type: "warn", msg: "Please apply a device first to show the data." });
                    }
                  }}
                  className={`w-full text-left bg-white rounded-2xl border-2 shadow-soft p-4 transition-all ${
                    isSelected ? "border-teal-500 ring-1 ring-teal-200" : "border-gray-100 hover:border-teal-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                      isSelected && loc ? "bg-teal-50" : "bg-gray-50"
                    }`}>
                      🚗
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{getCarLabel(car)}</p>

                      {/* Device badge */}
                      {device ? (
                        <p className="text-xs text-teal-600 font-medium mt-0.5">📡 {device.gpsName}</p>
                      ) : (
                        <p className="text-xs text-red-400 mt-0.5 italic">⚠ No GPS device assigned</p>
                      )}

                      {/* Location — only show for the selected car */}
                      {isSelected ? (
                        loc ? (
                          <>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                              {parseFloat(loc.lat).toFixed(5)}, {parseFloat(loc.lng).toFixed(5)}
                            </p>
                            {loc.lastLocation && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate" title={loc.lastLocation}>
                                📍 {loc.lastLocation}
                              </p>
                            )}
                            <p className="text-xs text-green-500 mt-0.5 font-medium">
                              🕒 {timeAgo(loc.updatedAt)}
                            </p>
                          </>
                        ) : (
                          // Selected but no location data
                          device ? (
                            <p className="text-xs text-gray-400 mt-0.5 italic">No GPS location stored yet</p>
                          ) : null
                        )
                      ) : (
                        // Not selected — show nothing about location
                        null
                      )}
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
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Applying…
                      </>
                    ) : (
                      <>📡 {isSelected && loc ? "Update GPS Location" : "Apply GPS Location"}</>
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
              {addingDevice ? "Adding…" : "+ Add GPS Device"}
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
                <div className="text-3xl mb-2">📡</div>
                <p className="text-sm text-gray-500 font-semibold">No assigned devices yet</p>
                <p className="text-xs text-gray-400 mt-1">Add a device, then assign a car to it.</p>
              </div>
            ) : (
              assignedDevices.map(device => {
                const assignedCar = allCars.find(c => c.id === device.carID);
                return (
                  <div key={device.id} className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">📡</span>
                      <p className="font-bold text-gray-800 text-sm">{device.gpsName}</p>
                    </div>
                    {assignedCar ? (
                      <p className="text-xs text-teal-600 font-medium">🚗 {getCarLabel(assignedCar)}</p>
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
          <p>🚗 Selected car location</p>
          <p className="text-gray-400">Select a car from the list to view its location.</p>
        </div>

        {/* Empty state — no car selected */}
        {!selected && (
          <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
            <div className="bg-white/95 rounded-2xl border border-gray-100 shadow-lg p-6 text-center max-w-xs">
              <div className="text-4xl mb-2">🗺️</div>
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
              <div className="text-4xl mb-2">📡</div>
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
