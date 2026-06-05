import { useState, useEffect, useCallback } from "react";
import {
  collection, getDocs, query, where, doc,
  setDoc, addDoc, serverTimestamp, getDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { initializeApp, getApps } from "firebase/app";
import { db } from "../fireabase";

// ─── Firebase Storage ─────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyDXSIR_zZh6LolqoW7tkERyXMglGCPGHdg",
  authDomain: "arltrack-carrentalservices.firebaseapp.com",
  projectId: "arltrack-carrentalservices",
  storageBucket: "arltrack-carrentalservices.firebasestorage.app",
  messagingSenderId: "803760784395",
  appId: "1:803760784395:web:1f428b6bb2b51e2721b30e",
};
const fbApp   = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const storage = getStorage(fbApp);

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconCar = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 11l2.5-4h9L19 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2" y="11" width="20" height="6" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="6.5" cy="17.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="17.5" cy="17.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 11h10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

const IconClipboard = ({ className = "w-8 h-8" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

const IconSave = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconPin = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const IconRocket = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconFlag = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconLock = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconWrench = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

// Arrow icons for exterior slots
const IconArrowUp    = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconArrowLeft  = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconArrowDown  = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── EXTERIOR SLOTS ───────────────────────────────────────────────────────────

const EXTERIOR_SLOTS = [
  { key: "frontViewUrl", label: "Front View", Icon: IconArrowUp },
  { key: "sideViewUrl",  label: "Side View",  Icon: IconArrowLeft },
  { key: "backViewUrl",  label: "Back View",  Icon: IconArrowDown },
];

// ─── PHASE CONFIG ─────────────────────────────────────────────────────────────

const PHASE = {
  before: { collection: "vehicleDocumentationBeforeTrip", idField: "vehicleDocumentationBeforeTripID" },
  after:  { collection: "vehicleDocumentationAfterTrip",  idField: "vehicleDocumentationAfterTripID" },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const partNameToFieldKey = (str = "") => {
  const camel = str
    .replace(/[^a-zA-Z0-9 ]/g, "").trim()
    .split(/\s+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
  return camel ? `${camel}Url` : "";
};

const fmtDate = (val) => {
  if (!val) return "—";
  const d = val?.toDate?.() || (val?._seconds ? new Date(val._seconds * 1000) : new Date(val));
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

const fmtDateShort = (val) => {
  if (!val) return "—";
  const d = val?.toDate?.() || (val?._seconds ? new Date(val._seconds * 1000) : new Date(val));
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const toSec = (val) => {
  if (val?._seconds !== undefined) return val._seconds;
  if (typeof val === "number") return val;
  if (typeof val === "string" || val instanceof Date) { const ms = new Date(val).getTime(); return isNaN(ms) ? NaN : ms / 1000; }
  if (typeof val?.toDate === "function") return val.toDate().getTime() / 1000;
  return NaN;
};

const STATUS_STYLE = {
  Active:      "bg-green-50 border border-green-200",
  Inactive:    "bg-gray-100 text-gray-500",
  Maintenance: "bg-yellow-100 text-yellow-700",
};

const BOOKING_STATUS_STYLE = {
  approved:             "bg-green-50 border border-green-200",
  pending:              "bg-yellow-50 border border-yellow-200",
  completed:            "bg-blue-50 border border-blue-200",
  cancelled:            "bg-red-100 text-red-600",
  cancellation_request: "bg-orange-100 text-orange-700",
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function VehicleDocs() {
  const [cars, setCars]                     = useState([]);
  const [carsLoading, setCarsLoading]       = useState(true);
  const [selectedCar, setSelectedCar]       = useState(null);
  const [carParts, setCarParts]             = useState([]);
  const [partTypes, setPartTypes]           = useState({});
  const [partsLoading, setPartsLoading]     = useState(false);
  const [activeBooking, setActiveBooking]   = useState(null);
  const [bookingUser, setBookingUser]       = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [tripType, setTripType]             = useState("before");
  const [beforeDoc, setBeforeDoc]           = useState(null);
  const [afterDoc, setAfterDoc]             = useState(null);
  const [docsLoading, setDocsLoading]       = useState(false);
  const [uploads, setUploads]               = useState({});
  const [uploading, setUploading]           = useState({});
  const [saving, setSaving]                 = useState(false);
  const [toast, setToast]                   = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    setCarsLoading(true);
    Promise.all([
      getDocs(collection(db, "cars")),
      getDocs(collection(db, "brand")),
      getDocs(collection(db, "model")),
      getDocs(collection(db, "carImages")),
    ])
      .then(([carsSnap, brandsSnap, modelsSnap, imgsSnap]) => {
        const bMap = Object.fromEntries(brandsSnap.docs.map(d => [d.id, d.data()]));
        const mMap = Object.fromEntries(modelsSnap.docs.map(d => [d.id, d.data()]));
        const iMap = {};
        imgsSnap.docs.forEach(d => { if (d.data().carID) iMap[d.data().carID] = d.data().imageURL; });
        setCars(carsSnap.docs.map(d => {
          const c     = { id: d.id, ...d.data() };
          const model = mMap[c.modelID] || {};
          const brand = bMap[model.brandID] || {};
          return { ...c, label: `${brand.brandName || ""} ${model.modelName || ""}`.trim() || d.id, brandName: brand.brandName || "—", modelName: model.modelName || "—", imageURL: iMap[d.id] || null };
        }));
      })
      .catch(console.error)
      .finally(() => setCarsLoading(false));

    getDocs(collection(db, "carPartTypes")).then(snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data().carPartName || d.id; });
      setPartTypes(map);
    });
  }, []);

  const loadPhotoDocs = useCallback(async (bookingID) => {
    if (!bookingID) return;
    setDocsLoading(true);
    try {
      const [beforeSnap, afterSnap] = await Promise.all([
        getDocs(query(collection(db, PHASE.before.collection), where("bookingID", "==", bookingID))),
        getDocs(query(collection(db, PHASE.after.collection),  where("bookingID", "==", bookingID))),
      ]);
      const pickLatest = (snap) => {
        if (snap.empty) return null;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => toSec(b.updatedAt || b.createdAt) - toSec(a.updatedAt || a.createdAt));
        return docs[0];
      };
      setBeforeDoc(pickLatest(beforeSnap));
      setAfterDoc(pickLatest(afterSnap));
    } catch (e) { console.error("photo docs fetch error:", e); }
    finally { setDocsLoading(false); }
  }, []);

  const selectCar = useCallback(async (car) => {
    setSelectedCar(car); setCarParts([]); setActiveBooking(null); setBookingUser(null);
    setBeforeDoc(null); setAfterDoc(null); setUploads({}); setTripType("before");

    setPartsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "carParts"), where("carID", "==", car.carID || car.id)));
      setCarParts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setPartsLoading(false); }

    setBookingLoading(true);
    try {
      const snap   = await getDocs(query(collection(db, "bookings"), where("carID", "==", car.carID || car.id)));
      const all    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const nowSec = Date.now() / 1000;
      const upcoming = all
        .filter(b => {
          const status   = b.status?.toLowerCase();
          if (!["approved", "completed"].includes(status)) return false;
          const startSec = toSec(b.startDateTime);
          const endSec   = toSec(b.endDateTime);
          return (!isNaN(endSec) && endSec > nowSec) ||
                 (!isNaN(startSec) && startSec >= nowSec - 86400) ||
                 (!isNaN(startSec) && startSec > nowSec && startSec <= nowSec + 604800);
        })
        .sort((a, b) => toSec(a.startDateTime) - toSec(b.startDateTime));

      const nearest = upcoming[0] || null;
      setActiveBooking(nearest);

      if (nearest) {
        const userID = nearest.userID;
        if (userID) {
          try {
            const [detailDoc, userDoc] = await Promise.all([
              getDoc(doc(db, "userDetails", userID)),
              getDoc(doc(db, "user", userID)),
            ]);
            const { firstName = "", lastName = "" } = detailDoc.exists() ? detailDoc.data() : {};
            const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
            const { email = "", phone = "" } = userDoc.exists() ? userDoc.data() : {};
            setBookingUser({ fullName: fullName || email || "—", email, phone });
          } catch (e) { setBookingUser(null); }
        }
        const bID = nearest.bookingID || nearest.id;
        await loadPhotoDocs(bID);
      }
    } catch (e) { console.error("booking fetch error:", e); }
    finally { setBookingLoading(false); }
  }, [loadPhotoDocs]);

  const handleFilePick = (fieldKey, file) => {
    if (!file) return;
    setUploads(prev => ({ ...prev, [fieldKey]: { file, preview: URL.createObjectURL(file) } }));
  };

  const uploadSlot = async (fieldKey) => {
    if (!uploads[fieldKey] || !selectedCar || !activeBooking) return;
    setUploading(prev => ({ ...prev, [fieldKey]: true }));
    const bID         = activeBooking.bookingID || activeBooking.id;
    const phase       = PHASE[tripType];
    const existingDoc = tripType === "before" ? beforeDoc : afterDoc;
    try {
      const { file } = uploads[fieldKey];
      const ext = file.name.split(".").pop();
      const storagePath = `vehicleDocs/${selectedCar.id}/${bID}/${tripType}/${fieldKey}_${Date.now()}.${ext}`;
      await uploadBytes(ref(storage, storagePath), file);
      const url = await getDownloadURL(ref(storage, storagePath));
      let savedDocId;
      if (existingDoc?.id) {
        savedDocId = existingDoc.id;
        await setDoc(doc(db, phase.collection, savedDocId), { [fieldKey]: url, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        const newRef = await addDoc(collection(db, phase.collection), {
          bookingID: bID, carID: selectedCar.carID || selectedCar.id,
          [phase.idField]: "", frontViewUrl: "", sideViewUrl: "", backViewUrl: "",
          [fieldKey]: url, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        savedDocId = newRef.id;
        await setDoc(doc(db, phase.collection, savedDocId), { [phase.idField]: savedDocId }, { merge: true });
      }
      const updatedDoc = { ...(existingDoc || {}), id: savedDocId, bookingID: bID, carID: selectedCar.carID || selectedCar.id, [fieldKey]: url };
      if (tripType === "before") setBeforeDoc(updatedDoc);
      else setAfterDoc(updatedDoc);
      setUploads(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
      showToast("Photo saved!");
    } catch (e) { console.error(e); showToast("Upload failed: " + e.message, "error"); }
    finally { setUploading(prev => ({ ...prev, [fieldKey]: false })); }
  };

  const saveAll = async () => {
    if (!activeBooking) { showToast("No active booking to link photos to.", "error"); return; }
    const pending = Object.keys(uploads);
    if (!pending.length) { showToast("No new photos to save.", "error"); return; }
    setSaving(true);
    for (const key of pending) await uploadSlot(key);
    setSaving(false);
    showToast("All photos saved!");
  };

  const getSlotImage  = (fieldKey) => {
    if (uploads[fieldKey]?.preview) return uploads[fieldKey].preview;
    const currentDoc = tripType === "before" ? beforeDoc : afterDoc;
    return currentDoc?.[fieldKey] || null;
  };

  const getPartFieldKey = (part) => {
    const typeName = partTypes[part.carPartTypeID] || "";
    const combined = `${typeName} ${part.carPartName || ""}`.trim();
    return partNameToFieldKey(combined) || partNameToFieldKey(part.carPartName || part.id);
  };

  const bID           = activeBooking ? (activeBooking.bookingID || activeBooking.id) : null;
  const currentDoc    = tripType === "before" ? beforeDoc : afterDoc;
  const isAfterTripLocked = tripType === "after" && activeBooking?.status?.toLowerCase() !== "completed";

  return (
    <div className="p-4 bg-gray-50">

      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-arl-dark">Vehicle Documentation</h1>
          <p className="text-sm text-gray-400 mt-0.5">Before &amp; after trip photo documentation per booking</p>
        </div>
        {selectedCar && Object.keys(uploads).length > 0 && (
          <button onClick={saveAll} disabled={saving}
            className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            <IconSave className="w-4 h-4" />
            {saving ? "Saving…" : `Save ${Object.keys(uploads).length} Photo${Object.keys(uploads).length > 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      <div className="flex gap-4">

        {/* Car list */}
        <div className={`${selectedCar ? "w-72 shrink-0" : "flex-1"} transition-all duration-300`}>
          {carsLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-20 animate-pulse" />)}
            </div>
          ) : (
            <div className={`grid gap-3 ${selectedCar ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
              {cars.length === 0 && <p className="text-gray-400 text-sm col-span-full text-center py-8">No vehicles found.</p>}
              {cars.map(car => (
                <button key={car.id} onClick={() => selectedCar?.id === car.id ? setSelectedCar(null) : selectCar(car)}
                  className={`w-full text-left bg-white rounded-2xl border transition-all duration-200 shadow-soft hover:shadow-md p-4 ${
                    selectedCar?.id === car.id ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"
                  }`}>
                  <div className="flex items-center gap-3">
                    {car.imageURL ? (
                      <img src={car.imageURL} alt="car" className={`rounded-xl object-cover ${selectedCar ? "w-10 h-10" : "w-14 h-14"}`} />
                    ) : (
                      <div className={`rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 ${selectedCar ? "w-10 h-10" : "w-14 h-14"}`}>
                        <IconCar className={selectedCar ? "w-5 h-5" : "w-7 h-7"} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{car.label}</p>
                      <p className="text-xs text-gray-400 truncate">{car.plateNumber || car.platenumber || "—"}</p>
                      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium text-black ${STATUS_STYLE[car.status] || "bg-gray-50 border border-gray-200"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_STYLE[car.status]?.includes("green") ? "bg-green-500" : "bg-gray-400"}`} />
                        {car.status}
                      </span>
                    </div>
                    {selectedCar?.id === car.id && (
                      <div className="shrink-0 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedCar && (
          <div className="flex-1 min-w-0 space-y-4">

            {/* Car header */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-arl-dark text-base">{selectedCar.label}</h2>
                  <p className="text-xs text-gray-400">
                    {selectedCar.plateNumber || selectedCar.platenumber || "—"}
                    {" · "}{selectedCar.year || "—"}
                    {" · "}{selectedCar.bodyType || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-black ${STATUS_STYLE[selectedCar.status] || "bg-gray-50 border border-gray-200"}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_STYLE[selectedCar.status]?.includes("green") ? "bg-green-500" : "bg-gray-400"}`} />
                    {selectedCar.status || "—"}
                  </span>
                  <button onClick={() => setSelectedCar(null)} className="text-gray-400 hover:text-gray-600">
                    <IconX className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Booking + Docs Section */}
            {bookingLoading ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse h-48" />
            ) : !activeBooking ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center">
                <div className="flex justify-center mb-3 text-gray-300">
                  <IconClipboard className="w-10 h-10" />
                </div>
                <p className="text-sm font-semibold text-gray-500">No upcoming booking for this vehicle</p>
                <p className="text-xs text-gray-400 mt-1">Photo documentation is tied to bookings. Check back when a booking is approved.</p>
              </div>
            ) : (
              <div className="space-y-4">

                {/* Booking info card */}
                <div className="bg-white rounded-2xl border-2 border-teal-300 ring-1 ring-teal-100 shadow-soft p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <IconCar className="w-4 h-4 text-teal-600" />
                      <h3 className="font-bold text-gray-800 text-sm">
                        {toSec(activeBooking.startDateTime) > Date.now() / 1000 ? "Upcoming Booking" : "Active Booking"}
                      </h3>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${BOOKING_STATUS_STYLE[activeBooking.status?.toLowerCase()] || "bg-gray-50 border border-gray-200"}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${BOOKING_STATUS_STYLE[activeBooking.status?.toLowerCase()]?.includes("green") ? "bg-green-500" : BOOKING_STATUS_STYLE[activeBooking.status?.toLowerCase()]?.includes("yellow") ? "bg-yellow-400" : BOOKING_STATUS_STYLE[activeBooking.status?.toLowerCase()]?.includes("blue") ? "bg-blue-500" : "bg-gray-400"}`} />
                      {activeBooking.status?.replace("_", " ") || "—"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-600">
                    <div className="flex justify-between col-span-2 sm:col-span-1">
                      <span className="text-gray-400 font-medium">Booking ID</span>
                      <span className="font-mono text-teal-700 font-semibold truncate max-w-[55%] text-right">{bID}</span>
                    </div>
                    <div className="flex justify-between col-span-2 sm:col-span-1">
                      <span className="text-gray-400 font-medium">Customer</span>
                      <span className="text-gray-700 truncate max-w-[55%] text-right">{bookingUser?.fullName || "—"}</span>
                    </div>
                    <div className="flex justify-between col-span-2 sm:col-span-1">
                      <span className="text-gray-400 font-medium">Start Date</span>
                      <span className="text-gray-700">{fmtDateShort(activeBooking.startDateTime)}</span>
                    </div>
                    <div className="flex justify-between col-span-2 sm:col-span-1">
                      <span className="text-gray-400 font-medium">End Date</span>
                      <span className="text-gray-700">{fmtDateShort(activeBooking.endDateTime)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-2 flex items-center gap-1.5">
                    <IconPin className="w-3.5 h-3.5 shrink-0" />
                    Photos will be linked to Booking ID: <span className="font-mono text-gray-600">{bID}</span>
                  </p>
                </div>

                {/* Before / After Tabs */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
                  <div className="flex bg-gray-50 border-b border-gray-100 p-1 gap-1">
                    <TabButton
                      active={tripType === "before"}
                      onClick={() => { setTripType("before"); setUploads({}); }}
                      Icon={IconRocket}
                      label="Before Trip"
                      badge={beforeDoc ? "✓ Has Photos" : null}
                      badgeColor="bg-teal-100 text-teal-700"
                    />
                    <TabButton
                      active={tripType === "after"}
                      onClick={() => { setTripType("after"); setUploads({}); }}
                      Icon={IconFlag}
                      label="After Trip"
                      badge={afterDoc ? "✓ Has Photos" : null}
                      badgeColor="bg-blue-100 text-blue-700"
                    />
                  </div>

                  <div className="p-5 space-y-5">

                    {/* Instruction banner */}
                    <div className={`px-3 py-2 rounded-xl text-xs font-medium flex items-start gap-2 ${
                      tripType === "before"
                        ? "bg-teal-50 text-teal-700 border border-teal-100"
                        : "bg-blue-50 text-blue-700 border border-blue-100"
                    }`}>
                      {tripType === "before"
                        ? <IconRocket className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        : <IconFlag   className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                      {tripType === "before"
                        ? "Before Trip — Take photos of the vehicle BEFORE the customer picks it up. Documents its condition at the start."
                        : "After Trip — Take photos AFTER the customer returns the vehicle. Documents any new damage or changes."}
                    </div>

                    {/* After trip locked */}
                    {isAfterTripLocked && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800">
                        <IconLock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <p>
                          <span className="font-semibold">After Trip is locked.</span> Photos can only be added once the booking is{" "}
                          <span className="font-bold">Completed</span>. Current status:{" "}
                          <span className="font-bold capitalize">{activeBooking.status?.replace("_", " ") || "—"}</span>.
                        </p>
                      </div>
                    )}

                    {currentDoc?.updatedAt && (
                      <p className="text-xs text-gray-400">Last saved: {fmtDate(currentDoc.updatedAt)}</p>
                    )}

                    {!isAfterTripLocked && (
                      <>
                        {/* Exterior Views */}
                        <SectionTitle title="Exterior Views (Required)" />
                        <div className="grid grid-cols-3 gap-4">
                          {EXTERIOR_SLOTS.map(slot => (
                            <PhotoSlot key={slot.key} fieldKey={slot.key} label={slot.label} SlotIcon={slot.Icon}
                              image={getSlotImage(slot.key)} uploading={uploading[slot.key]} isPending={!!uploads[slot.key]}
                              onFilePick={f => handleFilePick(slot.key, f)} onUpload={() => uploadSlot(slot.key)} required />
                          ))}
                        </div>

                        {/* Parts */}
                        {partsLoading ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-48 rounded-2xl bg-gray-100 animate-pulse" />)}
                          </div>
                        ) : carParts.length > 0 ? (
                          <>
                            <SectionTitle title={`Parts Documentation (${carParts.length})`} />
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                              {carParts.map(part => {
                                const fieldKey = getPartFieldKey(part);
                                return (
                                  <PhotoSlot key={part.id} fieldKey={fieldKey} label={part.carPartName || "Part"}
                                    sub={partTypes[part.carPartTypeID] || ""} image={getSlotImage(fieldKey)}
                                    uploading={uploading[fieldKey]} isPending={!!uploads[fieldKey]}
                                    onFilePick={f => handleFilePick(fieldKey, f)} onUpload={() => uploadSlot(fieldKey)} />
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                            <IconWrench className="w-8 h-8 text-gray-300" />
                            No parts found in inventory for this vehicle.
                          </div>
                        )}

                        {/* Pending uploads bar */}
                        {Object.keys(uploads).length > 0 && (
                          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 gap-3">
                            <div className="flex items-center gap-2">
                              <IconWarning className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <p className="text-xs font-semibold text-amber-800">
                                {Object.keys(uploads).length} unsaved photo{Object.keys(uploads).length !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setUploads({})} className="text-xs text-amber-600 hover:underline font-semibold">Discard</button>
                              <button onClick={saveAll} disabled={saving}
                                className="text-xs bg-teal-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1">
                                <IconSave className="w-3 h-3" />
                                {saving ? "Saving…" : "Save All"}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function SectionTitle({ title }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wider">{title}</h2>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function TabButton({ active, onClick, Icon, label, badge, badgeColor }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
        active ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
      }`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      {badge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>}
    </button>
  );
}

function PhotoSlot({ fieldKey, label, sub, SlotIcon, image, uploading, isPending, onFilePick, onUpload, required }) {
  const inputId = `slot_${fieldKey}`;
  return (
    <div className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
      isPending ? "border-teal-400" : "border-gray-100 hover:border-gray-200"
    }`}>
      <label htmlFor={inputId} className="block cursor-pointer relative">
        <input id={inputId} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files[0] && onFilePick(e.target.files[0])} />
        <div className="h-36 bg-gray-50 flex items-center justify-center relative overflow-hidden">
          {image ? (
            <>
              <img src={image} alt={label} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-all flex items-center justify-center opacity-0 hover:opacity-100">
                <span className="text-white text-xs font-semibold bg-black/50 px-2 py-1 rounded-lg">Change</span>
              </div>
              {isPending && (
                <div className="absolute top-2 right-2 bg-teal-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">New</div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 text-gray-300">
              {SlotIcon ? <SlotIcon className="w-7 h-7" /> : (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              )}
              <span className="text-xs">Tap to add</span>
              {required && <span className="text-xs text-red-400 font-semibold">Required</span>}
            </div>
          )}
        </div>
      </label>
      <div className="px-3 py-2">
        <p className="font-semibold text-gray-800 text-xs truncate">{label}</p>
        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
        <p className="text-xs text-gray-300 font-mono truncate mt-0.5">{fieldKey}</p>
        {isPending && (
          <button onClick={onUpload} disabled={uploading}
            className="mt-1.5 w-full py-1 text-xs bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1">
            <IconSave className="w-3 h-3" />
            {uploading ? "Uploading…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}