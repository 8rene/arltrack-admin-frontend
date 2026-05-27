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
  const [vehicles,     setVehicles]     = useState([]);
  const [allCars,      setAllCars]      = useState([]);
  const [brandMap,     setBrandMap]     = useState({});
  const [modelMap,     setModelMap]     = useState({});
  const [gpsDevices,   setGpsDevices]   = useState([]);   // gpsDevice collection
  const [selected,     setSelected]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [applyingId,   setApplyingId]   = useState(null);
  const [lastPoll,     setLastPoll]     = useState(null);
  const [notice,       setNotice]       = useState(null);
  const [addingDevice, setAddingDevice] = useState(false);
  const [activeTab,    setActiveTab]    = useState("cars"); // "cars" | "devices"

  // Device-tab assign state
  const [assignCarID,    setAssignCarID]    = useState("");  // selected car in dropdown
  const [assignDeviceID, setAssignDeviceID] = useState(""); // which device is being assigned
  const [savingAssign,   setSavingAssign]   = useState(false);

  const mapRef     = useRef(null);
  const leafletMap = useRef(null);
  const markers    = useRef({});
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
        markers.current = {};
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

  // ── Fetch GPS devices from gpsDevice collection ───────────────────────────
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

  // ── Fetch stored GPS locations + refresh markers ──────────────────────────
  const fetchLocations = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/gps`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const data = (json.data || []).filter(v => v.lat && v.lng);
      setVehicles(data);
      setLastPoll(new Date());

      if (!leafletMap.current) return;

      data.forEach(v => {
        const isActive = v.deviceId === selected;
        const icon     = makeCarIcon(isActive);
        const carInfo  = allCars.find(c => c.id === v.deviceId);
        const carLabel = carInfo
          ? [brandMap[carInfo.brandID], modelMap[carInfo.modelID]].filter(Boolean).join(" ")
          : v.deviceId;
        const popup = `<b>${carLabel}</b><br>${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}<br>
          <span style="color:#9ca3af;font-size:11px">${timeAgo(v.updatedAt)}</span>`;

        if (markers.current[v.deviceId]) {
          markers.current[v.deviceId].setLatLng([v.lat, v.lng]).setIcon(icon).getPopup()?.setContent(popup);
        } else {
          markers.current[v.deviceId] = L.marker([v.lat, v.lng], { icon })
            .addTo(leafletMap.current).bindPopup(popup);
        }
      });

      const activeIds = new Set(data.map(v => v.deviceId));
      Object.keys(markers.current).forEach(id => {
        if (!activeIds.has(id)) { markers.current[id].remove(); delete markers.current[id]; }
      });
    } catch (e) {
      console.error("[GPS] fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [token, selected, allCars, brandMap, modelMap]);

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchLocations]);

  // ── Select car → pan map ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selected || !leafletMap.current) return;
    Object.entries(markers.current).forEach(([id, m]) => m.setIcon(makeCarIcon(id === selected)));
    const v = vehicles.find(v => v.deviceId === selected);
    if (v) {
      leafletMap.current.setView([v.lat, v.lng], 15, { animate: true });
      markers.current[v.deviceId]?.openPopup();
      setNotice(null);
    } else {
      setNotice({ type: "info", msg: 'No GPS location stored for this car yet. Press "Apply GPS Location" to record one.' });
    }
  }, [selected, vehicles]);

  // ── Apply GPS location ────────────────────────────────────────────────────
  const applyGps = async (deviceId) => {
    setApplyingId(deviceId);
    setNotice(null);
    try {
      const res  = await fetch(`${API}/api/gps/${deviceId}`, {
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
        body: JSON.stringify({ device_id: deviceId, lat: live.lat, lng: live.lng }),
      });
      await fetchLocations();
      setSelected(deviceId);
      setNotice({ type: "ok", msg: `GPS location applied.` });
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
  const locationMap = Object.fromEntries(vehicles.map(v => [v.deviceId, v]));

  const getCarLabel = (car) =>
    [brandMap[car.brandID], modelMap[car.modelID]].filter(Boolean).join(" ") || car.id;

  // Devices shown in list = only assigned ones
  const assignedDevices   = gpsDevices.filter(d => d.assigned === true);
  // Unassigned devices = available to show in "Add Assignment" section
  const unassignedDevices = gpsDevices.filter(d => !d.assigned);

  // Cars not yet assigned to any device
  const assignedCarIDs = new Set(gpsDevices.filter(d => d.assigned).map(d => d.carID));
  const availableCars  = allCars.filter(c => !assignedCarIDs.has(c.id));

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
            {vehicles.length} / {allCars.length} car{allCars.length !== 1 ? "s" : ""} with stored GPS
            {lastPoll && ` · ${timeAgo(lastPoll.toISOString())}`}
          </p>
          <button
            onClick={fetchLocations}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Map
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
              const loc        = locationMap[car.id];
              const isSelected = selected === car.id;
              const isApplying = applyingId === car.id;
              const device     = gpsDevices.find(d => d.carID === car.id && d.assigned);

              return (
                <button
                  key={car.id}
                  onClick={() => { setSelected(car.id); setNotice(null); }}
                  className={`w-full text-left bg-white rounded-2xl border-2 shadow-soft p-4 transition-all ${
                    isSelected ? "border-teal-500 ring-1 ring-teal-200" : "border-gray-100 hover:border-teal-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${loc ? "bg-teal-50" : "bg-gray-50"}`}>
                      🚗
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{getCarLabel(car)}</p>
                      {device ? (
                        <p className="text-xs text-teal-600 font-medium mt-0.5">📡 {device.gpsName}</p>
                      ) : (
                        <p className="text-xs text-gray-300 mt-0.5 italic">No GPS device assigned</p>
                      )}
                      {loc ? (
                        <>
                          <p className="text-xs text-gray-400 font-mono">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</p>
                          <p className="text-xs text-green-500 mt-0.5 font-medium">📍 {timeAgo(loc.updatedAt)}</p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-300 mt-0.5 italic">No GPS location yet</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); applyGps(car.id); }}
                    disabled={isApplying}
                    className={`mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isApplying ? "bg-gray-100 text-gray-400 cursor-wait" : "bg-teal-600 text-white hover:bg-teal-700 active:scale-95"
                    }`}
                  >
                    {isApplying ? (
                      <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>Applying…</>
                    ) : (
                      <>📡 {loc ? "Update GPS Location" : "Apply GPS Location"}</>
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

            {/* Assign section — shown only when there are unassigned devices */}
            {unassignedDevices.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
                <p className="text-xs font-bold text-gray-700 mb-2">Assign Car to Device</p>

                {/* Device selector */}
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

                {/* Car selector */}
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
                <p className="text-xs text-gray-400 mt-1">
                  Add a device, then assign a car to it.
                </p>
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
          <p>🚗 Stored location</p>
          <p className="text-gray-400">Tap a car in the list to focus it.</p>
        </div>

        {!loading && vehicles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
            <div className="bg-white/95 rounded-2xl border border-gray-100 shadow-lg p-6 text-center max-w-xs">
              <div className="text-4xl mb-2">📡</div>
              <p className="font-semibold text-gray-700 text-sm">No GPS locations stored</p>
              <p className="text-xs text-gray-400 mt-1">
                Press "Apply GPS Location" on any car in the list to record its position.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
