import { useState, useEffect, useCallback } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { db } from "../fireabase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
} from "firebase/firestore";

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconBell = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconTrash = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconWarning = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconCheck = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBlock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconClock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconRefresh = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// ─── DATA ────────────────────────────────────────────────────────────────────

const STATUS_TABS = ["All", "Pending", "Active", "Cancelled", "Completed"];

const STATUS_DOT = {
  pending:   "bg-yellow-400",
  approved:  "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
};

const STATUS_BG = {
  pending:   "bg-yellow-50 border border-yellow-200",
  approved:  "bg-blue-50 border border-blue-200",
  completed: "bg-green-50 border border-green-200",
  cancelled: "bg-red-50 border border-red-200",
};

function StatusBadge({ status }) {
  const s   = (status || "").toLowerCase();
  const dot = STATUS_DOT[s] || "bg-gray-400";
  const bg  = STATUS_BG[s]  || "bg-gray-50 border border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {status?.replace("_", " ")}
    </span>
  );
}

const fmtDate = (val) => {
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

const canEdit  = (status) => ["pending", "approved"].includes(status?.toLowerCase());
const isLocked = (status) => ["completed", "cancelled"].includes(status?.toLowerCase());

// ─── NEW BOOKING ALERT BANNER ─────────────────────────────────────────────────

function NewBookingAlert({ notifications, onDismiss, onView }) {
  if (notifications.length === 0) return null;
  const latest = notifications[0];
  const count  = notifications.length;
  return (
    <div className="flex items-start gap-4 bg-teal-600 text-white px-5 py-4 rounded-2xl shadow-lg">
      <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
        <IconBell className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm leading-tight">
          {count === 1 ? "New booking request!" : `${count} new booking requests!`}
        </p>
        <p className="text-white/80 text-xs mt-0.5 truncate">{latest.body}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onView} className="px-3 py-1.5 bg-white text-teal-700 text-xs font-bold rounded-xl hover:bg-teal-50 transition-colors">View Pending</button>
        <button onClick={onDismiss} className="text-white/70 hover:text-white transition-colors">
          <IconX className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ─── DELETE CONFIRM MODAL ─────────────────────────────────────────────────────

function DeleteModal({ booking, onClose, onConfirm, deleting }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
            <IconTrash className="w-5 h-5" />
          </div>
          <h2 className="font-bold text-lg text-gray-800">Delete Booking</h2>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold text-amber-800">This will cascade-delete:</p>
          <ul className="text-sm text-amber-700 list-disc ml-4 space-y-0.5">
            <li>The booking record</li>
            <li>Its linked payment (if any)</li>
            <li>All linked reviews (if any)</li>
          </ul>
          <p className="text-xs text-amber-600 mt-2">All records will be archived before deletion and can be found in their respective Archive pages.</p>
        </div>
        <p className="text-sm text-gray-600">
          Are you sure you want to delete booking <span className="font-mono font-semibold text-gray-800">{booking.bookingID || booking.id}</span>?
        </p>
        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} disabled={deleting} className="px-4 py-2 border rounded-xl text-sm disabled:opacity-50">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
          >
            {deleting ? "Deleting…" : "Yes, Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────

function EditModal({ booking, onClose, onSave }) {
  const currentStatus     = booking.status?.toLowerCase() || "";
  const defaultNextStatus = currentStatus === "pending" ? "approved" : "completed";
  const [form, setForm] = useState({
    location:   booking.location || "",
    notesAdmin: booking.notesAdmin || "",
    status:     defaultNextStatus,
  });
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState(null);
  const [paymentStatus, setPaymentStatus]   = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    const bID = booking.bookingID || booking.id;
    if (!bID || currentStatus !== "pending") return;
    setPaymentLoading(true);
    fetch(`${process.env.REACT_APP_API_URL}/api/payments?bookingID=${encodeURIComponent(bID)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(json => {
        const list  = json.data || json.payments || [];
        const match = list.find(p => p.bookingID === bID);
        setPaymentStatus(match?.status ?? null);
      })
      .catch(() => setPaymentStatus(null))
      .finally(() => setPaymentLoading(false));
  }, [booking, currentStatus, getToken]);

  const approvedStatuses = ["approved", "paid"];
  const isApprovingWithUnpaidPayment =
    form.status === "approved" &&
    currentStatus === "pending" &&
    !paymentLoading &&
    (paymentStatus === null || !approvedStatuses.includes(paymentStatus?.toLowerCase()));

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to save");
      onSave();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-lg text-gray-800">Edit Booking</h2>
        <p className="text-xs text-gray-400 font-mono break-all">{booking.bookingID || booking.id}</p>
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-xl">{error}</div>}
        {form.status === "approved" && currentStatus === "pending" && (
          paymentLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-200 p-3 rounded-xl">
              <IconClock className="w-4 h-4 shrink-0" />
              Checking payment status…
            </div>
          ) : paymentStatus === null ? (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 p-3 rounded-xl">
              <IconBlock className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">No payment record found</p>
                <p className="text-xs text-red-600 mt-0.5">Cannot approve — no payment has been submitted for this booking yet.</p>
              </div>
            </div>
          ) : approvedStatuses.includes(paymentStatus?.toLowerCase()) ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 p-3 rounded-xl">
              <IconCheck className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 font-medium">Payment is <span className="font-bold">{paymentStatus}</span> — booking can be approved.</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 p-3 rounded-xl">
              <IconWarning className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Payment not yet approved</p>
                <p className="text-xs text-amber-700 mt-0.5">Payment status is currently <span className="font-bold">"{paymentStatus}"</span>. Go to the <span className="font-semibold">Payments page</span> and approve the payment first.</p>
              </div>
            </div>
          )
        )}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Location
            <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Admin Notes
            <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none resize-none" value={form.notesAdmin} onChange={(e) => setForm({ ...form, notesAdmin: e.target.value })} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Status
            <select className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {booking.status?.toLowerCase() === "pending" ? (
                <><option value="approved">Approved</option><option value="cancelled">Cancelled</option></>
              ) : (
                <><option value="completed">Completed</option><option value="cancelled">Cancelled</option></>
              )}
            </select>
          </label>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || isApprovingWithUnpaidPayment} className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VIEW DETAILS MODAL ───────────────────────────────────────────────────────

function ViewModal({ booking, onClose }) {
  const { fmt } = useCurrency();
  const row = (label, value) => (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
      <span className="text-gray-500 font-medium w-36 shrink-0">{label}</span>
      <span className="text-gray-800 text-right">{value || "—"}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-gray-800">Booking Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <IconX className="w-5 h-5" />
          </button>
        </div>
        <StatusBadge status={booking.status} />
        <div className="pt-1">
          {row("Booking ID",      booking.bookingID || booking.id)}
          {row("Customer",        booking.customerName)}
          {row("Phone",           booking.phone)}
          {row("Vehicle",         booking.vehicleName)}
          {row("Service Type",    booking.serviceTypeName)}
          {row("Car ID",          booking.carID)}
          {row("Start Date",      fmtDate(booking.startDateTime))}
          {row("End Date",        fmtDate(booking.endDateTime))}
          {row("Duration",        booking.totalDays != null ? `${booking.totalDays} day${booking.totalDays > 1 ? "s" : ""}` : "—")}
          {row("Location",        booking.location)}
          {row("Rental Fee",      fmt(booking.rentalFee))}
          {row("Deposit Fee",     fmt(booking.depositFee))}
          {row("Service Fee",     fmt(booking.serviceFee))}
          {row("Extra Fee",       fmt(booking.extraFee))}
          {row("Total Fee",       fmt(booking.totalFee))}
          {row("Payment Method",  booking.paymentMethod)}
          {row("Mode of Driving", booking.modeOfDriving)}
          {row("Notes (User)",    booking.notesUser)}
          {row("Notes (Admin)",   booking.notesAdmin)}
        </div>
        <button onClick={onClose} className="w-full mt-2 py-2 border rounded-xl text-sm">Close</button>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function Bookings() {
  const { fmt } = useCurrency();
  const { getToken } = useAuth();
  const [activeTab, setActiveTab]           = useState("All");
  const [search, setSearch]                 = useState("");
  const [allBookings, setAllBookings]       = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [viewBooking, setViewBooking]       = useState(null);
  const [editBooking, setEditBooking]       = useState(null);
  const [deleteBooking, setDeleteBooking]   = useState(null);
  const [deleting, setDeleting]             = useState(false);
  const [deleteToast, setDeleteToast]       = useState(null);
  const [newBookingNotifs, setNewBookingNotifs] = useState([]);
  const [alertDismissed, setAlertDismissed]     = useState(false);

  const showToast = (msg, type = "success") => {
    setDeleteToast({ msg, type });
    setTimeout(() => setDeleteToast(null), 4000);
  };

  const fetchBookings = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings?status=all`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load bookings");
      setAllBookings(json.data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  useEffect(() => {
    const q = query(
      collection(db, "notifications"),
      where("type", "==", "new_booking"),
      where("isRead", "==", false),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (docs.length > 0) { setNewBookingNotifs(docs); setAlertDismissed(false); fetchBookings(); }
    });
    return () => unsub();
  }, [fetchBookings]);

  const dismissAlert = async () => {
    setAlertDismissed(true);
    for (const n of newBookingNotifs) {
      try { await updateDoc(doc(db, "notifications", n.id), { isRead: true }); } catch {}
    }
    setNewBookingNotifs([]);
  };

  const viewPending = () => { setActiveTab("Pending"); dismissAlert(); };

  const handleDeleteConfirm = async () => {
    if (!deleteBooking) return;
    setDeleting(true);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${deleteBooking.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Delete failed.");
      setAllBookings((prev) => prev.filter((b) => b.id !== deleteBooking.id));
      showToast(`Booking archived and deleted. ${json.data?.reviewsArchivedCount > 0 ? `${json.data.reviewsArchivedCount} review(s) also archived.` : ""}`, "success");
      setDeleteBooking(null);
    } catch (err) { showToast(err.message, "error"); }
    finally { setDeleting(false); }
  };

  const counts = {
    All:       allBookings.length,
    Pending:   allBookings.filter((b) => b.status?.toLowerCase() === "pending").length,
    Active:    allBookings.filter((b) => b.status?.toLowerCase() === "approved").length,
    Cancelled: allBookings.filter((b) => b.status?.toLowerCase() === "cancelled").length,
    Completed: allBookings.filter((b) => b.status?.toLowerCase() === "completed").length,
  };

  const tabStatusMap = { Active: "approved" };
  const tabFiltered  = activeTab === "All"
    ? allBookings
    : allBookings.filter((b) => b.status?.toLowerCase() === (tabStatusMap[activeTab] || activeTab.toLowerCase()));

  const filtered = tabFiltered.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (b.bookingID || b.id || "").toLowerCase().includes(q) ||
      (b.customerName || "").toLowerCase().includes(q) ||
      (b.vehicleName || "").toLowerCase().includes(q) ||
      (b.phone || "").toLowerCase().includes(q)
    );
  });

  const fmtDuration = (days) => { if (days == null) return "—"; return days <= 1 ? `${days} day` : `${days} days`; };

  return (
    <div className="p-4 space-y-5 font-sans">

      {/* TOAST */}
      {deleteToast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${deleteToast.type === "error" ? "bg-red-500" : "bg-teal-600"}`}>
          {deleteToast.msg}
        </div>
      )}

      {/* NEW BOOKING ALERT */}
      {!alertDismissed && newBookingNotifs.length > 0 && (
        <NewBookingAlert notifications={newBookingNotifs} onDismiss={dismissAlert} onView={viewPending} />
      )}

      {/* STAT TABS */}
      <div className="grid grid-cols-5 gap-3">
        {STATUS_TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`p-4 rounded-2xl border text-left transition-all ${activeTab === tab ? "border-teal-500 bg-teal-50 shadow-sm" : "bg-white hover:bg-gray-50"}`}
          >
            <div className={`text-2xl font-bold ${activeTab === tab ? "text-teal-600" : "text-gray-800"}`}>{loading ? "…" : counts[tab] ?? 0}</div>
            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              {tab === "All" ? "All Bookings" : tab}
              {tab === "Pending" && !alertDismissed && newBookingNotifs.length > 0 && <span className="w-2 h-2 bg-red-500 rounded-full inline-block" />}
            </div>
          </button>
        ))}
      </div>

      {/* SEARCH */}
      <div className="flex gap-3 items-center bg-white p-4 rounded-2xl border">
        <input
          type="text"
          placeholder="Search by booking ID, customer, vehicle, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-xl text-sm outline-none"
        />
        <button
          onClick={fetchBookings}
          className="px-4 py-2 border rounded-xl text-sm text-teal-600 font-medium hover:bg-teal-50 flex items-center gap-1.5"
        >
          <IconRefresh className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex justify-between items-center">
          <span className="flex items-center gap-2">
            <IconWarning className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={fetchBookings} className="underline font-semibold">Retry</button>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">
            {activeTab === "All" ? "All Bookings" : `${activeTab} Bookings`}
            <span className="text-gray-400 text-sm font-normal ml-2">{filtered.length} results</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Booking ID</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Vehicle</th>
                <th className="px-4 py-3 text-left">Dates</th>
                <th className="px-4 py-3 text-left">Duration</th>
                <th className="px-4 py-3 text-left">Total Fee</th>
                <th className="px-4 py-3 text-left">Payment</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-12">No bookings found</td></tr>
              ) : (
                filtered.map((b) => {
                  const isNew = newBookingNotifs.some((n) => n.bookingID === (b.bookingID || b.id));
                  return (
                    <tr key={b.id} className={`border-t hover:bg-gray-50 transition-colors ${isNew ? "bg-teal-50 border-l-4 border-l-teal-500" : ""}`}>
                      <td className="px-4 py-3 text-gray-700 text-xs">
                        {b.bookingID || b.id}
                        {isNew && <span className="ml-2 text-[10px] font-bold bg-teal-500 text-white px-1.5 py-0.5 rounded-full">NEW</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{b.customerName}</div>
                        <div className="text-xs text-gray-400">{b.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700">{b.vehicleName}</div>
                        <div className="text-xs text-gray-400">{b.serviceTypeName}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(b.startDateTime)} – {fmtDate(b.endDateTime)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDuration(b.totalDays)}
                        {b.durationType && <span className="text-xs text-gray-400 ml-1">· {b.durationType}</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{fmt(b.totalFee)}</td>
                      <td className="px-4 py-3 text-gray-600">{b.paymentMethod}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setViewBooking(b)} className="px-3 py-1 border rounded-lg text-xs hover:bg-gray-50">View</button>
                          <button
                            onClick={() => canEdit(b.status) && setEditBooking(b)}
                            disabled={isLocked(b.status)}
                            className={`px-3 py-1 border rounded-lg text-xs transition-colors ${isLocked(b.status) ? "border-gray-200 text-gray-300 cursor-not-allowed" : "border-teal-400 text-teal-600 hover:bg-teal-50"}`}
                          >Edit</button>
                          <button
                            onClick={() => setDeleteBooking(b)}
                            className="px-3 py-1 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 transition-colors"
                          >Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewBooking   && <ViewModal booking={viewBooking} onClose={() => setViewBooking(null)} />}
      {editBooking   && <EditModal booking={editBooking} onClose={() => setEditBooking(null)} onSave={() => { setEditBooking(null); fetchBookings(); }} />}
      {deleteBooking && (
        <DeleteModal
          booking={deleteBooking}
          onClose={() => !deleting && setDeleteBooking(null)}
          onConfirm={handleDeleteConfirm}
          deleting={deleting}
        />
      )}
    </div>
  );
}
