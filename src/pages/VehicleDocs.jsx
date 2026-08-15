import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  collection, getDocs, query, where, doc,
  setDoc, addDoc, updateDoc, serverTimestamp, getDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { initializeApp, getApps } from "firebase/app";
import { db } from "../fireabase";
import { useAuth } from "../context/AuthContext";

const API_URL = process.env.REACT_APP_API_URL;

/* ── Firebase Storage ── */
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

/* ── Fixed exterior views ── */
const EXTERIOR_SLOTS = [
  { key: "frontViewUrl", label: "Front View", icon: "⬆️" },
  { key: "sideViewUrl",  label: "Side View",  icon: "◀️" },
  { key: "backViewUrl",  label: "Back View",  icon: "⬇️" },
];

/* ── Collection & ID field names per trip phase ── */
const PHASE = {
  before: {
    collection: "vehicleDocumentationBeforeTrip",
    idField:    "vehicleDocumentationBeforeTripID",
  },
  after: {
    collection: "vehicleDocumentationAfterTrip",
    idField:    "vehicleDocumentationAfterTripID",
  },
};

/* ── Helpers ── */
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

const fmtDate = (val) => {
  if (!val) return "—";
  const d = val?.toDate?.() || (val?._seconds ? new Date(val._seconds * 1000) : new Date(val));
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
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
  if (typeof val === "string" || val instanceof Date) {
    const ms = new Date(val).getTime();
    return isNaN(ms) ? NaN : ms / 1000;
  }
  if (typeof val?.toDate === "function") return val.toDate().getTime() / 1000;
  return NaN;
};

// Full part-condition palette — Admin/Owner/Supervisor see all of these
// via PartEditDropdown; Drivers only ever see/set Good or Damaged via
// StatusToggle, but existing Worn/Missing/Stolen records still need to
// render correctly for everyone, hence the full map living here.
const PART_STATUS_STYLE = {
  New:     "bg-blue-50 border border-blue-200",
  Good:    "bg-green-50 border border-green-200",
  Damaged: "bg-red-50 border border-red-200",
  Worn:    "bg-yellow-100 text-yellow-700",
  Missing: "bg-gray-200 text-gray-500",
  Stolen:  "bg-purple-50 border border-purple-200",
};

const STATUS_STYLE = {
  Active:      "bg-green-50 border border-green-200",
  Inactive:    "bg-gray-100 text-gray-500",
  Maintenance: "bg-yellow-100 text-yellow-700",
};

const BOOKING_STATUS_STYLE = {
  upcoming:             "bg-yellow-50 border border-yellow-200",
  ongoing:              "bg-green-50 border border-green-200",
  completed:            "bg-blue-50 border border-blue-200",
  cancelled:            "bg-red-100 text-red-600",
  cancellation_request: "bg-orange-100 text-orange-700",
  stolen:               "bg-red-900 text-white",
};

/* ═══════════════════════════════════════════════
   Main Component
═══════════════════════════════════════════════ */
export default function VehicleDocs() {
  const [searchParams] = useSearchParams();
  const navigate        = useNavigate();
  const { user }         = useAuth();
  const isDriver         = user?.role === "Driver";
  const deepLinkCarID    = searchParams.get("carID");
  const deepLinkBookingID = searchParams.get("bookingID");
  const pickupFlow       = searchParams.get("action") === "pickup";
  const returnFlow       = searchParams.get("action") === "return";

  // Whether we're still in the pickup "focus" state — separate from
  // pickupFlow (which reflects the URL) because the driver can back out
  // of the focus/lock UI (Cancel, or switching to After Trip) without us
  // needing to touch the URL/navigate away. Resets whenever a fresh
  // pickup deep link comes in (new carID/action=pickup on this same
  // mounted page, e.g. navigating from one trip's "Start Pickup" to
  // another without a full page reload).
  const [pickupCancelled, setPickupCancelled] = useState(false);
  useEffect(() => { setPickupCancelled(false); }, [pickupFlow, deepLinkCarID]);
  const inPickupMode = pickupFlow && !pickupCancelled;
  const cancelPickupFocus = () => setPickupCancelled(true);

  // Same "focus" pattern as pickup, mirrored for Return — landing here
  // from Car Tracking/My Trips' Return button locks the page onto this
  // car's After Trip photos instead of letting Return silently skip them.
  const [returnCancelled, setReturnCancelled] = useState(false);
  useEffect(() => { setReturnCancelled(false); }, [returnFlow, deepLinkCarID]);
  const inReturnMode = returnFlow && !returnCancelled;
  const cancelReturnFocus = () => setReturnCancelled(true);

  const [cars, setCars]               = useState([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState(null);
  const [carParts, setCarParts]       = useState([]);
  const [partTypes, setPartTypes]     = useState({});
  const [partsLoading, setPartsLoading] = useState(false);

  // Same booking logic as Inventory
  const [activeBooking, setActiveBooking]   = useState(null);
  const [bookingUser, setBookingUser]       = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Active tab: "before" | "after"  — same as Inventory's activeTab
  const [tripType, setTripType] = useState("before");

  // Existing docs per phase (same as Inventory's beforeRecord / afterRecord)
  const [beforeDoc, setBeforeDoc] = useState(null);
  const [afterDoc, setAfterDoc]   = useState(null);

  // Part condition status (Good/Damaged) — same inventoryBeforeTrip/AfterTrip
  // collections Inventory.jsx (admin) reads and writes. Staged locally like
  // photo uploads are, and only committed to Firestore on Save/Save All —
  // never written immediately on toggle.
  const [beforeInv, setBeforeInv]                 = useState(null); // existing record for this booking, or null
  const [afterInv, setAfterInv]                   = useState(null);
  const [beforeStatusEdits, setBeforeStatusEdits] = useState({});   // { carPartID: "Good" | "Damaged" }
  const [afterStatusEdits, setAfterStatusEdits]   = useState({});

  // Past trips — moved over from the old Inventory page. Lazy-loaded per
  // row on expand, same pattern as before.
  const [pastBookings, setPastBookings]         = useState([]);
  // Customer names for the COLLAPSED row header, keyed by bookingID.
  // Previously the collapsed row only had the raw booking ID to show
  // (customer name was fetched lazily per-row on expand, in
  // toggleHistoryRow) — batch-fetched once up front instead so the list
  // reads as names, not gibberish IDs.
  const [pastBookingNames, setPastBookingNames] = useState({});
  const [expandedHistoryID, setExpandedHistoryID] = useState(null);
  const [historyRecords, setHistoryRecords]     = useState({});
  const [viewingPhoto, setViewingPhoto]         = useState(null);
  const [docsLoading, setDocsLoading] = useState(false);

  // Pending file uploads { fieldKey: { file, preview } }
  const [uploads, setUploads]     = useState({});
  const [uploading, setUploading] = useState({});
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [completingPickup, setCompletingPickup] = useState(false);
  const [completingReturn, setCompletingReturn] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ── Load cars + carPartTypes on mount (same as Inventory) ── */
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
        imgsSnap.docs.forEach(d => {
          if (d.data().carID) iMap[d.data().carID] = d.data().imageURL;
        });
        setCars(
          carsSnap.docs.map(d => {
            const c     = { id: d.id, ...d.data() };
            const model = mMap[c.modelID] || {};
            const brand = bMap[model.brandID] || {};
            return {
              ...c,
              label:     `${brand.brandName || ""} ${model.modelName || ""}`.trim() || d.id,
              brandName: brand.brandName || "—",
              modelName: model.modelName || "—",
              imageURL:  iMap[d.id] || null,
            };
          })
        );
      })
      .catch(console.error)
      .finally(() => setCarsLoading(false));

    getDocs(collection(db, "carPartTypes")).then(snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data().carPartName || d.id; });
      setPartTypes(map);
    });
  }, []);

  /* ── Load existing photo docs for a booking (equivalent to Inventory's loadInventoryRecords) ── */
  const loadPhotoDocs = useCallback(async (bookingID) => {
    if (!bookingID) return;
    setDocsLoading(true);
    try {
      const [beforeSnap, afterSnap] = await Promise.all([
        getDocs(query(collection(db, PHASE.before.collection), where("bookingID", "==", bookingID))),
        getDocs(query(collection(db, PHASE.after.collection),  where("bookingID", "==", bookingID))),
      ]);
      // Pick most recent if multiple
      const pickLatest = (snap) => {
        if (snap.empty) return null;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => toSec(b.updatedAt || b.createdAt) - toSec(a.updatedAt || a.createdAt));
        return docs[0];
      };
      setBeforeDoc(pickLatest(beforeSnap));
      setAfterDoc(pickLatest(afterSnap));
    } catch (e) {
      console.error("photo docs fetch error:", e);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  /* ── Load existing part-condition status for this booking ──
   * Same inventoryBeforeTrip/inventoryAfterTrip collections and "pick
   * most recent doc" pattern Inventory.jsx uses, so both sides always
   * agree on which record is current. */
  const loadInventoryStatus = useCallback(async (bookingID) => {
    if (!bookingID) return;
    try {
      const [beforeSnap, afterSnap] = await Promise.all([
        getDocs(query(collection(db, "inventoryBeforeTrip"), where("bookingID", "==", bookingID))),
        getDocs(query(collection(db, "inventoryAfterTrip"),  where("bookingID", "==", bookingID))),
      ]);
      const pickLatest = (snap) => {
        if (snap.empty) return null;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => toSec(b.recordedAt) - toSec(a.recordedAt));
        return docs[0];
      };
      setBeforeInv(pickLatest(beforeSnap));
      setAfterInv(pickLatest(afterSnap));
    } catch (e) {
      console.error("inventory status fetch error:", e);
    }
  }, []);

  /* ── Toggle + lazy-load a past trip's before/after records + photos ── */
  const toggleHistoryRow = useCallback(async (booking) => {
    const bID = booking.bookingID || booking.id;

    if (expandedHistoryID === bID) {
      setExpandedHistoryID(null);
      return;
    }
    setExpandedHistoryID(bID);

    // Already fetched — don't re-query.
    if (historyRecords[bID] && !historyRecords[bID].loading) return;

    setHistoryRecords(prev => ({ ...prev, [bID]: { loading: true, before: null, after: null, beforePhoto: null, afterPhoto: null, userFullName: null } }));

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
      console.error("[VD] Failed to load history record:", e);
      setHistoryRecords(prev => ({ ...prev, [bID]: { loading: false, before: null, after: null, beforePhoto: null, afterPhoto: null, userFullName: "—" } }));
    }
  }, [expandedHistoryID, historyRecords]);

  /* ── Open a car — mirrors Inventory's openCar exactly ── */
  const selectCar = useCallback(async (car, forcedBookingID) => {
    setSelectedCar(car);
    setCarParts([]);
    setActiveBooking(null);
    setBookingUser(null);
    setBeforeDoc(null);
    setAfterDoc(null);
    setBeforeInv(null);
    setAfterInv(null);
    setBeforeStatusEdits({});
    setAfterStatusEdits({});
    setUploads({});
    setTripType("before");
    setPastBookings([]);
    setPastBookingNames({});
    setExpandedHistoryID(null);
    setHistoryRecords({});

    // Load parts
    setPartsLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "carParts"), where("carID", "==", car.carID || car.id))
      );
      setCarParts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setPartsLoading(false); }

    setBookingLoading(true);
    try {
      let target = null;

      if (forcedBookingID) {
        // Came from a specific "Start Pickup" tap on My Trips — go straight
        // to that exact booking instead of guessing. The "nearest booking
        // for this car" heuristic below is fine for Inventory (which has
        // no specific booking in mind), but for a targeted pickup it can
        // pick the wrong doc — e.g. a stale/duplicate "completed" booking
        // for the same car with an earlier start date — which silently
        // hides the Complete Pickup button since that only shows for
        // status "upcoming".
        const snap = await getDoc(doc(db, "bookings", forcedBookingID));
        if (snap.exists()) target = { id: snap.id, ...snap.data() };
      }

      if (!target) {
        // Load bookings → find the active one (SAME logic as Inventory).
        const snap = await getDocs(
          query(collection(db, "bookings"), where("carID", "==", car.carID || car.id))
        );
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Trust status, not scheduled dates, to decide what's "active."
        // "upcoming"/"ongoing" both mean the trip genuinely hasn't wrapped
        // up yet — a late pickup or delayed return whose original
        // startDateTime/endDateTime has already passed is still very much
        // active until it's actually marked completed/cancelled. Sort by
        // startDateTime only to pick among multiple open bookings, never
        // to exclude one.
        const candidates = all
          .filter(b => ["upcoming", "ongoing"].includes(b.status?.toLowerCase()))
          .sort((a, b) => toSec(a.startDateTime) - toSec(b.startDateTime));

        target = candidates[0] || null;

        // Past trips for this car — every booking that's actually run its
        // course, excluding whichever one we just picked as active.
        // Skipped in the forcedBookingID branch above (deep-link "Start
        // Pickup" flow) since there's no `all` list fetched there and the
        // person's focus is completing that one pickup, not browsing history.
        const targetID = target ? (target.bookingID || target.id) : null;
        const past = all
          .filter(b => {
            const status = b.status?.toLowerCase();
            const bID = b.bookingID || b.id;
            if (bID === targetID) return false;
            return ["completed", "cancelled", "stolen"].includes(status);
          })
          .sort((a, b) => toSec(b.startDateTime) - toSec(a.startDateTime));
        setPastBookings(past);

        // Batch-resolve one name per unique customer up front (instead of
        // per-row on expand) so the collapsed list can show "Customer" —
        // not the booking ID — without waiting for a click.
        const uniqueUserIDs = [...new Set(past.map(b => b.userID).filter(Boolean))];
        if (uniqueUserIDs.length) {
          Promise.all(
            uniqueUserIDs.map(async (uid) => {
              try {
                const [detailDoc, userDoc] = await Promise.all([
                  getDoc(doc(db, "userDetails", uid)),
                  getDoc(doc(db, "user", uid)),
                ]);
                const { firstName = "", lastName = "" } = detailDoc.exists() ? detailDoc.data() : {};
                let name = [firstName, lastName].filter(Boolean).join(" ").trim();
                if (!name && userDoc.exists()) {
                  const { username = "", email = "" } = userDoc.data();
                  name = username || email || "";
                }
                return [uid, name || null];
              } catch {
                return [uid, null];
              }
            })
          ).then(entries => {
            const byUser = Object.fromEntries(entries.filter(([, n]) => n));
            const byBooking = {};
            past.forEach(b => {
              const bID = b.bookingID || b.id;
              if (byUser[b.userID]) byBooking[bID] = byUser[b.userID];
            });
            setPastBookingNames(byBooking);
          });
        }
      }

      setActiveBooking(target);

      if (target) {
        // Resolve user info (same as Inventory)
        const userID = target.userID;
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
            setBookingUser(null);
          }
        }

        // Load existing photo docs + part-condition status for this booking
        const bID = target.bookingID || target.id;
        await Promise.all([loadPhotoDocs(bID), loadInventoryStatus(bID)]);
      }
    } catch (e) {
      console.error("booking fetch error:", e);
    } finally {
      setBookingLoading(false);
    }
  }, [loadPhotoDocs, loadInventoryStatus]);

  // ── Deep-link from Car Tracking's Pickup button (?carID=&action=pickup) ──
  // Auto-select the matching car once the cars list has loaded, so staff
  // land straight on the right vehicle's before-trip photos instead of
  // having to find it again in the grid.
  useEffect(() => {
    if (!deepLinkCarID || carsLoading || !cars.length || selectedCar) return;
    const match = cars.find(c => (c.carID || c.id) === deepLinkCarID);
    if (match) selectCar(match, deepLinkBookingID);
  }, [deepLinkCarID, deepLinkBookingID, carsLoading, cars, selectedCar, selectCar]);

  // ── Deep-link from Return (?action=return) — land on After Trip instead
  // of selectCar's default "before" tab. Runs as its own effect (rather
  // than folding into selectCar) because selectCar resets tripType to
  // "before" synchronously on every call, including the one above. ──
  useEffect(() => {
    if (!returnFlow || !selectedCar || !deepLinkCarID) return;
    if ((selectedCar.carID || selectedCar.id) !== deepLinkCarID) return;
    setTripType("after");
  }, [returnFlow, selectedCar, deepLinkCarID]);

  /* ── File pick & upload ──
   * Photos are handed to us straight from the device's file picker /
   * camera. Phone cameras (iPhones especially) often produce HEIC/HEIF
   * files, or a File object whose reported `.type` is empty/wrong. If we
   * upload that as-is, Storage saves it with a Content-Type the browser
   * can't decode in an <img> tag, and it renders as a solid black box
   * instead of erroring — which is exactly what was happening here.
   *
   * Fix: always normalize to a real JPEG client-side (via canvas) before
   * it ever reaches Storage, so what's saved is guaranteed renderable.
   */
  const normalizeToJpeg = async (file) => {
    // Already a normal, browser-decodable image — re-encode is unnecessary,
    // but we still funnel it through canvas so the stored file's
    // Content-Type is always explicit and correct.
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (e) {
      // Browser couldn't decode it natively (classic HEIC/HEIF case on
      // Chrome/Firefox/Edge — only Safari can decode HEIC in-browser).
      throw new Error(
        "This photo format (likely HEIC from an iPhone) can't be processed by this browser. " +
        "On iPhone: Settings → Camera → Formats → set to \"Most Compatible\" so photos save as JPEG, then retake/re-upload."
      );
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("JPEG encode failed"))), "image/jpeg", 0.9)
    );
    return blob;
  };

  const handleFilePick = (fieldKey, file) => {
    if (!file) return;
    setUploads(prev => ({ ...prev, [fieldKey]: { file, preview: URL.createObjectURL(file) } }));
  };

  /* ── Commit staged Good/Damaged edits ──
   * Writes into inventoryBeforeTrip/inventoryAfterTrip — the SAME
   * collections and damageParts[] shape Inventory.jsx (admin) reads and
   * writes — so a driver's check and an admin's edit land in one place,
   * not two disconnected records. Never called on toggle; only from
   * uploadSlot/saveAll, i.e. whenever the person hits Save or Save All.
   */
  const commitStatusEdits = async (bID, editsToCommit) => {
    const keys = Object.keys(editsToCommit);
    if (!keys.length) return;

    const collectionName = tripType === "before" ? "inventoryBeforeTrip" : "inventoryAfterTrip";
    const existingInv     = tripType === "before" ? beforeInv : afterInv;

    // Merge on top of whatever's already recorded so committing one
    // part's status doesn't clobber damage already saved for another.
    const merged = {};
    (existingInv?.damageParts || []).forEach(d => { merged[d.carPartID] = d; });
    carParts.forEach(part => {
      if (editsToCommit[part.id] !== undefined) {
        merged[part.id] = {
          carPartID:    part.id,
          carPartName:  part.carPartName || "—",
          serialNumber: part.serialNumber || "—",
          status:       editsToCommit[part.id],
        };
      }
    });
    // Same convention as Inventory.jsx: only non-Good entries are stored,
    // Good is the implicit default for any part not listed.
    const damageParts  = Object.values(merged).filter(d => d.status !== "Good" && d.status !== "New");
    const overallStatus = damageParts.length > 0 ? "has damage" : "good";

    let savedId = existingInv?.id;
    if (savedId) {
      await updateDoc(doc(db, collectionName, savedId), {
        inventoryOverallStatus: overallStatus,
        damageParts,
        recordedAt: serverTimestamp(),
      });
    } else {
      const newRef = await addDoc(collection(db, collectionName), {
        bookingID:               bID,
        carID:                   selectedCar.carID || selectedCar.id,
        inventoryOverallStatus:  overallStatus,
        damageParts,
        recordedAt:              serverTimestamp(),
      });
      savedId = newRef.id;
    }

    const updatedInv = { id: savedId, bookingID: bID, carID: selectedCar.carID || selectedCar.id, inventoryOverallStatus: overallStatus, damageParts };
    if (tripType === "before") {
      setBeforeInv(updatedInv);
      setBeforeStatusEdits(prev => { const n = { ...prev }; keys.forEach(k => delete n[k]); return n; });
    } else {
      setAfterInv(updatedInv);
      setAfterStatusEdits(prev => { const n = { ...prev }; keys.forEach(k => delete n[k]); return n; });
    }
  };

  const uploadSlot = async (fieldKey) => {
    if (!uploads[fieldKey] || !selectedCar || !activeBooking) return;
    setUploading(prev => ({ ...prev, [fieldKey]: true }));

    const bID    = activeBooking.bookingID || activeBooking.id;
    const phase  = PHASE[tripType];
    const existingDoc = tripType === "before" ? beforeDoc : afterDoc;

    try {
      const { file } = uploads[fieldKey];
      const jpegBlob = await normalizeToJpeg(file);
      const storagePath = `vehicleDocs/${selectedCar.id}/${bID}/${tripType}/${fieldKey}_${Date.now()}.jpg`;
      await uploadBytes(ref(storage, storagePath), jpegBlob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(ref(storage, storagePath));

      let savedDocId;
      if (existingDoc?.id) {
        savedDocId = existingDoc.id;
        await setDoc(
          doc(db, phase.collection, savedDocId),
          { [fieldKey]: url, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } else {
        const newRef = await addDoc(collection(db, phase.collection), {
          bookingID:       bID,
          carID:           selectedCar.carID || selectedCar.id,
          [phase.idField]: "",
          frontViewUrl:    "",
          sideViewUrl:     "",
          backViewUrl:     "",
          [fieldKey]:      url,
          createdAt:       serverTimestamp(),
          updatedAt:       serverTimestamp(),
        });
        savedDocId = newRef.id;
        await setDoc(doc(db, phase.collection, savedDocId), { [phase.idField]: savedDocId }, { merge: true });
      }

      // Update local state
      const updatedDoc = { ...(existingDoc || {}), id: savedDocId, bookingID: bID, carID: selectedCar.carID || selectedCar.id, [fieldKey]: url };
      if (tripType === "before") setBeforeDoc(updatedDoc);
      else setAfterDoc(updatedDoc);

      setUploads(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });

      // Commit any staged Good/Damaged edits together with this save —
      // status is never written on toggle, only here.
      const currentStatusEdits = tripType === "before" ? beforeStatusEdits : afterStatusEdits;
      if (Object.keys(currentStatusEdits).length) {
        await commitStatusEdits(bID, currentStatusEdits);
      }

      showToast(`Photo saved!`);
    } catch (e) {
      console.error(e);
      showToast("Upload failed: " + e.message, "error");
    } finally {
      setUploading(prev => ({ ...prev, [fieldKey]: false }));
    }
  };

  const saveAll = async () => {
    if (!activeBooking) { showToast("No active booking to link photos to.", "error"); return; }
    const pending = Object.keys(uploads);
    const currentStatusEdits = tripType === "before" ? beforeStatusEdits : afterStatusEdits;
    const pendingStatusKeys  = Object.keys(currentStatusEdits);
    // Save All now covers BOTH pending photos and pending Good/Damaged
    // toggles — a driver who only flagged a part as Damaged (no new
    // photo) still needs this button to actually persist it.
    if (!pending.length && !pendingStatusKeys.length) {
      showToast("Nothing to save.", "error");
      return;
    }

    setSaving(true);
    setUploading(prev => { const n = { ...prev }; pending.forEach(k => n[k] = true); return n; });

    const bID    = activeBooking.bookingID || activeBooking.id;
    const phase  = PHASE[tripType];
    // Read the existing doc ONCE, up front — this is the fix. The old
    // version called uploadSlot() once per pending photo in a loop, and
    // every one of those calls shared the same stale beforeDoc/afterDoc
    // closure from the render at click-time. So slot 1 would see "no
    // existing doc" and create one, slot 2 would ALSO see "no existing
    // doc" (its closure never saw slot 1's write) and create a second,
    // separate doc with only its own field, slot 3 a third — three
    // orphaned docs instead of one merged doc, and whichever save
    // finished last is the only one that ended up reflected on screen.
    const existingDoc = tripType === "before" ? beforeDoc : afterDoc;

    try {
      // Upload every pending file to storage in parallel and collect
      // { fieldKey: downloadURL } for all of them before writing anything.
      // (Empty when this Save All run is status-edits-only.)
      if (pending.length) {
        const entries = await Promise.all(pending.map(async (fieldKey) => {
          const { file } = uploads[fieldKey];
          const jpegBlob = await normalizeToJpeg(file);
          const storagePath = `vehicleDocs/${selectedCar.id}/${bID}/${tripType}/${fieldKey}_${Date.now()}.jpg`;
          await uploadBytes(ref(storage, storagePath), jpegBlob, { contentType: "image/jpeg" });
          const url = await getDownloadURL(ref(storage, storagePath));
          return [fieldKey, url];
        }));
        const urlMap = Object.fromEntries(entries);

        let savedDocId;
        if (existingDoc?.id) {
          savedDocId = existingDoc.id;
          await setDoc(
            doc(db, phase.collection, savedDocId),
            { ...urlMap, updatedAt: serverTimestamp() },
            { merge: true }
          );
        } else {
          const newRef = await addDoc(collection(db, phase.collection), {
            bookingID:       bID,
            carID:           selectedCar.carID || selectedCar.id,
            [phase.idField]: "",
            frontViewUrl:    "",
            sideViewUrl:     "",
            backViewUrl:     "",
            ...urlMap,
            createdAt:       serverTimestamp(),
            updatedAt:       serverTimestamp(),
          });
          savedDocId = newRef.id;
          await setDoc(doc(db, phase.collection, savedDocId), { [phase.idField]: savedDocId }, { merge: true });
        }

        // Single state update with ALL saved fields merged in — not one
        // overwrite per photo.
        const updatedDoc = { ...(existingDoc || {}), id: savedDocId, bookingID: bID, carID: selectedCar.carID || selectedCar.id, ...urlMap };
        if (tripType === "before") setBeforeDoc(updatedDoc);
        else setAfterDoc(updatedDoc);

        setUploads({});
      }

      // Commit any staged Good/Damaged edits together with this save.
      if (pendingStatusKeys.length) {
        await commitStatusEdits(bID, currentStatusEdits);
      }

      showToast("All changes saved!");
    } catch (e) {
      console.error(e);
      showToast("Save failed: " + e.message, "error");
    } finally {
      setUploading(prev => { const n = { ...prev }; pending.forEach(k => n[k] = false); return n; });
      setSaving(false);
    }
  };

  const getSlotImage = (fieldKey) => {
    if (uploads[fieldKey]?.preview) return uploads[fieldKey].preview;
    const currentDoc = tripType === "before" ? beforeDoc : afterDoc;
    return currentDoc?.[fieldKey] || null;
  };

  const getPartFieldKey = (part) => {
    const typeName = partTypes[part.carPartTypeID] || "";
    const combined = `${typeName} ${part.carPartName || ""}`.trim();
    return partNameToFieldKey(combined) || partNameToFieldKey(part.carPartName || part.id);
  };

  const bID        = activeBooking ? (activeBooking.bookingID || activeBooking.id) : null;
  const currentDoc = tripType === "before" ? beforeDoc : afterDoc;

  // After Trip used to be locked until the booking was already
  // "completed" (view-only, after the fact). It now also opens up while
  // "ongoing", so After Trip photos can be taken *before* Return —
  // mirroring how Before Trip opens up during "upcoming", before Pickup.
  const isAfterTripLocked = tripType === "after" && !["ongoing", "completed"].includes(activeBooking?.status?.toLowerCase());

  // ── Pickup completion ──────────────────────────────────────────
  // The 3 exterior shots are the only ones marked Required in the UI
  // (part photos are shown but optional) — matches the same rule the
  // backend enforces in booking.service.js's updateBooking, so a booking
  // can't reach "ongoing" without this being true either way.
  const hasRequiredBeforePhotos = !!(beforeDoc?.frontViewUrl && beforeDoc?.sideViewUrl && beforeDoc?.backViewUrl);
  const hasUnsavedUploads       = Object.keys(uploads).length > 0;
  const currentStatusEdits      = tripType === "before" ? beforeStatusEdits : afterStatusEdits;
  const setCurrentStatusEdits   = tripType === "before" ? setBeforeStatusEdits : setAfterStatusEdits;
  const currentInv              = tripType === "before" ? beforeInv : afterInv;
  const hasUnsavedStatusEdits   = Object.keys(currentStatusEdits).length > 0;
  const hasUnsavedChanges       = hasUnsavedUploads || hasUnsavedStatusEdits;
  const pendingChangeCount      = Object.keys(uploads).length + Object.keys(currentStatusEdits).length;
  const canCompletePickup =
    activeBooking?.status?.toLowerCase() === "upcoming" &&
    hasRequiredBeforePhotos &&
    !hasUnsavedChanges;

  // ── Return completion — same required-photos rule as Pickup, mirrored
  // for the after-trip set. Matches the server-side guard in
  // booking.service.js's updateBooking, so a booking can't reach
  // "completed" without this being true either way. ──
  const hasRequiredAfterPhotos = !!(afterDoc?.frontViewUrl && afterDoc?.sideViewUrl && afterDoc?.backViewUrl);
  const canCompleteReturn =
    activeBooking?.status?.toLowerCase() === "ongoing" &&
    hasRequiredAfterPhotos &&
    !hasUnsavedChanges;

  // Good/Damaged effective status per part — saved record, overridden by
  // whatever's staged locally but not yet saved.
  const getEffectivePartStatus = (part) => {
    const savedEntry  = currentInv?.damageParts?.find(d => d.carPartID === part.id);
    const savedStatus = savedEntry?.status || "Good";
    return currentStatusEdits[part.id] !== undefined ? currentStatusEdits[part.id] : savedStatus;
  };

  const handleCompletePickup = async () => {
    if (!activeBooking || !canCompletePickup) return;
    setCompletingPickup(true);
    try {
      // Drivers and staff hit different endpoints here — VehicleDocs is
      // shared between both (staff via Inventory, drivers via My Trips'
      // deep link), but PATCH /api/bookings/:id is role-gated to
      // Supervisor/Admin/Owner only. A Driver hitting it got a 403. The
      // driver-scoped route does an ownership check (this driver actually
      // owns this booking) then calls the exact same underlying
      // updateBooking(...,{status:"ongoing"}) the staff route uses, so
      // behavior is identical either way — just correctly authorized.
      const url = isDriver
        ? `${API_URL}/api/driver-dispatch/my-trips/${activeBooking.id}/pickup`
        : `${API_URL}/api/bookings/${activeBooking.id}`;

      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        ...(isDriver ? {} : { body: JSON.stringify({ status: "ongoing" }) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Pickup failed.");
      showToast("Pickup complete — GPS tracking is now active.");
      setActiveBooking({ ...activeBooking, status: "ongoing" });
      // Only auto-jump if they're still in the guided pickup focus — if
      // they cancelled it, they're back to browsing freely and shouldn't
      // get yanked to another page unexpectedly. Drivers land on My Trips
      // (their own page) rather than Car Tracking, which is staff-only —
      // see pagePermissions.js.
      if (inPickupMode) setTimeout(() => navigate(isDriver ? "/my-trips" : "/car-tracking"), 900);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setCompletingPickup(false);
    }
  };

  const handleCompleteReturn = async () => {
    if (!activeBooking || !canCompleteReturn) return;
    setCompletingReturn(true);
    try {
      // Same driver-vs-staff endpoint split as Pickup — driverReturn()
      // ownership-checks then calls the exact same underlying
      // updateBooking(...,{status:"completed"}) the staff route uses.
      const url = isDriver
        ? `${API_URL}/api/driver-dispatch/my-trips/${activeBooking.id}/return`
        : `${API_URL}/api/bookings/${activeBooking.id}`;

      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        ...(isDriver ? {} : { body: JSON.stringify({ status: "completed" }) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Return failed.");
      showToast("Car marked returned — trip history saved.");
      setActiveBooking({ ...activeBooking, status: "completed" });
      // Only auto-jump back if they're still in the guided return focus —
      // if they cancelled it, they're back to browsing freely.
      if (inReturnMode) setTimeout(() => navigate(isDriver ? "/my-trips" : "/car-tracking"), 900);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setCompletingReturn(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-arl-dark">Vehicle Inspections</h1>
          <p className="text-sm text-gray-400 mt-0.5">Before &amp; after trip photo documentation per booking</p>
        </div>
        {selectedCar && hasUnsavedChanges && (
          <button onClick={saveAll} disabled={saving}
            className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? "Saving…" : `💾 Save ${pendingChangeCount} Change${pendingChangeCount > 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      <div className="flex gap-4">

        {/* Car list — same layout as Inventory */}
        <div className={`${selectedCar ? "w-72 shrink-0" : "flex-1"} transition-all duration-300`}>
          {inPickupMode && selectedCar && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                📍 Pending Pickup Task
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Finish the Before Trip photos for <span className="font-semibold">{selectedCar.label}</span> — other vehicles are locked until this is done.
              </p>
              <button
                onClick={cancelPickupFocus}
                className="text-xs font-semibold text-amber-800 underline hover:text-amber-900 mt-1.5"
              >
                Cancel pickup task
              </button>
            </div>
          )}

          {inReturnMode && selectedCar && (
            <div className="mb-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                📍 Pending Return Task
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Finish the After Trip photos for <span className="font-semibold">{selectedCar.label}</span> — other vehicles are locked until this is done.
              </p>
              <button
                onClick={cancelReturnFocus}
                className="text-xs font-semibold text-blue-800 underline hover:text-blue-900 mt-1.5"
              >
                Cancel return task
              </button>
            </div>
          )}

          {carsLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className={`grid gap-3 ${selectedCar ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
              {cars.length === 0 && (
                <p className="text-gray-400 text-sm col-span-full text-center py-8">No vehicles found.</p>
              )}
              {cars.map(car => {
                const isSelected = selectedCar?.id === car.id;
                const isLockedOut = (inPickupMode || inReturnMode) && !isSelected;
                return (
                <button key={car.id}
                  disabled={isLockedOut}
                  onClick={() => isSelected ? setSelectedCar(null) : selectCar(car)}
                  className={`w-full text-left bg-white rounded-2xl border transition-all duration-200 shadow-soft p-4 ${
                    isLockedOut
                      ? "opacity-40 grayscale cursor-not-allowed border-gray-100"
                      : `hover:shadow-md ${isSelected ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"}`
                  }`}>
                  <div className="flex items-center gap-3">
                    {car.imageURL ? (
                      <img src={car.imageURL} alt="car"
                        className={`rounded-xl object-cover ${selectedCar ? "w-10 h-10" : "w-14 h-14"}`} />
                    ) : (
                      <div className={`rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 ${selectedCar ? "w-10 h-10" : "w-14 h-14"}`}>
                        🚗
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{car.label}</p>
                      <p className="text-xs text-gray-400 truncate">{car.plateNumber || car.platenumber || "—"}</p>
                      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium text-black ${STATUS_STYLE[car.status] || "bg-gray-50 border border-gray-200"}`}><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_STYLE[car.status]?.includes("green") ? "bg-green-500" : "bg-gray-400"}`} />
                        {car.status}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="shrink-0 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              );})}
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
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-black ${STATUS_STYLE[selectedCar.status] || "bg-gray-50 border border-gray-200"}`}><span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_STYLE[selectedCar.status]?.includes("green") ? "bg-green-500" : "bg-gray-400"}`} />
                    {selectedCar.status || "—"}
                  </span>
                  <button onClick={() => setSelectedCar(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                </div>
              </div>
            </div>

            {/* Booking + Docs Section — same structure as Inventory */}
            {bookingLoading || docsLoading ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse h-48" />
            ) : !activeBooking ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center">
                <div className="text-3xl mb-2">📋</div>
                <p className="text-sm font-semibold text-gray-500">No upcoming booking for this vehicle</p>
                <p className="text-xs text-gray-400 mt-1">Photo documentation is tied to bookings. Check back when a booking is approved.</p>
              </div>
            ) : (
              <div className="space-y-4">

                {/* Booking info card — mirrors Inventory's booking card */}
                <div className="bg-white rounded-2xl border-2 border-teal-300 ring-1 ring-teal-100 shadow-soft p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🚗</span>
                      <h3 className="font-bold text-gray-800 text-sm">
                        {activeBooking.status?.toLowerCase() === "ongoing" ? "Active Booking" : "Upcoming Booking"}
                      </h3>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${BOOKING_STATUS_STYLE[activeBooking.status?.toLowerCase()] || "bg-gray-50 border border-gray-200"}`}><span className={`w-2 h-2 rounded-full shrink-0 ${BOOKING_STATUS_STYLE[activeBooking.status?.toLowerCase()]?.includes("green") ? "bg-green-500" : BOOKING_STATUS_STYLE[activeBooking.status?.toLowerCase()]?.includes("yellow") ? "bg-yellow-400" : BOOKING_STATUS_STYLE[activeBooking.status?.toLowerCase()]?.includes("blue") ? "bg-blue-500" : BOOKING_STATUS_STYLE[activeBooking.status?.toLowerCase()]?.includes("red") ? "bg-red-500" : "bg-gray-400"}`} />
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
                  <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-2">
                    📌 Photos will be linked to Booking ID: <span className="font-mono text-gray-600">{bID}</span>
                  </p>
                </div>

                {/* Before / After Tabs — same as Inventory */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
                  {/* Tab bar */}
                  <div className="flex bg-gray-50 border-b border-gray-100 p-1 gap-1">
                    <TabButton
                      active={tripType === "before"}
                      onClick={() => {
                        // Switching away from After Trip mid-return counts as
                        // backing out of the focused return task — same as
                        // hitting Cancel, just via a different door.
                        if (inReturnMode) cancelReturnFocus();
                        setTripType("before");
                        setUploads({});
                      }}
                      emoji="🚀"
                      label="Before Trip"
                      badge={beforeDoc ? "✓ Has Photos" : null}
                      badgeColor="bg-teal-100 text-teal-700"
                      dimmed={inReturnMode}
                    />
                    <TabButton
                      active={tripType === "after"}
                      onClick={() => {
                        // Switching away from Before Trip mid-pickup counts as
                        // backing out of the focused pickup task — same as
                        // hitting Cancel, just via a different door.
                        if (inPickupMode) cancelPickupFocus();
                        setTripType("after");
                        setUploads({});
                      }}
                      emoji="🏁"
                      label="After Trip"
                      badge={afterDoc ? "✓ Has Photos" : null}
                      badgeColor="bg-blue-100 text-blue-700"
                      dimmed={inPickupMode}
                    />
                  </div>

                  {/* Tab content */}
                  <div className="p-5 space-y-5">

                    {/* Instruction banner */}
                    <div className={`px-3 py-2 rounded-xl text-xs font-medium ${
                      tripType === "before"
                        ? "bg-teal-50 text-teal-700 border border-teal-100"
                        : "bg-blue-50 text-blue-700 border border-blue-100"
                    }`}>
                      {tripType === "before"
                        ? "🚀 Before Trip — Take photos of the vehicle BEFORE the customer picks it up. Documents its condition at the start."
                        : "🏁 After Trip — Take photos AFTER the customer returns the vehicle. Documents any new damage or changes."}
                    </div>

                    {/* After trip locked notice */}
                    {isAfterTripLocked && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800">
                        <span className="shrink-0">🔒</span>
                        <p>
                          <span className="font-semibold">After Trip is locked.</span> Photos can only be added once the trip is{" "}
                          <span className="font-bold">picked up</span>. Current status:{" "}
                          <span className="font-bold capitalize">{activeBooking.status?.replace("_", " ") || "—"}</span>.
                        </p>
                      </div>
                    )}

                    {/* Pickup gate — landed here from Car Tracking's Pickup button, or
                        the booking just hasn't been picked up yet either way */}
                    {tripType === "before" && activeBooking.status?.toLowerCase() === "upcoming" && (
                      <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${
                        canCompletePickup ? "bg-green-50 border border-green-200 text-green-800" : "bg-blue-50 border border-blue-200 text-blue-800"
                      }`}>
                        <span className="shrink-0">{canCompletePickup ? "✅" : "📋"}</span>
                        <p>
                          {canCompletePickup ? (
                            <>Front, side, and back photos are all in — this trip is ready for pickup.</>
                          ) : (
                            <>
                              <span className="font-semibold">Pickup requires vehicle documentation first.</span>{" "}
                              Fill in the front, side, and back view photos below, then Save, before this car can be marked picked up.
                            </>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Return gate — landed here from Car Tracking/My Trips' Return
                        button, or the booking is ongoing and hasn't been returned yet
                        either way. Mirrors the Pickup gate above exactly. */}
                    {tripType === "after" && activeBooking.status?.toLowerCase() === "ongoing" && (
                      <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${
                        canCompleteReturn ? "bg-green-50 border border-green-200 text-green-800" : "bg-blue-50 border border-blue-200 text-blue-800"
                      }`}>
                        <span className="shrink-0">{canCompleteReturn ? "✅" : "📋"}</span>
                        <p>
                          {canCompleteReturn ? (
                            <>Front, side, and back photos are all in — this trip is ready to be marked returned.</>
                          ) : (
                            <>
                              <span className="font-semibold">Return requires vehicle documentation first.</span>{" "}
                              Fill in the front, side, and back view photos below, then Save, before this car can be marked returned.
                            </>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Last saved */}
                    {currentDoc?.updatedAt && (
                      <p className="text-xs text-gray-400">Last saved: {fmtDate(currentDoc.updatedAt)}</p>
                    )}

                    {!isAfterTripLocked && (
                      <>
                        {/* Exterior Views */}
                        <SectionTitle title="Exterior Views (Required)" />
                        <div className="grid grid-cols-3 gap-4">
                          {EXTERIOR_SLOTS.map(slot => (
                            <PhotoSlot key={slot.key} fieldKey={slot.key} label={slot.label} icon={slot.icon}
                              image={getSlotImage(slot.key)} uploading={uploading[slot.key]} isPending={!!uploads[slot.key]}
                              onFilePick={f => handleFilePick(slot.key, f)} onUpload={() => uploadSlot(slot.key)} required />
                          ))}
                        </div>

                        {/* Complete Pickup */}
                        {tripType === "before" && activeBooking.status?.toLowerCase() === "upcoming" && (
                          <button
                            onClick={handleCompletePickup}
                            disabled={!canCompletePickup || completingPickup}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                              canCompletePickup
                                ? "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.99]"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            }`}
                          >
                            {completingPickup
                              ? "Marking picked up…"
                              : canCompletePickup
                                ? "▶  Complete Pickup"
                                : hasUnsavedChanges
                                  ? "Save changes to continue"
                                  : "Complete required photos to continue"}
                          </button>
                        )}

                        {/* Complete Return */}
                        {tripType === "after" && activeBooking.status?.toLowerCase() === "ongoing" && (
                          <button
                            onClick={handleCompleteReturn}
                            disabled={!canCompleteReturn || completingReturn}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                              canCompleteReturn
                                ? "bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.99]"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            }`}
                          >
                            {completingReturn
                              ? "Marking returned…"
                              : canCompleteReturn
                                ? "🏁  Complete Return"
                                : hasUnsavedChanges
                                  ? "Save changes to continue"
                                  : "Complete required photos to continue"}
                          </button>
                        )}

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
                                const effectiveStatus = getEffectivePartStatus(part);
                                return (
                                  <div key={part.id} className="space-y-1.5">
                                    <PhotoSlot fieldKey={fieldKey} label={part.carPartName || "Part"}
                                      sub={partTypes[part.carPartTypeID] || ""} image={getSlotImage(fieldKey)}
                                      uploading={uploading[fieldKey]} isPending={!!uploads[fieldKey]}
                                      onFilePick={f => handleFilePick(fieldKey, f)} onUpload={() => uploadSlot(fieldKey)} />
                                    {isDriver ? (
                                      <StatusToggle
                                        status={effectiveStatus}
                                        isDirty={currentStatusEdits[part.id] !== undefined}
                                        onChange={(s) => setCurrentStatusEdits(prev => ({ ...prev, [part.id]: s }))}
                                      />
                                    ) : (
                                      <div className="flex items-center justify-between gap-1.5">
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                          PART_STATUS_STYLE[effectiveStatus] || "bg-gray-100 text-gray-500"
                                        }`}>
                                          {effectiveStatus}
                                        </span>
                                        <PartEditDropdown
                                          currentStatus={effectiveStatus}
                                          showStolen={tripType === "after"}
                                          onChange={(s) => setCurrentStatusEdits(prev => ({ ...prev, [part.id]: s }))}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
                            🔧 No parts found in inventory for this vehicle.
                          </div>
                        )}

                        {/* Pending changes bar — photos and/or Good/Damaged toggles, whichever's staged */}
                        {hasUnsavedChanges && (
                          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">⚠️</span>
                              <p className="text-xs font-semibold text-amber-800">
                                {pendingChangeCount} unsaved change{pendingChangeCount !== 1 ? "s" : ""}
                                {hasUnsavedUploads && hasUnsavedStatusEdits ? " (photos + status)" : hasUnsavedStatusEdits ? " (status)" : ""}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setUploads({}); setCurrentStatusEdits({}); }}
                                className="text-xs text-amber-600 hover:underline font-semibold">Discard</button>
                              <button onClick={saveAll} disabled={saving}
                                className="text-xs bg-teal-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50">
                                {saving ? "Saving…" : "Save All ↑"}
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

            {/* Past Trips — shown regardless of whether there's a current
                active booking, since history persists independent of that. */}
            {!bookingLoading && pastBookings.length > 0 && (
              <PastTripsSection
                pastBookings={pastBookings}
                pastBookingNames={pastBookingNames}
                parts={carParts}
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

function SectionTitle({ title }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wider">{title}</h2>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function TabButton({ active, onClick, emoji, label, badge, badgeColor, dimmed }) {
  return (
    <button onClick={onClick}
      title={dimmed ? "Switching here will cancel the pending pickup/return task" : undefined}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
        active ? "bg-white shadow-sm text-gray-800" : dimmed ? "text-gray-300 hover:text-gray-500" : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
      }`}>
      <span className={dimmed && !active ? "opacity-40" : ""}>{emoji}</span>
      <span>{label}</span>
      {badge && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
      )}
    </button>
  );
}

/* ── Good/Damaged part-condition toggle ──
 * Purely local until Save/Save All commits it (see commitStatusEdits) —
 * clicking this never writes to Firestore by itself. */
function StatusToggle({ status, isDirty, onChange }) {
  const isDamaged = status === "Damaged";
  return (
    <div className="relative">
      <div className="flex rounded-lg border border-gray-100 overflow-hidden text-[11px] font-semibold">
        <button
          type="button"
          onClick={() => onChange("Good")}
          className={`flex-1 py-1 transition-colors ${
            !isDamaged ? "bg-green-50 text-green-700" : "bg-white text-gray-400 hover:bg-gray-50"
          }`}
        >
          ✓ Good
        </button>
        <button
          type="button"
          onClick={() => onChange("Damaged")}
          className={`flex-1 py-1 border-l border-gray-100 transition-colors ${
            isDamaged ? "bg-red-50 text-red-700" : "bg-white text-gray-400 hover:bg-gray-50"
          }`}
        >
          ⚠ Damaged
        </button>
      </div>
      {isDirty && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" title="Unsaved" />
      )}
    </div>
  );
}

/* ── Admin/Owner/Supervisor's full status dropdown — same control the
 * old Inventory.jsx used. Drivers never see this; StatusToggle above is
 * their equivalent, deliberately limited to Good/Damaged. ── */
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

function PhotoSlot({ fieldKey, label, sub, icon, image, uploading, isPending, onFilePick, onUpload, required }) {
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
              {icon ? <span className="text-2xl">{icon}</span> : (
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
            className="mt-1.5 w-full py-1 text-xs bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50">
            {uploading ? "Uploading…" : "Save ↑"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Past Trips — moved over from the old Inventory page. Lazy-loads
 * each row's before/after status + photo docs only when expanded. ── */
function PastTripsSection({ pastBookings, pastBookingNames, parts, expandedHistoryID, historyRecords, onToggleRow, getPartFieldKey, onViewPhoto }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <span className="text-base">🕘</span>
        <h3 className="font-bold text-gray-800 text-sm">Past Trips</h3>
        <span className="text-xs text-gray-400">({pastBookings.length})</span>
      </div>

      {/* Column header — same grid template as each row below it (108px
          status / flexible name / 180px dates / 16px chevron gutter) so
          the labels line up exactly instead of floating disconnected
          from what they're labeling. */}
      {pastBookings.length > 0 && (
        <div className="grid grid-cols-[108px_minmax(0,1fr)_180px_16px] gap-4 px-5 py-2 border-b border-gray-100 bg-gray-50/50">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Customer</span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-right">Trip Dates</span>
          <span />
        </div>
      )}

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
                className="w-full grid grid-cols-[108px_minmax(0,1fr)_180px_16px] items-center gap-4 px-5 py-2.5 hover:bg-gray-50/60 transition-colors text-left"
              >
                <span className={`inline-flex items-center justify-center text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize text-black ${BOOKING_STATUS_STYLE[status] || "bg-gray-50 border border-gray-200"}`}>
                  {status?.replace("_", " ") || "—"}
                </span>

                {/* Customer name is what staff actually want to scan for
                    here — the raw booking ID used to sit in this slot
                    instead. Falls back to the ID only while the name is
                    still resolving or has no user on file. */}
                <span className="min-w-0 flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-gray-700 truncate">
                    {pastBookingNames[bID] || bID}
                  </span>
                  {pastBookingNames[bID] && (
                    <span className="hidden lg:inline text-[10px] font-mono text-gray-300 truncate">{bID}</span>
                  )}
                </span>

                <span className="text-xs text-gray-400 text-right tabular-nums whitespace-nowrap">
                  {fmtDateShort(booking.startDateTime)} – {fmtDateShort(booking.endDateTime)}
                </span>

                <span className={`text-gray-400 text-xs justify-self-end transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
              </button>

              {isExpanded && (
                <div className="px-5 pb-3.5">
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
   read-only parts table (all parts, not just damaged ones). ── */
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
   just without an edit control. ──
   NOTE: `record` (inventoryBeforeTrip/AfterTrip) and `photoDoc`
   (vehicleDocumentationBeforeTrip/AfterTrip) are two SEPARATE Firestore
   docs, only written together when a driver actually flags a part as
   Damaged (see commitStatusEdits, only called when there are pending
   status edits). A trip where every part stayed "Good" — the common
   case — saves photos but never creates an inventory doc. This used to
   bail out to "No record saved for this trip" on `!record` alone,
   which silently hid photos that WERE saved. Now it only bails when
   there's truly nothing (no inventory record AND no photos of any kind). */
function HistoryPartsTable({ record, parts, photoDoc, getPartFieldKey, onViewPhoto }) {
  const hasExteriorPhoto = !!(photoDoc?.frontViewUrl || photoDoc?.sideViewUrl || photoDoc?.backViewUrl);
  const hasPartPhoto = photoDoc ? parts.some(p => !!photoDoc[getPartFieldKey(p)]) : false;
  const hasAnyPhoto = hasExteriorPhoto || hasPartPhoto;

  if (!record && !hasAnyPhoto) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
        <p className="text-xs text-gray-400">No record saved for this trip.</p>
      </div>
    );
  }

  const isGood = !record || record.inventoryOverallStatus !== "has damage";
  const partRows = parts.map(p => {
    const savedEntry = record?.damageParts?.find(d => d.carPartID === p.id);
    const photoUrl = photoDoc?.[getPartFieldKey(p)] || null;
    return { ...p, effectiveStatus: savedEntry?.status || "Good", photoUrl };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isGood ? "bg-green-500" : "bg-red-500"}`} />
          <p className="text-xs font-semibold text-gray-700 capitalize">
            {record ? `Overall: ${record.inventoryOverallStatus}` : "No damage flagged (parts assumed good — no inventory report was filed)"}
          </p>
        </div>
        {record?.recordedAt && (
          <p className="text-xs text-gray-400">Recorded: {fmtDateShort(record.recordedAt)}</p>
        )}
      </div>

      {/* Exterior shots (front/side/back) — these are the required photos
          taken every trip, but were previously never shown in history at
          all, only per-part photos were. */}
      {hasExteriorPhoto ? (
        <div className="grid grid-cols-3 gap-2">
          {EXTERIOR_SLOTS.map(slot => {
            const url = photoDoc?.[slot.key];
            if (!url) {
              return (
                <div key={slot.key} className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-center">
                  <p className="text-[10px] text-gray-300">{slot.label} — not taken</p>
                </div>
              );
            }
            return (
              <button
                key={slot.key}
                onClick={() => onViewPhoto({ url, label: slot.label })}
                className="rounded-xl border border-gray-100 overflow-hidden hover:ring-2 hover:ring-teal-300 transition-all"
              >
                <img src={url} alt={slot.label} className="w-full h-20 object-cover" />
                <p className="text-[10px] text-gray-500 py-1">{slot.icon} {slot.label}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No exterior photos saved for this trip.</p>
      )}

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

/* ── Photo lightbox — click-outside/X-to-close overlay for viewing a
   single part/exterior photo, used from the Past Trips history view. ── */
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