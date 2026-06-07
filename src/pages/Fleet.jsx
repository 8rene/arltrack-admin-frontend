import { useState, useEffect, useCallback } from "react";
import { useCurrency } from "../context/CurrencyContext";
import {
  collection, getDocs, query, where, orderBy, doc, updateDoc,
  addDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../fireabase";

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const Icons = {
  Car: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 11l2-4h10l2 4M3 11h18v8H3v-8zm4 8v2m10-2v2" />
      <circle cx="7.5" cy="15" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="16.5" cy="15" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  Refresh: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Plus: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Tag: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  Trash: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  ),
  Edit: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Close: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  ChevronDown: (props) => (
    <svg {...props} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.25 4.42a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
    </svg>
  ),
  Camera: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Calendar: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  AlertTriangle: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Brands: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32" />
    </svg>
  ),
  ArrowRight: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
};

const STATUS_STYLE = {
  Active:      "bg-green-50 border border-green-200 text-black",
  Rented:      "bg-blue-50 border border-blue-200 text-black",
  Reserved:    "bg-orange-50 border border-orange-200 text-black",
  Maintenance: "bg-red-50 border border-red-200 text-black",
};

const STATUS_DOT_FLEET = {
  Active:      "bg-green-500",
  Rented:      "bg-blue-500",
  Reserved:    "bg-orange-100 text-orange-700",
  Maintenance: "bg-red-100 text-red-600",
};

// Sort pricing: 12 Hours always last
function sortPricing(pricing) {
  return [...(pricing || [])].sort((a, b) => {
    const aIs12 = a.durationType?.toLowerCase().includes("12");
    const bIs12 = b.durationType?.toLowerCase().includes("12");
    if (aIs12 && !bIs12) return 1;
    if (!aIs12 && bIs12) return -1;
    return 0;
  });
}

function fmtDate(val) {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Fleet() {
  const { fmt } = useCurrency();
  const [cars, setCars]           = useState([]);
  const [brands, setBrands]       = useState([]);
  const [models, setModels]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilter] = useState("All");
  const [detailCar, setDetailCar] = useState(null);
  const [editCar, setEditCar]     = useState(null);
  const [showAddCar, setShowAddCar] = useState(false);
  const [showManageBrands, setShowManageBrands] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleDeleteCar = async (car) => {
    try {
      await deleteDoc(doc(db, "cars", car.id));
      const imgSnap = await getDocs(query(collection(db, "carImages"), where("carID", "==", car.id)));
      for (const d of imgSnap.docs) await deleteDoc(d.ref);
      const priceSnap = await getDocs(query(collection(db, "carPricing"), where("carID", "==", car.id)));
      for (const d of priceSnap.docs) await deleteDoc(d.ref);
      setConfirmDelete(null);
      fetchAll();
    } catch (e) { console.error("Delete car error:", e); }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [carsSnap, imgSnap, priceSnap, brandSnap, modelSnap] = await Promise.all([
        getDocs(collection(db, "cars")),
        getDocs(collection(db, "carImages")),
        getDocs(collection(db, "carPricing")),
        getDocs(collection(db, "brand")),
        getDocs(collection(db, "model")),
      ]);

      const imgMap = {};
      imgSnap.docs.forEach(d => {
        const { carID, imageURL, isPrimary } = d.data();
        if (!imgMap[carID] || isPrimary) imgMap[carID] = imageURL;
      });

      const priceMap = {};
      priceSnap.docs.forEach(d => {
        const { carID, price, durationType } = d.data();
        if (!priceMap[carID]) priceMap[carID] = [];
        priceMap[carID].push({ id: d.id, price, durationType });
      });

      const brandList = brandSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const modelList = modelSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const brandMap  = Object.fromEntries(brandList.map(b => [b.id, b.brandName]));
      const modelMap  = Object.fromEntries(modelList.map(m => [m.id, m.modelName]));

      setBrands(brandList);
      setModels(modelList);

      const merged = carsSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        imageURL:  imgMap[d.id] || null,
        pricing:   sortPricing(priceMap[d.id] || []),
        brandName: brandMap[d.data().brandID] || "—",
        modelName: modelMap[d.data().modelID] || "—",
      }));

      setCars(merged);
    } catch (e) {
      console.error("Fleet fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const statuses = ["All", "Active", "Rented", "Reserved", "Maintenance"];
  const filtered = cars.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      (c.brandName || "").toLowerCase().includes(q) ||
      (c.modelName || "").toLowerCase().includes(q) ||
      (c.platenumber || c.plateNumber || "").toLowerCase().includes(q) ||
      (c.shortDescription || "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "All" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const counts = statuses.reduce((acc, s) => {
    acc[s] = s === "All" ? cars.length : cars.filter(c => c.status === s).length;
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-5 font-sans">
      {/* TOP BAR */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Fleet Manager</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search vehicle..."
            className="px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-400 w-52"
          />
          <button onClick={() => setShowManageBrands(true)}
            className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            <Icons.Tag className="w-4 h-4" />
            Brands & Models
          </button>
          <button onClick={fetchAll}
            className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            <Icons.Refresh className="w-4 h-4" />
            Refresh
          </button>
          <button onClick={() => setShowAddCar(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700">
            <Icons.Plus className="w-4 h-4" />
            Add Vehicle
          </button>
        </div>
      </div>

      {/* STATUS TABS */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filterStatus === s ? "bg-teal-600 text-white shadow" : "bg-white border text-gray-600 hover:bg-gray-50"
            }`}>
            {s} <span className="ml-1 opacity-70">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* GRID */}
      {loading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-2xl border h-72 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-20">No vehicles found.</div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {filtered.map(car => (
            <VehicleCard key={car.id} car={car}
              onViewDetails={() => setDetailCar(car)}
              onEdit={() => setEditCar(car)}
              onDelete={() => setConfirmDelete(car)}
              onStatusChange={(id, st) => setCars(prev => prev.map(c => c.id === id ? { ...c, status: st } : c))} />
          ))}
        </div>
      )}

      {/* MODALS */}
      {detailCar && (
        <ViewDetailsModal car={detailCar} onClose={() => setDetailCar(null)}
          onEdit={() => { setDetailCar(null); setEditCar(detailCar); }} />
      )}
      {editCar && (
        <EditCarModal car={editCar} brands={brands} models={models}
          onClose={() => setEditCar(null)}
          onSaved={() => { setEditCar(null); fetchAll(); }} />
      )}
      {showAddCar && (
        <AddCarModal brands={brands} models={models}
          onClose={() => setShowAddCar(false)}
          onSaved={() => { setShowAddCar(false); fetchAll(); }} />
      )}
      {showManageBrands && (
        <ManageBrandsModal brands={brands} models={models}
          onClose={() => setShowManageBrands(false)}
          onSaved={() => { setShowManageBrands(false); fetchAll(); }} />
      )}
      {confirmDelete && (
        <ConfirmDeleteModal
          message={`Delete ${confirmDelete.brandName || ""} ${confirmDelete.modelName || ""}? This will also remove its images and pricing.`}
          onConfirm={() => handleDeleteCar(confirmDelete)}
          onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

// ─── VEHICLE CARD ─────────────────────────────────────────────────────────────
function VehicleCard({ car, onViewDetails, onEdit, onDelete, onStatusChange }) {
  const { fmt } = useCurrency();
  const [nearestBooking, setNearestBooking] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const CAR_STATUSES = ["Active", "Rented", "Reserved", "Maintenance"];

  useEffect(() => {
    if (car.status === "Rented" || car.status === "Reserved") {
      const now = new Date();
      getDocs(query(
        collection(db, "bookings"),
        where("carID", "==", car.id),
        where("status", "==", "approved")
      )).then(snap => {
        const future = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => {
            const end = b.endDateTime?.toDate ? b.endDateTime.toDate() : new Date(b.endDateTime);
            return end >= now;
          })
          .sort((a, b) => {
            const aD = a.startDateTime?.toDate ? a.startDateTime.toDate() : new Date(a.startDateTime);
            const bD = b.startDateTime?.toDate ? b.startDateTime.toDate() : new Date(b.startDateTime);
            return aD - bD;
          });
        setNearestBooking(future[0] || null);
      }).catch(() => {});
    }
  }, [car.id, car.status]);

  const handleStatusChange = async (newStatus) => {
    if (newStatus === car.status) { setStatusOpen(false); return; }
    setStatusSaving(true);
    try {
      await updateDoc(doc(db, "cars", car.id), { status: newStatus });
      onStatusChange?.(car.id, newStatus);
    } catch (e) { console.error(e); }
    finally { setStatusSaving(false); setStatusOpen(false); }
  };

  const basePrice = car.pricing?.find(p =>
    !p.durationType?.toLowerCase().includes("12")
  ) || car.pricing?.[0];

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col">
      {/* IMAGE */}
      <div className="relative h-44 bg-gray-100 overflow-hidden">
        {car.imageURL ? (
          <img src={car.imageURL} alt={`${car.brandName} ${car.modelName}`}
            className="w-full h-full object-cover"
            onError={e => { e.target.style.display = "none"; }} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300">
            <Icons.Car className="w-16 h-16" />
          </div>
        )}
        {/* Status badge — click to change */}
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); setStatusOpen((v) => !v); }}
            disabled={statusSaving}
            className={`px-3 py-1 text-xs rounded-full font-semibold flex items-center gap-1 transition-opacity ${STATUS_STYLE[car.status] || "bg-gray-100 text-gray-600"} hover:opacity-80`}
          >
            {statusSaving ? "…" : car.status}
            <Icons.ChevronDown className="w-3 h-3" />
          </button>
          {statusOpen && (
            <div className="absolute right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden z-20 min-w-[130px]">
              {CAR_STATUSES.map((s) => (
                <button key={s} onClick={(e) => { e.stopPropagation(); handleStatusChange(s); }}
                  className={`w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors ${s === car.status ? "opacity-50 cursor-default" : ""}`}>
                  <span className={`w-2 h-2 rounded-full ${
                    s === "Active"      ? "bg-green-500" :
                    s === "Rented"      ? "bg-blue-500"  :
                    s === "Reserved"    ? "bg-orange-500":
                    "bg-red-500"
                  }`}/>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BODY */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Brand + Model as title */}
        <div>
          <h3 className="font-bold text-gray-800 text-base leading-tight">
            {car.brandName} {car.modelName}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{car.bodyType || "—"} · {car.year || "—"}</p>
          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-md mt-1 inline-block text-gray-600">
            {car.platenumber || car.plateNumber || "—"}
          </span>
        </div>

        {/* Short Description */}
        {car.shortDescription && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{car.shortDescription}</p>
        )}

        {/* Specs */}
        <div className="grid grid-cols-3 text-xs text-center border-t border-b py-2">
          <div><p className="text-gray-400">Seats</p><p className="font-semibold text-gray-700">{car.seatingCapacity || "—"}</p></div>
          <div><p className="text-gray-400">Fuel</p><p className="font-semibold text-gray-700">{car.fuelType || "—"}</p></div>
          <div><p className="text-gray-400">Trans.</p><p className="font-semibold text-gray-700">{car.transmission || "—"}</p></div>
        </div>

        {/* Price + rented info + buttons */}
        <div className="flex justify-between items-end flex-1">
          <div>
            {basePrice && (
              <p className="text-sm font-bold text-teal-700">
                {fmt(basePrice.price)}
                <span className="text-xs font-normal text-gray-400 ml-1">/{basePrice.durationType}</span>
              </p>
            )}
            {(car.status === "Rented" || car.status === "Reserved") && nearestBooking && (
              <p className="text-xs text-blue-600 font-medium mt-0.5 flex items-center gap-1">
                <Icons.Calendar className="w-3 h-3" />
                Until {fmtDate(nearestBooking.endDateTime)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onDelete} className="p-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50">
              <Icons.Trash className="w-4 h-4" />
            </button>
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">
              <Icons.Edit className="w-3.5 h-3.5" />
              Edit
            </button>
            <button onClick={onViewDetails} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700">
              Details
              <Icons.ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VIEW DETAILS MODAL ───────────────────────────────────────────────────────
function ViewDetailsModal({ car, onClose, onEdit }) {
  const { fmt } = useCurrency();
  const [bookings, setBookings]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [allImages, setAllImages] = useState([]);
  const [activeImg, setActiveImg] = useState(car.imageURL || null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const imgSnap = await getDocs(query(collection(db, "carImages"), where("carID", "==", car.id)));
        const imgs = imgSnap.docs.map(d => d.data().imageURL).filter(Boolean);
        setAllImages(imgs);
        if (imgs.length > 0) setActiveImg(imgs[0]);

        const now = new Date();
        let future = [];
        try {
          const bSnap = await getDocs(query(
            collection(db, "bookings"),
            where("carID", "==", car.id),
            where("status", "in", ["approved", "pending"]),
            orderBy("startDateTime", "asc")
          ));
          future = bSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(b => {
              const end = b.endDateTime?.toDate ? b.endDateTime.toDate() : new Date(b.endDateTime);
              return end >= now;
            });
        } catch {
          const bSnap = await getDocs(query(
            collection(db, "bookings"),
            where("carID", "==", car.id),
            where("status", "in", ["approved", "pending"])
          ));
          future = bSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(b => {
              const end = b.endDateTime?.toDate ? b.endDateTime.toDate() : new Date(b.endDateTime);
              return end >= now;
            })
            .sort((a, b) => {
              const aD = a.startDateTime?.toDate ? a.startDateTime.toDate() : new Date(a.startDateTime);
              const bD = b.startDateTime?.toDate ? b.startDateTime.toDate() : new Date(b.startDateTime);
              return aD - bD;
            });
        }
        setBookings(future);
      } catch (e) {
        console.error("ViewDetails error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [car.id]);

  const sorted = sortPricing(car.pricing || []);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-xl text-gray-800">{car.brandName} {car.modelName}</h2>
            <p className="text-sm text-gray-400">{car.bodyType} · {car.platenumber || car.plateNumber}</p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700">
              <Icons.Edit className="w-4 h-4" />
              Edit
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <Icons.Close className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Image gallery */}
          <div>
            <div className="h-56 bg-gray-100 rounded-xl overflow-hidden">
              {activeImg
                ? <img src={activeImg} alt="car" className="w-full h-full object-cover" />
                : <div className="flex items-center justify-center h-full text-gray-300"><Icons.Car className="w-16 h-16" /></div>
              }
            </div>
            {allImages.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                {allImages.map((img, i) => (
                  <img key={i} src={img} onClick={() => setActiveImg(img)}
                    className={`h-14 w-20 object-cover rounded-lg cursor-pointer border-2 flex-shrink-0 ${activeImg === img ? "border-teal-500" : "border-transparent"}`} />
                ))}
              </div>
            )}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              ["Seats", car.seatingCapacity], ["Fuel", car.fuelType],
              ["Trans.", car.transmission],   ["Color", car.color],
              ["Year", car.year],             ["Body", car.bodyType],
              ["Status", car.status],
            ].map(([label, val]) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-semibold text-gray-800 mt-0.5">{val || "—"}</p>
              </div>
            ))}
          </div>

          {/* Pricing (12 Hours last) */}
          {sorted.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">Pricing Tiers</h3>
              <div className="flex flex-wrap gap-2">
                {sorted.map((p, i) => (
                  <div key={i} className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-2 text-sm">
                    <p className="text-xs text-gray-400">{p.durationType}</p>
                    <p className="font-bold text-teal-700">{fmt(p.price)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Short Description */}
          {car.shortDescription && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-1">Short Description</h3>
              <p className="text-sm text-gray-600">{car.shortDescription}</p>
            </div>
          )}

          {/* Long Description */}
          {car.longDescription && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-1">Long Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{car.longDescription}</p>
            </div>
          )}

          {/* Upcoming bookings */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
              Upcoming & Active Bookings
              <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{bookings.length}</span>
            </h3>
            {loading ? (
              <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : bookings.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No upcoming bookings</p>
            ) : (
              <div className="space-y-2">
                {bookings.map(b => (
                  <div key={b.id} className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{b.userID || "Customer"}</p>
                      <p className="text-xs text-gray-400">{fmtDate(b.startDateTime)} → {fmtDate(b.endDateTime)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      b.status === "approved" ? "bg-blue-50 border border-blue-200 text-black" : "bg-yellow-50 border border-yellow-200 text-black"
                    }`}>{b.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PRICING ICON ─────────────────────────────────────────────────────────────
const PricingIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);

// ─── DETAILS FORM ─────────────────────────────────────────────────────────────
function CarDetailsForm({ form, setForm, imagePreview, onImageChange, brands, models }) {
  const filteredModels = models.filter(m => m.brandID === form.brandID);

  const Field = ({ label, name, type = "text", options }) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {options ? (
        <select value={form[name] || ""} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
          className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400">
          <option value="">Select {label}</option>
          {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
        </select>
      ) : (
        <input type={type} value={form[name] || ""}
          onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
          className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400" />
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Image */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Primary Photo</label>
        <div className="flex gap-4 items-center">
          <div className="w-28 h-20 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
            {imagePreview
              ? <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
              : <div className="flex items-center justify-center h-full text-gray-300"><Icons.Camera className="w-8 h-8" /></div>
            }
          </div>
          <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors">
            <Icons.Camera className="w-4 h-4" />
            Choose Image
            <input type="file" accept="image/*" className="hidden" onChange={onImageChange} />
          </label>
        </div>
      </div>

      {/* Brand + Model */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
          <select value={form.brandID || ""} onChange={e => setForm(f => ({ ...f, brandID: e.target.value, modelID: "" }))}
            className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400">
            <option value="">Select Brand</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.brandName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Model</label>
          <select value={form.modelID || ""} onChange={e => setForm(f => ({ ...f, modelID: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400"
            disabled={!form.brandID}>
            <option value="">Select Model</option>
            {filteredModels.map(m => <option key={m.id} value={m.id}>{m.modelName}</option>)}
          </select>
        </div>
      </div>

      {/* Other fields */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Plate Number"   name="platenumber" />
        <Field label="Color"          name="color" />
        <Field label="Body Type"      name="bodyType" />
        <Field label="Year"           name="year" type="number" />
        <Field label="Seats"          name="seatingCapacity" type="number" />
        <Field label="Fuel Type"      name="fuelType"     options={["Gasoline","Diesel","Electric","Hybrid"]} />
        <Field label="Transmission"   name="transmission" options={["Automatic","Manual"]} />
        <Field label="Status"         name="status"       options={["Active","Rented","Reserved","Maintenance"]} />
      </div>

      {/* Short Description */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Short Description</label>
        <input value={form.shortDescription || ""} onChange={e => setForm(f => ({ ...f, shortDescription: e.target.value }))}
          className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400" />
      </div>

      {/* Long Description */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Long Description</label>
        <textarea rows={3} value={form.longDescription || ""}
          onChange={e => setForm(f => ({ ...f, longDescription: e.target.value }))}
          className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
      </div>
    </div>
  );
}

// ─── PRICING FORM (standalone tab) ────────────────────────────────────────────
function PricingForm({ pricing, setPricing }) {
  const handlePriceChange = (idx, field, val) =>
    setPricing(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));

  const addPriceTier = () =>
    setPricing(prev => [...prev, { durationType: "", price: "" }]);

  const removePriceTier = (idx) =>
    setPricing(prev => prev.filter((_, i) => i !== idx));

  const sorted = sortPricing(pricing);

  const DURATION_SUGGESTIONS = ["3 Hours", "6 Hours", "12 Hours", "24 Hours", "Full Day", "2 Days", "Weekly"];

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <PricingIcon className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-teal-800">Pricing Tiers</p>
            <p className="text-xs text-teal-600 mt-0.5">Add multiple rental duration options. "12 Hours" tier will always appear last.</p>
          </div>
        </div>
      </div>

      {/* Pricing rows */}
      <div className="space-y-3">
        {sorted.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <PricingIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No pricing tiers yet</p>
            <p className="text-xs mt-1">Click "Add Tier" to get started</p>
          </div>
        )}
        {sorted.map((p, i) => (
          <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier {i + 1}</span>
              <button onClick={() => removePriceTier(i)} type="button"
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                <Icons.Trash className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Duration Type</label>
                <input value={p.durationType} placeholder="e.g. 24 Hours / Full Day"
                  onChange={e => handlePriceChange(i, "durationType", e.target.value)}
                  list={`dur-suggestions-${i}`}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400 bg-white" />
                <datalist id={`dur-suggestions-${i}`}>
                  {DURATION_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Price (₱)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-gray-400 font-medium">₱</span>
                  <input type="number" value={p.price} min={0}
                    onChange={e => handlePriceChange(i, "price", e.target.value)}
                    placeholder="0.00"
                    className="w-full border rounded-xl pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400 bg-white" />
                </div>
              </div>
            </div>
            {/* Preview pill */}
            {p.durationType && p.price && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Preview:</span>
                <span className="bg-teal-50 border border-teal-100 text-teal-700 text-xs font-semibold px-3 py-1 rounded-full">
                  ₱{Number(p.price).toLocaleString()} / {p.durationType}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add tier button */}
      <button onClick={addPriceTier} type="button"
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-teal-200 rounded-xl text-sm text-teal-600 hover:border-teal-400 hover:bg-teal-50 transition-colors font-medium">
        <Icons.Plus className="w-4 h-4" />
        Add Pricing Tier
      </button>
    </div>
  );
}

// ─── EDIT CAR MODAL ───────────────────────────────────────────────────────────
function EditCarModal({ car, brands, models, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState("details");
  const [form, setForm]         = useState({
    shortDescription: car.shortDescription || "",
    longDescription:  car.longDescription  || "",
    color:            car.color            || "",
    fuelType:         car.fuelType         || "",
    transmission:     car.transmission     || "",
    seatingCapacity:  car.seatingCapacity  || "",
    year:             car.year             || "",
    bodyType:         car.bodyType         || "",
    status:           car.status           || "Active",
    platenumber:      car.platenumber || car.plateNumber || "",
    brandID:          car.brandID          || "",
    modelID:          car.modelID          || "",
  });
  const [pricing, setPricing]   = useState(sortPricing(car.pricing || []));
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(car.imageURL || null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await updateDoc(doc(db, "cars", car.id), {
        ...form,
        seatingCapacity: Number(form.seatingCapacity) || form.seatingCapacity,
        year: Number(form.year) || form.year,
        updatedAt: serverTimestamp(),
      });

      if (imageFile) {
        const imgRef = ref(storage, `carImages/${car.id}/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imgRef, imageFile);
        const downloadURL = await getDownloadURL(imgRef);
        const imgQ = query(collection(db, "carImages"), where("carID", "==", car.id), where("isPrimary", "==", true));
        const imgSnap = await getDocs(imgQ);
        if (!imgSnap.empty) {
          await updateDoc(doc(db, "carImages", imgSnap.docs[0].id), { imageURL: downloadURL });
        } else {
          await addDoc(collection(db, "carImages"), { carID: car.id, imageURL: downloadURL, isPrimary: true, label: "Primary", createdAt: serverTimestamp() });
        }
      }

      for (const p of pricing) {
        if (p.id) await updateDoc(doc(db, "carPricing", p.id), { price: Number(p.price), durationType: p.durationType });
        else if (p.durationType && p.price) await addDoc(collection(db, "carPricing"), { carID: car.id, price: Number(p.price), durationType: p.durationType, pricingID: "" });
      }

      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const pricingCount = pricing.filter(p => p.durationType && p.price).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b">
          <div>
            <h2 className="font-bold text-lg text-gray-800">Edit Vehicle</h2>
            <p className="text-xs text-gray-400 mt-0.5">{car.brandName} {car.modelName} · {car.platenumber || car.plateNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4 border-b pb-0">
          <button
            onClick={() => setActiveTab("details")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "details"
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <Icons.Car className="w-4 h-4" />
            Details
          </button>
          <button
            onClick={() => setActiveTab("pricing")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative ${
              activeTab === "pricing"
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <PricingIcon className="w-4 h-4" />
            Pricing
            {pricingCount > 0 && (
              <span className="ml-1 bg-teal-100 text-teal-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pricingCount}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-5">
          {activeTab === "details" ? (
            <CarDetailsForm form={form} setForm={setForm}
              imagePreview={imagePreview} onImageChange={handleImageChange}
              brands={brands} models={models} />
          ) : (
            <PricingForm pricing={pricing} setPricing={setPricing} />
          )}
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl p-3 mt-4">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <div className="text-xs text-gray-400">
            {activeTab === "details" ? "Edit vehicle info, then switch to Pricing tab" : `${pricingCount} pricing tier${pricingCount !== 1 ? "s" : ""} configured`}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 bg-white">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ADD CAR MODAL ────────────────────────────────────────────────────────────
function AddCarModal({ brands, models, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState("details");
  const [form, setForm]     = useState({ status: "Active", fuelType: "Gasoline", transmission: "Automatic" });
  const [pricing, setPricing] = useState([{ durationType: "", price: "" }]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!form.brandID || !form.modelID) { setError("Please select Brand and Model."); return; }
    setSaving(true); setError(null);
    try {
      const carRef = await addDoc(collection(db, "cars"), {
        ...form,
        seatingCapacity: Number(form.seatingCapacity) || 0,
        year: Number(form.year) || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (imageFile) {
        const imgRef = ref(storage, `carImages/${carRef.id}/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imgRef, imageFile);
        const downloadURL = await getDownloadURL(imgRef);
        await addDoc(collection(db, "carImages"), { carID: carRef.id, imageURL: downloadURL, isPrimary: true, label: "Primary", createdAt: serverTimestamp() });
      }

      for (const p of pricing) {
        if (p.durationType && p.price) {
          await addDoc(collection(db, "carPricing"), { carID: carRef.id, price: Number(p.price), durationType: p.durationType });
        }
      }

      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const pricingCount = pricing.filter(p => p.durationType && p.price).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="font-bold text-lg text-gray-800">Add New Vehicle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4 border-b pb-0">
          <button
            onClick={() => setActiveTab("details")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "details"
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <Icons.Car className="w-4 h-4" />
            Details
          </button>
          <button
            onClick={() => setActiveTab("pricing")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "pricing"
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <PricingIcon className="w-4 h-4" />
            Pricing
            {pricingCount > 0 && (
              <span className="ml-1 bg-teal-100 text-teal-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pricingCount}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-5">
          {activeTab === "details" ? (
            <CarDetailsForm form={form} setForm={setForm}
              imagePreview={imagePreview} onImageChange={handleImageChange}
              brands={brands} models={models} />
          ) : (
            <PricingForm pricing={pricing} setPricing={setPricing} />
          )}
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl p-3 mt-4">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <div className="text-xs text-gray-400">
            {activeTab === "details" ? "Fill in vehicle info, then set Pricing" : `${pricingCount} pricing tier${pricingCount !== 1 ? "s" : ""} configured`}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 bg-white">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {saving ? "Adding..." : "Add Vehicle"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MANAGE BRANDS & MODELS MODAL ─────────────────────────────────────────────
function ManageBrandsModal({ brands, models, onClose, onSaved }) {
  const [newBrand, setNewBrand]     = useState("");
  const [newModel, setNewModel]     = useState("");
  const [modelBrandID, setModelBrandID] = useState("");
  const [saving, setSaving]         = useState(false);
  const [tab, setTab]               = useState("brand");
  const [error, setError]           = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const addBrand = async () => {
    if (!newBrand.trim()) return;
    setSaving(true); setError(null);
    try {
      const ref2 = await addDoc(collection(db, "brand"), { brandName: newBrand.trim() });
      await updateDoc(doc(db, "brand", ref2.id), { brandID: ref2.id });
      setNewBrand(""); onSaved();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const addModel = async () => {
    if (!newModel.trim() || !modelBrandID) { setError("Select a brand and enter model name."); return; }
    setSaving(true); setError(null);
    try {
      const ref2 = await addDoc(collection(db, "model"), { modelName: newModel.trim(), brandID: modelBrandID });
      await updateDoc(doc(db, "model", ref2.id), { modelID: ref2.id });
      setNewModel(""); setModelBrandID(""); onSaved();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    setSaving(true);
    try {
      if (confirmDel.type === "brand") {
        await deleteDoc(doc(db, "brand", confirmDel.item.id));
        const mSnap = await getDocs(query(collection(db, "model"), where("brandID", "==", confirmDel.item.id)));
        for (const d of mSnap.docs) await deleteDoc(d.ref);
      } else {
        await deleteDoc(doc(db, "model", confirmDel.item.id));
      }
      setConfirmDel(null); onSaved();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-lg text-gray-800">Brands & Models</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tabs */}
          <div className="flex gap-2">
            <button onClick={() => setTab("brand")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${tab === "brand" ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              <Icons.Tag className="w-3.5 h-3.5" />
              Brands
            </button>
            <button onClick={() => setTab("model")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${tab === "model" ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              <Icons.Car className="w-3.5 h-3.5" />
              Models
            </button>
          </div>

          {tab === "brand" ? (
            <>
              <div className="flex gap-2">
                <input value={newBrand} onChange={e => setNewBrand(e.target.value)}
                  placeholder="New brand name (e.g. Toyota)"
                  className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400" />
                <button onClick={addBrand} disabled={saving}
                  className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700 disabled:opacity-50">Add</button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {brands.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-4">No brands yet</p>
                  : brands.map(b => (
                  <div key={b.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-xl">
                    <div>
                      <span className="text-sm font-medium text-gray-700">{b.brandName}</span>
                      <span className="text-xs text-gray-400 ml-2">{models.filter(m => m.brandID === b.id).length} models</span>
                    </div>
                    <button onClick={() => setConfirmDel({ type: "brand", item: b })}
                      className="text-red-400 hover:text-red-600 p-1">
                      <Icons.Trash className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <select value={modelBrandID} onChange={e => setModelBrandID(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="">Select Brand</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.brandName}</option>)}
                </select>
                <div className="flex gap-2">
                  <input value={newModel} onChange={e => setNewModel(e.target.value)}
                    placeholder="New model name (e.g. Vios)"
                    className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400" />
                  <button onClick={addModel} disabled={saving}
                    className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700 disabled:opacity-50">Add</button>
                </div>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {brands.map(b => {
                  const bModels = models.filter(m => m.brandID === b.id);
                  if (bModels.length === 0) return null;
                  return (
                    <div key={b.id}>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-1">{b.brandName}</p>
                      {bModels.map(m => (
                        <div key={m.id} className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-xl mb-1">
                          <span className="text-sm text-gray-700">{m.modelName}</span>
                          <button onClick={() => setConfirmDel({ type: "model", item: m })}
                            className="text-red-400 hover:text-red-600 p-1">
                            <Icons.Trash className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl p-3">{error}</p>}
        </div>
      </div>

      {/* Inline confirm delete */}
      {confirmDel && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                  <Icons.Trash className="w-7 h-7 text-red-500" />
                </div>
              </div>
              <h3 className="font-bold text-gray-800 text-lg">Confirm Delete</h3>
              <p className="text-sm text-gray-500 mt-1">
                {confirmDel.type === "brand"
                  ? `Delete brand "${confirmDel.item.brandName}"? All its models will also be deleted.`
                  : `Delete model "${confirmDel.item.modelName}"?`}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={saving}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 disabled:opacity-50">
                {saving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CONFIRM DELETE MODAL ─────────────────────────────────────────────────────
function ConfirmDeleteModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <Icons.AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
          </div>
          <h3 className="font-bold text-gray-800 text-lg">Confirm Delete</h3>
          <p className="text-sm text-gray-500 mt-1">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}