import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import TripMapModal from "../components/TripMapModal";
import TripMapCard from "../components/TripMapCard";
import { InspectionMediaGallery } from "../components/InspectionMedia";
import DriverPenaltyModal from "../components/DriverPenaltyModal";
import TripDetailModal from "../components/TripDetailModal";
import TripTermsModal from "../components/TripTermsModal";
import { readCodingWarnings, warningsByCity } from "../utils/codingWarnings";

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
        ✓ Vehicle inspection complete — ready for pickup
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
            Waiting for a supervisor to complete the pickup inspection
          </p>
          <div className="text-[11px] space-y-0.5">
            <Row
              done={inspection.photos}
              label={`Video, or front, side & back photos${
                !inspection.photos && inspection.photoSlots && Object.values(inspection.photoSlots).some(Boolean)
                  ? ` (missing: ${["front", "side", "back"].filter((s) => !inspection.photoSlots[s]).join(", ")})`
                  : ""
              }`}
            />
            <Row done={inspection.parts} label={`Parts condition${inspection.parts ? "" : " (supervisor must confirm it)"}`} />
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

const IconShield = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
  </svg>
);

const hasPin = (p) => !!p && typeof p.lat === "number" && typeof p.lng === "number";
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
const isPaymentReady = (t) =>
  ["approved", "paid"].includes((t.payment?.paymentStatus || "").toLowerCase()) && (t.payment?.balance ?? 0) <= 0;

// ── Same look as the staff Refund Requests page: clickable summary card,
// dot-pill status badge, and bordered label/value blocks. ──
function StatCard({ icon, value, label, sub, color, onClick, active }) {
  const bgColors = {
    teal:   "bg-teal-50 text-teal-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
    green:  "bg-green-50 text-green-600",
    blue:   "bg-blue-50 text-blue-600",
    red:    "bg-red-50 text-red-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`bg-white rounded-2xl shadow-soft p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-left w-full transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-arl-light ${active ? "ring-2 ring-arl-light" : ""}`}
    >
      <div className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center rounded-xl ${bgColors[color] || "bg-gray-100 text-gray-600"}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-arl-dark">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {sub && <div className="text-[11px] text-orange-600 font-semibold">{sub}</div>}
      </div>
    </button>
  );
}

const STATUS_PILL = {
  upcoming:  { dot: "bg-yellow-500", bg: "bg-yellow-50 border border-yellow-200", label: "Upcoming" },
  ongoing:   { dot: "bg-green-500",  bg: "bg-green-50 border border-green-200",   label: "Ongoing" },
  completed: { dot: "bg-blue-500",   bg: "bg-blue-50 border border-blue-200",     label: "Completed" },
  cancelled: { dot: "bg-red-500",    bg: "bg-red-50 border border-red-200",       label: "Cancelled" },
  stolen:    { dot: "bg-red-900",    bg: "bg-red-100 border border-red-300",      label: "Stolen" },
};
function StatusPill({ status }) {
  const b = STATUS_PILL[status] || { dot: "bg-gray-400", bg: "bg-gray-50 border border-gray-200", label: (status || "—").replace("_", " ") };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-black ${b.bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${b.dot}`} />{b.label}
    </span>
  );
}

const Line = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
    <span className="text-gray-500 shrink-0">{label}</span>
    <span className="text-right text-gray-800 min-w-0 break-words">{children}</span>
  </div>
);
const Block = ({ title, children }) => (
  <div className="rounded-xl border border-gray-100 p-4">
    {title && <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">{title}</p>}
    {children}
  </div>
);
const Eyebrow = ({ children }) => (
  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{children}</p>
);

// Simple full-screen viewer for one photo or video (read-only).
function ProofLightbox({ photo, onClose }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/70 z-[2100] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl overflow-hidden w-full shadow-2xl ${photo.type === "video" ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">{photo.label}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        {photo.type === "video" ? (
          <div className="w-full bg-black">
            <video src={photo.url} controls autoPlay playsInline className="w-full max-h-[70vh]" />
          </div>
        ) : failed ? (
          <div className="w-full h-[50vh] flex flex-col items-center justify-center gap-2 bg-gray-50 text-gray-400">
            <p className="text-xs">Photo failed to load.</p>
            <a href={photo.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 font-semibold">Open original link</a>
          </div>
        ) : (
          <div className="w-full h-[60vh] bg-gray-50">
            <img src={photo.url} alt={photo.label} className="w-full h-full object-contain" onError={() => setFailed(true)} />
          </div>
        )}
      </div>
    </div>
  );
}

// Read-only inspection proof (Before / After) for one of the driver's own
// trips. Fetches only for the trip being shown. `refreshKey` changes when
// staff finish an inspection phase, so new photos appear without a reload.
function TripInspectionProof({ tripID, refreshKey, authedFetch }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [phase, setPhase]     = useState("before");
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await authedFetch(`/api/driver-dispatch/my-trips/${tripID}/inspection`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Couldn't load the inspection.");
        if (!cancelled) { setData(json.data); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tripID, refreshKey, authedFetch]);

  const hasAny = (r) => !!r && (r.exterior.length || r.videos.length || r.extraPhotos.length);
  const rec = data?.[phase];

  const renderTile = (item) => (
    <button key={item.key} type="button" onClick={() => setViewing({ url: item.url, label: item.label, type: "image" })}
      className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50 text-left">
      <div className="aspect-square">
        <img src={item.url} alt={item.label} loading="lazy" className="w-full h-full object-cover" />
      </div>
      <p className="px-2 py-1 text-[10px] font-semibold text-gray-500 truncate">{item.label}</p>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {[["before", "Before pickup"], ["after", "After return"]].map(([key, label]) => (
          <button key={key} onClick={() => setPhase(key)}
            className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
              phase === key ? "bg-arl-dark text-white border-arl-dark" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}>
            {label}{hasAny(data?.[key]) ? " ✓" : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 py-4 text-center">Loading inspection…</p>
      ) : error ? (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      ) : !hasAny(rec) ? (
        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-4 text-center">
          {phase === "before"
            ? "The pickup inspection hasn't been recorded yet."
            : "The return inspection is recorded after the trip ends."}
        </p>
      ) : (
        <div className="space-y-3">
          {rec.exterior.length > 0 && (
            <div className="space-y-1.5">
              <Eyebrow>Exterior</Eyebrow>
              <div className="grid grid-cols-3 gap-2">{rec.exterior.map(renderTile)}</div>
            </div>
          )}

          <InspectionMediaGallery doc={{ videos: rec.videos, extraPhotos: rec.extraPhotos }} onView={setViewing} />
        </div>
      )}

      {viewing && <ProofLightbox photo={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ─── PENALTIES NOTED ON A TRIP ───────────────────────────────────────────
// What the driver sees of a trip's penalties: what it was for, how much, and where it stands with staff. Never what the
// customer has paid or still owes. A penalty the driver noted can be edited only while it is still "Under review".
const PENALTY_PILL = {
  "Under review": "bg-amber-50 text-amber-700 border-amber-200",
  Accepted:       "bg-green-50 text-green-700 border-green-200",
  Rejected:       "bg-red-50 text-red-700 border-red-200",
  Removed:        "bg-gray-100 text-gray-500 border-gray-200",
};
function TripPenalties({ penalties, onEdit }) {
  const list = Array.isArray(penalties) ? penalties : [];
  if (list.length === 0) return null;
  return (
    <Block title="Penalties">
      <div className="space-y-2 mt-1">
        {list.map((p) => (
          <div key={p.penaltyID} className="rounded-lg border border-gray-100 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-arl-dark break-words">{p.items.map((i) => i.description).join(", ")}</p>
                <p className="text-xs text-gray-400">{peso(p.amount)}{p.mine ? "" : " · added by staff"}</p>
              </div>
              <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${PENALTY_PILL[p.status] || PENALTY_PILL.Removed}`}>
                {p.status}
              </span>
            </div>
            {p.status === "Under review" && (
              <p className="text-[11px] text-gray-400 mt-1">Waiting for a supervisor to review it.</p>
            )}
            {(p.status === "Rejected" || p.status === "Removed") && p.reason && (
              <p className="text-xs text-gray-500 mt-1">Reason: {p.reason}</p>
            )}
            {p.canEdit && onEdit && (
              <button onClick={() => onEdit(p)} className="mt-1.5 text-xs font-semibold text-teal-600 hover:underline">Edit</button>
            )}
          </div>
        ))}
      </div>
    </Block>
  );
}

// The "Locations" section of the History View modal: pickup / dropoff map cards and any extra stops.
function TripLocationsSection({ trip, onFullMap }) {
  const showPickupMap  = hasPin(trip.pickupLocation);
  const showDropoffMap = hasPin(trip.dropoffLocation) && !isSameSpot(trip.pickupLocation, trip.dropoffLocation);
  const extraStops     = tripStops(trip).filter((st) => st.type === "stop");
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onFullMap} disabled={tripStops(trip).length === 0}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border text-teal-700 hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <IconMap className="w-3.5 h-3.5" /> Full map
        </button>
      </div>
      {!showPickupMap && !showDropoffMap ? (
        <div className="text-xs bg-gray-50 rounded-xl px-3 py-4 text-center space-y-1">
          <p className="text-gray-400">No map pins saved for this trip.</p>
          {trip.location && trip.location !== "—" && <p className="font-semibold text-gray-700">{trip.location}</p>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {showPickupMap && <TripMapCard key={`${trip.id}-pickup`} destination={trip.pickupLocation} label="Pickup" />}
          {showDropoffMap && <TripMapCard key={`${trip.id}-dropoff`} destination={trip.dropoffLocation} label="Dropoff" />}
        </div>
      )}
      {extraStops.length > 0 && (
        <Block title={`Extra stops (${extraStops.length})`}>
          {extraStops.map((st, i) => (
            <Line key={st.key} label={`Stop ${i + 1}`}>{st.address}</Line>
          ))}
        </Block>
      )}
    </div>
  );
}

// ─── ACTIVE TRIPS TAB (upcoming + ongoing, with pickup/dropoff actions) ──
function ActiveTripsTab() {
  const token = localStorage.getItem("token");
  const [searchParams, setSearchParams] = useSearchParams();

  const [trips, setTrips]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast]     = useState(null);
  const [busyID, setBusyID]   = useState(null);
  const [mapTrip, setMapTrip] = useState(null);
  const [penaltyTrip, setPenaltyTrip] = useState(null);  // driver "Note a penalty" form
  const [termsTrip, setTermsTrip] = useState(null);      // read-only "terms the customer accepted" modal
  const [editPenaltyCtx, setEditPenaltyCtx] = useState(null); // { penalty, trip } — editing one still under review
  // One trip at a time (Previous / Next). Tracked by ID — not position — so
  // the background refresh reordering/removing trips never swaps the page
  // under the driver. lastIdx keeps the position if the current trip vanishes.
  const [currentID, setCurrentID] = useState(null);
  const lastIdx = useRef(0);
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

  // { silent: true }   = background refresh: no loading spinner, no error toast.
  // { keepList: true } = manual refresh: cards stay on screen (no "Loading…"
  //                      flash) but errors still toast.
  const fetchTrips = useCallback(async (opts) => {
    const silent = opts?.silent === true;
    const keepList = opts?.keepList === true;
    const showSpinner = !silent && !keepList;
    if (showSpinner) setLoading(true);
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
      json.data.forEach((t) => {
        const bSecs = t.balanceReminder?.retryAfterSeconds || 0;
        if (bSecs > 0) until[`${t.id}:balance`] = t0 + bSecs * 1000;
      });
      setRemindUntil(until);
      setNow(t0);
    } catch (e) {
      if (!silent) showToast(e.message, "error");
    } finally {
      if (showSpinner) setLoading(false);
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
    // Poll every 15s while any trip is still waiting on staff's inspection
    // (so it flips to "ready" soon after the supervisor saves), else 60s.
    const waiting = trips.some((t) => !(t.status === "ongoing" ? t.afterDocsComplete : t.beforeDocsComplete));
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchTrips({ silent: true });
    }, waiting ? 15000 : 60000);
    const onForeground = () => fetchTrips({ silent: true });
    const onVisibilityChange = () => { if (document.visibilityState === "visible") onForeground(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onForeground);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onForeground);
    };
  }, [fetchTrips, trips]);

  // Notification deep link (?open=<booking doc id>): once trips have loaded,
  // open the page on that trip, then drop the param.
  useEffect(() => {
    const openID = searchParams.get("open");
    if (!openID || loading) return;
    // The notification's refID can be the booking doc id OR the business
    // bookingID (payment/refund/penalty ones use the latter) — match both.
    const match = trips.find((t) => t.id === openID || t.bookingID === openID);
    if (match) setCurrentID(match.id);
    setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
  }, [searchParams, setSearchParams, loading, trips]);

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
      showToast("Payment isn't settled yet — staff need to settle it before pickup.", "error");
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

  // Driver rings the CUSTOMER's bell about the balance still owed. Same server-side
  // 10-minute cooldown idea as Remind Staff (key "<trip>:balance").
  const handleRemindCustomer = async (trip) => {
    const key = `${trip.id}:balance`;
    setRemindingKey(key);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${trip.id}/remind-balance`, { method: "POST" });
      const json = await res.json();
      const t0 = Date.now();
      if (res.status === 429) {
        setRemindUntil((prev) => ({ ...prev, [key]: t0 + (json.retryAfterSeconds || 600) * 1000 }));
        setNow(t0);
        showToast("The customer was just reminded — you can remind them again shortly.", "error");
        return;
      }
      if (!res.ok) throw new Error(json.message || "Could not send the reminder.");
      setRemindUntil((prev) => ({ ...prev, [key]: t0 + 600 * 1000 }));
      setNow(t0);
      showToast("The customer has been reminded of their balance.");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setRemindingKey(null);
    }
  };

  // "On my way" = heading to the customer's pickup location. NOT Start Pickup (that's
  // when the customer has been received). Same readiness checks as pickup; the server re-checks.
  const handleOnMyWay = (trip) => {
    const paymentReady = isPaymentReady(trip);
    if (!paymentReady) {
      showToast("Payment isn't settled yet — staff need to settle it before you head out.", "error");
      return;
    }
    if (!trip.beforeDocsComplete) {
      showToast("The vehicle inspection isn't complete yet — a supervisor needs to finish it first.", "error");
      return;
    }
    completeTripAction(trip, "on-my-way", "The customer has been told you're on the way.");
  };

  const completeTripAction = async (trip, action, successMsg) => {
    setBusyID(trip.id);
    try {
      const res  = await authedFetch(`/api/driver-dispatch/my-trips/${trip.id}/${action}`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Action failed.");
      showToast(successMsg);
      await fetchTrips({ silent: true });
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
      await fetchTrips({ silent: true });
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusyID(null);
    }
  };

  const loadLateFee = useCallback(async () => {
    if (!penaltyTrip) return null;
    const res  = await authedFetch(`/api/penalties/late-fee-preview/${encodeURIComponent(penaltyTrip.bookingID)}`);
    const json = await res.json();
    return res.ok ? json.data : null;
  }, [penaltyTrip, authedFetch]);

  const submitPenalty = async (body) => {
    const res  = await authedFetch(`/api/driver-dispatch/my-trips/${penaltyTrip.id}/penalty`, {
      method: "POST", body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Couldn't charge the penalty.");
    showToast("Penalty sent for review — the customer isn't notified until a supervisor confirms it.");
    await fetchTrips({ silent: true });
  };

  const submitPenaltyEdit = async (body) => {
    const res  = await authedFetch(`/api/driver-dispatch/my-penalties/${editPenaltyCtx.penalty.penaltyID}`, {
      method: "PATCH", body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      await fetchTrips({ silent: true });   // it may have just been accepted/rejected: show where it stands now
      throw new Error(json.message || "Couldn't update the penalty.");
    }
    showToast("Penalty updated — staff have been told it changed.");
    await fetchTrips({ silent: true });
  };

  return (
    <div className="space-y-3">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      <div className="flex justify-end">
        <button
          onClick={async () => { setRefreshing(true); await fetchTrips({ keepList: true }); setRefreshing(false); }}
          disabled={refreshing}
          className="px-4 py-2 text-sm rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50">
          {refreshing ? "Refreshing…" : "↺ Refresh"}
        </button>
      </div>

      {loading && trips.length === 0 ? (
        <p className="text-sm text-gray-400 py-16 text-center">Loading…</p>
      ) : trips.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
          <IconSteering className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-arl-dark">No trips assigned right now</p>
          <p className="text-xs text-gray-400 mt-1">Today's and upcoming trips will show here once dispatched.</p>
        </div>
      ) : (() => {
        // Trips arrive sorted by start time, so index 0 is the closest one
        // (an ongoing trip started earlier, so it naturally comes first).
        const found = trips.findIndex((t) => t.id === currentID);
        const idx   = found >= 0 ? found : Math.min(lastIdx.current, trips.length - 1);
        lastIdx.current = idx;
        const trip = trips[idx];
        const goTo = (i) => { if (trips[i]) setCurrentID(trips[i].id); };

        const isOngoing   = trip.status === "ongoing";
        const droppedOff  = fmtTime(trip.droppedOffTime);
        const codingByCity = warningsByCity(readCodingWarnings(trip.codingWarnings));
        const paymentReady = isPaymentReady(trip);
        const balance     = trip.payment?.balance ?? 0;
        const blocked     = !trip.beforeDocsComplete || !paymentReady;
        const showPickupMap  = hasPin(trip.pickupLocation);
        const showDropoffMap = hasPin(trip.dropoffLocation) && !isSameSpot(trip.pickupLocation, trip.dropoffLocation);
        const extraStops  = tripStops(trip).filter((st) => st.type === "stop");
        const inspection  = trip.beforeInspection || { photos: false, parts: false, complete: !!trip.beforeDocsComplete };

        // Summary cards — click one to jump to the first trip of that kind.
        const upcomingTrips = trips.filter((t) => t.status !== "ongoing");
        const ongoingTrips  = trips.filter((t) => t.status === "ongoing");
        const readyTrips    = upcomingTrips.filter((t) => t.beforeDocsComplete && isPaymentReady(t));
        const notReady      = upcomingTrips.length - readyTrips.length;
        const toDropOff     = ongoingTrips.filter((t) => !t.droppedOffTime).length;
        const jump = (list) => { if (list[0]) setCurrentID(list[0].id); };
        const inGroup = (list) => list.some((t) => t.id === trip.id);

        return (
          <div key={trip.id} id={`trip-${trip.id}`} className="space-y-4">
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <StatCard icon={<IconClock className="w-5 h-5" />} value={upcomingTrips.length} label="Upcoming" color="yellow"
                sub={notReady > 0 ? `${notReady} not ready` : null}
                active={inGroup(upcomingTrips)} onClick={() => jump(upcomingTrips)} />
              <StatCard icon={<IconSteering className="w-5 h-5" />} value={ongoingTrips.length} label="Ongoing" color="green"
                sub={toDropOff > 0 ? `${toDropOff} to drop off` : null}
                active={inGroup(ongoingTrips)} onClick={() => jump(ongoingTrips)} />
              <StatCard icon={<IconShield />} value={readyTrips.length} label="Ready for pickup" color="teal"
                active={inGroup(readyTrips)} onClick={() => jump(readyTrips)} />
            </div>

            {/* Pager */}
            <div className="bg-white rounded-2xl shadow-soft p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => goTo(idx - 1)} disabled={idx === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  ‹ Previous
                </button>
                <span className="text-xs text-gray-400">Trip <span className="font-semibold text-arl-dark">{idx + 1}</span> of {trips.length}</span>
                <button onClick={() => goTo(idx + 1)} disabled={idx === trips.length - 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next ›
                </button>
              </div>
              {trips.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {trips.map((t, i) => (
                    <button key={t.id} onClick={() => goTo(i)} title={`${t.customerName} — ${t.vehicleName}`}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        i === idx ? "bg-arl-dark text-white" : "text-gray-600 border hover:bg-gray-50"
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${t.status === "ongoing" ? "bg-green-500" : "bg-yellow-500"}`} />
                      {fmtDateTime(t.startDateTime)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Booking */}
            <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
                <div className="min-w-0">
                  <Eyebrow>{isOngoing ? "Ongoing trip" : "Upcoming trip"}{trip.modeOfDriving === "With Chauffeur" ? " · Chauffeur" : ""}</Eyebrow>
                  <h3 className="font-bold text-arl-dark text-lg truncate">{trip.customerName}</h3>
                  <div className="mt-1.5"><StatusPill status={trip.status} /></div>
                </div>
                <div className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-xl ${isOngoing ? "bg-green-50 text-green-600" : "bg-yellow-50 text-yellow-600"}`}>
                  <IconSteering className="w-5 h-5" />
                </div>
              </div>

              <div className="px-5 py-4 space-y-3">
                <button onClick={() => setTermsTrip(trip)}
                  className="text-xs font-semibold text-teal-600 hover:underline">
                  View accepted terms
                </button>
                {/* Quick actions: remind the customer to pay (left) and tell them you're on the way (right) */}
                {!isOngoing && (balance > 0 || !trip.enRouteAt) && (
                  <div className="flex gap-2">
                    {balance > 0 && (
                      <button
                        onClick={() => handleRemindCustomer(trip)}
                        disabled={remainingFor(trip.id, "balance") > 0 || remindingKey === `${trip.id}:balance`}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold border border-amber-200 text-amber-700 hover:bg-amber-50 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        {remindingKey === `${trip.id}:balance`
                          ? "Sending…"
                          : remainingFor(trip.id, "balance") > 0
                            ? `Remind again in ${fmtCountdown(remainingFor(trip.id, "balance"))}`
                            : "🔔 Remind to pay"}
                      </button>
                    )}
                    {!trip.enRouteAt && (
                      <button onClick={() => handleOnMyWay(trip)}
                        disabled={busyID === trip.id || blocked}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-teal-700 border border-teal-200 hover:bg-teal-50 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        🚗 On my way
                      </button>
                    )}
                  </div>
                )}

                <Block title="Booking">
                  <Line label="Vehicle">{trip.vehicleName}</Line>
                  {trip.customerPhone && trip.customerPhone !== "—" && (
                    <Line label="Customer phone">
                      <a href={`tel:${trip.customerPhone}`} className="font-medium text-teal-600 hover:underline">{trip.customerPhone}</a>
                    </Line>
                  )}
                  <Line label="Starts">{fmtDateTimeLong(trip.startDateTime)}</Line>
                  <Line label="Ends">{fmtDateTimeLong(trip.endDateTime)}</Line>
                  {!isOngoing && (
                    <Line label="Heading to pickup">
                      {trip.enRouteAt
                        ? <span className="font-semibold text-green-700">On the way · since {fmtTime(trip.enRouteAt)}</span>
                        : <span className="text-gray-400">Not yet</span>}
                    </Line>
                  )}
                  <Line label="Payment">
                    <span className={`font-semibold ${paymentReady ? "text-green-700" : "text-amber-600"}`}>
                      {paymentReady ? "Settled" : (trip.payment?.paymentStatus || "Pending")}
                      {balance > 0 ? ` · Balance ${peso(balance)}` : ""}
                    </span>
                  </Line>
                </Block>

                {isOngoing && (
                  <Block title="Trip progress">
                    <Line label="Picked up"><span className="font-semibold">{fmtTime(trip.startedAt) || "—"}</span></Line>
                    <Line label="Dropped off"><span className="font-semibold">{droppedOff || "Not recorded"}</span></Line>
                  </Block>
                )}

                <TripPenalties penalties={trip.penalties} onEdit={(penalty) => setEditPenaltyCtx({ penalty, trip })} />

                {codingByCity.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold">⚠️ Number Coding restrictions on this trip</p>
                    <ul className="mt-1.5 space-y-0.5">
                      {codingByCity.map((c) => (
                        <li key={c.city || "city"}>
                          <span className="font-semibold">{c.city || "City"}</span>
                          {c.plateLastDigit != null ? ` (plate ending ${c.plateLastDigit})` : ""}
                          {c.text ? `: ${c.text}` : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 opacity-80">Plan the route around these days and times to avoid a coding violation.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Route */}
            <div className="bg-white rounded-2xl shadow-soft p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Eyebrow>Locations</Eyebrow>
                <button onClick={() => setMapTrip(trip)} disabled={tripStops(trip).length === 0}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border text-teal-700 hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <IconMap className="w-3.5 h-3.5" /> Full map
                </button>
              </div>
              {!showPickupMap && !showDropoffMap ? (
                <div className="text-xs bg-gray-50 rounded-xl px-3 py-4 text-center space-y-1">
                  <p className="text-gray-400">No map pins saved for this trip.</p>
                  {trip.location && trip.location !== "—" && <p className="font-semibold text-gray-700">{trip.location}</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  {showPickupMap && <TripMapCard key={`${trip.id}-pickup`} destination={trip.pickupLocation} label="Pickup" />}
                  {showDropoffMap && <TripMapCard key={`${trip.id}-dropoff`} destination={trip.dropoffLocation} label="Dropoff" />}
                  {extraStops.length > 0 && (
                    <Block title={`Extra stops (${extraStops.length})`}>
                      {extraStops.map((st, i) => (
                        <Line key={st.key} label={`Stop ${i + 1}`}>{st.address}</Line>
                      ))}
                    </Block>
                  )}
                </div>
              )}
            </div>

            {/* Vehicle inspection */}
            <div className="bg-white rounded-2xl shadow-soft p-5 space-y-3">
              <Eyebrow>Vehicle inspection</Eyebrow>
              {!isOngoing && (
                paymentReady ? (
                  <InspectionPanel
                    inspection={inspection}
                    phase="before"
                    remaining={remainingFor(trip.id, "before")}
                    sending={remindingKey === `${trip.id}:before`}
                    onRemind={() => handleRemindStaff(trip, "before")}
                  />
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      Waiting for staff to settle payment{balance > 0 ? ` · Balance ${peso(balance)}` : ""}
                    </p>
                  </div>
                )
              )}
              <TripInspectionProof
                key={trip.id}
                tripID={trip.id}
                authedFetch={authedFetch}
                refreshKey={`${trip.beforeDocsComplete}:${trip.afterDocsComplete}`}
              />
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 z-10 -mx-4 px-4 py-3 bg-white/95 backdrop-blur border-t border-gray-100 flex gap-2">
              {!isOngoing ? (
                <>
                  <button onClick={() => handlePickup(trip)}
                    disabled={busyID === trip.id || blocked}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-arl-dark hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {busyID === trip.id ? "…" : blocked ? "Not Available Yet" : "▶ Start Pickup"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setPenaltyTrip(trip)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 active:scale-[0.99] transition-all">
                    Penalty
                  </button>
                  {!droppedOff && (
                    <button onClick={() => handleDropoff(trip)} disabled={busyID === trip.id}
                      className="flex-[1.6] inline-flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                      {busyID === trip.id ? "…" : <><IconPin className="w-3.5 h-3.5" /> Mark Dropped Off</>}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      <TripMapModal
        open={!!mapTrip}
        onClose={() => setMapTrip(null)}
        title={mapTrip ? `${mapTrip.customerName} — ${mapTrip.vehicleName}` : "Trip Route"}
        stops={mapTrip ? tripStops(mapTrip) : []}
      />
      <TripTermsModal open={!!termsTrip} onClose={() => setTermsTrip(null)} trip={termsTrip} token={token} />
      <DriverPenaltyModal
        open={!!penaltyTrip}
        onClose={() => setPenaltyTrip(null)}
        title={penaltyTrip ? `${penaltyTrip.customerName} — ${penaltyTrip.vehicleName}` : ""}
        loadLateFee={loadLateFee}
        onSubmit={submitPenalty}
        needsReview
      />
      <DriverPenaltyModal
        open={!!editPenaltyCtx}
        onClose={() => setEditPenaltyCtx(null)}
        title={editPenaltyCtx ? `${editPenaltyCtx.trip.customerName} — ${editPenaltyCtx.trip.vehicleName}` : ""}
        editing={editPenaltyCtx?.penalty || null}
        onSubmit={submitPenaltyEdit}
        needsReview
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
  const [termsTrip, setTermsTrip] = useState(null);
  const [editPenaltyCtx, setEditPenaltyCtx] = useState(null); // { penalty, trip } — editing one still under review
  const [statusF, setStatusF] = useState("All");   // click a summary card to filter, click again to clear

  const authedFetch = useCallback((path, options = {}) => fetch(`${API_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  }), [token]);

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

  const submitPenaltyEdit = async (body) => {
    const res  = await fetch(`${API_URL}/api/driver-dispatch/my-penalties/${editPenaltyCtx.penalty.penaltyID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      await fetchHistory();   // it may have just been accepted/rejected: show where it stands now
      throw new Error(json.message || "Couldn't update the penalty.");
    }
    await fetchHistory();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={fetchHistory} disabled={loading}
          className="px-4 py-2 text-sm rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50">
          {loading ? "Refreshing…" : "↺ Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>
      )}

      {(() => {
        const count = (st) => trips.filter((t) => t.status === st).length;
        const card = (st, icon, label, color) => (
          <StatCard icon={icon} value={count(st)} label={label} color={color}
            active={statusF === st} onClick={() => setStatusF(statusF === st ? "All" : st)} />
        );
        return (
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {card("completed", <IconShield />, "Completed", "blue")}
            {card("cancelled", <IconClock className="w-5 h-5" />, "Cancelled", "yellow")}
            {card("stolen", <IconPin className="w-5 h-5" />, "Flagged stolen", "red")}
          </div>
        );
      })()}

      {(() => {
        const shown = statusF === "All" ? trips : trips.filter((t) => t.status === statusF);
        if (loading && trips.length === 0) return <p className="text-sm text-gray-400 py-16 text-center">Loading…</p>;
        if (trips.length === 0) {
          return (
            <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
              <IconHistory className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-arl-dark">No completed trips yet</p>
              <p className="text-xs text-gray-400 mt-1">Trips you've finished, cancelled, or flagged will show here.</p>
            </div>
          );
        }
        if (shown.length === 0) {
          return <div className="bg-white rounded-2xl shadow-soft p-10 text-center text-sm text-gray-400">No {statusF} trips.</div>;
        }
        return shown.map((trip) => (
          <div key={trip.id} className="bg-white rounded-2xl shadow-soft overflow-hidden transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
              <div className="min-w-0">
                <Eyebrow>{trip.vehicleName}{trip.modeOfDriving === "With Chauffeur" ? " · Chauffeur" : ""}</Eyebrow>
                <h3 className="font-bold text-arl-dark text-base truncate">{trip.customerName}</h3>
              </div>
              <StatusPill status={trip.status} />
            </div>

            <div className="px-5 py-4 space-y-3">
              <Block>
                <Line label="Starts">{fmtDateTimeLong(trip.startDateTime)}</Line>
                <Line label="Ends">{fmtDateTimeLong(trip.endDateTime)}</Line>
                <Line label="Location">{trip.location}</Line>
                {trip.status === "completed" && (trip.startedAt || trip.droppedOffTime || trip.completedAt) && (
                  <>
                    <Line label="Picked up">{fmtDateTimeLong(trip.startedAt)}</Line>
                    <Line label="Dropped off">{trip.droppedOffTime ? fmtDateTimeLong(trip.droppedOffTime) : "Not recorded"}</Line>
                    <Line label="Completed">{fmtDateTimeLong(trip.completedAt)}</Line>
                  </>
                )}
              </Block>
              <TripPenalties penalties={trip.penalties} onEdit={(penalty) => setEditPenaltyCtx({ penalty, trip })} />

              <div className="flex justify-end gap-2">
                <button onClick={() => setTermsTrip(trip)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  Terms
                </button>
                <button onClick={() => setDetailTrip(trip)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-semibold text-teal-700 hover:bg-teal-50">
                  <IconEye /> View
                </button>
              </div>
            </div>
          </div>
        ));
      })()}

      <TripMapModal
        open={!!mapTrip}
        onClose={() => setMapTrip(null)}
        title={mapTrip ? `${mapTrip.customerName} — ${mapTrip.vehicleName}` : "Trip Route"}
        stops={mapTrip ? tripStops(mapTrip) : []}
      />
      <TripTermsModal open={!!termsTrip} onClose={() => setTermsTrip(null)} trip={termsTrip} token={token} />
      <TripDetailModal
        key={detailTrip?.id || "none"}
        open={!!detailTrip}
        onClose={() => setDetailTrip(null)}
        trip={detailTrip}
        sections={detailTrip ? [
          { key: "map", title: "Locations", render: () => (
            <TripLocationsSection trip={detailTrip} onFullMap={() => { setMapTrip(detailTrip); setDetailTrip(null); }} />
          ) },
          { key: "inspection", title: "Vehicle inspection", render: () => (
            <TripInspectionProof key={detailTrip.id} tripID={detailTrip.id} authedFetch={authedFetch} refreshKey="history" />
          ) },
        ] : []}
        // No "View Full Inspection" link: Vehicle Inspections is staff-only.
      />
      <DriverPenaltyModal
        open={!!editPenaltyCtx}
        onClose={() => setEditPenaltyCtx(null)}
        title={editPenaltyCtx ? `${editPenaltyCtx.trip.customerName} — ${editPenaltyCtx.trip.vehicleName}` : ""}
        editing={editPenaltyCtx?.penalty || null}
        onSubmit={submitPenaltyEdit}
        needsReview
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
      <div className="pt-2">
        <h1 className="text-xl font-bold text-arl-dark flex items-center gap-2">My Trips</h1>
        <p className="text-sm text-gray-500">Your assigned trips and trip history</p>
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        {[["active", "Trips"], ["history", "History"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === key ? "border-arl-dark text-arl-dark" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "active" ? <ActiveTripsTab /> : <HistoryTab />}
    </div>
  );
}