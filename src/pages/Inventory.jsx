import { useState, useEffect, useCallback } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where,
} from "firebase/firestore";
import { db } from "../fireabase";

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// Inventory — the vehicle PARTS CATALOG (name, type, serial number).
// Config-style data an admin sets up once and edits occasionally, so it's
// grouped under "System" in the sidebar — but deliberately its own page,
// not folded into the generic Settings screen.
//
// Per-TRIP condition (Good/Damaged, tied to one specific booking) and its
// history are NOT here — that's operational data checked on every
// pickup/return, and lives on Vehicle Documentation's Before/After tabs
// + Past Trips section instead.

export default function Inventory() {
  const [cars, setCars]               = useState([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState(null);

  const [parts, setParts]             = useState([]);
  const [partsLoading, setPartsLoading] = useState(false);

  const [partTypes, setPartTypes]     = useState([]); // [{id, carPartName}]

  const [editingID, setEditingID]     = useState(null);
  const [formState, setFormState]     = useState({ carPartName: "", carPartTypeID: "", serialNumber: "" });
  const [isAdding, setIsAdding]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setCarsLoading(true);
    Promise.all([
      getDocs(collection(db, "cars")),
      getDocs(collection(db, "brand")),
      getDocs(collection(db, "model")),
    ])
      .then(([carsSnap, brandsSnap, modelsSnap]) => {
        const bMap = Object.fromEntries(brandsSnap.docs.map(d => [d.id, d.data()]));
        const mMap = Object.fromEntries(modelsSnap.docs.map(d => [d.id, d.data()]));
        setCars(
          carsSnap.docs.map(d => {
            const c     = { id: d.id, ...d.data() };
            const model = mMap[c.modelID] || {};
            const brand = bMap[model.brandID] || {};
            return {
              ...c,
              label: `${brand.brandName || ""} ${model.modelName || ""}`.trim() || d.id,
            };
          })
        );
      })
      .catch(console.error)
      .finally(() => setCarsLoading(false));

    getDocs(collection(db, "carPartTypes")).then(snap => {
      setPartTypes(snap.docs.map(d => ({ id: d.id, carPartName: d.data().carPartName || d.id })));
    }).catch(console.error);
  }, []);

  const loadParts = useCallback(async (carID) => {
    setPartsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "carParts"), where("carID", "==", carID)));
      setParts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      showToast("Failed to load parts.", "error");
    } finally {
      setPartsLoading(false);
    }
  }, []);

  const openCar = (car) => {
    setSelectedCar(car);
    setEditingID(null);
    setIsAdding(false);
    loadParts(car.id);
  };

  const startEdit = (part) => {
    setIsAdding(false);
    setEditingID(part.id);
    setFormState({
      carPartName:   part.carPartName || "",
      carPartTypeID: part.carPartTypeID || "",
      serialNumber:  part.serialNumber || "",
    });
  };

  const startAdd = () => {
    setEditingID(null);
    setIsAdding(true);
    setFormState({ carPartName: "", carPartTypeID: partTypes[0]?.id || "", serialNumber: "" });
  };

  const cancelForm = () => {
    setEditingID(null);
    setIsAdding(false);
  };

  const saveEdit = async () => {
    if (!formState.carPartName.trim()) { showToast("Part name is required.", "error"); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "carParts", editingID), {
        carPartName:   formState.carPartName.trim(),
        carPartTypeID: formState.carPartTypeID,
        serialNumber:  formState.serialNumber.trim(),
      });
      setParts(prev => prev.map(p => p.id === editingID ? { ...p, ...formState } : p));
      setEditingID(null);
      showToast("Part updated.");
    } catch (e) {
      console.error(e);
      showToast("Failed to update part: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const saveNew = async () => {
    if (!formState.carPartName.trim()) { showToast("Part name is required.", "error"); return; }
    setSaving(true);
    try {
      const newRef = await addDoc(collection(db, "carParts"), {
        carID:         selectedCar.id,
        carPartName:   formState.carPartName.trim(),
        carPartTypeID: formState.carPartTypeID,
        serialNumber:  formState.serialNumber.trim(),
        status:        "Good",
      });
      setParts(prev => [...prev, { id: newRef.id, carID: selectedCar.id, ...formState, status: "Good" }]);
      setIsAdding(false);
      showToast("Part added.");
    } catch (e) {
      console.error(e);
      showToast("Failed to add part: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const removePart = async (part) => {
    if (!window.confirm(`Remove "${part.carPartName}" from ${selectedCar.label}? This can't be undone, and any photo/history tied to it (via its old field key) will become orphaned.`)) return;
    try {
      await deleteDoc(doc(db, "carParts", part.id));
      setParts(prev => prev.filter(p => p.id !== part.id));
      showToast("Part removed.");
    } catch (e) {
      console.error(e);
      showToast("Failed to remove part: " + e.message, "error");
    }
  };

  const inputCls = "w-full text-xs rounded-lg border px-2.5 py-1.5 bg-white border-gray-200 text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-300";

  return (
    <div className="p-4 bg-gray-50">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "error"
            ? "bg-red-50 text-red-700 border border-red-200"
            : "bg-green-50 text-green-700 border border-green-200"
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-arl-dark">Parts Inventory</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          The parts catalog for each vehicle — name, type, and serial number. Per-trip
          condition (Good/Damaged) is recorded separately, per booking, on Vehicle Inspections.
        </p>
      </div>

      <div className="flex gap-4">
        {/* Car list */}
        <div className={`${selectedCar ? "w-72 shrink-0" : "flex-1"} transition-all duration-300`}>
          {carsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
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
                return (
                  <button
                    key={car.id}
                    onClick={() => isSelected ? setSelectedCar(null) : openCar(car)}
                    className={`w-full text-left bg-white rounded-2xl border transition-all duration-200 shadow-soft p-4 hover:shadow-md ${
                      isSelected ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"
                    }`}
                  >
                    <p className="font-semibold text-gray-800 text-sm truncate">{car.label}</p>
                    <p className="text-xs text-gray-400 truncate">{car.plateNumber || car.platenumber || "—"}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Parts panel */}
        {selectedCar && (
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{selectedCar.label}</h3>
                <p className="text-xs text-gray-400">{parts.length} part{parts.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={startAdd}
                  className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-teal-700"
                >
                  + Add Part
                </button>
                <button onClick={() => setSelectedCar(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
            </div>

            {partsLoading ? (
              <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
            ) : (
              <div className="space-y-2">
                {isAdding && (
                  <PartFormRow
                    formState={formState} setFormState={setFormState} partTypes={partTypes}
                    onSave={saveNew} onCancel={cancelForm} saving={saving} inputCls={inputCls}
                  />
                )}

                {parts.length === 0 && !isAdding && (
                  <p className="text-sm text-center py-8 text-gray-400">
                    No parts in the catalog for this vehicle yet.
                  </p>
                )}

                {parts.map(part => (
                  editingID === part.id ? (
                    <PartFormRow
                      key={part.id}
                      formState={formState} setFormState={setFormState} partTypes={partTypes}
                      onSave={saveEdit} onCancel={cancelForm} saving={saving} inputCls={inputCls}
                    />
                  ) : (
                    <div key={part.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate text-gray-800">{part.carPartName || "—"}</p>
                        <p className="text-xs truncate text-gray-400">
                          {partTypes.find(t => t.id === part.carPartTypeID)?.carPartName || "No type"}
                          {part.serialNumber ? ` · ${part.serialNumber}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button onClick={() => startEdit(part)} className="text-xs font-semibold text-teal-600 hover:text-teal-700">Edit</button>
                        <button onClick={() => removePart(part)} className="text-xs font-semibold text-red-500 hover:text-red-600">Remove</button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PartFormRow({ formState, setFormState, partTypes, onSave, onCancel, saving, inputCls }) {
  return (
    <div className="rounded-xl border-2 border-teal-300 ring-1 ring-teal-100 bg-teal-50/20 px-3 py-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Part Name</label>
          <input
            className={inputCls}
            value={formState.carPartName}
            onChange={e => setFormState(prev => ({ ...prev, carPartName: e.target.value }))}
            placeholder="e.g. Brake Disc"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Type</label>
          <select
            className={inputCls}
            value={formState.carPartTypeID}
            onChange={e => setFormState(prev => ({ ...prev, carPartTypeID: e.target.value }))}
          >
            <option value="">— None —</option>
            {partTypes.map(t => (
              <option key={t.id} value={t.id}>{t.carPartName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Serial No.</label>
          <input
            className={inputCls}
            value={formState.serialNumber}
            onChange={e => setFormState(prev => ({ ...prev, serialNumber: e.target.value }))}
            placeholder="Optional"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="text-xs font-semibold text-gray-400 hover:text-gray-600">Cancel</button>
        <button
          onClick={onSave}
          disabled={saving}
          className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}