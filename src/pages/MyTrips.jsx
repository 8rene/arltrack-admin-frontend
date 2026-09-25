import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import TripMapModal from "../components/TripMapModal";
import PaymentStatusModal from "../components/PaymentStatusModal";
import TripDetailModal from "../components/TripDetailModal";

const API_URL = process.env.REACT_APP_API_URL;

// ─── ICONS ───────────────────────────────────────────────────────────────

const IconSteering = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.5" />
    <path strokeLinecap="round" d="M12 3v6.5M12 14.5V21M4.2 7.5l5.6 3.2M14.2 13.3l5.6 3.2M19.8 7.5l-5.6 3.2M9.8 13.3l-5.6 3.2" />
  </svg>
);

const IconClock = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
  </svg>
);

const IconPin = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-7.75 7-13a7 7 0 10-14 0c0 5.25 7 13 7 13z" />
    <circle cx="12" cy="8" r="2.5" />
  </svg>
);

const IconFlag = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" strokeLinecap="round" />
  </svg>
);

const IconPeso = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 20V4h6a4 4 0 010 8H7M4 10h11M4 13h9" />
  </svg>
);

const IconMap = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path strokeLinecap="round" d="M9 4v14M15 6v14" />
  </svg>
);

const IconHistory = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 109-9 9 9 0 00-6.36 2.64L3 8" />
    <path strokeLinecap="round" d="M3 3v5h5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
  </svg>
);

const IconEye = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const fmtDateTime = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const fmtDateTimeLong = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const fmtTime = (val) => {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d)) return null;
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};

const STATUS_STYLE = {
  completed: "bg-blue-50 text-blue-700 border border-blue-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
  stolen:    "bg-red-900 text-white",
};

// Shared: turn a trip's pickupLocation/dropoffLocation into the `stops`
// shape TripMapModal expects. Both are included whenever present — even
// when dropoff shares pickup's address (e.g. a round trip back to the
// same spot), it's still a real stop the driver needs to log/confirm,
// so it stays on the list rather than being silently collapsed away.
// Roughly "same point" — ~55m, generous enough that a geofence zone
// centered on the exact pickup/dropoff coordinate (which the customer
// backend's makeZone() may include alongside genuine extra stops) is
// recognized as a duplicate rather than shown as its own pin.
const SAME_SPOT_DEG = 0.0005;
const isSameSpot = (a, b) =>
  !!a && !!b && Math.abs(a.lat - b.lat) < SAME_SPOT_DEG && Math.abs(a.lng - b.lng) < SAME_SPOT_DEG;

const tripStops = (trip) => {
  const stops = [];
  if (trip.pickupLocation) stops.push({ key: "pickup", type: "pickup", ...trip.pickupLocation });
  if (trip.dropoffLocation) stops.push({ key: "dropoff", type: "dropoff", ...trip.dropoffLocation });
  // Extra stops selected during booking — the same geofenceZones
  // CarTracking's live map already draws for staff. Filtered to genuine
  // extras: skip anything whose own label calls it out as pickup/dropoff,
  // or that sits on (near) the same coordinate as one — either would just
  // double up a pin that's already shown above.
  (trip.geofenceZones || []).forEach((zone, i) => {
    if (typeof zone.lat !== "number" || typeof zone.lng !== "number") return;
    const label = (zone.label || "").toLowerCase();
    if (label.includes("pickup") || label.includes("drop")) return;
    if (isSameSpot(zone, trip.pickupLocation) || isSameSpot(zone, trip.dropoffLocation)) return;
    stops.push({ key: `stop-${i}`, type: "stop", address: zone.label || `Stop ${i + 1}`, lat: zone.lat, lng: zone.lng });
  });
  return stops;
};

// mm:ss for the Remind Staff cooldown.
const fmtCountdown = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

// Where the vehicle inspection stands for one phase of a trip. Drivers no
// longer fill the inspection in — a supervisor does — so this is a
// read-only checklist plus a Remind Staff nudge. The button's cooldown is
// enforced by the server (10 min per trip + phase); `remaining` here is
// only the display of it.
function InspectionPanel({ inspection, phase, remaining, sending, onRemind }) {
  if (inspection.complete) {
    return (
      <p className="text-[11px] font-medium text-green-600 mb-1">
        ✓ Vehicle inspection complete — {phase === "before" ? "ready for pickup" : "ready to return"}
      </p>
    );
  }
  const Row = ({ done, label }) => (
    <span className={`flex items-center gap-1.5 ${done ? "text-green-700" : "text-gray-500"}`}>
      <span className="font-bold w-3 text-center">{done ? "✓" : "○"}</span> {label}
    </span>
  );
  const cooling = remaining > 0;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 mb-1 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-800">
            Waiting for a supervisor to complete the {phase === "before" ? "pickup" : "return"} inspection
          </p>
          <div className="text-[11px] space-y-0.5">
            <Row done={inspection.photos} label="Front, side & back photos" />
            <Row done={inspection.parts} label="Parts condition" />
          </div>
        </div>
        <button
          onClick={onRemind}
          disabled={sending || cooling}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {sending ? "Sending…" : cooling ? `Remind again in ${fmtCountdown(remaining)}` : "🔔 Remind Staff"}
        </button>
      </div>
    </div>
  );
}

// ─── ACTIVE TRIPS TAB (upcoming + ongoing, with pickup/dropoff/return actions) ──
function ActiveTripsTab() {
  const token = localStorage.getItem("token");

  const [trips, setTrips]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState(null);
  const [busyID, setBusyID]   = useState(null);
  const [mapTrip, setMapTrip] = useState(null);
  const [paymentTrip, setPaymentTrip] = useState(null);
  const [collectingBalance, setCollectingBalance] = useState(false);
  const [collectBalanceError, setCollectBalanceError] = useState(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [confirmPaymentError, setConfirmPaymentError] = useState(null);
  const [markingRefund, setMarkingRefund] = useState(false);
  const [refundError, setRefundError] = useState(null);
  // Remind Staff cooldowns: "<tripID>:<phase>" → epoch ms when the button
  // unlocks. Seeded from the server on every fetch (so a page refresh
  // doesn't reset it) and bumped locally right after a reminder is sent.
  const [remindUntil, setRemindUntil]   = useState({});
  const [now, setNow]                   = useState(Date.now());
  const [remindingKey, setRemindingKey] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

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

  // { silent: true } = background refresh: no loading spinner, no error toast.
  const fetchTrips = useCallback(async (opts) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const res  = await authedFetch("/api/driver-dispatch/my-trips");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load your trips.");
      setTrips(json.data);

      // Server sends seconds-remaining (not a timestamp) so this phone's
      // clock can't skew the countdown.
      const t0 = Date.now();
      const until = {};
      json.data.forEach((t) => ["before", "after"].forEach((ph) => {
        const secs = t.inspectionReminder?.[ph]?.retryAfterSeconds || 0;
        if (secs > 0) until[`${t.id}:${ph}`] = t0 + secs * 1000;
      }));
      setRemindUntil(until);
      setNow(t0);
    } catch (e) {
      if (!silent) showToast(e.message, "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  // The driver is often standing at the car waiting on a supervisor to
  // finish the inspection, or waiting on a payment to clear, or a new
  // booking to land — none of which the driver themself triggers, so this
  // page needs to notice on its own instead of only updating after the
  // driver's own actions. The bell (Header.jsx) is a live Firestore
  // listener, but it only pings the driver for a new assignment or a
  // discount — it doesn't touch this page's own trip cards (payment
  // status, inspection checklist, reminder cooldown), which come from a
  // plain API call. So this page still refreshes itself:
  //  - a 1-minute poll while the tab is open and visible — the inspection
  //    checklist and Remind Staff cooldown don't need anything tighter, and
  //  - an immediate refetch the moment the app is foregrounded again
  //    (switching back from another app, or waking the phone screen),
  //    rather than waiting for the next poll tick — this is what actually
  //    catches most "just got back to it" cases.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchTrips({ silent: true });
    }, 60000);
    const onForeground = () => fetchTrips({ silent: true });
    const onVisibilityChange = () => { if (document.visibilityState === "visible") onForeground(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onForeground);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onForeground);
    };
  }, [fetchTrips]);

  // 1-second tick, only while at least one Remind Staff cooldown is running.
  useEffect(() => {
    if (!Object.values(remindUntil).some((t) => t > now)) return undefined;
    const id = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(id);
  }, [remindUntil, now]);

  const remainingFor = (tripID, phase) =>
    Math.max(0, Math.ceil(((remindUntil[`${tripID}:${phase}`] || 0) - now) / 1000));

  // Two hard blocks before pickup, both re-checked server-side:
  //  - unresolved payment.
  //  - vehicle inspection not complete. Drivers can't fill the inspection in
  //    any more (a supervisor does), so instead of being sent to the
  //    inspection page they get the checklist + Remind Staff on the card.
  const handlePickup = (trip) => {
    const paymentReady = ["approved", "paid"].includes((trip.payment?.paymentStatus || "").toLowerCase()) && (trip.payment?.balance ?? 0) <= 0;
    if (!paymentReady) {
      showToast("Payment still requires action before pickup.", "error");
      return;
    }
    if (!trip.beforeDocsComplete) {
      showToast("The vehicle inspection isn't complete yet — a supervisor needs to finish it first.", "error");
      return;
    }
    completeTripAction(trip, "pickup", "Pickup complete — GPS tracking is now active.");
  };

  // Driver nudging Owner/Admin/Supervisor because the inspection they're
  // waiting on isn't done. The server enforces the 10-minute cooldown (429
  // carries retryAfterSeconds), so this stays right even across reloads.
  const handleRemindStaff = async (trip, phase) => {
    const key = `${trip.id}:${phase}`;
    setRemindingKey(key);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${trip.id}/remind-inspection`, {
        method: "POST",
        body: JSON.stringify({ phase }),
      });
      const json = await res.json();
      const t0 = Date.now();
      if (res.status === 429) {
        setRemindUntil((prev) => ({ ...prev, [key]: t0 + (json.retryAfterSeconds || 600) * 1000 }));
        setNow(t0);
        showToast("Staff were just reminded — you can remind them again shortly.", "error");
        return;
      }
      if (!res.ok) throw new Error(json.message || "Could not send the reminder.");
      setRemindUntil((prev) => ({ ...prev, [key]: t0 + (json.data?.retryAfterSeconds || 600) * 1000 }));
      setNow(t0);
      showToast("Staff have been reminded.");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setRemindingKey(null);
    }
  };

  // No payment gate on Return — only the inspection requirement.
  const completeTripAction = async (trip, action, successMsg) => {
    setBusyID(trip.id);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${trip.id}/${action}`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Action failed.");
      showToast(successMsg);
      fetchTrips();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusyID(null);
    }
  };

  const handleDropoff = async (trip) => {
    setBusyID(trip.id);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${trip.id}/dropoff`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to mark dropped off.");
      showToast("Marked dropped off.");
      fetchTrips();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusyID(null);
    }
  };

  const handleReturn = (trip) => {
    if (!trip.afterDocsComplete) {
      showToast("The vehicle inspection isn't complete yet — a supervisor needs to finish it first.", "error");
      return;
    }
    completeTripAction(trip, "return", "Car marked returned — trip history saved.");
  };

  // Driver confirming a cash/in-person initial payment — right here in My
  // Trips, no Payments page access needed (drivers can't reach it anyway).
  const handleConfirmPayment = async (paymentMethod) => {
    if (!paymentTrip) return;
    setConfirmingPayment(true);
    setConfirmPaymentError(null);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${paymentTrip.id}/confirm-payment`, {
        method: "PATCH",
        body: JSON.stringify({ paymentMethod }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not confirm payment.");
      showToast("Payment marked as received.");
      setPaymentTrip(null);
      fetchTrips();
    } catch (e) {
      setConfirmPaymentError(e.message);
    } finally {
      setConfirmingPayment(false);
    }
  };

  // Driver receiving cash/in-person payment of the remaining balance —
  // e.g. right before Start Pickup, same as staff can do on Car Tracking.
  const handleCollectBalance = async (paymentMethod) => {
    if (!paymentTrip) return;
    setCollectingBalance(true);
    setCollectBalanceError(null);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${paymentTrip.id}/collect-balance`, {
        method: "PATCH",
        body: JSON.stringify({ paymentMethod }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not mark balance as received.");
      showToast("Balance marked as received.");
      setPaymentTrip(null);
      fetchTrips();
    } catch (e) {
      setCollectBalanceError(e.message);
    } finally {
      setCollectingBalance(false);
    }
  };

  // Driver confirming they handed a refund-due amount back to the
  // customer (created when a staff discount overshot the balance) —
  // they're usually the one physically holding the cash.
  const handleMarkRefundIssued = async () => {
    if (!paymentTrip) return;
    setMarkingRefund(true);
    setRefundError(null);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${paymentTrip.id}/refund-issued`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not mark refund as returned.");
      showToast("Refund marked as returned.");
      setPaymentTrip(null);
      fetchTrips();
    } catch (e) {
      setRefundError(e.message);
    } finally {
      setMarkingRefund(false);
    }
  };

  return (
    <div className="space-y-3">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      <div className="flex justify-end">
        <button onClick={fetchTrips} disabled={loading}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          ↺ Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-16 text-center">Loading…</p>
      ) : trips.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
          <IconSteering className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-arl-dark">No trips assigned right now</p>
          <p className="text-xs text-gray-400 mt-1">Today's and upcoming trips will show here once dispatched.</p>
        </div>
      ) : (
        trips.map((trip) => {
          const isOngoing   = trip.status === "ongoing";
          const droppedOff  = fmtTime(trip.customerDroppedOffAt);
          return (
            <div key={trip.id} className="bg-white rounded-2xl shadow-soft p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-arl-dark">{trip.customerName}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg ${
                      isOngoing ? "bg-green-50 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                    }`}>{trip.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{trip.vehicleName}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="flex items-center gap-1"><IconClock /> {fmtDateTime(trip.startDateTime)} → {fmtDateTime(trip.endDateTime)}</span>
                <span className="flex items-center gap-1"><IconPin /> {trip.location}</span>
                {isOngoing && tripStops(trip).length > 0 && (
                  <button
                    onClick={() => setMapTrip(trip)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 ml-auto"
                  >
                    <IconMap /> Show Map
                  </button>
                )}
              </div>

              {isOngoing && (
                <div className="flex items-center gap-4 text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-500">Picked up: <span className="font-semibold text-arl-dark">{fmtTime(trip.pickupTime) || "—"}</span></span>
                  <span className="text-gray-500">
                    Dropped off: <span className="font-semibold text-arl-dark">{droppedOff || "Not recorded"}</span>
                  </span>
                </div>
              )}

              {(() => {
                const phase = isOngoing ? "after" : "before";
                const paymentReady = ["approved", "paid"].includes((trip.payment?.paymentStatus || "").toLowerCase()) && (trip.payment?.balance ?? 0) <= 0;
                // Payment is the blocker that matters first for pickup —
                // no point nudging staff about the inspection until that's
                // sorted (the server refuses the reminder then too).
                if (!isOngoing && !paymentReady) {
                  return <p className="text-[11px] font-medium text-amber-600 mb-1">Payment still requires action</p>;
                }
                const inspection = (isOngoing ? trip.afterInspection : trip.beforeInspection)
                  || { photos: false, parts: false, complete: !!(isOngoing ? trip.afterDocsComplete : trip.beforeDocsComplete) };
                return (
                  <InspectionPanel
                    inspection={inspection}
                    phase={phase}
                    remaining={remainingFor(trip.id, phase)}
                    sending={remindingKey === `${trip.id}:${phase}`}
                    onRemind={() => handleRemindStaff(trip, phase)}
                  />
                );
              })()}
              <div className="flex gap-2">
                {!isOngoing ? (
                  <>
                    <button
                      onClick={() => setMapTrip(trip)}
                      disabled={tripStops(trip).length === 0}
                      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <IconMap className="w-4 h-4" /> Map
                    </button>
                    <button
                      onClick={() => setPaymentTrip(trip)}
                      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold border transition-all ${
                        trip.payment?.totalFee > 0 && trip.payment?.balance <= 0
                          ? "border-green-300 text-green-700 hover:bg-green-50"
                          : "border-amber-300 text-amber-700 hover:bg-amber-50"
                      }`}
                    >
                      <IconPeso className="w-4 h-4" /> Payment
                    </button>
                    {(() => {
                      const paymentReady = ["approved", "paid"].includes((trip.payment?.paymentStatus || "").toLowerCase()) && (trip.payment?.balance ?? 0) <= 0;
                      // "Not Available Yet" covers both blockers (payment or
                      // inspection) — the card above already says which one;
                      // the button itself just needs to read as blocked, not
                      // as a live "Start Pickup" that happens to be greyed out.
                      const blocked = !trip.beforeDocsComplete || !paymentReady;
                      return (
                        <button onClick={() => handlePickup(trip)}
                          disabled={busyID === trip.id || blocked}
                          className="flex-[1.6] flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300">
                          {busyID === trip.id ? "…" : blocked ? "Not Available Yet" : "▶ Start Pickup"}
                        </button>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {!droppedOff && (
                      <button onClick={() => handleDropoff(trip)} disabled={busyID === trip.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 active:scale-[0.99] transition-all disabled:opacity-50">
                        <IconPin className="w-3.5 h-3.5" /> Mark Dropped Off
                      </button>
                    )}
                    <button onClick={() => handleReturn(trip)} disabled={busyID === trip.id || !trip.afterDocsComplete}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300">
                      {trip.afterDocsComplete && <IconFlag className="w-3.5 h-3.5" />} {busyID === trip.id ? "…" : trip.afterDocsComplete ? "Return" : "Not Available Yet"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}

      <TripMapModal
        open={!!mapTrip}
        onClose={() => setMapTrip(null)}
        title={mapTrip ? `${mapTrip.customerName} — ${mapTrip.vehicleName}` : "Trip Route"}
        stops={mapTrip ? tripStops(mapTrip) : []}
      />
      <PaymentStatusModal
        open={!!paymentTrip}
        onClose={() => { setPaymentTrip(null); setCollectBalanceError(null); setConfirmPaymentError(null); setRefundError(null); }}
        customerName={paymentTrip?.customerName}
        payment={paymentTrip?.payment}
        onConfirmPayment={handleConfirmPayment}
        confirming={confirmingPayment}
        confirmError={confirmPaymentError}
        onCollectBalance={handleCollectBalance}
        collecting={collectingBalance}
        collectError={collectBalanceError}
        onMarkRefundIssued={handleMarkRefundIssued}
        markingRefund={markingRefund}
        refundError={refundError}
        pendingApprovalNote="The initial payment hasn't been approved yet — ask an admin or supervisor to approve it before collecting the rest."
      />
    </div>
  );
}

// ─── HISTORY TAB (completed/cancelled/stolen) ─────────────────────────────
function HistoryTab() {
  const token = localStorage.getItem("token");

  const [trips, setTrips]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [mapTrip, setMapTrip] = useState(null);
  const [detailTrip, setDetailTrip] = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_URL}/api/driver-dispatch/my-trips/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load trip history.");
      setTrips(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={fetchHistory} disabled={loading}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          ↺ Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-16 text-center">Loading…</p>
      ) : trips.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
          <IconHistory className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-arl-dark">No completed trips yet</p>
          <p className="text-xs text-gray-400 mt-1">Trips you've finished, cancelled, or flagged will show here.</p>
        </div>
      ) : (
        trips.map((trip) => (
          <div key={trip.id} className="bg-white rounded-2xl shadow-soft p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-arl-dark">{trip.customerName}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg ${STATUS_STYLE[trip.status] || "bg-gray-100 text-gray-500"}`}>
                    {trip.status?.replace("_", " ")}
                  </span>
                  {trip.modeOfDriving === "With Chauffeur" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg bg-indigo-600 text-white">
                      Chauffeur
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{trip.vehicleName}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="flex items-center gap-1"><IconClock /> {fmtDateTimeLong(trip.startDateTime)} → {fmtDateTimeLong(trip.endDateTime)}</span>
              <span className="flex items-center gap-1"><IconPin /> {trip.location}</span>
              <button
                onClick={() => setDetailTrip(trip)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 ml-auto"
              >
                <IconEye /> View
              </button>
            </div>

            {trip.status === "completed" && (trip.pickupTime || trip.customerDroppedOffAt || trip.returnTime) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5">
                <span>Picked up: <span className="font-semibold text-gray-600">{fmtDateTimeLong(trip.pickupTime)}</span></span>
                {trip.modeOfDriving === "With Chauffeur" && (
                  <span>Dropped off: <span className="font-semibold text-gray-600">{trip.customerDroppedOffAt ? fmtDateTimeLong(trip.customerDroppedOffAt) : "Not recorded"}</span></span>
                )}
                <span>Returned: <span className="font-semibold text-gray-600">{fmtDateTimeLong(trip.returnTime)}</span></span>
              </div>
            )}
          </div>
        ))
      )}

      <TripMapModal
        open={!!mapTrip}
        onClose={() => setMapTrip(null)}
        title={mapTrip ? `${mapTrip.customerName} — ${mapTrip.vehicleName}` : "Trip Route"}
        stops={mapTrip ? tripStops(mapTrip) : []}
      />
      <TripDetailModal
        open={!!detailTrip}
        onClose={() => setDetailTrip(null)}
        trip={detailTrip}
        onShowMap={() => { setMapTrip(detailTrip); setDetailTrip(null); }}
        // No "View Full Inspection" link: Vehicle Inspections is staff-only.
      />
    </div>
  );
}

// ─── MAIN: My Trips (Active | History tabs) ───────────────────────────────
// /my-trips/history used to be its own page — now it's just this page with
// ?tab=history, see the redirect in App.jsx for old links/bookmarks.
export default function MyTrips() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "history" ? "history" : "active";

  const setTab = (t) => setSearchParams(t === "active" ? {} : { tab: t }, { replace: true });

  return (
    <div className="w-full px-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-arl-dark">My Trips</h1>
        <p className="text-xs text-gray-400 mt-0.5">Your assigned trips and trip history</p>
      </div>

      <div className="flex gap-2 border-b border-gray-100">
        <button onClick={() => setTab("active")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "active" ? "border-arl-primary text-arl-primary" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}>
          Trips
        </button>
        <button onClick={() => setTab("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "history" ? "border-arl-primary text-arl-primary" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}>
          History
        </button>
      </div>

      {tab === "active" ? <ActiveTripsTab /> : <HistoryTab />}
    </div>
  );
}