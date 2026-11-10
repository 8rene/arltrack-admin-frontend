import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL;

// Driver Dispatch — redesigned to match Bookings.jsx / Users.jsx:
//   • one card on top: clickable stat cards (Upcoming trips · Ongoing trips · Total drivers),
//     the Driver Trips / Drivers tabs and Refresh underneath (same layout as the Users page)
//   • one bordered table card (search bar + sortable table + numbered pagination + 10-row filler)
//   • details and assigning happen in modals (header / scrolling body / fixed footer),
//     so nothing expands inline and stacks any more
// Duplicated helpers (StatusBadge, SortableTh, Pagination, InfoSection…) are kept local on purpose —
// same convention as the rest of the codebase (see Bookings.jsx).

// ─── ICONS ───────────────────────────────────────────────────────────────────

const IconSteering = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.5" />
    <path strokeLinecap="round" d="M12 3v6.5M12 14.5V21M4.2 7.5l5.6 3.2M14.2 13.3l5.6 3.2M19.8 7.5l-5.6 3.2M9.8 13.3l-5.6 3.2" />
  </svg>
);
const IconClock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" d="M12 7v5l3 3" />
  </svg>
);
const IconActivity = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path d="M3 12h4l3 8 4-16 3 8h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
  </svg>
);
const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconRefresh = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" />
  </svg>
);
const IconUser = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="3.5" />
    <path strokeLinecap="round" d="M4.5 20c1.2-3.5 4-5.5 7.5-5.5s6.3 2 7.5 5.5" />
  </svg>
);
const IconChevronsUpDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSortArrow = ({ dir, className = "w-3.5 h-3.5" }) => (
  <svg className={`${className} transition-transform ${dir === "desc" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none">
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const ROW_H = 61; // px — every table row (data, skeleton, filler, empty message) uses this, so the table keeps the same height on every view and page

const toMillis = (val) => {
  if (!val) return -Infinity;
  const ms = new Date(val).getTime();
  return isNaN(ms) ? -Infinity : ms;
};

const fmtDate = (val) => {
  const ms = toMillis(val);
  if (!isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
const fmtTime = (val) => {
  const ms = toMillis(val);
  if (!isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};
const fmtDateTime = (val) => {
  const ms = toMillis(val);
  if (!isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

// Same "date | time" cell Bookings uses for Created At.
const DateTimeCell = ({ value }) => (
  <span className="whitespace-nowrap">
    <span className="text-gray-700">{fmtDate(value)}</span>
    {fmtTime(value) && (
      <>
        <span className="mx-1.5 text-gray-300">|</span>
        <span className="text-gray-500">{fmtTime(value)}</span>
      </>
    )}
  </span>
);

// "YYYY-MM-DD" (local day) of a date value; what the date picker in "Search by" is compared against.
const dayKey = (val) => {
  const ms = toMillis(val);
  if (!isFinite(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "Search by" options per view: they mirror the table's columns. The with / without driver dropdown has its own filter.
const SEARCH_BY = {
  trips: [
    { key: "customer", label: "Customer",   type: "text" },
    { key: "vehicle",  label: "Vehicle",    type: "text" },
    { key: "start",    label: "Trip Start", type: "date" },
    { key: "end",      label: "Trip End",   type: "date" },
    { key: "driver",   label: "Driver",     type: "text" },
  ],
  drivers: [
    { key: "name",  label: "Driver",      type: "text" },
    { key: "phone", label: "Contact No.", type: "text" },
  ],
};

// Driver's-license note; null when there's nothing to warn about (board's `license` field).
const licenseWarning = (lic) => {
  if (!lic) return null;
  if (lic.status === "expired") {
    return { level: "expired", short: "License expired",
             long: `Driver's license expired${lic.expiry ? ` on ${fmtDate(lic.expiry)}` : ""}.` };
  }
  if (lic.status === "expiring") {
    return { level: "expiring", short: `License expires in ${lic.daysLeft}d`,
             long: `Driver's license expires in ${lic.daysLeft} day${lic.daysLeft === 1 ? "" : "s"}.` };
  }
  return null;
};
const LICENSE_STYLE = {
  expired:  "bg-red-50 text-red-700 border-red-200",
  expiring: "bg-amber-50 text-amber-700 border-amber-200",
};

// How one driver fits ONE booking's window (GET /api/driver-dispatch/availability).
//   free = no clash · tight = gap shorter than the buffer (warning) · busy = real overlap (needs a reason)
const fmtGap = (mins) => {
  const m = Number(mins) || 0;
  if (m <= 0) return "no gap";
  const h = Math.floor(m / 60), r = m % 60;
  return [h ? `${h} h` : "", r ? `${r} min` : ""].filter(Boolean).join(" ");
};
const FIT_STYLES = {
  free:  "bg-green-50 text-green-700 border-green-200",
  tight: "bg-amber-50 text-amber-700 border-amber-200",
  busy:  "bg-red-50 text-red-700 border-red-200",
};
const fitText = (fit) => (
  fit.status === "busy" ? "Busy"
  : fit.status === "tight" ? `Tight · ${fmtGap(fit.conflict?.gapMinutes)} gap`
  : "Free"
);
const FIT_ORDER = { free: 0, tight: 1, busy: 2 };

// A real overlap can only be forced with a typed reason; keep in step with OVERRIDE_REASON_MIN_LENGTH in the backend.
const OVERRIDE_REASON_MIN = 5;

// Same status colors as Bookings / Dashboard.
const STATUS_DOT = {
  upcoming: "bg-yellow-400", ongoing: "bg-blue-500", completed: "bg-green-500", cancelled: "bg-red-500",
};
const STATUS_BG = {
  upcoming:  "bg-yellow-50 border border-yellow-200",
  ongoing:   "bg-blue-50 border border-blue-200",
  completed: "bg-green-50 border border-green-200",
  cancelled: "bg-red-50 border border-red-200",
};
function StatusBadge({ status }) {
  const s = (status || "").toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${STATUS_BG[s] || "bg-gray-50 border border-gray-200"}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s] || "bg-gray-400"}`} />
      {status?.replace("_", " ")}
    </span>
  );
}

// Same flat stat card as Users.jsx. Click = open that view (click-state shown with the teal ring).
function StatCard({ title, value, Icon, color, selected, onClick }) {
  const colors = {
    teal:   "bg-teal-50 text-teal-600",
    yellow: "bg-yellow-50 text-yellow-600",
    amber:  "bg-amber-50 text-amber-600",
    blue:   "bg-blue-50 text-blue-600",
  };
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={`rounded-2xl border p-4 flex items-center gap-3 transition-all cursor-pointer ${
        selected ? "bg-white border-teal-500 ring-2 ring-teal-100" : "bg-gray-50 border-transparent hover:bg-gray-100"
      }`}
    >
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${colors[color] || colors.teal}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-800">{value}</div>
        <div className="text-xs text-gray-500">{title}</div>
      </div>
    </div>
  );
}

const Pill = ({ className, children }) => (
  <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${className}`}>{children}</span>
);

function Avatar({ src, name, className = "w-9 h-9" }) {
  return (
    <div className={`${className} rounded-full bg-teal-50 text-teal-600 flex items-center justify-center overflow-hidden shrink-0`}>
      {src
        ? <img src={src} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        : <IconUser className="w-4 h-4" />}
    </div>
  );
}

// Card + label-over-value cell — same as Bookings.jsx's InfoSection / InfoField.
function InfoSection({ title, aside, children, cols = 2 }) {
  return (
    <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
        {aside}
      </div>
      <div className={`p-4 grid ${cols === 3 ? "grid-cols-3" : "grid-cols-2"} gap-x-6 gap-y-4`}>{children}</div>
    </section>
  );
}
function InfoField({ label, value, wide }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className="text-sm font-medium text-gray-800 mt-0.5 break-words">{value || "—"}</div>
    </div>
  );
}

function SortableTh({ label, sortKey: key, sortKeyState, sortDir, onSort }) {
  const active = sortKeyState === key;
  return (
    <th className="px-4 py-3 text-left select-none">
      <button
        onClick={() => onSort(key)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={sortDir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

function Pagination({ page, totalPages, onChange, start, pageSize, count }) {
  if (count === 0) return null;
  const nums = [1];
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) nums.push(n);
  if (totalPages > 1) nums.push(totalPages);
  const dedup = [...new Set(nums)].sort((a, b) => a - b);
  const rangeEnd = Math.min(start + pageSize, count);
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50/50">
      <p className="text-xs text-gray-400">Showing {start + 1}–{rangeEnd} of {count}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Prev
        </button>
        {dedup.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - dedup[i - 1] > 1 && <span className="px-1.5 text-gray-300 text-xs">…</span>}
            <button onClick={() => onChange(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                n === page ? "bg-arl-primary text-white shadow" : "border text-gray-600 hover:bg-white"
              }`}>
              {n}
            </button>
          </span>
        ))}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Next
        </button>
      </div>
    </div>
  );
}

const btnPrimary = "w-full px-3 py-1.5 bg-arl-primary text-white font-semibold rounded-xl text-sm hover:bg-[#16526a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnClose   = "w-full mt-1.5 py-1.5 border rounded-xl text-sm";
const btnView    = "px-3.5 py-1 rounded-lg text-xs font-semibold bg-arl-primary text-white hover:bg-[#16526a] transition-colors";

// ─── ASSIGN DRIVER MODAL ─────────────────────────────────────────────────────
// Owns the whole assigning flow (pick → availability → conflict / override reason → assign).
// On success it calls onDone(), so the parent closes it and reloads the board — nothing is left
// half-open on the page afterwards.

function AssignModal({ booking, drivers, authedFetch, onClose, onDone, navigate, onUnassign, busyID }) {
  const assigned = !!booking.hasDriver; // already has a driver: read-only details + Unassign (then the picker appears)
  const [picked, setPicked]       = useState("");
  const [availability, setAvail]  = useState(null);  // { [driverID]: fit }
  const [conflict, setConflict]   = useState(null);  // { message, conflictType, requiresReason }
  const [reason, setReason]       = useState("");
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    if (assigned) return;
    let alive = true;
    (async () => {
      try {
        const res  = await authedFetch(`/api/driver-dispatch/availability?bookingID=${encodeURIComponent(booking.id)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Failed to load driver availability.");
        if (alive) setAvail(Object.fromEntries((json.data?.drivers || []).map((x) => [x.driverID, x])));
      } catch { if (alive) setAvail({}); }   // informational only — the server re-checks on assign
    })();
    return () => { alive = false; };
  }, [booking.id, assigned, authedFetch]);

  // Free drivers first, then tight, then busy; stable within each group.
  const sorted = useMemo(() => {
    if (!availability) return drivers;
    return drivers
      .map((d, i) => ({ d, i, o: FIT_ORDER[availability[d.driverID]?.status] ?? 0 }))
      .sort((a, b) => a.o - b.o || a.i - b.i)
      .map((x) => x.d);
  }, [drivers, availability]);

  const pick = (id) => { setPicked(id); setConflict(null); setReason(""); setError(""); };

  const submit = async (force = false) => {
    if (!picked) return;
    setBusy(true); setError("");
    try {
      const res = await authedFetch("/api/driver-dispatch/assign", {
        method: "POST",
        body: JSON.stringify({ bookingID: booking.id, driverID: picked, force, ...(force && reason.trim() ? { overrideReason: reason.trim() } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.conflict) {
          setConflict({ message: json.message, conflictType: json.conflictType || null, requiresReason: !!json.requiresReason });
          return;
        }
        throw new Error(json.message || "Failed to assign driver.");
      }
      onDone("Driver assigned.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pickedDriver = drivers.find((d) => d.driverID === picked);
  const pickedFit    = availability?.[picked];
  const pickedLic    = licenseWarning(pickedDriver?.license);
  const reasonOk     = reason.trim().length >= OVERRIDE_REASON_MIN;
  const needsReason  = !!conflict?.requiresReason;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-bold text-lg text-gray-800">{assigned ? "Trip Details" : "Assign Driver"}</h2>
              <StatusBadge status={booking.status || "upcoming"} />
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><IconX /></button>
          </div>
          <p className="text-sm text-gray-500 mt-1 truncate">
            {booking.customerName || "—"}{booking.vehicleName ? ` · ${booking.vehicleName}` : ""}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <InfoSection
            title="Trip"
            aside={
              <button type="button" onClick={() => navigate(`/bookings?open=${encodeURIComponent(booking.id)}`)}
                className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-arl-primary text-white hover:bg-[#16526a] transition-colors">
                View Booking →
              </button>
            }
          >
            <InfoField label="Customer" value={booking.userID ? (
              <button type="button" onClick={() => navigate(`/users?role=customer&tab=directory&open=${encodeURIComponent(booking.userID)}`)}
                title="Open this customer in Users" className="text-indigo-600 hover:underline font-medium text-left">
                {booking.customerName || "—"}
              </button>
            ) : booking.customerName} />
            <InfoField label="Vehicle"    value={booking.vehicleName} />
            <InfoField label="Trip Start" value={fmtDateTime(booking.startDateTime)} />
            <InfoField label="Trip End"   value={fmtDateTime(booking.endDateTime)} />
            <InfoField wide label="Driver" value={assigned
              ? `${booking.driverName || "—"}${booking.driverPhone ? ` · ${booking.driverPhone}` : ""}`
              : <Pill className="bg-red-50 text-red-700 border-red-200">No Driver</Pill>} />
          </InfoSection>

          {assigned && (
            <p className="text-xs text-gray-400 px-1">To change the driver, unassign this one first. You can then pick another driver here.</p>
          )}

          {!assigned && (<>
          <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Choose a driver</h3>
              {availability === null && <span className="text-[11px] text-gray-400">Checking availability…</span>}
            </div>
            {sorted.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No drivers found. Add one from Users.</p>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {sorted.map((d) => {
                  const fit = availability?.[d.driverID];
                  const lic = licenseWarning(d.license);
                  const selected = picked === d.driverID;
                  return (
                    <li key={d.driverID}>
                      <button type="button" onClick={() => pick(d.driverID)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${selected ? "bg-teal-50/60" : "hover:bg-gray-50"}`}>
                        <span className={`w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? "border-teal-600" : "border-gray-300"}`}>
                          {selected && <span className="w-2 h-2 rounded-full bg-teal-600" />}
                        </span>
                        <Avatar src={d.profileImage} name={d.name} className="w-8 h-8" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{d.name}</p>
                          <p className="text-xs text-gray-400">{d.phone || "—"} · {d.assignments.length} trip{d.assignments.length === 1 ? "" : "s"}</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
                          {lic && <Pill className={LICENSE_STYLE[lic.level]}>{lic.short}</Pill>}
                          {fit && <Pill className={FIT_STYLES[fit.status]}>{fitText(fit)}</Pill>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Warnings for the driver that is selected */}
          {!conflict && pickedFit && pickedFit.status !== "free" && (
            <p className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2 border ${FIT_STYLES[pickedFit.status]}`}>
              <IconWarning className="w-4 h-4 shrink-0" />
              <span>{pickedFit.conflict?.message}{pickedFit.status === "busy" ? " You'll need to give a reason to assign anyway." : ""}</span>
            </p>
          )}
          {!conflict && pickedLic && (
            <p className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2 border ${LICENSE_STYLE[pickedLic.level]}`}>
              <IconWarning className="w-4 h-4 shrink-0" />
              <span>{pickedLic.long}{pickedLic.level === "expired" ? " You'll be asked to confirm before assigning." : ""}</span>
            </p>
          )}

          {/* Server-side conflict → confirm (and, for a real overlap, give a reason) */}
          {conflict && (
            <div className={`rounded-xl border p-3 space-y-2 ${conflict.conflictType === "overlap" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
              <p className={`flex items-start gap-2 text-xs ${conflict.conflictType === "overlap" ? "text-red-700" : "text-amber-800"}`}>
                <IconWarning className="w-4 h-4 shrink-0" /> {conflict.message}
              </p>
              {needsReason && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-red-700">
                    Reason for assigning over an overlap (saved in the audit log)
                  </label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                    placeholder="e.g. both trips are short and in the same area"
                    className="w-full border border-red-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-200" />
                  {!reasonOk && reason.length > 0 && (
                    <p className="text-[11px] text-red-600">At least {OVERRIDE_REASON_MIN} characters.</p>
                  )}
                </div>
              )}
            </div>
          )}

          </>)}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
              <IconWarning className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {assigned ? (
            <button onClick={() => onUnassign(booking.id)} disabled={busyID === booking.id}
              className="w-full px-3 py-1.5 border border-red-200 bg-red-50 text-red-600 font-semibold rounded-xl text-sm hover:bg-red-100 transition-colors disabled:opacity-40">
              {busyID === booking.id ? "Unassigning…" : "Unassign Driver"}
            </button>
          ) : conflict ? (
            <div className="flex flex-col gap-1.5">
              <button onClick={() => submit(true)} disabled={busy || (needsReason && !reasonOk)}
                title={needsReason && !reasonOk ? "Type a reason first" : undefined}
                className={`w-full px-3 py-1.5 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  conflict.conflictType === "overlap" ? "bg-red-600 hover:bg-red-700" : "bg-arl-primary hover:bg-[#16526a]"
                }`}>
                {busy ? "Assigning…" : "Assign Anyway"}
              </button>
              <button onClick={() => { setConflict(null); setReason(""); }} className="w-full py-1.5 border rounded-xl text-sm">Pick another driver</button>
            </div>
          ) : (
            <button onClick={() => submit(false)} disabled={busy || !picked}
              title={!picked ? "Select a driver first" : undefined} className={btnPrimary}>
              {busy ? "Assigning…" : picked ? `Assign ${pickedDriver?.name || "Driver"}` : "Assign Driver"}
            </button>
          )}
          <button onClick={onClose} className={btnClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── DRIVER DETAILS MODAL ────────────────────────────────────────────────────
// Current trips + trip history, 5 per page, same data and look as the driver "Trips" tab in Users.jsx
// (GET /api/driver-dispatch/drivers/:id/activity). The driver itself is read live from the board, and the
// trips reload whenever the driver's assignments change (e.g. after an Unassign).

const MODAL_PAGE_SIZE = 5;

function TripSection({ title, rows, loading, emptyText, renderRow }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / MODAL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * MODAL_PAGE_SIZE;
  const items = rows.slice(start, start + MODAL_PAGE_SIZE);
  return (
    <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {title}{!loading && <span className="ml-1.5 text-gray-400 normal-case font-medium">({rows.length})</span>}
        </h3>
      </div>
      {loading ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-gray-100">{items.map(renderRow)}</ul>
      )}
      <Pagination page={safePage} totalPages={totalPages} onChange={setPage} start={start} pageSize={MODAL_PAGE_SIZE} count={loading ? 0 : rows.length} />
    </section>
  );
}

function DriverModal({ driver, busyID, onUnassign, onClose, navigate, authedFetch }) {
  const [data, setData]       = useState(null);   // { current: [], history: [] }
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Changes whenever a trip is assigned to / removed from this driver → refetch.
  const assignKey = driver.assignments.map((a) => a.id).join(",");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res  = await authedFetch(`/api/driver-dispatch/drivers/${encodeURIComponent(driver.driverID)}/activity`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load trips.");
      setData(json.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [driver.driverID, authedFetch]);
  useEffect(() => { load(); }, [load, assignKey]);

  const lic = licenseWarning(driver.license);
  const onTrip = driver.assignments.length > 0;
  const licenseValue = lic
    ? <span className="flex items-center gap-2 flex-wrap"><Pill className={LICENSE_STYLE[lic.level]}>{lic.short}</Pill>{driver.license?.expiry && <span className="text-xs text-gray-400 font-normal">{fmtDate(driver.license.expiry)}</span>}</span>
    : driver.license?.expiry ? `Valid until ${fmtDate(driver.license.expiry)}` : null;

  const openBooking  = (id) => navigate(`/bookings?open=${encodeURIComponent(id)}`);
  const openCustomer = (id) => navigate(`/users?role=customer&tab=directory&open=${encodeURIComponent(id)}`);

  const renderRow = (history) => (t) => {
    const end = history ? (t.completedAt || t.endDateTime) : t.endDateTime;
    return (
      <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} />
            {t.archived && <Pill className="bg-gray-50 border-gray-200 text-gray-500">Archived</Pill>}
          </div>
          <p className="text-sm font-semibold text-gray-800">
            {t.vehicleName} ·{" "}
            {t.userID ? (
              <button type="button" onClick={() => openCustomer(t.userID)} title="Open this customer in Users"
                className="text-indigo-600 hover:underline font-semibold text-left">{t.customerName || "—"}</button>
            ) : (t.customerName || "—")}
          </p>
          <p className="text-xs text-gray-500">
            {fmtDateTime(t.startDateTime)} → {fmtDateTime(end)}{history && t.completedAt ? " (returned)" : ""}
          </p>
          {t.location && t.location !== "—" && <p className="text-xs text-gray-400 truncate">{t.location}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* An archived trip has no live booking to open. */}
          {!t.archived && <button onClick={() => openBooking(t.id)} className={btnView}>View Booking →</button>}
          {!history && (
            <button onClick={() => onUnassign(t.id)} disabled={busyID === t.id}
              className="px-3.5 py-1 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40">
              {busyID === t.id ? "…" : "Unassign"}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-bold text-lg text-gray-800">Driver Details</h2>
              <Pill className={onTrip ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-500 border-gray-200"}>
                {onTrip ? "On a Trip" : "Available"}
              </Pill>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><IconX /></button>
          </div>
          <p className="text-sm text-gray-500 mt-1 truncate">{driver.name}{driver.phone ? ` · ${driver.phone}` : ""}</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <InfoSection title="Driver Information">
            <InfoField label="Name"  value={driver.name} />
            <InfoField label="Phone" value={driver.phone} />
            <InfoField wide label="Driver's License" value={licenseValue} />
          </InfoSection>

          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex justify-between items-center">
              <span className="flex items-center gap-2"><IconWarning className="w-4 h-4 shrink-0" />{error}</span>
              <button onClick={load} className="underline font-semibold">Retry</button>
            </div>
          ) : (
            <>
              <TripSection title="Current Trips" rows={data?.current || []} loading={loading}
                emptyText="No upcoming or ongoing trips." renderRow={renderRow(false)} />
              <TripSection title="Trip History" rows={data?.history || []} loading={loading}
                emptyText="No completed trips yet." renderRow={renderRow(true)} />
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={() => navigate(`/users?role=driver&tab=directory&open=${encodeURIComponent(driver.driverID)}`)} className={btnPrimary}>
            View Driver Info
          </button>
          <button onClick={onClose} className={btnClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────


export default function DriverDispatch() {
  const token = localStorage.getItem("token");
  const [searchParams] = useSearchParams();
  const highlightDriverID = searchParams.get("driver");
  const routerLocation = useLocation();
  const navigate = useNavigate();

  // Arrived via "Assign Driver" on Car Tracking → open the Assign modal for that booking once the board has loaded.
  const assignTarget = routerLocation.state?.assignBookingId || null;

  const [board, setBoard]     = useState({ drivers: [], unassigned: [], missingWhileOngoing: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState(null);
  const [view, setView]       = useState("trips");
  const [search, setSearch]   = useState("");
  const [searchBy, setSearchBy] = useState("customer");
  const [dateValue, setDateValue] = useState(""); // "YYYY-MM-DD" from the date picker
  const [driverFilter, setDriverFilter] = useState("all"); // drivers view only: all | available | busy
  const [needsDriverOnly, setNeedsDriverOnly] = useState(false); // trips view only: set by the "Needs Driver" card
  const [statusFilter, setStatusFilter] = useState("all"); // trips view only: all | upcoming | ongoing (set by the stat cards)
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage]       = useState(1);
  const [assignBookingID, setAssignBookingID] = useState(null); // booking shown in AssignModal (looked up live, so it updates after an Unassign)
  const [driverModalID, setDriverModalID] = useState(null);   // driverID shown in DriverModal
  const [busyID, setBusyID]   = useState(null);               // booking being unassigned
  const deepLinked = useRef({ driver: false, assign: false });

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const authedFetch = useCallback((path, options = {}) => (
    fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    })
  ), [token]);

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

  // "View Driver" link (e.g. from Car Tracking) → open that driver's details.
  useEffect(() => {
    if (!highlightDriverID || loading || deepLinked.current.driver) return;
    deepLinked.current.driver = true;
    if (board.drivers.some((d) => d.driverID === highlightDriverID)) {
      setView("drivers");
      setDriverModalID(highlightDriverID);
    }
  }, [highlightDriverID, loading, board.drivers]);

  // "Assign Driver" link from Car Tracking → open the Assign modal.
  useEffect(() => {
    if (!assignTarget || loading || deepLinked.current.assign) return;
    deepLinked.current.assign = true;
    const b = board.unassigned.find((x) => x.id === assignTarget);
    if (b) { setView("trips"); setAssignBookingID(b.id); }
    else {
      showToast("That booking no longer needs a driver.", "error");
      navigate(routerLocation.pathname, { replace: true, state: {} });
    }
  }, [assignTarget, loading, board.unassigned, navigate, routerLocation.pathname]);

  const clearRouteState = () => {
    if (routerLocation.state?.assignBookingId) navigate(routerLocation.pathname, { replace: true, state: {} });
  };
  const closeAssign = () => { setAssignBookingID(null); clearRouteState(); };
  const assignDone = (msg) => { setAssignBookingID(null); clearRouteState(); showToast(msg); fetchBoard(); };

  const doUnassign = async (bookingDocID) => {
    setBusyID(bookingDocID);
    try {
      const res  = await authedFetch("/api/driver-dispatch/unassign", { method: "POST", body: JSON.stringify({ bookingID: bookingDocID }) });
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

  // ── derived data ──
  // Every driver trip that is still live: upcoming (with a driver, or still waiting for one) and ongoing.
  // Completed trips are not listed here — they stay in each driver's Trip History and in Bookings.
  const tripRows = useMemo(() => [
    ...board.unassigned.map((b) => ({ ...b, hasDriver: false })),
    ...board.drivers.flatMap((d) =>
      d.assignments
        .filter((b) => ["upcoming", "ongoing"].includes(String(b.status).toLowerCase()))
        .map((b) => ({ ...b, hasDriver: true, driverID: d.driverID, driverName: d.name, driverPhone: d.phone }))
    ),
  ], [board]);
  const upcomingCount = tripRows.filter((b) => String(b.status).toLowerCase() === "upcoming").length;
  const needsDriverCount = tripRows.filter((b) => !b.hasDriver).length;
  const ongoingCount  = tripRows.filter((b) => String(b.status).toLowerCase() === "ongoing").length;
  const assignBooking = assignBookingID ? tripRows.find((b) => b.id === assignBookingID) : null;

  const TABS = [
    { key: "trips",   label: "Driver Trips", icon: IconClock },
    { key: "drivers", label: "Drivers",        icon: IconSteering },
  ];

  // Column definitions per view. `sort` makes the header clickable.
  const COLUMNS = {
    trips: [
      { id: "customer", label: "Customer", sort: (b) => (b.customerName || "").toLowerCase(), cell: (b) => <span className="font-medium text-gray-800">{b.customerName || "—"}</span> },
      { id: "vehicle",  label: "Vehicle",  cell: (b) => <span className="text-gray-700">{b.vehicleName || "—"}</span> },
      { id: "start",    label: "Trip Start", sort: (b) => toMillis(b.startDateTime), cell: (b) => <DateTimeCell value={b.startDateTime} /> },
      { id: "end",      label: "Trip End",   sort: (b) => toMillis(b.endDateTime),   cell: (b) => <DateTimeCell value={b.endDateTime} /> },
      { id: "driver",   label: "Driver", sort: (b) => (b.hasDriver ? (b.driverName || "").toLowerCase() : ""), cell: (b) => (
          b.hasDriver
            ? <span className="font-medium text-gray-800">{b.driverName || "—"}</span>
            : <Pill className="bg-red-50 text-red-700 border-red-200">No Driver</Pill>
        ) },
      { id: "status",   label: "Status", sort: (b) => String(b.status || ""), cell: (b) => <StatusBadge status={b.status} /> },
      { id: "action",   label: "Action", cell: (b) => (
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setAssignBookingID(b.id)} className={btnView}>View</button>
          </div>
        ) },
    ],
    drivers: [
      { id: "name",   label: "Driver", sort: (d) => (d.name || "").toLowerCase(), cell: (d) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar src={d.profileImage} name={d.name} />
            <span className="font-medium text-gray-800 truncate">{d.name}</span>
          </div>
        ) },
      { id: "phone",  label: "Contact No.", cell: (d) => <span className="text-gray-700 whitespace-nowrap">{d.phone || "—"}</span> },
      { id: "license", label: "License", cell: (d) => {
          const lic = licenseWarning(d.license);
          return lic ? <Pill className={LICENSE_STYLE[lic.level]}>{lic.short}</Pill> : <span className="text-gray-300">—</span>;
        } },
      { id: "status", label: "Status", cell: (d) => (
          <Pill className={d.assignments.length > 0 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-500 border-gray-200"}>
            {d.assignments.length > 0 ? "On a Trip" : "Available"}
          </Pill>
        ) },
      { id: "trips",  label: "Trips", sort: (d) => d.assignments.length, cell: (d) => <span className="text-gray-600">{d.assignments.length}</span> },
      { id: "action", label: "Action", cell: (d) => (
          <div className="flex justify-end"><button onClick={() => setDriverModalID(d.driverID)} className={btnView}>View</button></div>
        ) },
    ],
  };
  const columns = COLUMNS[view];

  const sourceRows = view === "trips" ? tripRows : board.drivers;
  const rowKey = (r) => (view === "drivers" ? r.driverID : r.id);

  const searchOptions = SEARCH_BY[view];
  const searchType = searchOptions.find((o) => o.key === searchBy)?.type || "text";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = sourceRows;
    if (view === "trips" && needsDriverOnly) rows = rows.filter((r) => !r.hasDriver);
    if (view === "trips" && statusFilter !== "all") {
      rows = rows.filter((r) => String(r.status).toLowerCase() === statusFilter);
    }
    if (view === "drivers" && driverFilter !== "all") {
      rows = rows.filter((d) => (driverFilter === "busy") === (d.assignments.length > 0));
    }
    if (searchType === "date") {
      if (dateValue) {
        rows = rows.filter((r) => dayKey(searchBy === "start" ? r.startDateTime : r.endDateTime) === dateValue);
      }
    } else if (q) {
      const field = (r) => ({
        customer: r.customerName, vehicle: r.vehicleName, driver: r.driverName,
        name: r.name, phone: r.phone,
      }[searchBy] || "");
      rows = rows.filter((r) => String(field(r) || "").toLowerCase().includes(q));
    }
    const col = columns.find((c) => c.id === sortKey && c.sort);
    if (col) {
      rows = [...rows].sort((a, b) => {
        const x = col.sort(a), y = col.sort(b);
        return (x < y ? -1 : x > y ? 1 : 0) * (sortDir === "asc" ? 1 : -1);
      });
    }
    return rows;
  }, [sourceRows, view, search, searchBy, searchType, dateValue, driverFilter, statusFilter, needsDriverOnly, sortKey, sortDir, columns]);

  useEffect(() => { setPage(1); }, [view, search, searchBy, dateValue, driverFilter, statusFilter, needsDriverOnly, sortKey, sortDir]);
  useEffect(() => { setSearch(""); setDateValue(""); setSearchBy(SEARCH_BY[view][0].key); setDriverFilter("all"); setSortKey(null); setSortDir("asc"); }, [view]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const start      = (safePage - 1) * PAGE_SIZE;
  const pageItems  = filtered.slice(start, start + PAGE_SIZE);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const driverForModal = board.drivers.find((d) => d.driverID === driverModalID);
  const emptyText = view === "trips" ? "No driver trips" : "No drivers found. Add one from Users.";

  return (
    <div className="p-4 space-y-5 font-sans">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === "error" ? "bg-red-500" : "bg-teal-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* STAT CARDS + TABS — one card, same layout as the Users page. The cards open the matching view. */}
      <div className="bg-white rounded-2xl shadow-sm border">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 p-4">
          <StatCard title="Upcoming Trips" value={loading ? "…" : upcomingCount} Icon={IconClock} color="yellow"
            selected={view === "trips" && statusFilter === "upcoming" && !needsDriverOnly}
            onClick={() => {
              if (view === "trips" && statusFilter === "upcoming" && !needsDriverOnly) { setStatusFilter("all"); return; } // click again = un-select
              setStatusFilter("upcoming"); setNeedsDriverOnly(false); setView("trips");
            }} />
          <StatCard title="Needs Driver" value={loading ? "…" : needsDriverCount} Icon={IconWarning} color="amber"
            selected={view === "trips" && needsDriverOnly}
            onClick={() => {
              if (view === "trips" && needsDriverOnly) { setNeedsDriverOnly(false); return; }
              setStatusFilter("all"); setNeedsDriverOnly(true); setView("trips");
            }} />
          <StatCard title="Ongoing Trips" value={loading ? "…" : ongoingCount} Icon={IconActivity} color="blue"
            selected={view === "trips" && statusFilter === "ongoing" && !needsDriverOnly}
            onClick={() => {
              if (view === "trips" && statusFilter === "ongoing" && !needsDriverOnly) { setStatusFilter("all"); return; }
              setStatusFilter("ongoing"); setNeedsDriverOnly(false); setView("trips");
            }} />
          <StatCard title="Total Drivers" value={loading ? "…" : board.drivers.length} Icon={IconSteering} color="teal"
            selected={view === "drivers"}
            onClick={() => setView("drivers")} />
        </div>

        <div className="flex justify-between items-center border-t px-4 py-3">
          <div className="flex gap-2 flex-wrap">
            {TABS.map(({ key, label, icon: TabIcon }) => (
              <button key={key} onClick={() => { setStatusFilter("all"); setNeedsDriverOnly(false); setView(key); }}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                  view === key ? "bg-arl-primary text-white shadow" : "text-gray-600 hover:bg-gray-50"
                }`}>
                <TabIcon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
          <button onClick={fetchBoard} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-arl-primary text-white hover:bg-[#16526a] transition-colors disabled:opacity-50">
            <IconRefresh className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Data-integrity flag: chauffeur bookings already picked up with no driver on record */}
      {board.missingWhileOngoing.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm space-y-1.5">
          <p className="flex items-center gap-2 font-semibold">
            <IconWarning className="w-4 h-4 shrink-0" />
            {board.missingWhileOngoing.length} ongoing chauffeur trip{board.missingWhileOngoing.length === 1 ? " has" : "s have"} no driver on record
          </p>
          <p className="text-xs text-red-600">These were already picked up but weren't assigned before dispatch — worth checking directly.</p>
          <ul className="text-xs space-y-0.5">
            {board.missingWhileOngoing.map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <span>{b.customerName} · {b.vehicleName} · {fmtDateTime(b.startDateTime)}</span>
                <button onClick={() => navigate(`/bookings?open=${encodeURIComponent(b.id)}`)} className="underline font-semibold">View</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="flex flex-wrap gap-3 items-end p-4 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search by</span>
            <select
              value={searchBy}
              onChange={(e) => { setSearchBy(e.target.value); setSearch(""); setDateValue(""); }}
              className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white"
            >
              {searchOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          {searchType === "date" ? (
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none"
            />
          ) : (
            <input
              type="text"
              placeholder={`Enter ${(searchOptions.find((o) => o.key === searchBy)?.label || "").toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none"
            />
          )}
          {view === "trips" && (
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setNeedsDriverOnly(false); }}
              className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white">
              <option value="all">All statuses</option>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
            </select>
          )}
          {view === "drivers" && (
            <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}
              className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white">
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="busy">On a Trip</option>
            </select>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                {columns.map((c) => c.sort ? (
                  <SortableTh key={c.id} label={c.label} sortKey={c.id} sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                ) : (
                  <th key={c.id} className={c.id === "action" ? "pl-4 pr-8 py-3 text-right" : "px-4 py-3 text-left"}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-t" style={{ height: ROW_H }}>
                    {columns.map((c) => <td key={c.id} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length} className="text-center text-gray-400" style={{ height: ROW_H * PAGE_SIZE }}>{emptyText}</td></tr>
              ) : (
                pageItems.map((r) => (
                  <tr key={rowKey(r)} className="border-t hover:bg-gray-50 transition-colors" style={{ height: ROW_H }}>
                    {columns.map((c) => (
                      <td key={c.id} className={c.id === "action" ? "pl-4 pr-8 py-3 text-right" : "px-4 py-3"}>{c.cell(r)}</td>
                    ))}
                  </tr>
                ))
              )}
              {/* Pad a short page with empty rows so the table always keeps its 10-row height. */}
              {!loading && pageItems.length > 0 && Array.from({ length: Math.max(0, PAGE_SIZE - pageItems.length) }).map((_, i) => (
                <tr key={`filler-${i}`} aria-hidden="true" className="border-t" style={{ height: ROW_H }}>
                  <td colSpan={columns.length}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={filtered.length} />
      </div>

      {assignBooking && (
        <AssignModal
          booking={assignBooking}
          drivers={board.drivers}
          authedFetch={authedFetch}
          onClose={closeAssign}
          onDone={assignDone}
          navigate={navigate}
          onUnassign={doUnassign}
          busyID={busyID}
        />
      )}
      {driverForModal && (
        <DriverModal
          driver={driverForModal}
          busyID={busyID}
          onUnassign={doUnassign}
          onClose={() => setDriverModalID(null)}
          navigate={navigate}
          authedFetch={authedFetch}
        />
      )}
    </div>
  );
}