import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../fireabase";
import TracebackPanel from "./TracebackPanel";
import HistoryPanel from "./HistoryPanel";
import ReviewPanel from "./ReviewPanel";
import BookingInfoPanel from "./BookingInfoPanel";
import LogsPanel from "./LogsPanel";
import GeofenceBanner from "../components/GeofenceBanner";
import PlaceLabel from "../components/PlaceLabel";
import { isGeofenceBreachedNow, isCodingRestrictedNow } from "../utils/geofenceAlerts";

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
  Navigation: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  ),
  Calendar: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Play: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  Flag: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  Siren: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 00-7 7v6h14V9a7 7 0 00-7-7z" />
      <line x1="5" y1="15" x2="19" y2="15" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="3" y1="22" x2="21" y2="22" />
    </svg>
  ),
  X: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  ChevronUp: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  ChevronDown: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Info: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  List: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
};

// Car SVG string for the Leaflet divIcon (can't use React components there).
// Kept in two forms: raw markup for inline fallback content, and a
// URI-encoded data: src for when there's no car photo to show at all.
const CAR_SVG_RAW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="20" height="20">
  <path d="M5 11l2-4h10l2 4M3 11h18v8H3v-8zm4 8v2m10-2v2"/>
  <circle cx="7.5" cy="15" r="1.5"/>
  <circle cx="16.5" cy="15" r="1.5"/>
</svg>`;

const POLL_MS = 10_000;
const API     = process.env.REACT_APP_API_URL;

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// Booking dates come back from the API as Firestore Timestamps serialized
// over JSON — same shape handled the same way as Bookings.jsx.
function fmtDateTime(val) {
  if (!val) return "—";
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

function sortByStartAsc(a, b) {
  const av = a?.startDateTime?._seconds ?? (a?.startDateTime ? new Date(a.startDateTime).getTime() / 1000 : Infinity);
  const bv = b?.startDateTime?._seconds ?? (b?.startDateTime ? new Date(b.startDateTime).getTime() / 1000 : Infinity);
  return av - bv;
}

// `imageURL` comes from the same carImages collection VehicleDocs.jsx reads
// (doc per car: { carID, imageURL }) — shows the vehicle's real photo on the
// map marker instead of the generic icon, falling back to it on load error
// or when a car simply has no photo uploaded yet.
function makeCarIcon(active = false, imageURL = null) {
  const content = imageURL
    ? `<img src="${imageURL}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
       <div style="display:none;align-items:center;justify-content:center;width:100%;height:100%;">${CAR_SVG_RAW}</div>`
    : CAR_SVG_RAW;

  return L.divIcon({
    className: "",
    html: `<div style="
      background:${active ? "#0f766e" : "#0d9488"};
      color:white;border-radius:50%;width:36px;height:36px;
      display:flex;align-items:center;justify-content:center;
      overflow:hidden;
      box-shadow:0 2px 10px rgba(0,0,0,${active ? "0.5" : "0.3"});
      border:${active ? "3px solid #134e4a" : "2px solid transparent"};
      transition:all .2s">
      ${content}
    </div>`,
    iconSize:   [36, 36],
    iconAnchor: [18, 18],
    popupAnchor:[0, -22],
  });
}

export default function CarTracking() {
  const [allCars,      setAllCars]      = useState([]);
  const [brandMap,     setBrandMap]     = useState({});
  const [modelMap,     setModelMap]     = useState({});
  const [gpsDevices,   setGpsDevices]   = useState([]);
  const [locations,    setLocations]    = useState({}); // { [gpsDeviceID]: { lat, lng, updatedAt, lastLocation } }
  const [bookings,     setBookings]     = useState([]); // upcoming + ongoing, raw from API
  const [selected,     setSelected]     = useState(null); // carId or null
  const selectedRef = useRef(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const [loading,      setLoading]      = useState(true);
  const [lastPoll,     setLastPoll]     = useState(null);
  const [notice,       setNotice]       = useState(null);
  const [actionBusyId, setActionBusyId] = useState(null); // booking doc id currently being acted on
  // Deep-link from Bookings' "Trip History" button — { tab: "history", carID, bookingID }.
  // Only consumed once; switching tabs away and back won't re-trigger it since
  // React Router keeps the same location.state for the life of this page visit,
  // but HistoryPanel's own one-shot ref guards against re-opening on remount.
  const location = useLocation();
  const historyDeepLink = location.state?.tab === "history" ? location.state : null;

  const [tab,          setTab]          = useState(historyDeepLink ? "history" : "live"); // "live" | "traceback" | "history"
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [refreshTick,  setRefreshTick]  = useState(0);

  const mapRef      = useRef(null);
  const [sessionInfo,    setSessionInfo]    = useState(null); // active session for the focused car: zones + alerts
  // Live preview of whatever's currently being dragged/typed in BookingInfoPanel,
  // before Save — null means "nothing being edited, draw the saved zones".
  // Lets the map circle resize in real time as the radius slider moves,
  // instead of only updating once the edit is actually saved.
  const [draftZones,     setDraftZones]     = useState(null);
  useEffect(() => { setDraftZones(null); }, [selected]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [showBookingInfo, setShowBookingInfo] = useState(false);
  const [showLogs,       setShowLogs]       = useState(false);
  useEffect(() => { if (!showBookingInfo) setDraftZones(null); }, [showBookingInfo]);
  const zoneLayersRef = useRef([]); // leaflet Circle/Marker layers for the current geofence zones
  const leafletMap  = useRef(null);
  const markersRef  = useRef({}); // { [carId]: L.Marker }
  const token       = localStorage.getItem("token");

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
        markersRef.current = {};
      }
    };
  }, []);

  // ── Fetch all cars + brand/model + photos from Firestore ──────────────────
  const fetchAllCars = useCallback(async () => {
    try {
      const [carsSnap, brandSnap, modelSnap, imgSnap] = await Promise.all([
        getDocs(collection(db, "cars")),
        getDocs(collection(db, "brand")),
        getDocs(collection(db, "model")),
        getDocs(collection(db, "carImages")),
      ]);
      const imgMap = {};
      imgSnap.docs.forEach(d => {
        if (d.data().carID) imgMap[d.data().carID] = d.data().imageURL;
      });
      setAllCars(carsSnap.docs.map(d => ({ id: d.id, ...d.data(), imageURL: imgMap[d.id] || null })));
      setBrandMap(Object.fromEntries(brandSnap.docs.map(d => [d.id, d.data().brandName || ""])));
      setModelMap(Object.fromEntries(modelSnap.docs.map(d => [d.id, d.data().modelName || ""])));
    } catch (e) {
      console.error("[CarTracking] Firestore fetch error:", e);
    }
  }, []);

  useEffect(() => { fetchAllCars(); }, [fetchAllCars]);

  // ── Fetch GPS devices (read-only here — assignment lives in GPS Setup) ────
  const fetchGpsDevices = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/gps/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setGpsDevices(json.data || []);
    } catch (e) {
      console.error("[CarTracking] fetchGpsDevices error:", e);
    }
  }, [token]);

  useEffect(() => { fetchGpsDevices(); }, [fetchGpsDevices]);

  // ── Fetch every assigned device's live location in one shot (unified map) ─
  const fetchLocations = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/gps`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const map = {};
      (json.data || []).forEach(loc => {
        if (loc.deviceId && loc.lat && loc.lng) map[loc.deviceId] = loc;
      });
      setLocations(map);
      setLastPoll(new Date());
    } catch (e) {
      console.error("[CarTracking] fetchLocations error:", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchLocations]);

  // ── Fetch upcoming + ongoing bookings (for the badges / pickup-return-stolen panel) ─
  const fetchBookings = useCallback(async () => {
    try {
      const [upRes, onRes] = await Promise.all([
        fetch(`${API}/api/bookings?status=upcoming`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/bookings?status=ongoing`,  { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [upJson, onJson] = await Promise.all([upRes.json(), onRes.json()]);
      setBookings([...(upJson.data || []), ...(onJson.data || [])]);
    } catch (e) {
      console.error("[CarTracking] fetchBookings error:", e);
    }
  }, [token]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  useEffect(() => { setShowAllUpcoming(false); }, [selected]);

  // ── Realtime listener: only currently-active sessions ──────────────────────
  // Cheapest way to know "which cars are geofence-breached / coding-restricted
  // right now" for the whole fleet at once: instead of polling every car's
  // one-car session endpoint on a timer (N reads every poll, forever, even for
  // idle cars), listen directly to Firestore for sessions where
  // status == "active" — only real trips cost a read, and Firestore only
  // bills again when something actually changes, not on a fixed clock.
  const [liveSessionsByCar, setLiveSessionsByCar] = useState({}); // { [carID]: { geofenceAlerts, codingAlerts } }
  useEffect(() => {
    const q = query(collection(db, "bookingSessions"), where("status", "==", "active"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (!data.carID) return;
          map[data.carID] = {
            geofenceAlerts: data.geofenceAlerts || [],
            codingAlerts:   data.codingAlerts   || [],
          };
        });
        setLiveSessionsByCar(map);
      },
      (e) => console.error("[CarTracking] bookingSessions listener error:", e)
    );
    return () => unsub();
  }, []);

  // ── Active session for the focused car — geofence zones + alert logs ──────
  const fetchCarSession = useCallback(async (carId) => {
    setSessionLoading(true);
    try {
      const res  = await fetch(`${API}/api/gps/${carId}/session`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setSessionInfo(res.ok ? (json.data || null) : null);
    } catch (e) {
      console.error("[CarTracking] fetchCarSession error:", e);
      setSessionInfo(null);
    } finally {
      setSessionLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setShowBookingInfo(false);
    setShowLogs(false);
    if (tab === "live" && selected) fetchCarSession(selected);
    else setSessionInfo(null);
  }, [selected, tab, fetchCarSession]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getCarLabel = (car) =>
    [brandMap[car.brandID], modelMap[car.modelID]].filter(Boolean).join(" ") || car.id;

  const deviceForCar = (carId) => gpsDevices.find(d => d.carID === carId && d.assigned);
  const locationForCar = (carId) => {
    const device = deviceForCar(carId);
    return device ? locations[device.gpsDeviceID] : undefined;
  };

  // Group bookings by carID once per fetch — nearest upcoming first, ongoing separate.
  const bookingsByCar = {};
  bookings.forEach(b => {
    if (!b.carID) return;
    if (!bookingsByCar[b.carID]) bookingsByCar[b.carID] = { upcoming: [], ongoing: null };
    if (b.status?.toLowerCase() === "ongoing") bookingsByCar[b.carID].ongoing = b;
    else bookingsByCar[b.carID].upcoming.push(b);
  });
  Object.values(bookingsByCar).forEach(g => g.upcoming.sort(sortByStartAsc));

  const nearestUpcoming = (carId) => bookingsByCar[carId]?.upcoming?.[0] || null;
  const ongoingBooking  = (carId) => bookingsByCar[carId]?.ongoing || null;

  // ── "Due" badges — purely derived from bookings already in memory, no new
  // reads. A booking is late if its clock time has passed but its own
  // status hasn't moved on yet (still "upcoming" past startDateTime, or
  // still "ongoing" past endDateTime). ──────────────────────────────────────
  const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
  const isDueNotPickedUp = (carId) => {
    const b = nearestUpcoming(carId);
    const start = b && toDate(b.startDateTime);
    return !!(b && start && start.getTime() <= Date.now());
  };
  const isDueNotReturned = (carId) => {
    const b = ongoingBooking(carId);
    const end = b && toDate(b.endDateTime);
    return !!(b && end && end.getTime() <= Date.now());
  };

  // ── Geofence / coding-restriction badges — from the realtime listener,
  // cheap (only active-trip cars are ever in this map). ─────────────────────
  const isBreached          = (carId) => isGeofenceBreachedNow(liveSessionsByCar[carId]?.geofenceAlerts);
  const isCodingRestricted  = (carId) => isCodingRestrictedNow(liveSessionsByCar[carId]?.codingAlerts);

  // Cars currently breaching a zone right now — feeds the top-center pulsing
  // banner on the map, same "show every breaching car, not just the focused
  // one" behavior as the geo-test reference.
  const breachedCars = allCars.filter((c) => isBreached(c.id));
  const restrictedCars = allCars.filter((c) => isCodingRestricted(c.id));
  const mapBanners = [
    ...breachedCars.map((c) => ({ id: `breach-${c.id}`, tone: "breach", text: `🚨 ${getCarLabel(c)} is outside its zone` })),
    ...restrictedCars.map((c) => ({ id: `restricted-${c.id}`, tone: "restricted", text: `🚫 ${getCarLabel(c)} is coding-restricted` })),
  ];

  // ── Sync map markers for every car with an assigned + located device ──────
  useEffect(() => {
    if (!leafletMap.current) return;
    const seen = new Set();

    allCars.forEach(car => {
      const loc = locationForCar(car.id);
      if (!loc?.lat || !loc?.lng) return;
      seen.add(car.id);

      const isSelected = selected === car.id;
      const popupHtml = `<b>${getCarLabel(car)}</b><br>
        ${loc.lastLocation ? `${loc.lastLocation}<br>` : ""}
        Speed: ${typeof loc.speed === "number" ? loc.speed.toFixed(1) : "0.0"} km/h<br>
        ${loc.offline ? `<span style="color:#f59e0b;font-size:11px">📦 Offline flush</span><br>` : ""}
        <span style="color:#9ca3af;font-size:11px">${timeAgo(loc.updatedAt)}</span>`;

      const existing = markersRef.current[car.id];
      if (existing) {
        existing.setLatLng([loc.lat, loc.lng]);
        existing.setIcon(makeCarIcon(isSelected, car.imageURL));
        existing.setPopupContent(popupHtml);
      } else {
        const marker = L.marker([loc.lat, loc.lng], { icon: makeCarIcon(isSelected, car.imageURL) })
          .addTo(leafletMap.current)
          .bindPopup(popupHtml)
          .on("click", () => setSelected(selectedRef.current === car.id ? null : car.id));
        markersRef.current[car.id] = marker;
      }
    });

    // Drop markers for cars that no longer have a live location.
    Object.keys(markersRef.current).forEach(carId => {
      if (!seen.has(carId)) {
        markersRef.current[carId].remove();
        delete markersRef.current[carId];
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCars, gpsDevices, locations]);

  // ── Geofence zones for the focused car — circles + numbered markers ───────
  useEffect(() => {
    if (!leafletMap.current) return;

    zoneLayersRef.current.forEach(layer => layer.remove());
    zoneLayersRef.current = [];

    const zones = draftZones ?? (sessionInfo?.geofenceZones || []);
    if (!selected || !zones.length) return;

    zones.forEach((zone, i) => {
      if (typeof zone.lat !== "number" || typeof zone.lng !== "number") return;
      const circle = L.circle([zone.lat, zone.lng], {
        radius: zone.radius || 500, // meters — matches geofence.service.js's haversine comparison
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
  }, [sessionInfo, selected, draftZones]);

  // ── Focus behavior: clicking a car hides the rest and zooms in; clearing shows all ──
  useEffect(() => {
    if (!leafletMap.current) return;
    const markers = markersRef.current;
    const ids = Object.keys(markers);
    if (!ids.length) return;

    if (selected && markers[selected]) {
      ids.forEach(carId => {
        markers[carId].setOpacity(carId === selected ? 1 : 0);
        markers[carId].setIcon(makeCarIcon(carId === selected, allCars.find(c => c.id === carId)?.imageURL));
      });
      const latlng = markers[selected].getLatLng();
      leafletMap.current.setView(latlng, 15, { animate: true });
      markers[selected].openPopup();
    } else {
      ids.forEach(carId => {
        markers[carId].setOpacity(1);
        markers[carId].setIcon(makeCarIcon(false, allCars.find(c => c.id === carId)?.imageURL));
      });
      if (ids.length === 1) {
        leafletMap.current.setView(markers[ids[0]].getLatLng(), 13, { animate: true });
      } else if (ids.length > 1) {
        const bounds = L.latLngBounds(ids.map(carId => markers[carId].getLatLng()));
        leafletMap.current.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }, [selected, locations, gpsDevices, allCars]);

  // ── Pickup / Return / Stolen actions ───────────────────────────────────────
  const runBookingAction = async (bookingDocId, status, successMsg) => {
    setActionBusyId(bookingDocId);
    setNotice(null);
    try {
      const res  = await fetch(`${API}/api/bookings/${bookingDocId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        setNotice({ type: "ok", msg: successMsg });
        await fetchBookings();
        // Pickup/Return/Stolen change the *session's* active state, but that's
        // only ever fetched by the [selected, tab] effect above — which never
        // re-fires just because a booking action ran. Without this, Car
        // Info/Logs keeps showing whatever sessionInfo was fetched before the
        // action (correctly "no active session" back then), forever, until
        // the user re-clicks the car.
        if (selected) fetchCarSession(selected);
      } else {
        setNotice({ type: "error", msg: json.message || "Action failed." });
      }
    } catch (e) {
      setNotice({ type: "error", msg: "Action failed — check your connection." });
    } finally {
      setActionBusyId(null);
    }
  };

  const handlePickup  = (b) => runBookingAction(b.id, "ongoing",   "Car marked picked up — GPS tracking is now active.");
  const handleReturn  = (b) => runBookingAction(b.id, "completed", "Car marked returned — trip history saved.");
  const handleStolen  = (b) => {
    if (!window.confirm("Flag this car as stolen? This is logged permanently and the booking will be locked.")) return;
    runBookingAction(b.id, "stolen", "Car flagged as stolen — trip history saved for documentation.");
  };

  // Flies the Live map to a geofence zone's location — used by BookingInfoPanel
  // so clicking a zone entry focuses it, same idea as clicking a car marker.
  function flyToZone(zone) {
    if (!leafletMap.current || typeof zone?.lat !== "number" || typeof zone?.lng !== "number") return;
    leafletMap.current.flyTo([zone.lat, zone.lng], 17, { animate: true });
    const marker = zoneLayersRef.current.find(
      l => l instanceof L.Marker && l.getLatLng().lat === zone.lat && l.getLatLng().lng === zone.lng
    );
    marker?.openPopup();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0 gap-3">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-arl-dark text-sm">
              Car Tracking — {tab === "live" ? "Live" : tab === "traceback" ? "Traceback" : tab === "history" ? "History" : "Review"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {allCars.length} car{allCars.length !== 1 ? "s" : ""} total
              {lastPoll && ` · Updated ${timeAgo(lastPoll.toISOString())}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {tab === "live" && selected && (
              <button
                onClick={() => setSelected(null)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
              >
                <Icons.X className="w-3.5 h-3.5" />
                Show all cars
              </button>
            )}
            {tab === "live" && (
              <button
                onClick={() => { fetchLocations(); fetchGpsDevices(); fetchBookings(); }}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
              >
                <Icons.Refresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
            {tab !== "live" && tab !== "review" && (
              <button
                onClick={() => setRefreshTick(t => t + 1)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
              >
                <Icons.Refresh className="w-3.5 h-3.5" />
                Refresh
              </button>
            )}
          </div>
        </div>

        {/* ── Switchable tabs: Live / Traceback / History ─────────────────── */}
        <div className="flex items-center gap-1 mt-3 bg-gray-50 rounded-xl p-1 w-fit">
          {[
            { id: "live",       label: "Live" },
            { id: "traceback",  label: "Traceback" },
            { id: "history",    label: "History" },
            { id: "review",     label: "Review" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === t.id ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notice */}
      {tab === "live" && notice && (
        <div className={`shrink-0 rounded-2xl px-4 py-3 text-xs font-medium border flex items-start gap-2 ${
          notice.type === "ok"    ? "bg-green-50 border-green-200 text-green-700" :
          notice.type === "warn"  ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
          "bg-red-50 border-red-200 text-red-700"
        }`}>
          <Icons.AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {notice.msg}
        </div>
      )}

      {tab === "traceback" && (
        <TracebackPanel cars={allCars.map(c => ({ id: c.id, name: getCarLabel(c) }))} token={token} refreshTick={refreshTick} />
      )}

      {tab === "history" && (
        <HistoryPanel
          cars={allCars.map(c => ({ id: c.id, name: getCarLabel(c) }))}
          token={token}
          refreshTick={refreshTick}
          autoOpen={historyDeepLink ? { carID: historyDeepLink.carID, bookingID: historyDeepLink.bookingID } : null}
        />
      )}

      {tab === "review" && (
        <ReviewPanel cars={allCars.map(c => ({ id: c.id, name: getCarLabel(c) }))} token={token} />
      )}

      {tab === "live" && (
      <div className="flex flex-1 min-h-0 gap-4">

      {/* ── Sidebar: car list ────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-hide">
        {loading && allCars.length === 0 ? (
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
            const device      = deviceForCar(car.id);
            const loc         = locationForCar(car.id);
            const ongoing     = ongoingBooking(car.id);
            const nextUpcoming = nearestUpcoming(car.id);
            const dueNotPickedUp = isDueNotPickedUp(car.id);
            const dueNotReturned = isDueNotReturned(car.id);
            const breached = isBreached(car.id);
            const codingRestricted = isCodingRestricted(car.id);

            return (
              <button
                key={car.id}
                onClick={() => {
                  setSelected(isSelected ? null : car.id);
                  setNotice(null);
                }}
                className={`w-full text-left bg-white rounded-2xl border-2 shadow-soft p-4 transition-all ${
                  isSelected ? "border-teal-500 ring-1 ring-teal-200" : "border-gray-100 hover:border-teal-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${
                    isSelected && loc ? "bg-teal-50 text-teal-600" : "bg-gray-50 text-gray-400"
                  }`}>
                    {car.imageURL ? (
                      <img
                        src={car.imageURL}
                        alt={getCarLabel(car)}
                        className="w-full h-full object-cover"
                        onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling.style.display = "flex"; }}
                      />
                    ) : null}
                    <Icons.Car className="w-5 h-5" style={car.imageURL ? { display: "none" } : undefined} />
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

                    {/* Location */}
                    {loc ? (
                      <>
                        <p className="text-xs text-green-500 mt-0.5 font-medium flex items-center gap-1">
                          <Icons.Clock className="w-3 h-3" />
                          {timeAgo(loc.updatedAt)} · {typeof loc.speed === "number" ? loc.speed.toFixed(1) : "0.0"} km/h
                        </p>
                        {loc.offline && (
                          <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2 py-0.5 mt-1 font-medium inline-flex items-center gap-1">
                            📦 Offline flush — buffered ping, not live
                          </p>
                        )}
                      </>
                    ) : device ? (
                      <p className="text-xs text-gray-400 mt-0.5 italic">No live location yet</p>
                    ) : null}

                    {/* On-trip / next-booking badge — "due" states override the
                        neutral version once the clock has actually passed. */}
                    {ongoing && dueNotReturned ? (
                      <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-2 py-1 mt-1.5 font-medium flex items-center gap-1">
                        <Icons.AlertTriangle className="w-3 h-3 shrink-0" />
                        Due, not returned · {ongoing.customerName || "—"}
                      </p>
                    ) : ongoing ? (
                      <p className="text-xs text-teal-700 bg-teal-50 rounded-lg px-2 py-1 mt-1.5 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                        On trip · {ongoing.customerName || "—"}
                      </p>
                    ) : nextUpcoming && dueNotPickedUp ? (
                      <p className="text-xs text-red-700 bg-red-50 rounded-lg px-2 py-1 mt-1.5 font-medium flex items-center gap-1">
                        <Icons.AlertTriangle className="w-3 h-3 shrink-0" />
                        Due, not picked up · {nextUpcoming.customerName || "—"}
                      </p>
                    ) : nextUpcoming ? (
                      <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-2 py-1 mt-1.5 font-medium flex items-center gap-1">
                        <Icons.Calendar className="w-3 h-3 shrink-0" />
                        Next: {fmtDateTime(nextUpcoming.startDateTime)} · {nextUpcoming.customerName || "—"}
                      </p>
                    ) : null}

                    {/* Geofence / coding-restriction badges — live, from the
                        realtime bookingSessions listener. */}
                    {breached && (
                      <p className="text-xs text-red-700 bg-red-50 rounded-lg px-2 py-1 mt-1.5 font-medium flex items-center gap-1">
                        🚧 Outside geofence
                      </p>
                    )}
                    {codingRestricted && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-1.5 font-medium flex items-center gap-1">
                        🚫 Coding-restricted
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ── Map + selected-car action panel ─────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden relative">
          <div ref={mapRef} className="w-full h-full" style={{ minHeight: "400px" }} />

          <GeofenceBanner banners={mapBanners} />

          <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-500 shadow-sm space-y-1">
            <p className="font-semibold text-gray-700 mb-1">Map Legend</p>
            <p className="flex items-center gap-1.5">
              <Icons.Car className="w-3.5 h-3.5 text-teal-600" />
              {selected ? "Focused car" : "All tracked cars"}
            </p>
            <p className="text-gray-400">Click a car to focus on it — click "Show all cars" to zoom back out.</p>
          </div>

          {/* Floating "Booking Information" / "Logs" buttons — always shown once a car
              is focused. Previously gated on sessionInfo.hasActiveSession, which
              hid these entirely for any car whose booking is "ongoing" but has no
              linked bookingSessions doc (e.g. older bookings created before that
              doc was reliably created at booking time) — now the panels
              themselves say "no active session" instead of vanishing. */}
          {selected && (
            <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 items-end">
              <button
                onClick={() => { setShowBookingInfo(v => !v); setShowLogs(false); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm transition-all ${
                  showBookingInfo ? "bg-teal-600 text-white" : "bg-white/95 text-gray-700 hover:bg-white"
                }`}
              >
                <Icons.Info className="w-3.5 h-3.5" />
                Booking Information
              </button>
              <button
                onClick={() => { setShowLogs(v => !v); setShowBookingInfo(false); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm transition-all ${
                  showLogs ? "bg-teal-600 text-white" : "bg-white/95 text-gray-700 hover:bg-white"
                }`}
              >
                <Icons.List className="w-3.5 h-3.5" />
                Logs
              </button>
            </div>
          )}

          {showBookingInfo && selected && (
            <BookingInfoPanel
              carId={selected}
              carLabel={getCarLabel(allCars.find(c => c.id === selected) || {})}
              sessionInfo={sessionInfo}
              lastKnownPosition={locationForCar(selected)}
              ongoingBooking={ongoingBooking(selected)}
              upcomingBookings={bookingsByCar[selected]?.upcoming || []}
              token={token}
              onClose={() => setShowBookingInfo(false)}
              onSaved={() => fetchCarSession(selected)}
              onFocusZone={flyToZone}
              onZonesChange={setDraftZones}
            />
          )}

          {showLogs && (
            <LogsPanel sessionInfo={sessionInfo} loading={sessionLoading} onClose={() => setShowLogs(false)} />
          )}

          {Object.keys(markersRef.current).length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-[999] pointer-events-none">
              <div className="bg-white/95 rounded-2xl border border-gray-100 shadow-lg p-6 text-center max-w-xs">
                <div className="flex justify-center mb-3">
                  <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
                    <Icons.Map className="w-7 h-7 text-gray-400" />
                  </div>
                </div>
                <p className="font-semibold text-gray-700 text-sm">No cars reporting a live location</p>
                <p className="text-xs text-gray-400 mt-1">
                  Assign GPS devices in GPS Setup and wait for a ping.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Selected car: current trip (Return/Stolen) or upcoming bookings (Pickup) ── */}
        {selected && (() => {
          const car = allCars.find(c => c.id === selected);
          if (!car) return null;
          const ongoing = ongoingBooking(selected);
          const upcoming = bookingsByCar[selected]?.upcoming || [];

          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4 shrink-0 max-h-64 overflow-y-auto scrollbar-hide">
              <p className="font-bold text-gray-800 text-sm mb-3">{getCarLabel(car)}</p>

              {ongoing ? (
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-teal-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                    Current trip — {ongoing.customerName || "—"}
                  </p>
                  <p className="text-xs text-teal-600 mt-1">
                    {fmtDateTime(ongoing.startDateTime)} → {fmtDateTime(ongoing.endDateTime)}
                  </p>
                  {locationForCar(selected) && (
                    <p className="text-[11px] text-teal-500 mt-1 flex items-center gap-1">
                      <Icons.MapPin className="w-3 h-3 shrink-0" />
                      <PlaceLabel lat={locationForCar(selected).lat} lng={locationForCar(selected).lng} />
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => handleReturn(ongoing)}
                      disabled={actionBusyId === ongoing.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Icons.Flag className="w-3.5 h-3.5" />
                      {actionBusyId === ongoing.id ? "…" : "Return"}
                    </button>
                    <button
                      onClick={() => handleStolen(ongoing)}
                      disabled={actionBusyId === ongoing.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Icons.Siren className="w-3.5 h-3.5" />
                      {actionBusyId === ongoing.id ? "…" : "Stolen"}
                    </button>
                  </div>
                </div>
              ) : upcoming.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No upcoming bookings for this car.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {(showAllUpcoming ? upcoming : upcoming.slice(0, 2)).map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-blue-800 truncate">{b.customerName || "—"}</p>
                        <p className="text-xs text-blue-600 mt-0.5">
                          {fmtDateTime(b.startDateTime)} → {fmtDateTime(b.endDateTime)}
                        </p>
                      </div>
                      <button
                        onClick={() => handlePickup(b)}
                        disabled={actionBusyId === b.id}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <Icons.Play className="w-3 h-3" />
                        {actionBusyId === b.id ? "…" : "Pickup"}
                      </button>
                    </div>
                  ))}

                  {upcoming.length > 2 && (
                    <button
                      onClick={() => setShowAllUpcoming(v => !v)}
                      className="flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600"
                    >
                      {showAllUpcoming ? (
                        <>Show less <Icons.ChevronUp className="w-3.5 h-3.5" /></>
                      ) : (
                        <>Show {upcoming.length - 2} more <Icons.ChevronDown className="w-3.5 h-3.5" /></>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>
      </div>
      )}
    </div>
  );
}