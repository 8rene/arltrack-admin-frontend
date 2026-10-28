import { useState, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../fireabase";

const API_URL = process.env.REACT_APP_API_URL;

const EMPTY_FORM = { carPartName: "", carPartTypeID: "", serialNumber: "", price: "" };

// Parts are priced in PHP (what it costs to replace the part).
const formatPeso = (n) =>
  `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Table header cell + full-size row buttons — same look as Holidays / Addresses.
const thCls = "text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider";
const actionBtn = "px-4 py-2 text-sm font-semibold rounded-xl border transition";

// A part's live condition (carParts.status). Set by the backend from inspections + Completed
// maintenance jobs (services/carParts/carPartConditions.service.js) — read-only here.
const STATUS_STYLES = {
  Good:    "bg-green-50 text-green-700 border-green-200",
  Damaged: "bg-red-50 text-red-700 border-red-200",
  Missing: "bg-orange-50 text-orange-700 border-orange-200",
  Stolen:  "bg-purple-50 text-purple-700 border-purple-200",
};
function PartStatusBadge({ status }) {
  const s = status || "Good"; // parts created before status existed read as Good
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[s] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {s}
    </span>
  );
}

// Price text box -> { value } where value is:
//   a number      → set the price
//   null          → box was empty
// or { error } when it isn't a valid amount.
const parsePriceInput = (raw) => {
  const t = String(raw ?? "").trim();
  if (t === "") return { value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { error: "Price must be a number that is 0 or greater." };
  return { value: n };
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// Inventory — the vehicle PARTS CATALOG (name, type, serial number, price).
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
  const [formState, setFormState]     = useState(EMPTY_FORM);
  const [isAdding, setIsAdding]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const token = localStorage.getItem("token");
  const authedFetch = useCallback((path, options = {}) => {
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  }, [token]);

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

    authedFetch("/api/car-parts/types").then(async (res) => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load part types.");
      setPartTypes(json.data || []);
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadParts = useCallback(async (carID) => {
    setPartsLoading(true);
    try {
      const res = await authedFetch(`/api/car-parts/car/${carID}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load parts.");
      setParts(json.data || []);
    } catch (e) {
      console.error(e);
      showToast("Failed to load parts.", "error");
    } finally {
      setPartsLoading(false);
    }
  }, [authedFetch]);

  const openCar = (car) => {
    setSelectedCar(car);
    setEditingID(null);
    setIsAdding(false);
    loadParts(car.id);
  };

  // A car is always open — default to the first one once the list loads
  // (same behavior as Reviews and Vehicle Inspections).
  useEffect(() => {
    if (!selectedCar && cars.length) openCar(cars[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars]);

  const startEdit = (part) => {
    setIsAdding(false);
    setEditingID(part.id);
    setFormState({
      carPartName:   part.carPartName || "",
      carPartTypeID: part.carPartTypeID || "",
      serialNumber:  part.serialNumber || "",
      price:         part.price != null ? String(part.price) : "",
    });
  };

  const startAdd = () => {
    setEditingID(null);
    setIsAdding(true);
    setFormState({ ...EMPTY_FORM, carPartTypeID: partTypes[0]?.id || "" });
  };

  const cancelForm = () => {
    setEditingID(null);
    setIsAdding(false);
  };

  const saveEdit = async () => {
    if (!formState.carPartName.trim()) { showToast("Part name is required.", "error"); return; }
    const price = parsePriceInput(formState.price);
    if (price.error) { showToast(price.error, "error"); return; }
    setSaving(true);
    try {
      const res = await authedFetch(`/api/car-parts/${editingID}`, {
        method: "PUT",
        body: JSON.stringify({
          carPartName:   formState.carPartName.trim(),
          carPartTypeID: formState.carPartTypeID,
          serialNumber:  formState.serialNumber.trim(),
          // Empty box on an existing part = remove its price (null).
          price:         price.value,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to update part.");
      // Use the server's copy so price / carPartPricingID are exactly what was saved.
      setParts(prev => prev.map(p => p.id === editingID ? { ...p, ...json.data } : p));
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
    const price = parsePriceInput(formState.price);
    if (price.error) { showToast(price.error, "error"); return; }
    setSaving(true);
    try {
      const res = await authedFetch("/api/car-parts", {
        method: "POST",
        body: JSON.stringify({
          carID:         selectedCar.id,
          carPartName:   formState.carPartName.trim(),
          carPartTypeID: formState.carPartTypeID,
          serialNumber:  formState.serialNumber.trim(),
          // Part and price are created together; empty box = no price yet.
          price:         price.value,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to add part.");
      setParts(prev => [...prev, json.data]);
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
      const res = await authedFetch(`/api/car-parts/${part.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to remove part.");
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
          The parts catalog for each vehicle — name, type, serial number, and replacement price. Per-trip
          condition (Good/Damaged) is recorded separately, per booking, on Vehicle Inspections.
        </p>
      </div>

      <div className="flex gap-4">
        {/* Car list */}
        <div className="w-72 shrink-0">
          {carsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1">
              {cars.length === 0 && (
                <p className="text-gray-400 text-sm col-span-full text-center py-8">No vehicles found.</p>
              )}
              {cars.map(car => {
                const isSelected = selectedCar?.id === car.id;
                return (
                  <button
                    key={car.id}
                    onClick={() => { if (!isSelected) openCar(car); }}
                    className={`w-full text-left bg-white rounded-2xl border transition-all duration-200 shadow-soft p-4 hover:shadow-md ${
                      isSelected ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"
                    }`}
                  >
                    <p className="font-semibold text-gray-800 text-sm truncate">{car.label}</p>
                    <p className="text-xs text-gray-400 truncate">{car.plateNumber || "—"}</p>
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
              <button
                onClick={startAdd}
                className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-teal-700"
              >
                + Add Part
              </button>
            </div>

            {partsLoading ? (
              <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
            ) : (
              <div className="border border-gray-100 rounded-xl overflow-x-auto">
                <table className="w-full text-sm font-sans min-w-[720px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className={thCls}>Part</th>
                      <th className={thCls}>Type</th>
                      <th className={thCls}>Serial No.</th>
                      <th className={thCls}>Price</th>
                      <th className={thCls}>Status</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isAdding && (
                      <tr className="border-b border-gray-50">
                        <td colSpan={6} className="p-3">
                          <PartFormRow
                            formState={formState} setFormState={setFormState} partTypes={partTypes}
                            onSave={saveNew} onCancel={cancelForm} saving={saving} inputCls={inputCls}
                          />
                        </td>
                      </tr>
                    )}

                    {parts.length === 0 && !isAdding && (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                          No parts in the catalog for this vehicle yet.
                        </td>
                      </tr>
                    )}

                    {parts.map(part => (
                      editingID === part.id ? (
                        <tr key={part.id} className="border-b border-gray-50">
                          <td colSpan={6} className="p-3">
                            <PartFormRow
                              formState={formState} setFormState={setFormState} partTypes={partTypes}
                              onSave={saveEdit} onCancel={cancelForm} saving={saving} inputCls={inputCls}
                            />
                          </td>
                        </tr>
                      ) : (
                        <tr key={part.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-5 py-3 font-semibold text-gray-800">{part.carPartName || "—"}</td>
                          <td className="px-5 py-3 text-gray-600">
                            {partTypes.find(t => t.id === part.carPartTypeID)?.carPartName || <span className="text-gray-400">No type</span>}
                          </td>
                          <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{part.serialNumber || "—"}</td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            {part.price != null ? (
                              <span className="font-semibold text-gray-700">{formatPeso(part.price)}</span>
                            ) : (
                              <span className="text-xs text-gray-300 italic">No price</span>
                            )}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap"><PartStatusBadge status={part.status} /></td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              <button onClick={() => startEdit(part)} className={`${actionBtn} border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100`}>Edit</button>
                              <button onClick={() => removePart(part)} className={`${actionBtn} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}>Remove</button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
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
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Price (₱)</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">₱</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={`${inputCls} pl-6`}
              value={formState.price}
              onChange={e => setFormState(prev => ({ ...prev, price: e.target.value }))}
              placeholder="0.00"
            />
          </div>
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