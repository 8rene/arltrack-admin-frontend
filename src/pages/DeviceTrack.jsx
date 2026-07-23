import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../fireabase";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Fix Leaflet default marker icons ─────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const ONLINE_WINDOW_MS = 5 * 60 * 1000; // a device is "online" if it reported within the last 5 min
const POLL_MS = 15_000;

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function makeDeviceIcon(online, focused = false) {
  const size = focused ? 38 : 30;
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${online ? "#0d9488" : "#9ca3af"};
      color:white;border-radius:50%;width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 10px rgba(0,0,0,${focused ? "0.5" : "0.3"});
      border:${focused ? "3px solid #134e4a" : "2px solid white"};
      transition:all .15s;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2">
        <ellipse cx="12" cy="12" rx="3" ry="3"/>
        <path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4"/>
      </svg>
    </div>`,
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor:[0, -(size / 2 + 3)],
  });
}

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
  Edit: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Trash: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  Copy: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  Check: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  X: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

const API = process.env.REACT_APP_API_URL;

export default function DeviceTrack() {
  const routerLocation = useLocation();
  const navigate       = useNavigate();

  // If we got here from "No GPS device assigned" on the Car Tracking page,
  // this holds the car we're trying to link a device to. Kept in state
  // (rather than read straight from routerLocation.state) so we can clear
  // it locally once the assignment succeeds without another navigation.
  const [assignForCar, setAssignForCar] = useState(
    routerLocation.state?.assignCarId
      ? { id: routerLocation.state.assignCarId, label: routerLocation.state.assignCarLabel }
      : null
  );

  const [allCars,      setAllCars]      = useState([]);
  const [brandMap,     setBrandMap]     = useState({});
  const [modelMap,     setModelMap]     = useState({});
  const [gpsDevices,   setGpsDevices]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [notice,       setNotice]       = useState(null);
  const [addingDevice, setAddingDevice] = useState(false);
  const [busyId,       setBusyId]       = useState(null);

  const [editingId,   setEditingId]   = useState(null);
  const [editName,    setEditName]    = useState("");
  const [assignDraft, setAssignDraft] = useState({}); // { [deviceId]: carId }
  const [copiedId,    setCopiedId]    = useState(null);
  const [locations,   setLocations]   = useState({}); // { [gpsDeviceID]: { lat, lng, updatedAt } }
  const [focusedDeviceId, setFocusedDeviceId] = useState(null);

  const token       = localStorage.getItem("token");
  const mapRef      = useRef(null);
  const leafletMap  = useRef(null);
  const markersRef  = useRef({}); // { [gpsDeviceID]: L.Marker }

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
      console.error("[DeviceTrack] Firestore fetch error:", e);
    }
  }, []);

  const fetchGpsDevices = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/gps/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setGpsDevices(json.data || []);
    } catch (e) {
      console.error("[DeviceTrack] fetchGpsDevices error:", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAllCars(); fetchGpsDevices(); }, [fetchAllCars, fetchGpsDevices]);

  // ── Fetch every device's last known location (for the status map) ─────────
  const fetchLocations = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/gps`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const map = {};
      (json.data || []).forEach(loc => {
        if (loc.deviceId && loc.lat && loc.lng) {
          map[loc.deviceId] = {
            lat: loc.lat,
            lng: loc.lng,
            updatedAt: loc.updatedAt,
            speed: typeof loc.speed === "number" ? loc.speed : 0,
            offline: loc.offline === true,
          };
        }
      });
      setLocations(map);
    } catch (e) {
      console.error("[DeviceTrack] fetchLocations error:", e);
    }
  }, [token]);

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchLocations]);

  // ── Init Leaflet map ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    leafletMap.current = L.map(mapRef.current, { zoomControl: true })
      .setView([14.5995, 120.9842], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(leafletMap.current);
    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        markersRef.current = {};
      }
    };
  }, []);

  // ── Sync markers whenever devices or locations change ─────────────────────
  useEffect(() => {
    if (!leafletMap.current) return;

    const seenIds = new Set();

    gpsDevices.forEach(device => {
      const loc = locations[device.gpsDeviceID];
      if (!loc) return;
      seenIds.add(device.gpsDeviceID);

      const online = loc.updatedAt && (Date.now() - new Date(loc.updatedAt).getTime() < ONLINE_WINDOW_MS);
      const focused = focusedDeviceId === device.gpsDeviceID;
      const assignedCar = allCars.find(c => c.id === device.carID);
      const carLabel = assignedCar
        ? [brandMap[assignedCar.brandID], modelMap[assignedCar.modelID]].filter(Boolean).join(" ") || assignedCar.id
        : null;

      const popupHtml = `<b>${device.gpsName}</b><br>
        ${carLabel ? `Car: ${carLabel}<br>` : `<span style="color:#9ca3af">Not assigned to a car</span><br>`}
        <span style="color:${online ? "#0d9488" : "#9ca3af"}">${online ? "● Online" : "○ Offline"}</span>
        · <span style="color:#9ca3af;font-size:11px">${timeAgo(loc.updatedAt)}</span><br>
        Speed: ${typeof loc.speed === "number" ? loc.speed.toFixed(1) : "0.0"} km/h
        ${loc.offline ? `<br><span style="color:#d97706;font-size:11px">📦 Buffered ping</span>` : ""}`;

      const existing = markersRef.current[device.gpsDeviceID];
      if (existing) {
        existing.setLatLng([loc.lat, loc.lng]);
        existing.setIcon(makeDeviceIcon(online, focused));
        existing.setPopupContent(popupHtml);
      } else {
        markersRef.current[device.gpsDeviceID] = L.marker([loc.lat, loc.lng], { icon: makeDeviceIcon(online, focused) })
          .addTo(leafletMap.current)
          .bindPopup(popupHtml)
          .on("click", () => setFocusedDeviceId(device.gpsDeviceID));
      }
    });

    // Remove markers for devices that no longer have a location (deleted device, etc.)
    Object.keys(markersRef.current).forEach(id => {
      if (!seenIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
  }, [gpsDevices, locations, allCars, brandMap, modelMap, focusedDeviceId]);

  // ── Fly the map to whichever device was just clicked (card or marker) ─────
  useEffect(() => {
    if (!focusedDeviceId || !leafletMap.current) return;
    const loc = locations[focusedDeviceId];
    if (!loc) return;
    leafletMap.current.flyTo([loc.lat, loc.lng], 15, { duration: 0.6 });
    markersRef.current[focusedDeviceId]?.openPopup();
  }, [focusedDeviceId, locations]);

  const onlineCount = gpsDevices.filter(d => {
    const loc = locations[d.gpsDeviceID];
    return loc?.updatedAt && (Date.now() - new Date(loc.updatedAt).getTime() < ONLINE_WINDOW_MS);
  }).length;

  const getCarLabel = (car) =>
    [brandMap[car.brandID], modelMap[car.modelID]].filter(Boolean).join(" ") || car?.id || "—";

  const assignedCarIDs = new Set(gpsDevices.filter(d => d.assigned).map(d => d.carID));
  const availableCars  = allCars.filter(c => !assignedCarIDs.has(c.id));

  // ── Add device ─────────────────────────────────────────────────────────
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
      } else {
        setNotice({ type: "error", msg: json.message || "Failed to add GPS device." });
      }
    } catch (e) {
      setNotice({ type: "error", msg: "Failed to add GPS device." });
    } finally {
      setAddingDevice(false);
    }
  };

  // ── Rename device ──────────────────────────────────────────────────────
  const startEdit = (device) => { setEditingId(device.id); setEditName(device.gpsName); };
  const cancelEdit = () => { setEditingId(null); setEditName(""); };

  const saveEdit = async (deviceId) => {
    if (!editName.trim()) return;
    setBusyId(deviceId);
    try {
      const res = await fetch(`${API}/api/gps/devices/${deviceId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ gpsName: editName.trim() }),
      });
      const json = await res.json();
      if (json.status === "ok") {
        await fetchGpsDevices();
        setNotice({ type: "ok", msg: "Device renamed." });
        cancelEdit();
      } else {
        setNotice({ type: "error", msg: json.message || "Failed to rename device." });
      }
    } catch (e) {
      setNotice({ type: "error", msg: "Failed to rename device." });
    } finally {
      setBusyId(null);
    }
  };

  // ── Assign / Unassign ──────────────────────────────────────────────────
  const handleAssign = async (deviceId) => {
    const carID = assignDraft[deviceId];
    if (!carID) return;
    setBusyId(deviceId);
    try {
      const res = await fetch(`${API}/api/gps/devices/${deviceId}/assign`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ carID }),
      });
      const json = await res.json();
      if (json.status === "ok") {
        await fetchGpsDevices();
        setAssignDraft(prev => ({ ...prev, [deviceId]: "" }));
        setNotice({ type: "ok", msg: "Car assigned to GPS device." });
      } else {
        setNotice({ type: "error", msg: json.message || "Failed to assign car." });
      }
    } catch (e) {
      setNotice({ type: "error", msg: "Failed to assign car." });
    } finally {
      setBusyId(null);
    }
  };

  // Used when a device card is clicked while we're in "assign this car" mode
  // (i.e. the user arrived here via "No GPS device assigned" on Car Tracking).
  // Skips the manual select-a-car dropdown and assigns directly.
  const handleQuickAssign = async (deviceId) => {
    if (!assignForCar) return;
    setBusyId(deviceId);
    try {
      const res = await fetch(`${API}/api/gps/devices/${deviceId}/assign`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ carID: assignForCar.id }),
      });
      const json = await res.json();
      if (json.status === "ok") {
        await fetchGpsDevices();
        setNotice({ type: "ok", msg: `${assignForCar.label} linked to this GPS device.` });
        setAssignForCar(null);
        // Clear the router state so refreshing this page doesn't re-trigger assign mode.
        navigate(routerLocation.pathname, { replace: true, state: {} });
      } else {
        setNotice({ type: "error", msg: json.message || "Failed to assign car." });
      }
    } catch (e) {
      setNotice({ type: "error", msg: "Failed to assign car." });
    } finally {
      setBusyId(null);
    }
  };

  const handleUnassign = async (deviceId) => {
    setBusyId(deviceId);
    try {
      const res = await fetch(`${API}/api/gps/devices/${deviceId}/unassign`, {
        method:  "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.status === "ok") {
        await fetchGpsDevices();
        setNotice({ type: "ok", msg: "Car unassigned from device." });
      } else {
        setNotice({ type: "error", msg: json.message || "Failed to unassign car." });
      }
    } catch (e) {
      setNotice({ type: "error", msg: "Failed to unassign car." });
    } finally {
      setBusyId(null);
    }
  };

  // ── Delete device ──────────────────────────────────────────────────────
  const handleDelete = async (deviceId, deviceName) => {
    if (!window.confirm(`Permanently delete "${deviceName}"? This cannot be undone.`)) return;
    setBusyId(deviceId);
    try {
      const res = await fetch(`${API}/api/gps/devices/${deviceId}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.status === "ok") {
        await fetchGpsDevices();
        setNotice({ type: "ok", msg: `${deviceName} deleted.` });
      } else {
        setNotice({ type: "error", msg: json.message || "Failed to delete device." });
      }
    } catch (e) {
      setNotice({ type: "error", msg: "Failed to delete device." });
    } finally {
      setBusyId(null);
    }
  };

  // ── Copy ID ────────────────────────────────────────────────────────────
  const handleCopyId = async (deviceId) => {
    try {
      await navigator.clipboard.writeText(deviceId);
      setCopiedId(deviceId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      setNotice({ type: "error", msg: "Couldn't copy — copy it manually from the field." });
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-arl-dark text-sm">GPS Setup</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Manage GPS devices — add new hardware, assign/unassign cars, and copy each device's ID for IoT configuration.
          </p>
          <p className="text-xs mt-1 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-teal-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> {onlineCount} online
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">{gpsDevices.length} device{gpsDevices.length !== 1 ? "s" : ""} total</span>
          </p>
        </div>
        <button
          onClick={handleAddDevice}
          disabled={addingDevice}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 active:scale-95 transition-all disabled:opacity-50 shrink-0"
        >
          <Icons.Plus className="w-3.5 h-3.5" />
          {addingDevice ? "Adding…" : "Add GPS Device"}
        </button>
      </div>

      {/* Assign-mode banner — shown when we arrived here to link a specific car */}
      {assignForCar && (
        <div className="rounded-2xl px-4 py-3 text-xs font-medium border bg-teal-50 border-teal-200 text-teal-700 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Icons.Satellite className="w-3.5 h-3.5 shrink-0" />
            Pick an available GPS device below to link it to <strong>{assignForCar.label}</strong>.
          </span>
          <button
            onClick={() => {
              setAssignForCar(null);
              navigate(routerLocation.pathname, { replace: true, state: {} });
            }}
            className="text-teal-600 hover:text-teal-800 font-semibold shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Notice */}
      {notice && (
        <div className={`rounded-2xl px-4 py-3 text-xs font-medium border flex items-start gap-2 ${
          notice.type === "ok" ? "bg-green-50 border-green-200 text-green-700" :
          "bg-red-50 border-red-200 text-red-700"
        }`}>
          <Icons.AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {notice.msg}
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-4">
      {/* Device list */}
      <div className="w-96 shrink-0 overflow-y-auto scrollbar-hide flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-24 animate-pulse" />
          ))
        ) : gpsDevices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6 text-center">
            <div className="flex justify-center mb-2">
              <Icons.Satellite className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 font-semibold">No GPS devices yet</p>
            <p className="text-xs text-gray-400 mt-1">Add one to get started.</p>
          </div>
        ) : (
          gpsDevices.map(device => {
            const isEditing    = editingId === device.id;
            const isBusy       = busyId === device.id;
            const assignedCar  = allCars.find(c => c.id === device.carID);
            const isCopied     = copiedId === device.gpsDeviceID;
            const loc          = locations[device.gpsDeviceID];
            const online       = !!(loc?.updatedAt && (Date.now() - new Date(loc.updatedAt).getTime() < ONLINE_WINDOW_MS));

            // While assigning a specific car, unassigned devices become the
            // pickable targets — clicking one assigns immediately instead of
            // just focusing the map.
            const isAssignTarget = !!assignForCar && !device.assigned;

            return (
              <div
                key={device.id}
                onClick={() => {
                  if (isAssignTarget) {
                    if (!isBusy) handleQuickAssign(device.id);
                  } else if (loc) {
                    setFocusedDeviceId(device.gpsDeviceID);
                  } else {
                    setNotice({ type: "warn", msg: `${device.gpsName} has no GPS ping to focus on yet.` });
                  }
                }}
                className={`bg-white rounded-2xl border-2 shadow-soft p-4 transition-all cursor-pointer ${
                  isAssignTarget
                    ? "border-amber-400 ring-2 ring-amber-200 animate-pulse"
                    : assignForCar
                    ? "border-gray-100 opacity-50"
                    : focusedDeviceId === device.gpsDeviceID
                    ? "border-teal-500 ring-1 ring-teal-200"
                    : "border-gray-100 hover:border-teal-300"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Name / rename */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          className="flex-1 text-sm font-bold border border-teal-300 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-500"
                        />
                        <button onClick={() => saveEdit(device.id)} disabled={isBusy} className="text-green-600 hover:text-green-700">
                          <Icons.Check className="w-4 h-4" />
                        </button>
                        <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600">
                          <Icons.X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Icons.Satellite className="w-4 h-4 text-teal-600 shrink-0" />
                        <p className="font-bold text-gray-800 text-sm truncate">{device.gpsName}</p>
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-teal-500" : "bg-gray-300"}`}
                          title={online ? "Online — reported within 5 min" : "Offline / stale"}
                        />
                        <button onClick={(e) => { e.stopPropagation(); startEdit(device); }} className="text-gray-300 hover:text-teal-600 shrink-0">
                          <Icons.Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Device ID + copy */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <code className="text-xs text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded truncate">
                        {device.gpsDeviceID}
                      </code>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyId(device.gpsDeviceID); }}
                        title="Copy device ID for IoT setup"
                        className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors ${
                          isCopied ? "text-green-600" : "text-gray-400 hover:text-teal-600"
                        }`}
                      >
                        {isCopied ? <Icons.Check className="w-3 h-3" /> : <Icons.Copy className="w-3 h-3" />}
                        {isCopied ? "Copied" : "Copy ID"}
                      </button>
                    </div>

                    {/* Assignment status */}
                    {device.assigned && assignedCar ? (
                      <p className="text-xs text-teal-600 font-medium mt-1.5 flex items-center gap-1">
                        <Icons.Car className="w-3 h-3" />
                        {getCarLabel(assignedCar)}
                      </p>
                    ) : device.assigned ? (
                      <p className="text-xs text-gray-300 italic mt-1.5">Assigned car not found</p>
                    ) : isAssignTarget ? (
                      <p className="text-xs text-amber-600 font-semibold mt-1.5 flex items-center gap-1">
                        <Icons.Car className="w-3 h-3" />
                        {isBusy ? "Linking…" : `Click to link ${assignForCar.label}`}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic mt-1.5">Not assigned to a car</p>
                    )}

                    {/* Last GPS ping — the device reports this anyway, so surface it here
                        instead of only on the map marker's popup. */}
                    {loc ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className={`font-medium flex items-center gap-1 ${online ? "text-teal-600" : "text-gray-400"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-teal-500" : "bg-gray-300"}`} />
                          {online ? "Online" : "Offline"} · {timeAgo(loc.updatedAt)}
                        </span>
                        <span className="text-gray-400 font-mono">
                          {loc.speed.toFixed(1)} km/h
                        </span>
                        {loc.offline && (
                          <span className="text-amber-600 font-medium bg-amber-50 rounded px-1.5 py-0.5">
                            📦 Buffered ping
                          </span>
                        )}
                        <span className="w-full text-gray-300 font-mono text-[11px]">
                          {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-300 italic mt-1.5">No GPS ping received yet</p>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(device.id, device.gpsName); }}
                    disabled={isBusy}
                    title="Delete device"
                    className="text-gray-300 hover:text-red-500 shrink-0 disabled:opacity-40"
                  >
                    <Icons.Trash className="w-4 h-4" />
                  </button>
                </div>

                {/* Assign / Unassign controls */}
                <div className="mt-3 pt-3 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                  {device.assigned ? (
                    <button
                      onClick={() => handleUnassign(device.id)}
                      disabled={isBusy}
                      className="text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-40"
                    >
                      {isBusy ? "Unassigning…" : "Unassign car"}
                    </button>
                  ) : isAssignTarget ? (
                    <p className="text-xs text-amber-600 italic">
                      ↑ Click this card to link it to {assignForCar.label}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={assignDraft[device.id] || ""}
                        onChange={(e) => setAssignDraft(prev => ({ ...prev, [device.id]: e.target.value }))}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-400"
                      >
                        <option value="">— Select Car —</option>
                        {availableCars.map(car => (
                          <option key={car.id} value={car.id}>{getCarLabel(car)}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssign(device.id)}
                        disabled={!assignDraft[device.id] || isBusy}
                        className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 disabled:opacity-40 transition-all"
                      >
                        {isBusy ? "…" : "Assign"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Live status map ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden relative">
        <div ref={mapRef} className="w-full h-full" style={{ minHeight: "500px" }} />

        <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-500 shadow-sm space-y-1">
          <p className="font-semibold text-gray-700 mb-1">Device Status</p>
          <p className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
            Online (reported within 5 min)
          </p>
          <p className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
            Offline / stale
          </p>
        </div>

        {Object.keys(locations).length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
            <div className="bg-white/95 rounded-2xl border border-gray-100 shadow-lg p-6 text-center max-w-xs">
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
                  <Icons.Satellite className="w-7 h-7 text-gray-400" />
                </div>
              </div>
              <p className="font-semibold text-gray-700 text-sm">No device locations yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Devices will appear here once they start reporting GPS pings.
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}