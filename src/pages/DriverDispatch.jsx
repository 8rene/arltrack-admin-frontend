import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL;

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconSteering = ({ className = "w-5 h-5" }) => (
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

const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
  </svg>
);

const IconUser = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="3.5" />
    <path strokeLinecap="round" d="M4.5 20c1.2-3.5 4-5.5 7.5-5.5s6.3 2 7.5 5.5" />
  </svg>
);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmtDateTime = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const StatCard = ({ icon, value, label, color }) => {
  const colors = {
    red:    "bg-red-50 text-red-600",
    yellow: "bg-yellow-50 text-yellow-600",
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
  };
  return (
    <div className="bg-white rounded-2xl shadow-soft p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>{icon}</div>
      <div>
        <div className="text-lg font-bold text-arl-dark leading-none">{value}</div>
        <div className="text-xs text-gray-400 mt-1">{label}</div>
      </div>
    </div>
  );
};

export default function DriverDispatch() {
  const token = localStorage.getItem("token");
  const [searchParams] = useSearchParams();
  const highlightDriverID = searchParams.get("driver");
  const routerLocation = useLocation();
  const navigate        = useNavigate();

  // If we got here from "Assign Driver" / "Assign Driver First" on Car
  // Tracking, this holds the booking we're trying to assign a driver to —
  // same pattern as DeviceTrack.jsx's assignForCar. Kept in local state
  // (rather than read straight from routerLocation.state) so we can clear
  // it once the assignment succeeds without another navigation.
  const [assignForBooking, setAssignForBooking] = useState(
    routerLocation.state?.assignBookingId
      ? {
          bookingId: routerLocation.state.assignBookingId,
          customerName: routerLocation.state.assignCustomerName,
          carLabel: routerLocation.state.assignCarLabel,
        }
      : null
  );
  const cancelAssignMode = () => {
    setAssignForBooking(null);
    navigate(routerLocation.pathname, { replace: true, state: {} });
  };

  const [board, setBoard]       = useState({ drivers: [], unassigned: [], missingWhileOngoing: [] });
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState(null);
  const [picked, setPicked]     = useState({});   // { [bookingDocID]: driverID }
  const [busyID, setBusyID]     = useState(null);  // bookingDocID currently being assigned/unassigned
  const [conflict, setConflict] = useState(null);  // { bookingDocID, driverID, message }
  const [expanded, setExpanded] = useState({});    // { [driverID]: bool }

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

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await authedFetch("/api/driver-dispatch/board");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load driver dispatch board.");
      setBoard(json.data);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  // Arrived via a "View Driver" link (e.g. from Car Tracking) — auto-expand
  // and scroll to that driver's card instead of leaving it collapsed.
  useEffect(() => {
    if (!highlightDriverID || loading) return;
    setExpanded((prev) => ({ ...prev, [highlightDriverID]: true }));
    const el = document.getElementById(`driver-${highlightDriverID}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightDriverID, loading]);

  // Arrived via "Assign Driver" on Car Tracking — scroll to this booking's
  // card in the "Needs a Driver" queue so its conflict prompt (if any) is
  // visible once a driver is clicked below.
  useEffect(() => {
    if (!assignForBooking || loading) return;
    const el = document.getElementById(`booking-${assignForBooking.bookingId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [assignForBooking, loading]);

  const driverOptions = useMemo(
    () => board.drivers.map((d) => ({ id: d.driverID, name: d.name })),
    [board.drivers]
  );

  const doAssign = async (bookingDocID, driverID, force = false) => {
    if (!driverID) { showToast("Pick a driver first.", "error"); return false; }
    setBusyID(bookingDocID);
    try {
      const res  = await authedFetch("/api/driver-dispatch/assign", {
        method: "POST",
        body: JSON.stringify({ bookingID: bookingDocID, driverID, force }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.conflict) {
          setConflict({ bookingDocID, driverID, message: json.message });
          return false;
        }
        throw new Error(json.message || "Failed to assign driver.");
      }
      setConflict(null);
      showToast("Driver assigned.");
      fetchBoard();
      return true;
    } catch (e) {
      showToast(e.message, "error");
      return false;
    } finally {
      setBusyID(null);
    }
  };

  // Used when a driver card is clicked while in "assign this booking" mode
  // (i.e. arrived here via "Assign Driver" on Car Tracking). Skips the
  // manual dropdown-and-Assign step and assigns directly — mirrors
  // DeviceTrack.jsx's handleQuickAssign for GPS devices. On a scheduling
  // conflict, doAssign already surfaces the "Assign Anyway" prompt on the
  // matching Needs-a-Driver card (scrolled into view above), so assign
  // mode stays open until it actually succeeds.
  const handleQuickAssignDriver = async (driverID) => {
    if (!assignForBooking) return;
    const ok = await doAssign(assignForBooking.bookingId, driverID);
    if (ok) cancelAssignMode();
  };

  const doUnassign = async (bookingDocID) => {
    setBusyID(bookingDocID);
    try {
      const res  = await authedFetch("/api/driver-dispatch/unassign", {
        method: "POST",
        body: JSON.stringify({ bookingID: bookingDocID }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to unassign driver.");
      showToast("Driver unassigned.");
      fetchBoard();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusyID(null);
    }
  };

  const toggleExpand = (driverID) => setExpanded((prev) => ({ ...prev, [driverID]: !prev[driverID] }));

  const activeTripCount = board.drivers.reduce((sum, d) => sum + d.assignments.length, 0);

  return (
    <div className="w-full px-4 space-y-5">

      {/* Assign-mode banner — shown when we arrived here to assign a specific booking */}
      {assignForBooking && (
        <div className="rounded-2xl px-4 py-3 text-xs font-medium border bg-amber-50 border-amber-200 text-amber-700 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <IconSteering className="w-3.5 h-3.5 shrink-0" />
            Pick an available driver below to assign to <strong>{assignForBooking.customerName || "this trip"}</strong>
            {assignForBooking.carLabel ? <> · {assignForBooking.carLabel}</> : null}.
          </span>
          <button onClick={cancelAssignMode} className="text-amber-600 hover:text-amber-800 font-semibold shrink-0">
            Cancel
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Driver Dispatch</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${board.unassigned.length} awaiting a driver · ${board.drivers.length} drivers`}
          </p>
        </div>
        <button onClick={fetchBoard} disabled={loading}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 self-start sm:self-auto">
          ↺ Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard icon={<IconWarning />}   value={board.unassigned.length} label="Needs a Driver" color="yellow" />
        <StatCard icon={<IconSteering />}  value={board.drivers.length}    label="Drivers"        color="blue" />
        <StatCard icon={<IconClock />}     value={activeTripCount}         label="Active Trips"   color="green" />
      </div>

      {/* Data-integrity flag: chauffeur bookings already picked up with no driver on record */}
      {board.missingWhileOngoing.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
            <IconWarning /> {board.missingWhileOngoing.length} ongoing chauffeur trip(s) have no driver on record
          </div>
          <p className="text-xs text-red-600">These are already picked up but weren't assigned before dispatch — worth checking directly.</p>
          <div className="space-y-1">
            {board.missingWhileOngoing.map((b) => (
              <div key={b.id} className="text-xs text-red-700">
                {b.customerName} · {b.vehicleName} · {fmtDateTime(b.startDateTime)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">

        {/* ── Needs a Driver queue ─────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-soft p-4 space-y-3">
          <h2 className="text-sm font-bold text-arl-dark flex items-center gap-2">
            <IconWarning className="w-4 h-4 text-yellow-500" /> Needs a Driver
          </h2>

          {loading ? (
            <p className="text-xs text-gray-400 py-6 text-center">Loading…</p>
          ) : board.unassigned.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">All chauffeur bookings are assigned. 🎉</p>
          ) : (
            <div className="space-y-2">
              {board.unassigned.map((b) => (
                <div key={b.id} id={`booking-${b.id}`} className={`border rounded-xl p-3 space-y-2 transition-all ${
                  assignForBooking?.bookingId === b.id ? "border-amber-400 ring-2 ring-amber-200" : "border-gray-200"
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-arl-dark">{b.customerName}</div>
                      <div className="text-xs text-gray-400">{b.vehicleName}</div>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200">
                      Upcoming
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><IconClock /> {fmtDateTime(b.startDateTime)}</span>
                    <span className="flex items-center gap-1"><IconPin /> {b.location}</span>
                  </div>

                  {conflict?.bookingDocID === b.id ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 space-y-2">
                      <p className="text-xs text-red-700">{conflict.message}</p>
                      <div className="flex gap-2">
                        <button onClick={() => doAssign(b.id, conflict.driverID, true)} disabled={busyID === b.id}
                          className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-arl-cta text-white hover:opacity-90 disabled:opacity-40">
                          Assign Anyway
                        </button>
                        <button onClick={() => setConflict(null)}
                          className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={picked[b.id] || ""}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [b.id]: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-arl-light">
                        <option value="">Select driver…</option>
                        {driverOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button onClick={() => doAssign(b.id, picked[b.id])} disabled={busyID === b.id}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-arl-dark text-white hover:opacity-90 disabled:opacity-40">
                        Assign
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Drivers list ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-soft p-4 space-y-3">
          <h2 className="text-sm font-bold text-arl-dark flex items-center gap-2">
            <IconSteering className="w-4 h-4 text-arl-primary" /> Drivers
          </h2>

          {loading ? (
            <p className="text-xs text-gray-400 py-6 text-center">Loading…</p>
          ) : board.drivers.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No drivers found. Add one from Users.</p>
          ) : (
            <div className="space-y-2">
              {board.drivers.map((d) => {
                const isAssignTarget = !!assignForBooking;
                const isAssigning    = busyID === assignForBooking?.bookingId;
                return (
                <div key={d.driverID} id={`driver-${d.driverID}`}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isAssignTarget
                      ? "border-amber-400 ring-2 ring-amber-200 animate-pulse cursor-pointer"
                      : highlightDriverID === d.driverID ? "border-arl-primary ring-2 ring-arl-primary/30" : "border-gray-200"
                  }`}>
                  <button
                    onClick={() => {
                      if (isAssignTarget) { if (!isAssigning) handleQuickAssignDriver(d.driverID); }
                      else toggleExpand(d.driverID);
                    }}
                    disabled={isAssignTarget && isAssigning}
                    className="w-full flex items-center justify-between gap-2 p-3 hover:bg-gray-50 text-left disabled:opacity-50">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-arl-light flex items-center justify-center text-arl-primary">
                        <IconUser />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-arl-dark">{d.name}</div>
                        <div className="text-xs text-gray-400">{d.phone}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg ${
                      d.assignments.length > 0 ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-500 border border-gray-200"
                    }`}>
                      {isAssignTarget && isAssigning ? "Assigning…" : `${d.assignments.length} trip${d.assignments.length === 1 ? "" : "s"}`}
                    </span>
                  </button>

                  {!isAssignTarget && expanded[d.driverID] && (
                    <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50/50">
                      {d.assignments.length === 0 ? (
                        <p className="text-xs text-gray-400">No trips assigned.</p>
                      ) : (
                        d.assignments.map((b) => (
                          <div key={b.id} className="flex items-start justify-between gap-2 bg-white border border-gray-200 rounded-lg p-2.5">
                            <div className="space-y-0.5">
                              <div className="text-xs font-semibold text-arl-dark">{b.customerName} · {b.vehicleName}</div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                                <span className="flex items-center gap-1"><IconClock className="w-3.5 h-3.5" /> {fmtDateTime(b.startDateTime)}</span>
                                <span className="flex items-center gap-1"><IconPin className="w-3.5 h-3.5" /> {b.location}</span>
                              </div>
                              <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                b.status === "ongoing" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                              }`}>{b.status}</span>
                            </div>
                            <button onClick={() => doUnassign(b.id)} disabled={busyID === b.id}
                              className="text-[11px] font-semibold text-arl-cta hover:underline disabled:opacity-40 shrink-0">
                              Unassign
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}