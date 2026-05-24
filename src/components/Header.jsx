import { useState, useRef, useEffect } from "react";
import { db } from "../fireabase";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";

/* ── Icons ── */
const BellIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-arl-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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

/**
 * Returns display metadata for each notification type.
 * Covers:
 *   - booking: pending, cancellation_request
 *   - inventory: before_trip_damage, after_trip_damage
 *   - carParts: Damaged, Stolen (legacy damaged_part type)
 */
const notifMeta = (n) => {
  // ── Inventory notifications (written by inventory service) ──
  if (n.type === "before_trip_damage") {
    return { bg: "bg-orange-100", emoji: "🔧", title: "Pre-Trip Damage Detected" };
  }
  if (n.type === "after_trip_damage") {
    return { bg: "bg-red-100", emoji: "⚠️", title: "Post-Trip Damage Reported" };
  }
  // ── Legacy: damaged carParts ──
  if (n._type === "damaged_part") {
    return { bg: "bg-red-100", emoji: "🔧", title: n.status === "Stolen" ? "Stolen Part" : "Damaged Part" };
  }
  // ── Booking notifications ──
  if (n.status === "cancellation_request") {
    return { bg: "bg-orange-100", emoji: "⚠️", title: "Cancellation Request" };
  }
  return { bg: "bg-teal-100", emoji: "🔔", title: "New Booking Request" };
};

/* ── Notification Row ── */
function NotifRow({ n }) {
  const meta = notifMeta(n);
  const isInventory = n.type === "before_trip_damage" || n.type === "after_trip_damage";
  const isBooking   = !isInventory && n.type !== "damaged_part" && !n._type;

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 hover:bg-teal-50 transition-colors">
      <div className={`w-9 h-9 rounded-full ${meta.bg} flex items-center justify-center shrink-0 mt-0.5 text-base`}>
        {meta.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 leading-snug">{meta.title}</p>

        {/* Inventory notification: show full message */}
        {isInventory && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
        )}

        {/* Legacy damaged part */}
        {n._type === "damaged_part" && (
          <>
            <p className="text-xs text-gray-500 mt-0.5">{n.carPartName || "Unknown Part"}</p>
            <p className="text-xs text-gray-400">Car: {n.carName || n.carID || "—"}</p>
          </>
        )}

        {/* Booking notification */}
        {isBooking && (
          <>
            <p className="text-xs text-gray-500 mt-0.5">Booking ID: {n.bookingID || n.id}</p>
            <p className="text-xs text-gray-400">User ID: {n.userID || "—"}</p>
          </>
        )}

        <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt || n.updatedAt)}</p>
      </div>
    </div>
  );
}

/* ── Notification Dropdown ── */
function NotificationDropdown({ notifications }) {
  return (
    <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-card border z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800 text-sm">Notifications</span>
          {notifications.length > 0 && (
            <span className="bg-teal-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {notifications.length}
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
        {notifications.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
            <BellIcon />
            <p className="text-sm">No new notifications</p>
          </div>
        ) : (
          notifications.map((n, i) => <NotifRow key={n.id || i} n={n} />)
        )}
      </div>

      {notifications.length > 0 && (
        <div className="px-5 py-3 border-t bg-gray-50 text-xs text-gray-400 text-center">
          Bookings · Cancellations · Pre/Post-Trip Damage
        </div>
      )}
    </div>
  );
}

/* ── Main Header ── */
export default function Header({ title = "Dashboard", onNewBooking }) {
  const [profileOpen, setProfileOpen]     = useState(false);
  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [user, setUser]                   = useState(null);

  const dropdownRef = useRef(null);
  const notifRef    = useRef(null);

  // Load user from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  const [pendingBookings, setPendingBookings]     = useState([]);
  const [cancelBookings, setCancelBookings]       = useState([]);
  const [damagedParts, setDamagedParts]           = useState([]);
  const [inventoryNotifs, setInventoryNotifs]     = useState([]);

  // ── Stream 1: Pending bookings ──
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "bookings"), where("status", "==", "pending")),
      (snap) => setPendingBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  // ── Stream 2: Cancellation requests ──
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "bookings"), where("status", "==", "cancellation_request")),
      (snap) => setCancelBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  // ── Stream 3: Legacy damaged carParts ──
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "carParts"), where("status", "in", ["Damaged", "Stolen"])),
      async (snap) => {
        const parts = snap.docs.map((d) => ({ id: d.id, ...d.data(), _type: "damaged_part" }));
        // Enrich with car brand/model name
        const carIDs = [...new Set(parts.map(p => p.carID).filter(Boolean))];
        let carNameMap = {};
        if (carIDs.length > 0) {
          try {
            const [carsSnap, brandsSnap, modelsSnap] = await Promise.all([
              getDocs(query(collection(db, "cars"), where("__name__", "in", carIDs))),
              getDocs(collection(db, "brand")),
              getDocs(collection(db, "model")),
            ]);
            const brandMap = Object.fromEntries(brandsSnap.docs.map(d => [d.id, d.data().brandName || ""]));
            const modelMap = Object.fromEntries(modelsSnap.docs.map(d => [d.id, { modelName: d.data().modelName || "", brandID: d.data().brandID }]));
            carsSnap.docs.forEach(d => {
              const model = modelMap[d.data().modelID] || {};
              carNameMap[d.id] = `${brandMap[model.brandID] || ""} ${model.modelName || ""}`.trim() || d.id;
            });
          } catch {}
        }
        setDamagedParts(parts.map(p => ({ ...p, carName: carNameMap[p.carID] || p.carID || "—" })));
      }
    );
    return unsub;
  }, []);

  // ── Stream 4: Inventory notifications (before_trip_damage + after_trip_damage) ──
  // These are written by the inventory service to the `notifications` collection.
  // We only show unread ones (isRead: false).
  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, "notifications"),
        where("isRead", "==", false),
        where("type", "in", ["before_trip_damage", "after_trip_damage"])
      ),
      (snap) => setInventoryNotifs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);

  // ── Combine & sort all notifications ──
  useEffect(() => {
    const combined = [
      ...inventoryNotifs,       // inventory damage (highest priority — show first)
      ...cancelBookings,        // urgent cancellation requests
      ...pendingBookings,       // pending bookings
      ...damagedParts,          // legacy damaged carParts
    ].sort((a, b) => {
      // Sort by most recent first
      const getTs = (n) =>
        n.createdAt?._seconds ?? n.updatedAt?._seconds ?? 0;
      return getTs(b) - getTs(a);
    });
    setNotifications(combined);
  }, [inventoryNotifs, pendingBookings, cancelBookings, damagedParts]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setProfileOpen(false);
      if (notifRef.current    && !notifRef.current.contains(e.target))    setNotifOpen(false);
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

  const hasNew = notifications.length > 0;

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
              onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
              className="relative w-10 h-10 flex items-center justify-center rounded-full bg-arl-light border hover:bg-teal-50 transition-colors"
            >
              <BellIcon />
              {hasNew && (
                <>
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                  {notifications.length > 1 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {notifications.length > 9 ? "9+" : notifications.length}
                    </span>
                  )}
                </>
              )}
            </button>

            {notifOpen && (
              <NotificationDropdown notifications={notifications} />
            )}
          </div>

          <div className="w-px h-6 bg-gray-200" />

          {/* New Booking */}
          <button
            onClick={onNewBooking}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-arl-primary text-white text-sm font-semibold"
          >
            <PlusIcon />
            New Booking
          </button>

          <div className="w-px h-6 bg-gray-200" />

          {/* PROFILE */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              className="flex items-center gap-2 px-3 py-1 rounded-full border"
            >
              <div className="w-8 h-8 rounded-full bg-arl-primary flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
              <div className="flex flex-col items-start">
                <span className="text-xs font-semibold text-arl-dark">{user.username || "User"}</span>
                <span className="text-xs text-gray-400">{user.role}</span>
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-card border">
                <div className="bg-arl-primary px-5 py-4">
                  <p className="text-white font-semibold">{user.username}</p>
                  <p className="text-white/70 text-xs">{user.email}</p>
                  <span className="text-xs text-white/80">{user.role}</span>
                </div>
                <div className="px-5 py-4">
                  <div className="text-sm">
                    <p>Email: {user.email}</p>
                    <p>Role: {user.role}</p>
                  </div>
                  <p className="text-xs text-gray-300 mt-2">Connected to Firebase Auth + JWT</p>
                </div>
                <div className="px-5 py-3 bg-gray-50 border-t">
                  <button
                    onClick={() => {
                      localStorage.removeItem("user");
                      localStorage.removeItem("token");
                      window.location.href = "/";
                    }}
                    className="text-red-500 text-xs font-semibold"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
