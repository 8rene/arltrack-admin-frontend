import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../fireabase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

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
  cars: "/car-tracking",
};

const META_BY_TYPE = {
  cancellation_request: { bg: "bg-orange-100", emoji: "⚠️", title: "Cancellation Request" },
  new_user:             { bg: "bg-teal-100",   emoji: "🆕", title: "New User Signup" },
  geofence_alert:       { bg: "bg-red-100",    emoji: "📍", title: "Vehicle Left Zone" },
  coding_alert:         { bg: "bg-red-100",    emoji: "🚫", title: "Coding Restriction" },
  pickup_overdue:       { bg: "bg-orange-100", emoji: "⏰", title: "Pickup Overdue" },
  return_overdue:       { bg: "bg-red-100",    emoji: "⏰", title: "Return Overdue" },
};

/* ── Notification Row ── */
function NotifRow({ n, onOpen, onDelete }) {
  const meta = META_BY_TYPE[n.type] || { bg: "bg-gray-100", emoji: "🔔", title: n.title || "Notification" };

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 hover:bg-teal-50 transition-colors group">
      <button
        onClick={() => onOpen(n)}
        className="flex items-start gap-3 flex-1 min-w-0 text-left"
      >
        <div className={`w-9 h-9 rounded-full ${meta.bg} flex items-center justify-center shrink-0 mt-0.5 text-base`}>
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 leading-snug">{meta.title}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
          <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
        </div>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 shrink-0"
        title="Dismiss"
      >
        <XIcon />
      </button>
    </div>
  );
}

/* ── Notification Dropdown ── */
function NotificationDropdown({ notifications, onOpen, onDelete }) {
  return (
    <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-card border z-50 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <span className="font-semibold text-gray-800 text-sm">Notifications</span>
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
        {notifications.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
            <BellIcon />
            <p className="text-sm">No new notifications</p>
          </div>
        ) : (
          notifications.map((n) => (
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
  const [user, setUser]                   = useState(null);

  const notifRef = useRef(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  // Single source of truth: one query against the real notifications
  // collection, active ones only. Replaces the old 4 mismatched streams
  // (2 of which were live business queries with no read state, plus a
  // legacy carParts stream, plus an inventory stream) with one consistent
  // shape — see models/notification/notification.model.js on the backend.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "notifications"), where("status", "==", "active")),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setNotifications(rows);
      }
    );
    return unsub;
  }, []);

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

  const handleBellClick = () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening) {
      // Mark all currently loaded notifications as read IN FIRESTORE, not
      // localStorage — so the badge state is the same on every device/
      // browser this admin logs into, not just this one.
      notifications.forEach((n) => {
        if (!n.isRead) {
          updateDoc(doc(db, "notifications", n.id), { isRead: true }).catch(() => {});
        }
      });
    }
  };

  // Click → exact record, not just the page. Bookings/Customers read the
  // ?open=<refID> query param on mount (see their own useEffect hooks).
  // CarTracking already has its own working deep-link convention via
  // router state (location.state.selectCarId) — reuse that instead of
  // adding a second, redundant way to do the same thing.
  const handleOpen = (n) => {
    setNotifOpen(false);
    if (n.refCollection === "cars" && n.refID) {
      navigate("/car-tracking", { state: { selectCarId: n.refID } });
      return;
    }
    const base = ROUTE_BY_COLLECTION[n.refCollection];
    if (base && n.refID) {
      navigate(`${base}?open=${n.refID}`);
    } else if (base) {
      navigate(base);
    }
  };

  const handleDelete = (notifID) => {
    deleteDoc(doc(db, "notifications", notifID)).catch(() => {});
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
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                  {unreadCount > 1 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </>
              )}
            </button>

            {notifOpen && (
              <NotificationDropdown
                notifications={notifications}
                onOpen={handleOpen}
                onDelete={handleDelete}
              />
            )}
          </div>

          <div className="w-px h-6 bg-gray-200" />

          {/* PROFILE */}
          <button
            onClick={() => navigate("/profile")}
            className="flex items-center gap-2 px-3 py-1 rounded-full border hover:bg-teal-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-arl-primary flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
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