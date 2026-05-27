import { useState, useEffect, useCallback } from "react";
import { useCurrency } from "../context/CurrencyContext";
import {
  collection, getDocs, query, where, orderBy, doc, updateDoc,
  addDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../fireabase";

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
            className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            🏷️ Brands & Models
          </button>
          <button onClick={fetchAll}
            className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button onClick={() => setShowAddCar(true)}
            className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700">
            + Add Vehicle
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
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M5 11l2-4h10l2 4M3 11h18v8H3v-8zm4 8v2m10-2v2" />
            </svg>
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
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.25 4.42a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
            </svg>
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
              <p className="text-xs text-blue-600 font-medium mt-0.5">
                📅 Until {fmtDate(nearestBooking.endDateTime)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onDelete} className="px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50">🗑</button>
            <button onClick={onEdit} className="px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">Edit</button>
            <button onClick={onViewDetails} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700">Details →</button>
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
            <button onClick={onEdit} className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700">✏️ Edit</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-2">✕</button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Image gallery */}
          <div>
            <div className="h-56 bg-gray-100 rounded-xl overflow-hidden">
              {activeImg
                ? <img src={activeImg} alt="car" className="w-full h-full object-cover" />
                : <div className="flex items-center justify-center h-full text-gray-300 text-5xl">🚗</div>
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

// ─── SHARED CAR FORM FIELDS ───────────────────────────────────────────────────
function CarForm({ form, setForm, pricing, setPricing, imagePreview, onImageChange, brands, models }) {
  const filteredModels = models.filter(m => m.brandID === form.brandID);

  const Field = ({ label, name, type = "text", options, span }) => (
    <div className={span ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {options ? (
        <select value={form[name]} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
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

  const handlePriceChange = (idx, field, val) =>
    setPricing(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));

  const addPriceTier = () =>
    setPricing(prev => [...prev, { durationType: "", price: "" }]);

  const removePriceTier = (idx) =>
    setPricing(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-5">
      {/* Image */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Primary Photo</label>
        <div className="flex gap-4 items-center">
          <div className="w-28 h-20 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
            {imagePreview
              ? <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
              : <div className="flex items-center justify-center h-full text-gray-300 text-2xl">📷</div>
            }
          </div>
          <label className="cursor-pointer px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors">
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

      {/* Pricing (12 Hours last) */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xs font-medium text-gray-500">Pricing (12 Hours goes last)</h3>
          <button onClick={addPriceTier} type="button"
            className="text-xs px-3 py-1 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100">+ Add Tier</button>
        </div>
        <div className="space-y-2">
          {sortPricing(pricing).map((p, i) => (
            <div key={i} className="flex gap-3 items-center">
              <input value={p.durationType} placeholder="e.g. 24 Hours / Full Day"
                onChange={e => handlePriceChange(i, "durationType", e.target.value)}
                className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400" />
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-gray-400">₱</span>
                <input type="number" value={p.price}
                  onChange={e => handlePriceChange(i, "price", e.target.value)}
                  className="w-32 border rounded-xl pl-7 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <button onClick={() => removePriceTier(i)} type="button"
                className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── EDIT CAR MODAL ───────────────────────────────────────────────────────────
function EditCarModal({ car, brands, models, onClose, onSaved }) {
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-lg text-gray-800">Edit Vehicle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-2">✕</button>
        </div>
        <div className="p-5">
          <CarForm form={form} setForm={setForm} pricing={pricing} setPricing={setPricing}
            imagePreview={imagePreview} onImageChange={handleImageChange} brands={brands} models={models} />
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl p-3 mt-4">{error}</p>}
          <div className="flex justify-end gap-3 pt-5">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-lg text-gray-800">Add New Vehicle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-2">✕</button>
        </div>
        <div className="p-5">
          <CarForm form={form} setForm={setForm} pricing={pricing} setPricing={setPricing}
            imagePreview={imagePreview} onImageChange={handleImageChange} brands={brands} models={models} />
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl p-3 mt-4">{error}</p>}
          <div className="flex justify-end gap-3 pt-5">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
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
  const [confirmDel, setConfirmDel] = useState(null); // { type: "brand"|"model", item }

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
        // also delete its models
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-2">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tabs */}
          <div className="flex gap-2">
            {["brand","model"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize ${tab === t ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t === "brand" ? "🏷️ Brands" : "🚘 Models"}
              </button>
            ))}
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
                      className="text-red-400 hover:text-red-600 text-lg px-2">🗑</button>
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
                            className="text-red-400 hover:text-red-600 text-lg px-2">🗑</button>
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
              <div className="text-4xl mb-3">🗑️</div>
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
          <div className="text-4xl mb-3">🗑️</div>
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

