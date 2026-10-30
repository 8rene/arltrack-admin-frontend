import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../fireabase";
import { useAuth } from "../context/AuthContext";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

const API_URL = process.env.REACT_APP_API_URL;

// Mark-read / delete go through the backend (admin SDK, scoped to the caller's own
// notifications) so they don't depend on the Firestore client rules. Reads stay on the
// live Firestore listener below.
async function notifApi(method, path, token) {
  const res = await fetch(`${API_URL}/api/notifications${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/* ── Icons ── */
const BellIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-arl-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/* ── Helpers ── */
const getFormattedDate = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const timeAgo = (ts) => {
  if (!ts) return "";
  let date;
  if (typeof ts?.toDate === "function") date = ts.toDate();
  else if (ts?._seconds !== undefined) date = new Date(ts._seconds * 1000);
  else date = new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// Where each refCollection's notifications open to, and how the ?open=
// param is expected to be read by that page (see Bookings.jsx / Users.jsx /
// CarTracking.jsx for the reader side).
const ROUTE_BY_COLLECTION = {
  bookings: "/bookings",
  user: "/users",
  idResubmitRequests: "/users",
  editRequests: "/users",
  cars: "/car-tracking",
  refundRequests: "/refund-requests",
  maintenance: "/maintenance",
  // "A penalty needs review" / "A penalty was charged" — opens the Penalties page with that penalty's details
  // (Penalties.jsx reads ?open=).
  penalties: "/penalties",
  // Profile edit / ID resubmit approve-reject notifications (sent to the
  // requester themself, not staff) — nothing to deep-link into beyond
  // their own Account page.
  account: "/account",
  // "Terms & Conditions Updated" — sent to every user when a new version is published.
  terms: "/terms",
  // "Archived account review" — opens the Deleted Users page with that person's details window (UserArchivePage reads ?open=).
  userArchives: "/archives/users",
};

const META_BY_TYPE = {
  cancellation_request: { bg: "bg-orange-100", emoji: "⚠️", title: "Cancellation Request" },
  new_booking:          { bg: "bg-teal-100",   emoji: "📅", title: "New Booking" },
  new_user:             { bg: "bg-teal-100",   emoji: "🆕", title: "New User Signup" },
  geofence_alert:       { bg: "bg-red-100",    emoji: "📍", title: "Vehicle Left Zone" },
  coding_alert:         { bg: "bg-red-100",    emoji: "🚫", title: "Coding Restriction" },
  pickup_overdue:       { bg: "bg-orange-100", emoji: "⏰", title: "Pickup Overdue" },
  return_overdue:       { bg: "bg-red-100",    emoji: "⏰", title: "Return Overdue" },
  maintenance_overdue:  { bg: "bg-red-100",    emoji: "🔧", title: "Maintenance Overdue" },
  // A Supervisor scheduled maintenance — sent to the Owner(s) only.
  maintenance_created:  { bg: "bg-teal-100",   emoji: "🔧", title: "Maintenance Created" },
  // A driver noted a penalty: it waits for a supervisor to edit / confirm it before the customer is told.
  penalty_review:       { bg: "bg-amber-100",  emoji: "📝", title: "Penalty Needs Review" },
  penalty_created:      { bg: "bg-red-100",    emoji: "⚠️", title: "Penalty Charged" },
  refund_request:       { bg: "bg-blue-100",   emoji: "💸", title: "Refund Request" },
  refund_due:           { bg: "bg-blue-100",   emoji: "💰", title: "Refund Due" },
  license_expiring:     { bg: "bg-yellow-100", emoji: "🪪", title: "License Expiring Soon" },
  license_expired:      { bg: "bg-red-100",    emoji: "🪪", title: "License Expired" },
  driver_assigned:      { bg: "bg-teal-100",   emoji: "🚗", title: "Trip Assigned" },
  booking_cancelled:    { bg: "bg-red-100",    emoji: "🚫", title: "Booking Cancelled" },
  // A driver hit "Remind Staff" in My Trips — they can't start pickup /
  // return until the vehicle inspection is completed.
  inspection_pickup_needed: { bg: "bg-orange-100", emoji: "📋", title: "Pickup Inspection Needed" },
  inspection_return_needed: { bg: "bg-orange-100", emoji: "📋", title: "Return Inspection Needed" },
  // Sent to the requester themself once an Owner/Admin reviews their
  // profile-edit or ID/license resubmission request.
  id_resubmit_request:  { bg: "bg-indigo-100", emoji: "🪪", title: "ID Resubmission" },
  edit_request:         { bg: "bg-blue-100",   emoji: "✏️", title: "Profile Edit Request" },
  profile_edit_approved: { bg: "bg-green-100", emoji: "✅", title: "Profile Update" },
  profile_edit_rejected: { bg: "bg-red-100",   emoji: "❌", title: "Profile Update" },
  id_resubmit_approved:  { bg: "bg-green-100", emoji: "✅", title: "Document/License Update" },
  id_resubmit_rejected:  { bg: "bg-red-100",   emoji: "❌", title: "Document/License Update" },
  // Sent to every user when an Owner/Admin publishes a new Terms & Conditions version.
  terms_updated:         { bg: "bg-blue-100",  emoji: "📄", title: "Terms & Conditions Updated" },
  // An archived customer pressed "Ask the administrator to check my account" on the login screen (written by the CUSTOMER backend).
  archive_appeal:        { bg: "bg-amber-100", emoji: "🔓", title: "Archived Account Review" },
};

/* ── Notification Row ── */
function NotifRow({ n, onOpen, onDelete }) {
  const meta = META_BY_TYPE[n.type] || { bg: "bg-gray-100", emoji: "🔔", title: n.title || "Notification" };
  const unread = !n.isRead;

  return (
    <div className={`flex items-start gap-2 pl-3 pr-4 py-3.5 hover:bg-teal-50 transition-colors ${unread ? "bg-teal-50/60" : "bg-white"}`}>
      {/* unread dot (blank spacer when read so rows stay aligned) */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 mt-4 ${unread ? "bg-teal-500" : "bg-transparent"}`}
        title={unread ? "Unread" : "Read"}
      />
      <button
        onClick={() => onOpen(n)}
        className="flex items-start gap-3 flex-1 min-w-0 text-left"
      >
        <div className={`w-9 h-9 rounded-full ${meta.bg} flex items-center justify-center shrink-0 mt-0.5 text-base ${unread ? "" : "opacity-60"}`}>
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${unread ? "font-semibold text-gray-800" : "font-medium text-gray-500"}`}>{meta.title}</p>
          <p className={`text-xs mt-0.5 leading-relaxed ${unread ? "text-gray-600" : "text-gray-400"}`}>{n.message}</p>
          <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
        </div>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
        className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full p-1.5 shrink-0 transition-colors"
        title="Delete notification"
        aria-label="Delete notification"
      >
        <XIcon />
      </button>
    </div>
  );
}

/* ── Notification Dropdown ── */
const EMPTY_TEXT = { all: "No notifications", unread: "No unread notifications" };

function NotificationDropdown({ notifications, tab, onTab, error, onOpen, onDelete, onMarkAllRead, onClear }) {
  const unread = notifications.filter((n) => !n.isRead);
  const shown  = tab === "unread" ? unread : notifications;

  const tabs = [
    { key: "all",    label: "All",    count: notifications.length },
    { key: "unread", label: "Unread", count: unread.length },
  ];

  return (
    <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-card border z-50 overflow-hidden">
      <div className="px-5 pt-3 border-b bg-gray-50">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            Notifications
            <span className="text-[11px] font-semibold text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">{notifications.length}</span>
          </span>
          <div className="flex items-center gap-3">
            {unread.length > 0 && (
              <button onClick={onMarkAllRead} className="text-xs font-semibold text-teal-600 hover:text-teal-700">
                Mark all read
              </button>
            )}
            {tab !== "unread" && shown.length > 0 && (
              <button onClick={() => onClear("all")} className="text-xs font-semibold text-red-500 hover:text-red-600">
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1 mt-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onTab(t.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
                tab === t.key ? "text-teal-700 border-teal-500" : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              {t.label} <span className="ml-0.5">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</p>}

      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
        {shown.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
            <BellIcon />
            <p className="text-sm">{EMPTY_TEXT[tab]}</p>
          </div>
        ) : (
          shown.map((n) => (
            <NotifRow key={n.id} n={n} onOpen={onOpen} onDelete={onDelete} />
          ))
        )}
      </div>

      {notifications.length > 0 && (
        <div className="px-5 py-3 border-t bg-gray-50 text-xs text-gray-400 text-center">
          Cancellations · New Users · Vehicle Alerts · Pickup/Return
        </div>
      )}
    </div>
  );
}

/* ── Main Header ── */
export default function Header({ title = "Dashboard" }) {
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifTab, setNotifTab]             = useState("all"); // "all" | "unread"
  const [notifError, setNotifError]         = useState("");
  // Sourced from AuthContext (backed by localStorage under the hood) rather
  // than reading localStorage directly here — that used to be a one-time
  // read on mount, so a username/profile edit never showed up until the
  // next full login. AuthContext's `user` updates live via updateUser(),
  // so this now re-renders immediately when a profile edit changes it.
  const { user, getToken } = useAuth();

  const notifRef = useRef(null);

  // Single query, single listener: every notification type now fans out
  // to specific people with a real userID (Owner/Admin/Supervisor for
  // staff-facing types, or the specific driver for driver_assigned /
  // license alerts). Nothing writes userID: null anymore, so the old
  // second "global" listener would only ever return an empty snapshot —
  // removed rather than left running as dead weight.
  //
  // Gated on `user` being loaded first (from the separate effect above)
  // since we need user.uid before this query can even be built.
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(
      query(
        collection(db, "notifications"),
        where("status", "==", "active"),
        where("userID", "==", user.uid)
      ),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setNotifications(rows);
      }
    );

    return () => unsub();
  }, [user]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!user) return null;

  const initials = (user.username || user.email || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const hasNew      = unreadCount > 0;

  // Opening the bell no longer marks everything read — that made every
  // notification look "read" the instant it was opened, so there was no way to
  // tell new from old. A notification is marked read when it's clicked (see
  // handleOpen), or all at once with "Mark all read". Read state lives in
  // Firestore, so it's the same on every device this account logs into.
  const handleBellClick = () => setNotifOpen((v) => !v);

  const showNotifError = (msg) => {
    setNotifError(msg);
    setTimeout(() => setNotifError(""), 4000);
  };

  // Backend first; if it can't be reached, fall back to writing Firestore directly
  // from the browser. Only if both fail does the person see an error.
  const markRead = async (n) => {
    if (n.isRead) return;
    try { await notifApi("PATCH", `/${n.id}/read`, getToken()); }
    catch { updateDoc(doc(db, "notifications", n.id), { isRead: true }).catch(() => {}); }
  };

  const handleMarkAllRead = async () => {
    try { await notifApi("POST", "/read-all", getToken()); }
    catch {
      try { await Promise.all(notifications.filter((n) => !n.isRead).map((n) => updateDoc(doc(db, "notifications", n.id), { isRead: true }))); }
      catch { showNotifError("Couldn't mark notifications as read. Try again."); }
    }
  };

  // Click → exact record, not just the page. Bookings/Customers read the
  // ?open=<refID> query param on mount (see their own useEffect hooks).
  // CarTracking already has its own working deep-link convention via
  // router state (location.state.selectCarId) — reuse that instead of
  // adding a second, redundant way to do the same thing.
  const handleOpen = (n) => {
    markRead(n);
    setNotifOpen(false);
    // Drivers can't open /bookings, /users, /refund-requests etc., so those
    // links bounced them to the Dashboard. Send them where they can act:
    // license alerts → their Account, everything else → My Trips (on the
    // exact trip when the notification points at a booking). An unassigned
    // trip is no longer in their list, so just open the page.
    if (user?.role === "Driver") {
      if (n.type === "terms_updated") {
        navigate("/terms");
        return;
      }
      if (n.type === "license_expired" || n.type === "license_expiring" || n.refCollection === "account" || n.refCollection === "user") {
        navigate("/account");
      } else if (n.refCollection === "bookings" && n.refID && n.type !== "driver_unassigned" && n.type !== "booking_cancelled") {
        navigate(`/my-trips?open=${n.refID}`);
      } else {
        navigate("/my-trips");
      }
      return;
    }
    // Driver waiting on the inspection → straight to that booking's
    // Vehicle Inspections page, in the same pickup/return "focus" mode
    // Car Tracking uses. refID is the booking doc ID; carID/phase were
    // stored on the notification when the driver sent the reminder.
    if ((n.type === "inspection_pickup_needed" || n.type === "inspection_return_needed") && n.refID && n.carID) {
      const action = n.type === "inspection_return_needed" ? "return" : "pickup";
      navigate(`/vehicle-documentation?carID=${n.carID}&bookingID=${n.refID}&action=${action}`);
      return;
    }
    if (n.refCollection === "cars" && n.refID) {
      navigate("/car-tracking", { state: { selectCarId: n.refID } });
      return;
    }
    // Document resubmission / profile edit requests → the exact modal on the Users page.
    // requesterRole (stored on the notification) picks the right role tab; older
    // notifications without it fall back to Customers.
    if ((n.refCollection === "idResubmitRequests" || n.refCollection === "editRequests") && n.refID) {
      const role = String(n.requesterRole || "customer").toLowerCase();
      const tab  = n.refCollection === "idResubmitRequests" ? "documents" : "editRequests";
      navigate(`/users?role=${role}&tab=${tab}&open=${n.refID}`);
      return;
    }
    const base = ROUTE_BY_COLLECTION[n.refCollection];
    if (base && n.refID) {
      navigate(`${base}?open=${n.refID}`);
    } else if (base) {
      navigate(base);
    }
  };

  const handleDelete = async (notifID) => {
    try { await notifApi("DELETE", `/${notifID}`, getToken()); }
    catch {
      try { await deleteDoc(doc(db, "notifications", notifID)); }
      catch { showNotifError("Couldn't delete that notification. Try again."); }
    }
  };

  // scope "all" clears every notification of this account; "read" only the ones already read.
  const handleClear = async (scope) => {
    const targets = scope === "read" ? notifications.filter((n) => n.isRead) : notifications;
    if (targets.length === 0) return;
    const what = scope === "read" ? "read notification" : "notification";
    if (!window.confirm(`Delete ${targets.length} ${what}${targets.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    try { await notifApi("DELETE", `?scope=${scope}`, getToken()); }
    catch {
      try { await Promise.all(targets.map((n) => deleteDoc(doc(db, "notifications", n.id)))); }
      catch { showNotifError("Couldn't clear notifications. Try again."); }
    }
  };

  return (
    <header className="w-full bg-white border-b border-gray-100 shadow-soft px-6 py-4 relative z-50">
      <div className="flex items-center justify-between">

        {/* LEFT */}
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-arl-dark">{title}</h1>
          <p className="text-sm text-gray-400">{getFormattedDate()}</p>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-3">

          {/* 🔔 Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={handleBellClick}
              className="relative w-10 h-10 flex items-center justify-center rounded-full bg-arl-light border hover:bg-teal-50 transition-colors"
            >
              <BellIcon />
              {hasNew && (
                <>
                  <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 rounded-full bg-red-500 animate-ping opacity-60" />
                  <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                </>
              )}
            </button>

            {notifOpen && (
              <NotificationDropdown
                notifications={notifications}
                tab={notifTab}
                onTab={setNotifTab}
                error={notifError}
                onOpen={handleOpen}
                onDelete={handleDelete}
                onMarkAllRead={handleMarkAllRead}
                onClear={handleClear}
              />
            )}
          </div>

          <div className="w-px h-6 bg-gray-200" />

          {/* PROFILE */}
          <button
            onClick={() => navigate("/account")}
            className="flex items-center gap-2 px-3 py-1 rounded-full border hover:bg-teal-50 transition-colors"
          >
            <AvatarBubble key={user.profileImage || "none"} src={user.profileImage} initials={initials} className="w-8 h-8 text-xs" />
            <div className="flex flex-col items-start">
              <span className="text-xs font-semibold text-arl-dark">{user.username || "User"}</span>
              <span className="text-xs text-gray-400">{user.role}</span>
            </div>
          </button>

        </div>
      </div>
    </header>
  );
}

// Round profile photo with an initials fallback — used when the account has
// no photo yet, or the image can't be loaded. Give it a `key` that changes
// with `src` so a failed load is retried when the photo is replaced.
function AvatarBubble({ src, initials, className = "" }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <div className={`${className} rounded-full bg-arl-primary flex items-center justify-center text-white font-bold shrink-0`}>
      {initials}
    </div>
  );
}