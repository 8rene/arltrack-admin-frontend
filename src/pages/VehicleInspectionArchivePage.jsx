import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";

function formatDate(iso, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
  });
}
function inRange(iso, from, to) {
  if (!from && !to) return true;
  const d = new Date(iso);
  if (isNaN(d)) return true;
  if (from && d < new Date(from)) return false;
  if (to   && d > new Date(to + "T23:59:59")) return false;
  return true;
}

const carLabel = (r) => [r.brandName, r.modelName].filter((v) => v && v !== "—").join(" ");
const prettyPart = (key) =>
  key.replace(/Url$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const photosOf = (doc) =>
  Object.entries(doc || {}).filter(([k, v]) => /Url$/.test(k) && typeof v === "string" && v).map(([k, v]) => ({ label: prettyPart(k), url: v }));

const PAGE_SIZE = 15;

// One trip phase (before / after): part condition + photos, read from the archived records.
function PhaseBlock({ title, inventory, documentation }) {
  const inv = (inventory || [])[0];
  const photos = photosOf((documentation || [])[0]);
  const damaged = Array.isArray(inv?.damageParts) ? inv.damageParts : [];
  return (
    <div className="mb-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{title}</h4>
      <p className="text-xs text-gray-500 mb-2">
        Overall condition:{" "}
        <span className="font-medium text-gray-700">{inv ? (inv.inventoryOverallStatus || "—") : "No part check recorded"}</span>
      </p>
      {damaged.length > 0 && (
        <ul className="text-xs text-gray-600 mb-2 list-disc ml-5">
          {damaged.map((p, i) => (
            <li key={i}>{p.carPartName || p.carPartID} {p.serialNumber ? `(${p.serialNumber})` : ""} — {p.status || "Damaged"}</li>
          ))}
        </ul>
      )}
      {photos.length === 0 ? (
        <p className="text-xs text-gray-400">No photos recorded.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <a key={p.label} href={p.url} target="_blank" rel="noreferrer" className="block">
              <img src={p.url} alt={p.label} loading="lazy" className="w-full h-20 object-cover rounded-lg border border-gray-100 bg-gray-50" />
              <span className="block text-[11px] text-gray-500 mt-0.5 truncate">{p.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VehicleInspectionArchivePage() {
  const { effectiveRole } = useAuth();
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [page, setPage]           = useState(1);
  const [toast, setToast]         = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState(null);
  const [actionId, setActionId]   = useState(null);
  const [viewRecord, setViewRecord] = useState(null);

  const token = localStorage.getItem("token");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 7000);
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/vehicle-inspection`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load archive.");
      setRecords(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleRestore = async (id) => {
    setRestoreConfirmId(null);
    setActionId(id);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/vehicle-inspection/${id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Restore failed.");
      fetchRecords();
      showToast(data.message || "Vehicle inspection restored.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const handleDelete = async (id) => {
    setConfirmId(null);
    setActionId(id);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/vehicle-inspection/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      fetchRecords();
      showToast(data.message || "Permanently deleted.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      (r.vehicleInspectionArchivesId || "").toLowerCase().includes(q) ||
      (r.bookingID                   || "").toLowerCase().includes(q) ||
      (r.plateNumber                 || "").toLowerCase().includes(q) ||
      carLabel(r).toLowerCase().includes(q);
    return matchSearch && inRange(r.archivedAt, dateFrom, dateTo);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, dateFrom, dateTo]);

  const canDelete = effectiveRole === ROLES.OWNER || effectiveRole === ROLES.ADMIN;
  const TH = "text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider";

  return (
    <div className="w-full px-6 py-6">

      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white max-w-md ${
          toast.type === "error" ? "bg-red-500" : "bg-teal-600"
        }`}>
          {toast.msg}
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96">
            <h3 className="font-semibold text-gray-800 mb-2">Permanently Delete?</h3>
            <p className="text-sm text-gray-500 mb-3">If this booking is still in the Booking Archive, deleting this vehicle inspection also permanently deletes the <b>whole archived booking</b> and everything archived with it (payment, payment entries, refund requests, penalties, reviews, session, driver assignments, cancellation requests and maintenance).</p>
            <p className="text-sm text-gray-500 mb-3">If the booking archive no longer exists, only this vehicle inspection is deleted. Transaction logs are always kept.</p>
            <p className="text-sm text-red-600 mb-3">The inspection <b>photos stored in Firebase Storage are deleted too</b> (and the GPS history file when the whole booking goes). This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(confirmId)} className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}

      {restoreConfirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96">
            <h3 className="font-semibold text-gray-800 mb-2">Restore this vehicle inspection?</h3>
            <p className="text-sm text-gray-500 mb-5">If this booking is still in the Booking Archive, restoring this vehicle inspection restores the <b>whole booking</b> with it: payment and payment entries, all refund requests, all penalties, reviews, session, driver assignments, cancellation requests, maintenance and vehicle inspection. If the booking archive no longer exists, only this vehicle inspection is restored. The photos were never moved, so they show again straight away.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRestoreConfirmId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleRestore(restoreConfirmId)} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700">Yes, Restore</button>
            </div>
          </div>
        </div>
      )}

      {viewRecord && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={() => setViewRecord(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">Vehicle Inspection Archive</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {viewRecord.plateNumber || "—"} {carLabel(viewRecord) ? `· ${carLabel(viewRecord)}` : ""} · Booking {viewRecord.bookingID || "—"}
                </p>
              </div>
              <button onClick={() => setViewRecord(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <PhaseBlock title="Before trip" inventory={viewRecord.records?.inventoryBeforeTrip} documentation={viewRecord.records?.vehicleDocumentationBeforeTrip} />
            <PhaseBlock title="After trip"  inventory={viewRecord.records?.inventoryAfterTrip}  documentation={viewRecord.records?.vehicleDocumentationAfterTrip} />
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">VEHICLE INSPECTION ARCHIVE</h1>
        <p className="text-sm text-gray-400 mt-1">
          {loading ? "Loading…" : `${filtered.length} archived inspection${filtered.length !== 1 ? "s" : ""}`}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          A booking's before / after part checks and photos end up here when the booking is deleted. The photos stay in Firebase Storage until the record is permanently deleted.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by booking, plate, vehicle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 w-80"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 whitespace-nowrap">Archived from</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <label className="text-xs text-gray-400">to</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
        <button onClick={fetchRecords} disabled={loading} className="px-4 py-2 text-sm rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 ml-auto">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className={TH}>Booking</th>
              <th className={TH}>Vehicle</th>
              <th className={TH}>Before trip</th>
              <th className={TH}>After trip</th>
              <th className={TH}>Archived At</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-16 text-gray-400 text-sm">{search || dateFrom || dateTo ? "No records match your filters." : "No archived vehicle inspections found."}</td></tr>
            ) : (
              paginated.map((r, i) => (
                <tr key={r.vehicleInspectionArchivesId} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors ${i % 2 !== 0 ? "bg-gray-50/20" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[160px]">{r.bookingID || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-700 max-w-[160px]">
                    <div className="font-medium truncate">{r.plateNumber || "—"}</div>
                    <div className="text-gray-400 truncate">{carLabel(r) || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{r.beforeDamaged} damaged · {r.beforePhotos} photo{r.beforePhotos === 1 ? "" : "s"}</td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{r.afterDamaged} damaged · {r.afterPhotos} photo{r.afterPhotos === 1 ? "" : "s"}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">{formatDate(r.archivedAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setViewRecord(r)} disabled={!!actionId} className="px-3 py-1.5 text-xs rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40">View</button>
                      <button onClick={() => setRestoreConfirmId(r.vehicleInspectionArchivesId)} disabled={!!actionId} className="px-3 py-1.5 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40">
                        {actionId === r.vehicleInspectionArchivesId ? "…" : "Restore"}
                      </button>
                      {canDelete && (
                        <button onClick={() => setConfirmId(r.vehicleInspectionArchivesId)} disabled={!!actionId} className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">← Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}