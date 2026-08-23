import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";
import { useCurrency } from "../context/CurrencyContext";
import ArchiveDetailModal from "../components/shared/ArchiveDetailModal";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
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

const statusColor = {
  pending:   "bg-yellow-100 text-yellow-700",
  approved:  "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const PAGE_SIZE = 15;

export default function BookingArchivePage() {
  const { effectiveRole } = useAuth();
  const { fmt } = useCurrency();
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [page, setPage]           = useState(1);
  const [toast, setToast]         = useState(null);
  const [confirmId, setConfirmId] = useState(null); // bookingArchivesId pending delete confirm
  const [restoreConfirmId, setRestoreConfirmId] = useState(null); // bookingArchivesId pending restore confirm
  const [actionId, setActionId]   = useState(null); // currently processing id
  const [viewRecord, setViewRecord] = useState(null); // record currently shown in the detail modal

  // Linked-record modals — Payment / Vehicle Inspection / Booking Session.
  // Each stays a modal fed from the archive copy, never a navigation to the
  // live page, so archived data never leaks back into a live operational view.
  const [paymentModal, setPaymentModal]         = useState(null); // { loading, data, bookingArchivesId } | null
  const [inspectionModal, setInspectionModal]   = useState(null);
  const [sessionModal, setSessionModal]         = useState(null);

  const openLinkedModal = async (setModal, bookingArchivesId, endpoint) => {
    setModal({ loading: true, data: null, bookingArchivesId });
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/bookings/${bookingArchivesId}/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load record.");
      setModal({ loading: false, data: data.data, message: data.message, bookingArchivesId });
    } catch (err) {
      setModal({ loading: false, data: null, error: err.message, bookingArchivesId });
    }
  };

  const token = localStorage.getItem("token");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load archive.");
      setRecords(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // ── CASCADE RESTORE ──────────────────────────────────────────
  // Restores booking + linked payment + linked reviews back to live collections,
  // then removes all three archive records.
  const handleRestore = async (bookingArchivesId) => {
    setRestoreConfirmId(null);
    setActionId(bookingArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/bookings/${bookingArchivesId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Restore failed.");
      // Remove the record from the list since the archive doc was deleted on restore
      setRecords((prev) => prev.filter((r) => r.bookingArchivesId !== bookingArchivesId));
      showToast(data.message || "Booking restored successfully.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  // ── CASCADE DELETE ───────────────────────────────────────────
  // Permanently deletes bookingArchive + linked paymentsArchives + reviewsArchives.
  const handleDelete = async (bookingArchivesId) => {
    setConfirmId(null);
    setActionId(bookingArchivesId);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/archives/bookings/${bookingArchivesId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Delete failed.");
      setRecords((prev) => prev.filter((r) => r.bookingArchivesId !== bookingArchivesId));
      showToast(data.message || "Permanently deleted.", "success");
    } catch (err) { showToast(err.message, "error"); }
    finally { setActionId(null); }
  };

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      (r.bookingArchivesId || "").toLowerCase().includes(q) ||
      (r.bookingID         || "").toLowerCase().includes(q) ||
      (r.customerName      || "").toLowerCase().includes(q) ||
      (r.status            || "").toLowerCase().includes(q);
    return matchSearch && inRange(r.archivedAt, dateFrom, dateTo);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, dateFrom, dateTo]);

  const peso = (n) => {
    if (n == null) return "—";
    if (fmt) return fmt(n);
    return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  };

  // The record currently pending delete (for confirm modal details)
  const confirmRecord = records.find((r) => r.bookingArchivesId === confirmId);
  const restoreConfirmRecord = records.find((r) => r.bookingArchivesId === restoreConfirmId);

  return (
    <div className="w-full px-6 py-6">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.type === "error" ? "bg-red-500" : "bg-teal-600"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* CASCADE RESTORE CONFIRM MODAL */}
      {restoreConfirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 text-lg">↺</div>
              <h3 className="font-semibold text-gray-800">Restore this booking?</h3>
            </div>
            {restoreConfirmRecord && (
              <p className="text-xs font-mono text-gray-400 mb-3 break-all">
                Booking ID: {restoreConfirmRecord.bookingID || restoreConfirmRecord.bookingArchivesId}
              </p>
            )}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 mb-4 space-y-1">
              <p className="text-xs font-semibold text-teal-800">This will also restore:</p>
              <ul className="text-xs text-teal-700 list-disc ml-4 space-y-0.5">
                <li>The linked payment (if any)</li>
                <li>All linked reviews (if any)</li>
              </ul>
              <p className="text-xs text-teal-600 mt-1">All matching archive records will be removed once restored.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRestoreConfirmId(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestore(restoreConfirmId)}
                className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700"
              >
                Yes, Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {viewRecord && (
        <ArchiveDetailModal
          title={`Booking Archive — ${viewRecord.bookingID || viewRecord.bookingArchivesId}`}
          record={viewRecord}
          onClose={() => setViewRecord(null)}
          labelOverrides={{ bookingArchivesId: "Archive ID", bookingID: "Booking ID", carID: "Car ID", userID: "User ID" }}
        />
      )}

      {/* VIEW PAYMENT MODAL — linked paymentsArchives record, scoped to this one booking */}
      {paymentModal && (
        paymentModal.loading ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-2xl shadow-xl p-6 text-sm text-gray-500">Loading payment record…</div>
          </div>
        ) : paymentModal.data ? (
          <ArchiveDetailModal
            title="Linked Payment Archive"
            record={paymentModal.data}
            onClose={() => setPaymentModal(null)}
            labelOverrides={{ paymentsArchivesId: "Archive ID", bookingID: "Booking ID", userID: "User ID" }}
          />
        ) : (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setPaymentModal(null)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-gray-600">{paymentModal.error || paymentModal.message || "No linked payment archive found for this booking."}</p>
              <button onClick={() => setPaymentModal(null)} className="mt-4 px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Close</button>
            </div>
          </div>
        )
      )}

      {/* VIEW BOOKING SESSION MODAL — linked bookingSessionArchives record */}
      {sessionModal && (
        sessionModal.loading ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-2xl shadow-xl p-6 text-sm text-gray-500">Loading booking session…</div>
          </div>
        ) : sessionModal.data ? (
          <ArchiveDetailModal
            title="Linked Booking Session Archive"
            record={sessionModal.data}
            onClose={() => setSessionModal(null)}
            labelOverrides={{ bookingSessionArchivesId: "Archive ID", bookingID: "Booking ID", carID: "Car ID" }}
          />
        ) : (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setSessionModal(null)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-gray-600">{sessionModal.error || sessionModal.message || "No linked booking session archive found for this booking."}</p>
              <button onClick={() => setSessionModal(null)} className="mt-4 px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Close</button>
            </div>
          </div>
        )
      )}

      {/* VIEW VEHICLE INSPECTION MODAL — before/after parts status + photos,
          scoped to just this one booking. These records were never archived
          (they live permanently in their own collections), so this reads
          straight from the live inventory/vehicleDocumentation collections. */}
      {inspectionModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={() => setInspectionModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">Vehicle Inspection Record</h3>
              <button onClick={() => setInspectionModal(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            {inspectionModal.loading ? (
              <p className="text-sm text-gray-500">Loading inspection record…</p>
            ) : inspectionModal.error ? (
              <p className="text-sm text-red-500">{inspectionModal.error}</p>
            ) : (
              (() => {
                const groups = [
                  ["inventoryBeforeTrip", "Parts — Before Trip"],
                  ["inventoryAfterTrip", "Parts — After Trip"],
                  ["vehicleDocumentationBeforeTrip", "Photos — Before Trip"],
                  ["vehicleDocumentationAfterTrip", "Photos — After Trip"],
                ];
                const data = inspectionModal.data || {};
                const hasAny = groups.some(([key]) => (data[key] || []).length > 0);
                if (!hasAny) return <p className="text-sm text-gray-400">No vehicle inspection records found for this booking.</p>;
                return groups.map(([key, label]) => {
                  const rows = data[key] || [];
                  if (rows.length === 0) return null;
                  return (
                    <div key={key} className="mb-5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
                      <div className="space-y-2">
                        {rows.map((row) => (
                          <div key={row.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/60 text-xs text-gray-700">
                            <pre className="whitespace-pre-wrap break-all font-sans">{JSON.stringify(row, null, 2)}</pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>
      )}

      {/* CASCADE DELETE CONFIRM MODAL */}
      {confirmId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-lg">🗑</div>
              <h3 className="font-semibold text-gray-800">Permanently Delete Archive?</h3>
            </div>
            {confirmRecord && (
              <p className="text-xs font-mono text-gray-400 mb-3 break-all">
                Booking ID: {confirmRecord.bookingID || confirmRecord.bookingArchivesId}
              </p>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 space-y-1">
              <p className="text-xs font-semibold text-amber-800">This will also permanently delete:</p>
              <ul className="text-xs text-amber-700 list-disc ml-4 space-y-0.5">
                <li>The linked payment archive (if any)</li>
                <li>All linked review archives (if any)</li>
                <li>The linked booking session archive (if any)</li>
                <li>This booking's vehicle inspection records — before/after parts status and photos (if any)</li>
              </ul>
              <p className="text-xs text-amber-600 mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmId)}
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm hover:bg-red-600"
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">BOOKING ARCHIVE</h1>
        <p className="text-sm text-gray-400 mt-1">
          {loading ? "Loading…" : `${filtered.length} archived record${filtered.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by archive ID, booking ID, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 w-72"
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Archive ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Deleted Booking ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Booking Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Archived At</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">{search || dateFrom || dateTo ? "No records match your filters." : "No archived bookings found."}</td></tr>
            ) : (
              paginated.map((r, i) => (
                <tr key={r.bookingArchivesId} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors ${i % 2 !== 0 ? "bg-gray-50/20" : ""}`}>
                  {/* Archive ID */}
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[130px]" title={r.bookingArchivesId}>
                    {r.bookingArchivesId}
                  </td>
                  {/* Deleted Booking ID — the main identifier of what was deleted */}
                  <td className="px-4 py-3 max-w-[180px]">
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg break-all">
                      {r.bookingID || r.originalId || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">{r.customerName || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-700 font-medium">{peso(r.amount ?? r.totalFee)}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[(r.status || "").toLowerCase()] || "bg-gray-100 text-gray-500"}`}>
                      {r.status || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">{formatDate(r.archivedAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setViewRecord(r)}
                        disabled={!!actionId}
                        title="View full archived record"
                        className="px-3 py-1.5 text-xs rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        View
                      </button>
                      <button
                        onClick={() => setRestoreConfirmId(r.bookingArchivesId)}
                        disabled={!!actionId}
                        title="Restores booking, payment, and reviews back to live collections and removes all archive records"
                        className="px-3 py-1.5 text-xs rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 whitespace-nowrap"
                      >
                        {actionId === r.bookingArchivesId ? "…" : "Restore"}
                      </button>
                      <button
                        onClick={() => openLinkedModal(setPaymentModal, r.bookingArchivesId, "payment")}
                        disabled={!!actionId}
                        title="View the linked archived payment for this booking"
                        className="px-3 py-1.5 text-xs rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        Payment
                      </button>
                      <button
                        onClick={() => openLinkedModal(setInspectionModal, r.bookingArchivesId, "vehicle-inspection")}
                        disabled={!!actionId}
                        title="View this booking's vehicle inspection record (parts status + photos)"
                        className="px-3 py-1.5 text-xs rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        Inspection
                      </button>
                      <button
                        onClick={() => openLinkedModal(setSessionModal, r.bookingArchivesId, "booking-session")}
                        disabled={!!actionId}
                        title="View the linked archived booking session (status, pickup/return, geofence & coding alerts)"
                        className="px-3 py-1.5 text-xs rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        Session
                      </button>
                      {effectiveRole === ROLES.OWNER && (
                      <button
                        onClick={() => setConfirmId(r.bookingArchivesId)}
                        disabled={!!actionId}
                        title="Permanently deletes this archive and all linked payment/review/session/inspection archives"
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap"
                      >
                        Delete
                      </button>
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