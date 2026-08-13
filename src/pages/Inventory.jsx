import { useState, useEffect, useCallback } from "react";
import {
  collection, getDocs, addDoc, query, where,
  doc, updateDoc, serverTimestamp, getDoc
} from "firebase/firestore";
import { db } from "../fireabase";

/* ── helpers ── */

// Same slugifier VehicleDocs.jsx uses to build each part's photo field
// key (e.g. "Brake Parts" + "Brake Disc" -> "brakePartsBrakeDiscUrl").
// Must stay byte-for-byte identical on both sides or the lookup won't
// find the photo a driver actually saved.
const partNameToFieldKey = (str = "") => {
  const camel = str
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join("");
  return camel ? `${camel}Url` : "";
};
const fmtTs = (val) => {
  if (!val) return "—";
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
};

const toSec = (val) => {
  if (!val) return NaN;
  if (typeof val?.toDate === "function") return val.toDate().getTime() / 1000;
  if (val?._seconds !== undefined) return val._seconds;
  if (typeof val === "number") return val;
  if (typeof val === "string" || val instanceof Date) {
    const ms = new Date(val).getTime();
    return isNaN(ms) ? NaN : ms / 1000;
  }
  return NaN;
};

const STATUS_STYLE = {
  Active:      "bg-green-50 border border-green-200",
  Inactive:    "bg-gray-100 border border-gray-200",
  Maintenance: "bg-yellow-50 border border-yellow-200 text-yellow-700",
};

const PART_STATUS_STYLE = {
  New:     "bg-blue-50 border border-blue-200",
  Good:    "bg-green-50 border border-green-200",
  Damaged: "bg-red-50 border border-red-200",
  Worn:    "bg-yellow-100 text-yellow-700",
  Missing: "bg-gray-200 text-gray-500",
  Stolen:  "bg-purple-50 border border-purple-200",
};

const BOOKING_STATUS_STYLE = {
  upcoming:             "bg-yellow-50 border border-yellow-200",
  ongoing:              "bg-green-50 border border-green-200",
  completed:            "bg-blue-50 border border-blue-200",
  cancelled:            "bg-red-100 text-red-600",
  cancellation_request: "bg-orange-100 text-orange-700",
  stolen:               "bg-red-900 text-white",
};

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function Inventory() {
  const [cars, setCars]                     = useState([]);
  const [carsLoading, setCarsLoading]       = useState(true);
  const [selectedCar, setSelectedCar]       = useState(null);
  const [parts, setParts]                   = useState([]);
  const [partsLoading, setPartsLoading]     = useState(false);

  // Nearest upcoming booking for the selected car
  const [activeBooking, setActiveBooking]   = useState(null);
  const [bookingUser, setBookingUser]       = useState(null);   // resolved user info for activeBooking
  const [bookingLoading, setBookingLoading] = useState(false);

  // Active tab: "before" | "after"
  const [activeTab, setActiveTab]           = useState("before");

  // inventoryBeforeTrip / inventoryAfterTrip records for the active booking
  const [beforeRecord, setBeforeRecord]     = useState(null);   // single record object or null
  const [afterRecord, setAfterRecord]       = useState(null);   // single record object or null
  const [invLoading, setInvLoading]         = useState(false);

  // Save state
  const [saving, setSaving]                 = useState(false);
  const [saveSuccess, setSaveSuccess]       = useState("");     // flash message

  // carPartTypes map (typeID -> category name), used to build the same
  // photo field key VehicleDocs.jsx computes per part (e.g. "brakePartsBrakeDiscUrl")
  const [partTypes, setPartTypes]           = useState({});

  // vehicleDocumentationBeforeTrip / AfterTrip docs for the active booking —
  // read-only here, this page never writes photos, just links to them.
  const [beforePhotoDoc, setBeforePhotoDoc] = useState(null);
  const [afterPhotoDoc, setAfterPhotoDoc]   = useState(null);

  // Lightbox for "View Photo" — { url, label } or null
  const [viewingPhoto, setViewingPhoto]     = useState(null);

  // Part edits per tab
  const [beforeEdits, setBeforeEdits]       = useState({});     // { partId: status }
  const [afterEdits, setAfterEdits]         = useState({});

  // Search / filter
  const [search, setSearch]                 = useState("");
  const [statusFilter, setStatusFilter]     = useState("All");

  // Past trips (history) for the selected car — derived from the same
  // bookings query openCar() already runs, just the non-nearest ones.
  const [pastBookings, setPastBookings]         = useState([]);
  const [expandedHistoryID, setExpandedHistoryID] = useState(null);
  // bookingID -> { loading, userFullName, before, after }
  const [historyRecords, setHistoryRecords]     = useState({});

  /* ── Load cars ── */
  const fetchCars = useCallback(async () => {
    setCarsLoading(true);
    try {
      const [carsSnap, brandsSnap, modelsSnap, imagesSnap] = await Promise.all([
        getDocs(collection(db, "cars")),
        getDocs(collection(db, "brand")),
        getDocs(collection(db, "model")),
        getDocs(collection(db, "carImages")),
      ]);
      const brandMap = Object.fromEntries(brandsSnap.docs.map(d => [d.id, d.data()]));
      const modelMap = Object.fromEntries(modelsSnap.docs.map(d => [d.id, d.data()]));
      const imageMap = {};
      imagesSnap.docs.forEach(d => {
        const v = d.data();
        if (v.carID) imageMap[v.carID] = v.imageURL;
      });

      const merged = carsSnap.docs.map(d => {
        const c     = { id: d.id, ...d.data() };
        const model = modelMap[c.modelID]  || {};
        const brand = brandMap[model.brandID] || {};
        return {
          ...c,
          modelName: model.modelName || "—",
          brandName: brand.brandName || "—",
          imageURL:  imageMap[d.id] || null,
        };
      });
      setCars(merged);
    } catch (e) { console.error(e); }
    finally { setCarsLoading(false); }
  }, []);

  useEffect(() => { fetchCars(); }, [fetchCars]);

  // carPartTypes — needed to compute each part's photo field key the
  // same way VehicleDocs.jsx does (typeName + partName -> camelCase + "Url").
  useEffect(() => {
    getDocs(collection(db, "carPartTypes")).then(snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data().carPartName || d.id; });
      setPartTypes(map);
    }).catch(console.error);
  }, []);

  // Same slugifier VehicleDocs.jsx uses — must match exactly, or the
  // computed field key won't line up with the URL a driver actually saved.
  const getPartFieldKey = useCallback((part) => {
    const typeName = partTypes[part.carPartTypeID] || "";
    const combined = `${typeName} ${part.carPartName || ""}`.trim();
    return partNameToFieldKey(combined) || partNameToFieldKey(part.carPartName || part.id);
  }, [partTypes]);

  /* ── Load photo docs (read-only) for a booking ──
   * Same collections + "pick most recent" pattern VehicleDocs.jsx uses,
   * just never written to from this page. */
  const loadPhotoDocs = useCallback(async (bookingID) => {
    if (!bookingID) { setBeforePhotoDoc(null); setAfterPhotoDoc(null); return; }
    try {
      const [beforeSnap, afterSnap] = await Promise.all([
        getDocs(query(collection(db, "vehicleDocumentationBeforeTrip"), where("bookingID", "==", bookingID))),
        getDocs(query(collection(db, "vehicleDocumentationAfterTrip"),  where("bookingID", "==", bookingID))),
      ]);
      const pickLatest = (snap) => {
        if (snap.empty) return null;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => toSec(b.updatedAt || b.createdAt) - toSec(a.updatedAt || a.createdAt));
        return docs[0];
      };
      setBeforePhotoDoc(pickLatest(beforeSnap));
      setAfterPhotoDoc(pickLatest(afterSnap));
    } catch (e) {
      console.error("[INV] Failed to load photo docs:", e);
      setBeforePhotoDoc(null); setAfterPhotoDoc(null);
    }
  }, []);

  /* ── Load inventory records for a booking ── */
  const loadInventoryRecords = useCallback(async (bookingID) => {
    if (!bookingID) return;
    setInvLoading(true);
    try {
      const [beforeSnap, afterSnap] = await Promise.all([
        getDocs(query(collection(db, "inventoryBeforeTrip"), where("bookingID", "==", bookingID))),
        getDocs(query(collection(db, "inventoryAfterTrip"),  where("bookingID", "==", bookingID))),
      ]);

      // Each booking has ONE before record and ONE after record (top-level doc)
      // The doc contains damageParts[] and inventoryOverallStatus
      // If multiple docs exist (parts stored as separate docs), pick the most recent
      const pickLatest = (snap) => {
        if (snap.empty) return null;
        // Sort by recordedAt descending, take first group by bookingID
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => toSec(b.recordedAt) - toSec(a.recordedAt));
        return docs[0];
      };

      setBeforeRecord(pickLatest(beforeSnap));
      setAfterRecord(pickLatest(afterSnap));
    } catch (e) {
      console.error("[INV] Failed to load inventory records:", e);
    } finally {
      setInvLoading(false);
    }
  }, []);

  /* ── Toggle + lazy-load a past trip's before/after records ── */
  const toggleHistoryRow = useCallback(async (booking) => {
    const bID = booking.bookingID || booking.id;

    if (expandedHistoryID === bID) {
      setExpandedHistoryID(null);
      return;
    }
    setExpandedHistoryID(bID);

    // Already fetched — don't re-query.
    if (historyRecords[bID] && !historyRecords[bID].loading) return;

    setHistoryRecords(prev => ({ ...prev, [bID]: { loading: true, before: null, after: null, userFullName: null } }));

    try {
      const [beforeSnap, afterSnap, beforePhotoSnap, afterPhotoSnap, detailDoc, userDoc] = await Promise.all([
        getDocs(query(collection(db, "inventoryBeforeTrip"), where("bookingID", "==", bID))),
        getDocs(query(collection(db, "inventoryAfterTrip"),  where("bookingID", "==", bID))),
        getDocs(query(collection(db, "vehicleDocumentationBeforeTrip"), where("bookingID", "==", bID))),
        getDocs(query(collection(db, "vehicleDocumentationAfterTrip"),  where("bookingID", "==", bID))),
        booking.userID ? getDoc(doc(db, "userDetails", booking.userID)) : Promise.resolve(null),
        booking.userID ? getDoc(doc(db, "user", booking.userID)) : Promise.resolve(null),
      ]);

      const pickLatest = (snap, sortField = "recordedAt") => {
        if (snap.empty) return null;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => toSec(b[sortField]) - toSec(a[sortField]));
        return docs[0];
      };

      let userFullName = "—";
      if (detailDoc?.exists()) {
        const { firstName = "", lastName = "" } = detailDoc.data();
        userFullName = [firstName, lastName].filter(Boolean).join(" ").trim() || userFullName;
      }
      if (userFullName === "—" && userDoc?.exists()) {
        const { username = "", email = "" } = userDoc.data();
        userFullName = username || email || "—";
      }

      setHistoryRecords(prev => ({
        ...prev,
        [bID]: {
          loading: false,
          before: pickLatest(beforeSnap),
          after:  pickLatest(afterSnap),
          beforePhoto: pickLatest(beforePhotoSnap, "updatedAt"),
          afterPhoto:  pickLatest(afterPhotoSnap, "updatedAt"),
          userFullName,
        },
      }));
    } catch (e) {
      console.error("[INV] Failed to load history record:", e);
      setHistoryRecords(prev => ({ ...prev, [bID]: { loading: false, before: null, after: null, beforePhoto: null, afterPhoto: null, userFullName: "—" } }));
    }
  }, [expandedHistoryID, historyRecords]);

  /* ── Open a car ── */
  const openCar = useCallback(async (car) => {
    setSelectedCar(car);
    setParts([]);
    setActiveBooking(null);
    setBookingUser(null);
    setBeforeRecord(null);
    setAfterRecord(null);
    setBeforePhotoDoc(null);
    setAfterPhotoDoc(null);
    setBeforeEdits({});
    setAfterEdits({});
    setActiveTab("before");
    setSaveSuccess("");
    setPastBookings([]);
    setExpandedHistoryID(null);
    setHistoryRecords({});

    // Load parts
    setPartsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "carParts"), where("carID", "==", car.id)));
      setParts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setPartsLoading(false); }

    // Load bookings → find the active one
    setBookingLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "bookings"), where("carID", "==", car.id))
      );
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Trust status, not scheduled dates, to decide what's "active" (same
      // logic as VehicleDocs.jsx). "upcoming"/"ongoing" both mean the trip
      // genuinely hasn't wrapped up yet — a late pickup or delayed return
      // whose original startDateTime/endDateTime has already passed is
      // still very much active until it's actually marked
      // completed/cancelled. A prior version of this filter used a date
      // window on top of status, which silently dropped bookings the
      // moment their scheduled dates slipped into the past even though
      // nothing about their real state had changed. Sort by
      // startDateTime only to pick among multiple open bookings for the
      // same car, never to exclude one.
      const upcoming = all
        .filter(b => ["upcoming", "ongoing"].includes(b.status?.toLowerCase()))
        .sort((a, b) => toSec(a.startDateTime) - toSec(b.startDateTime));

      const nearest = upcoming[0] || null;
      setActiveBooking(nearest);

      // Past trips for this car — every other booking that's actually run
      // its course (completed/cancelled/stolen), not the nearest
      // upcoming/ongoing one above. Reuses the same `all` fetch — no extra
      // query needed. Sorted newest-first by startDateTime.
      const nearestID = nearest ? (nearest.bookingID || nearest.id) : null;
      const past = all
        .filter(b => {
          const status = b.status?.toLowerCase();
          const bID = b.bookingID || b.id;
          if (bID === nearestID) return false;
          return ["completed", "cancelled", "stolen"].includes(status);
        })
        .sort((a, b) => toSec(b.startDateTime) - toSec(a.startDateTime));
      setPastBookings(past);

      if (nearest) {
        // Resolve user info for this booking
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
          } catch (e) {
            console.warn("[USER] Could not resolve user:", e);
            setBookingUser(null);
          }
        }

        // Load inventory records + linked photo docs
        const bID = nearest.bookingID || nearest.id;
        await Promise.all([loadInventoryRecords(bID), loadPhotoDocs(bID)]);
      }
    } catch (e) {
      console.error("[BOOKING] fetch error:", e);
    } finally {
      setBookingLoading(false);
    }
  }, [loadInventoryRecords, loadPhotoDocs]);

  /* ── Save Before Trip record ── */
  const saveBeforeTrip = async () => {
    if (!selectedCar || !activeBooking || parts.length === 0) return;
    setSaving(true);
    setSaveSuccess("");

    const bookingID  = activeBooking.bookingID || activeBooking.id;
    const timestamp  = serverTimestamp();

    // Build damageParts list from edits
    const damageParts = parts
      .map(p => ({
        carPartID:   p.id,
        carPartName: p.carPartName || "—",
        serialNumber: p.serialNumber || "—",
        status:       beforeEdits[p.id] !== undefined ? beforeEdits[p.id] : (p.status || "Good"),
      }))
      .filter(p => p.status !== "Good" && p.status !== "New");

    const hasDamage = damageParts.length > 0;
    const overallStatus = hasDamage ? "has damage" : "good";

    try {
      // Upsert: if a record already exists for this booking, update it; else create
      if (beforeRecord?.id) {
        await updateDoc(doc(db, "inventoryBeforeTrip", beforeRecord.id), {
          inventoryOverallStatus: overallStatus,
          damageParts,
          recordedAt: timestamp,
        });
      } else {
        await addDoc(collection(db, "inventoryBeforeTrip"), {
          bookingID,
          carID:                  selectedCar.id,
          inventoryOverallStatus: overallStatus,
          damageParts,
          recordedAt:             timestamp,
        });
      }

      // Damage is now visible directly on this record — no separate
      // self-notification, since the admin filling this form is the same
      // person who'd receive the alert.

      // Reload records
      await loadInventoryRecords(bookingID);
      setBeforeEdits({});
      setSaveSuccess("Before Trip record saved!");
    } catch (e) {
      console.error("[SAVE BEFORE]", e);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveSuccess(""), 3000);
    }
  };

  /* ── Save After Trip record ── */
  const saveAfterTrip = async () => {
    if (!selectedCar || !activeBooking || parts.length === 0) return;
    if (activeBooking.status?.toLowerCase() !== "completed") return;
    setSaving(true);
    setSaveSuccess("");

    const bookingID = activeBooking.bookingID || activeBooking.id;
    const timestamp = serverTimestamp();

    // Build damageParts list
    const damageParts = parts
      .map(p => ({
        carPartID:   p.id,
        carPartName: p.carPartName || "—",
        serialNumber: p.serialNumber || "—",
        status:       afterEdits[p.id] !== undefined ? afterEdits[p.id] : (p.status || "Good"),
      }))
      .filter(p => ["Damaged", "Stolen", "Missing"].includes(p.status));

    const hasDamage = damageParts.length > 0;
    const overallStatus = hasDamage ? "has damage" : "good";

    try {
      if (afterRecord?.id) {
        await updateDoc(doc(db, "inventoryAfterTrip", afterRecord.id), {
          inventoryOverallStatus: overallStatus,
          damageParts,
          recordedAt: timestamp,
        });
      } else {
        await addDoc(collection(db, "inventoryAfterTrip"), {
          bookingID,
          carID:                  selectedCar.id,
          inventoryOverallStatus: overallStatus,
          damageParts,
          recordedAt:             timestamp,
        });
      }

      // Same as before-trip — the record itself is the source of truth,
      // no self-notification for the admin who just entered it.

      await loadInventoryRecords(bookingID);
      setAfterEdits({});
      setSaveSuccess("After Trip record saved!");
    } catch (e) {
      console.error("[SAVE AFTER]", e);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveSuccess(""), 3000);
    }
  };

  /* ── Derived ── */
  const filtered = cars.filter(c => {
    const name = `${c.brandName} ${c.modelName} ${c.platenumber || c.plateNumber || ""}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const carName = selectedCar
    ? `${selectedCar.brandName} ${selectedCar.modelName}`
    : "";

  /* ─────────────────────────────────────────── */
  return (
    <div className="p-4 bg-gray-50">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-arl-dark">Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {carsLoading
              ? "Loading cars…"
              : `${filtered.length} vehicle${filtered.length !== 1 ? "s" : ""} · click a car to view its inventory`}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search car, plate..."
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white w-48"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            {["All", "Active", "Inactive", "Maintenance"].map(s => <option key={s}>{s}</option>)}
          </select>
          <button
            onClick={fetchCars}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-gray-500"
            title="Refresh"
          >↺</button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Car list */}
        <div className={`${selectedCar ? "w-72 shrink-0" : "flex-1"} transition-all duration-300`}>
          {carsLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className={`grid gap-3 ${selectedCar ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
              {filtered.length === 0 && (
                <p className="text-gray-400 text-sm col-span-full text-center py-8">No vehicles found.</p>
              )}
              {filtered.map(car => (
                <CarCard
                  key={car.id}
                  car={car}
                  selected={selectedCar?.id === car.id}
                  compact={!!selectedCar}
                  onClick={() => selectedCar?.id === car.id ? setSelectedCar(null) : openCar(car)}
                />
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
                  <h2 className="font-bold text-arl-dark text-base">{carName}</h2>
                  <p className="text-xs text-gray-400">
                    {selectedCar.platenumber || selectedCar.plateNumber || "—"}
                    {" · "}{selectedCar.year || "—"}
                    {" · "}{selectedCar.bodyType || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-black ${STATUS_STYLE[selectedCar.status] || "bg-gray-50 border border-gray-200"}`}><span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_STYLE[selectedCar.status]?.includes("green") ? "bg-green-500" : STATUS_STYLE[selectedCar.status]?.includes("blue") ? "bg-blue-500" : STATUS_STYLE[selectedCar.status]?.includes("yellow") ? "bg-yellow-400" : STATUS_STYLE[selectedCar.status]?.includes("red") ? "bg-red-500" : STATUS_STYLE[selectedCar.status]?.includes("purple") ? "bg-purple-500" : "bg-gray-400"}`} />
                    {selectedCar.status || "—"}
                  </span>
                  <button
                    onClick={() => setSelectedCar(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >✕</button>
                </div>
              </div>
            </div>

            {/* Booking + Inventory Section */}
            {bookingLoading ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse h-48" />
            ) : !activeBooking ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center">
                <div className="text-3xl mb-2">📋</div>
                <p className="text-sm font-semibold text-gray-500">No upcoming booking for this vehicle</p>
                <p className="text-xs text-gray-400 mt-1">Inventory inspection is tied to bookings. Check back when a booking is upcoming.</p>
              </div>
            ) : (
              <InventoryPanel
                booking={activeBooking}
                bookingUser={bookingUser}
                carName={carName}
                parts={parts}
                partsLoading={partsLoading}
                beforeRecord={beforeRecord}
                afterRecord={afterRecord}
                invLoading={invLoading}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                beforeEdits={beforeEdits}
                setBeforeEdits={setBeforeEdits}
                afterEdits={afterEdits}
                setAfterEdits={setAfterEdits}
                saving={saving}
                saveSuccess={saveSuccess}
                onSaveBefore={saveBeforeTrip}
                onSaveAfter={saveAfterTrip}
                beforePhotoDoc={beforePhotoDoc}
                afterPhotoDoc={afterPhotoDoc}
                getPartFieldKey={getPartFieldKey}
                onViewPhoto={setViewingPhoto}
              />
            )}

            {/* Past Trips — every other completed/cancelled/stolen booking
                for this car. Before/after records are lazy-loaded only
                when a row is expanded, so opening a car with a long
                history doesn't fire N queries up front. */}
            {!bookingLoading && pastBookings.length > 0 && (
              <PastTripsSection
                pastBookings={pastBookings}
                parts={parts}
                expandedHistoryID={expandedHistoryID}
                historyRecords={historyRecords}
                onToggleRow={toggleHistoryRow}
                getPartFieldKey={getPartFieldKey}
                onViewPhoto={setViewingPhoto}
              />
            )}
          </div>
        )}
      </div>

      {viewingPhoto && (
        <PhotoLightbox photo={viewingPhoto} onClose={() => setViewingPhoto(null)} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   INVENTORY PANEL — booking header + Before/After tabs
══════════════════════════════════════════════ */
function InventoryPanel({
  booking, bookingUser, carName,
  parts, partsLoading,
  beforeRecord, afterRecord, invLoading,
  activeTab, setActiveTab,
  beforeEdits, setBeforeEdits,
  afterEdits, setAfterEdits,
  saving, saveSuccess,
  onSaveBefore, onSaveAfter,
  beforePhotoDoc, afterPhotoDoc, getPartFieldKey, onViewPhoto,
}) {
  const bID = booking.bookingID || booking.id;

  const isBeforeTab = activeTab === "before";
  const currentRecord  = isBeforeTab ? beforeRecord : afterRecord;
  const currentEdits   = isBeforeTab ? beforeEdits  : afterEdits;
  const setCurrentEdits = isBeforeTab ? setBeforeEdits : setAfterEdits;
  const onSave         = isBeforeTab ? onSaveBefore : onSaveAfter;
  const currentPhotoDoc = isBeforeTab ? beforePhotoDoc : afterPhotoDoc;

  const hasPendingEdits = Object.keys(currentEdits).length > 0;

  // After Trip is only editable when booking is completed
  const isAfterTripLocked = !isBeforeTab && booking.status?.toLowerCase() !== "completed";

  // Build part list with effective status (edit overrides existing record or carParts status)
  const partRows = parts.map(p => {
    // From saved record (damageParts list)
    const savedEntry = currentRecord?.damageParts?.find(d => d.carPartID === p.id);
    const savedStatus = savedEntry?.status || "Good";
    const effectiveStatus = currentEdits[p.id] !== undefined ? currentEdits[p.id] : savedStatus;
    const photoUrl = currentPhotoDoc?.[getPartFieldKey(p)] || null;
    return { ...p, effectiveStatus, isDirty: currentEdits[p.id] !== undefined, photoUrl };
  });

  const damagedCount = partRows.filter(p => !["Good", "New"].includes(p.effectiveStatus)).length;
  const overallStatus = damagedCount > 0 ? "has damage" : "good";

  return (
    <div className="space-y-4">

      {/* Booking info card */}
      <div className="bg-white rounded-2xl border-2 border-teal-300 ring-1 ring-teal-100 shadow-soft p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🚗</span>
            <h3 className="font-bold text-gray-800 text-sm">
              {booking.status?.toLowerCase() === "ongoing" ? "Active Booking" : "Upcoming Booking"}
            </h3>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${BOOKING_STATUS_STYLE[booking.status?.toLowerCase()] || "bg-gray-50 border border-gray-200"}`}><span className={`w-2 h-2 rounded-full shrink-0 ${BOOKING_STATUS_STYLE[booking.status?.toLowerCase()]?.includes("green") ? "bg-green-500" : BOOKING_STATUS_STYLE[booking.status?.toLowerCase()]?.includes("yellow") ? "bg-yellow-400" : BOOKING_STATUS_STYLE[booking.status?.toLowerCase()]?.includes("blue") ? "bg-blue-500" : BOOKING_STATUS_STYLE[booking.status?.toLowerCase()]?.includes("red") ? "bg-red-500" : "bg-gray-400"}`} />
            {booking.status?.replace("_", " ") || "—"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-600">
          <div className="flex justify-between col-span-2 sm:col-span-1">
            <span className="text-gray-400 font-medium">Booking ID</span>
            <span className="font-mono text-gray-700 truncate max-w-[55%] text-right">{bID}</span>
          </div>
          <div className="flex justify-between col-span-2 sm:col-span-1">
            <span className="text-gray-400 font-medium">Customer</span>
            <span className="text-gray-700 truncate max-w-[55%] text-right">{bookingUser?.fullName || "—"}</span>
          </div>
          <div className="flex justify-between col-span-2 sm:col-span-1">
            <span className="text-gray-400 font-medium">Start Date</span>
            <span className="text-gray-700">{fmtTs(booking.startDateTime)}</span>
          </div>
          <div className="flex justify-between col-span-2 sm:col-span-1">
            <span className="text-gray-400 font-medium">End Date</span>
            <span className="text-gray-700">{fmtTs(booking.endDateTime)}</span>
          </div>
          {booking.location && (
            <div className="flex justify-between col-span-2">
              <span className="text-gray-400 font-medium">Location</span>
              <span className="text-gray-700 truncate max-w-[60%] text-right">{booking.location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Before / After Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">

        {/* Tab bar */}
        <div className="flex bg-gray-50 border-b border-gray-100 p-1 gap-1">
          <TabButton
            active={activeTab === "before"}
            onClick={() => setActiveTab("before")}
            emoji="🔍"
            label="Before Trip"
            badge={beforeRecord ? (beforeRecord.inventoryOverallStatus === "has damage" ? "⚠ Damage" : "✓ Good") : null}
            badgeColor={beforeRecord?.inventoryOverallStatus === "has damage" ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}
          />
          <TabButton
            active={activeTab === "after"}
            onClick={() => setActiveTab("after")}
            emoji="🔎"
            label="After Trip"
            badge={afterRecord ? (afterRecord.inventoryOverallStatus === "has damage" ? "⚠ Damage" : "✓ Good") : null}
            badgeColor={afterRecord?.inventoryOverallStatus === "has damage" ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}
          />
        </div>

        {/* Tab content */}
        <div className="p-5">

          {/* Record metadata */}
          {currentRecord && !invLoading && (
            <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${overallStatus === "has damage" ? "bg-red-500" : "bg-green-500"}`} />
                <p className="text-xs font-semibold text-gray-700 capitalize">
                  Overall: {currentRecord.inventoryOverallStatus}
                </p>
              </div>
              {currentRecord.recordedAt && (
                <p className="text-xs text-gray-400">
                  Last saved: {fmtTs(currentRecord.recordedAt)}
                </p>
              )}
            </div>
          )}

          {invLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : partsLoading ? (
            <div className="h-24 flex items-center justify-center text-gray-400 text-sm">Loading parts…</div>
          ) : parts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">No parts found for this vehicle.</p>
            </div>
          ) : (
            <>
              {/* Instruction banner */}
              <div className={`mb-4 px-3 py-2 rounded-xl text-xs font-medium ${
                isBeforeTab
                  ? "bg-teal-50 text-teal-700 border border-teal-100"
                  : "bg-blue-50 text-blue-700 border border-blue-100"
              }`}>
                {isBeforeTab
                  ? "🔍 Before Trip — Record part conditions BEFORE the customer picks up the car. Damage here triggers a repair task (no charge to customer)."
                  : "🔎 After Trip — Record part conditions AFTER the customer returns the car. Damage here triggers a customer notification for payment."}
              </div>

              {/* Parts table */}
              <div className="rounded-xl border border-gray-100 overflow-hidden mb-4">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "18%" }} />
                  </colgroup>
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left font-semibold">Part Name</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Serial No.</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                      <th className="px-4 py-2.5 text-center font-semibold">Photo</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partRows.map((p, i) => (
                      <tr
                        key={p.id}
                        className={`border-t border-gray-50 hover:bg-gray-50/50 transition-colors ${
                          i % 2 === 1 ? "bg-gray-50/20" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-800 text-xs truncate">
                          {p.carPartName || "—"}
                          {p.isDirty && <span className="ml-1.5 text-[10px] text-amber-500 font-bold">●</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate">
                          {p.serialNumber || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            PART_STATUS_STYLE[p.effectiveStatus] || "bg-gray-100 text-gray-500"
                          }`}>
                            {p.effectiveStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.photoUrl ? (
                            <button
                              onClick={() => onViewPhoto({ url: p.photoUrl, label: p.carPartName || "Part" })}
                              className="text-xs text-teal-600 hover:text-teal-700 font-semibold inline-flex items-center gap-1"
                              title="View photo saved by driver"
                            >
                              📷 View
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300" title="No photo saved for this part yet">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <PartEditDropdown
                            currentStatus={p.effectiveStatus}
                            showStolen={!isBeforeTab}
                            onChange={(s) => setCurrentEdits(prev => ({ ...prev, [p.id]: s }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Damage summary */}
              {damagedCount > 0 && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-xs font-semibold text-red-700 mb-1">
                    ⚠ {damagedCount} damaged / missing part{damagedCount !== 1 ? "s" : ""}
                  </p>
                  <ul className="space-y-0.5">
                    {partRows.filter(p => !["Good", "New"].includes(p.effectiveStatus)).map(p => (
                      <li key={p.id} className="text-xs text-red-600 flex items-center gap-1">
                        <span>·</span>
                        <span>{p.carPartName}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          PART_STATUS_STYLE[p.effectiveStatus] || "bg-gray-100 text-gray-500"
                        }`}>{p.effectiveStatus}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pending edits bar */}
              {hasPendingEdits && (
                <div className="mb-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">⚠️</span>
                    <p className="text-xs font-semibold text-amber-800">
                      {Object.keys(currentEdits).length} unsaved change{Object.keys(currentEdits).length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setCurrentEdits({})}
                    className="text-xs text-amber-600 hover:underline font-semibold"
                  >
                    Discard
                  </button>
                </div>
              )}

              {/* After Trip locked notice */}
              {isAfterTripLocked && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800">
                  <span className="shrink-0">🔒</span>
                  <p>
                    <span className="font-semibold">After Trip is locked.</span> This section can only be edited once the booking status is{" "}
                    <span className="font-bold">Completed</span>. Current status:{" "}
                    <span className="font-bold capitalize">{booking.status?.replace("_", " ") || "—"}</span>.
                  </p>
                </div>
              )}

              {/* Save button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={onSave}
                  disabled={saving || isAfterTripLocked}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    isBeforeTab
                      ? "bg-teal-600 hover:bg-teal-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {saving
                    ? "Saving…"
                    : currentRecord
                      ? `💾 Update ${isBeforeTab ? "Before" : "After"} Trip Record`
                      : `💾 Save ${isBeforeTab ? "Before" : "After"} Trip Record`}
                </button>
                {saveSuccess && (
                  <span className="text-xs text-green-600 font-semibold whitespace-nowrap">
                    ✓ {saveSuccess}
                  </span>
                )}
              </div>

              {/* Notification preview */}
              {damagedCount > 0 && (
                <div className={`mt-3 p-3 rounded-xl text-xs border ${
                  isBeforeTab
                    ? "bg-orange-50 border-orange-100 text-orange-700"
                    : "bg-red-50 border-red-100 text-red-700"
                }`}>
                  <p className="font-semibold mb-1">
                    {isBeforeTab ? "📣 Notification that will be sent:" : "📣 Notifications that will be sent:"}
                  </p>
                  {isBeforeTab ? (
                    <p className="italic">
                      "The car {carName} has damage before trip. Please schedule a repair."
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {partRows.filter(p => ["Damaged", "Stolen", "Missing"].includes(p.effectiveStatus)).map(p => (
                        <li key={p.id} className="italic">
                          "The part {p.carPartName} on {carName} was {p.effectiveStatus === "Stolen" ? "stolen" : "damaged"} by [customer name]. Please contact him/her and arrange payment."
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   PAST TRIPS — collapsed list of past bookings for the selected car;
   click a row to lazy-load and expand that trip's before/after records.
══════════════════════════════════════════════ */
function PastTripsSection({ pastBookings, parts, expandedHistoryID, historyRecords, onToggleRow, getPartFieldKey, onViewPhoto }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <span className="text-base">🕘</span>
        <h3 className="font-bold text-gray-800 text-sm">Past Trips</h3>
        <span className="text-xs text-gray-400">({pastBookings.length})</span>
      </div>

      <div className="divide-y divide-gray-50">
        {pastBookings.map((booking) => {
          const bID = booking.bookingID || booking.id;
          const isExpanded = expandedHistoryID === bID;
          const record = historyRecords[bID];
          const status = booking.status?.toLowerCase();

          return (
            <div key={bID}>
              <button
                onClick={() => onToggleRow(booking)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black shrink-0 ${BOOKING_STATUS_STYLE[status] || "bg-gray-50 border border-gray-200"}`}>
                    {status?.replace("_", " ") || "—"}
                  </span>
                  <span className="text-xs font-mono text-gray-500 truncate">{bID}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {fmtTs(booking.startDateTime)} – {fmtTs(booking.endDateTime)}
                  </span>
                </div>
                <span className={`text-gray-400 text-xs shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4">
                  {!record || record.loading ? (
                    <div className="h-16 flex items-center justify-center text-gray-400 text-xs">Loading trip record…</div>
                  ) : (
                    <PastTripDetail record={record} parts={parts} getPartFieldKey={getPartFieldKey} onViewPhoto={onViewPhoto} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Expanded past-trip detail: own Before/After tab toggle, full
   read-only parts table (all parts, not just damaged ones) — same shape
   as the live InventoryPanel table, minus the Edit column. ── */
function PastTripDetail({ record, parts, getPartFieldKey, onViewPhoto }) {
  const [rowTab, setRowTab] = useState("before");
  const isBeforeTab = rowTab === "before";
  const currentRecord = isBeforeTab ? record.before : record.after;
  const currentPhotoDoc = isBeforeTab ? record.beforePhoto : record.afterPhoto;

  return (
    <div className="space-y-3 pt-1">
      {record.userFullName && record.userFullName !== "—" && (
        <p className="text-xs text-gray-500">Customer: <span className="text-gray-700 font-medium">{record.userFullName}</span></p>
      )}

      <div className="flex bg-gray-50 border border-gray-100 rounded-xl p-1 gap-1 w-fit">
        <button
          onClick={() => setRowTab("before")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isBeforeTab ? "bg-white shadow-sm text-arl-dark" : "text-gray-400 hover:text-gray-600"}`}
        >🔍 Before Trip</button>
        <button
          onClick={() => setRowTab("after")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!isBeforeTab ? "bg-white shadow-sm text-arl-dark" : "text-gray-400 hover:text-gray-600"}`}
        >🔎 After Trip</button>
      </div>

      <HistoryPartsTable record={currentRecord} parts={parts} photoDoc={currentPhotoDoc} getPartFieldKey={getPartFieldKey} onViewPhoto={onViewPhoto} />
    </div>
  );
}

/* ── Full read-only parts table for one past before/after record —
   every part for the car, mirroring the live Before/After Trip table,
   just without the Edit column. ── */
function HistoryPartsTable({ record, parts, photoDoc, getPartFieldKey, onViewPhoto }) {
  if (!record) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
        <p className="text-xs text-gray-400">No record saved for this trip.</p>
      </div>
    );
  }

  const isGood = record.inventoryOverallStatus !== "has damage";
  const partRows = parts.map(p => {
    const savedEntry = record.damageParts?.find(d => d.carPartID === p.id);
    const photoUrl = photoDoc?.[getPartFieldKey(p)] || null;
    return { ...p, effectiveStatus: savedEntry?.status || "Good", photoUrl };
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isGood ? "bg-green-500" : "bg-red-500"}`} />
          <p className="text-xs font-semibold text-gray-700 capitalize">Overall: {record.inventoryOverallStatus}</p>
        </div>
        {record.recordedAt && (
          <p className="text-xs text-gray-400">Recorded: {fmtTs(record.recordedAt)}</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: "38%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2 text-left font-semibold">Part Name</th>
              <th className="px-4 py-2 text-left font-semibold">Serial No.</th>
              <th className="px-4 py-2 text-left font-semibold">Status</th>
              <th className="px-4 py-2 text-center font-semibold">Photo</th>
            </tr>
          </thead>
          <tbody>
            {partRows.map((p, i) => (
              <tr key={p.id} className={`border-t border-gray-50 ${i % 2 === 1 ? "bg-gray-50/20" : ""}`}>
                <td className="px-4 py-2.5 font-medium text-gray-800 text-xs truncate">{p.carPartName || "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500 truncate">{p.serialNumber || "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PART_STATUS_STYLE[p.effectiveStatus] || "bg-gray-100 text-gray-500"}`}>
                    {p.effectiveStatus}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {p.photoUrl ? (
                    <button
                      onClick={() => onViewPhoto({ url: p.photoUrl, label: p.carPartName || "Part" })}
                      className="text-xs text-teal-600 hover:text-teal-700 font-semibold"
                    >
                      📷 View
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Tab Button ── */
function TabButton({ active, onClick, emoji, label, badge, badgeColor }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
        active
          ? "bg-white shadow-sm text-gray-800"
          : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
      }`}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      {badge && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

/* ── Part Edit Dropdown ── */
function PartEditDropdown({ currentStatus, showStolen, onChange }) {
  const statuses = showStolen
    ? ["New", "Good", "Worn", "Damaged", "Missing", "Stolen"]
    : ["New", "Good", "Worn", "Damaged", "Missing"];

  return (
    <select
      value={currentStatus}
      onChange={e => onChange(e.target.value)}
      className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer"
    >
      {statuses.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

/* ══════════════════════════════════════════════
   CAR CARD
══════════════════════════════════════════════ */
function CarCard({ car, selected, compact, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-2xl border transition-all duration-200 shadow-soft hover:shadow-md p-4 ${
        selected ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"
      }`}
    >
      <div className="flex items-center gap-3">
        {car.imageURL ? (
          <img
            src={car.imageURL}
            alt="car"
            className={`rounded-xl object-cover ${compact ? "w-10 h-10" : "w-14 h-14"}`}
          />
        ) : (
          <div className={`rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 ${compact ? "w-10 h-10" : "w-14 h-14"}`}>
            🚗
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm truncate">{car.brandName} {car.modelName}</p>
          <p className="text-xs text-gray-400 truncate">{car.platenumber || car.plateNumber || "—"} · {car.year || "—"}</p>
          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium text-black ${STATUS_STYLE[car.status] || "bg-gray-50 border border-gray-200"}`}><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_STYLE[car.status]?.includes("green") ? "bg-green-500" : STATUS_STYLE[car.status]?.includes("yellow") ? "bg-yellow-400" : "bg-gray-400"}`} />
            {car.status}
          </span>
        </div>
        {selected && (
          <div className="shrink-0 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}

/* ── Photo lightbox — simple click-outside/X-to-close overlay for
   viewing a single part/exterior photo a driver saved in VehicleDocs. ── */
function PhotoLightbox({ photo, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">{photo.label}</p>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >✕</button>
        </div>
        <img src={photo.url} alt={photo.label} className="w-full max-h-[70vh] object-contain bg-gray-50" />
      </div>
    </div>
  );
}