import { useState } from "react";
import { readCodingWarnings, warningsByCity } from "../utils/codingWarnings";

const fmtDateTimeLong = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// Same dot + pill colours as the Bookings page status badge.
const STATUS_DOT = { upcoming: "bg-yellow-400", ongoing: "bg-blue-500", completed: "bg-green-500", cancelled: "bg-red-500", stolen: "bg-red-700" };
const STATUS_BG = {
  upcoming:  "bg-yellow-50 border border-yellow-200",
  ongoing:   "bg-blue-50 border border-blue-200",
  completed: "bg-green-50 border border-green-200",
  cancelled: "bg-red-50 border border-red-200",
  stolen:    "bg-red-100 border border-red-300",
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

// Card + label-over-value cell — same look as the Bookings view window.
// With `onToggle` the body can be shown / hidden and is only rendered while open, so heavy content
// (maps, inspection photos, the terms text) loads on demand.
function InfoSection({ title, children, open = true, onToggle, grid = true }) {
  return (
    <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
        {onToggle && (
          <button type="button" onClick={onToggle} aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800">
            {open ? "Hide" : "Show"}
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
      {open && <div className={grid ? "p-4 grid grid-cols-2 gap-x-6 gap-y-4" : "p-4"}>{children}</div>}
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

/**
 * Read-only "View" modal for a completed trip in My Trips' History tab, styled like the
 * Bookings view window: header with status badge, banners, bordered info cards, Close at the bottom.
 * Nothing here is editable — corrections happen on Payments (staff), not from this screen.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {object} trip - shaped trip object from /my-trips/history
 * @param {Array<{key:string,title:string,render:() => any}>} sections - extra show/hide sections (penalties, locations, inspection, terms)
 */
export default function TripDetailModal({ open, onClose, trip, sections = [] }) {
  // Booking info + payment + penalties start open; the heavier sections start hidden until asked for.
  const [openKeys, setOpenKeys] = useState({ penalties: true });
  const isOpen = (k) => !!openKeys[k];
  const toggle = (k) => setOpenKeys((o) => ({ ...o, [k]: !o[k] }));

  if (!open || !trip) return null;

  const p = trip.payment || {};
  const status = (trip.status || "").toLowerCase();
  const isStolen = status === "stolen";
  const dead = status === "cancelled" || isStolen;
  const codingByCity = warningsByCity(readCodingWarnings(trip.codingWarnings));

  return (
    <div className="fixed inset-0 bg-black/40 z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-3 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-bold text-lg text-gray-800">Booking Details</h2>
              <StatusBadge status={trip.status} />
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
              <IconX />
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1 truncate">
            {trip.customerName || "—"}{trip.vehicleName ? ` · ${trip.vehicleName}` : ""}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {dead && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-red-700">
                {isStolen ? "Stolen — car flagged stolen" : "Cancelled"}
              </p>
            </div>
          )}

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
            </div>
          )}

          <InfoSection title="Booking Information">
            <InfoField label="Booking ID" value={trip.bookingID || trip.id} />
            <InfoField label="Booked on" value={fmtDateTimeLong(trip.bookingCreatedAt)} />
            <InfoField label="Booked by" value={trip.customerName} />
            <InfoField label="Phone" value={trip.customerPhone && trip.customerPhone !== "—" ? (
              <a href={`tel:${trip.customerPhone}`} className="text-teal-600 hover:underline">{trip.customerPhone}</a>
            ) : null} />
            <InfoField label="Vehicle" value={trip.vehicleName} />
            <InfoField label="Driving" value={trip.modeOfDriving} />
            <InfoField label="Trip start" value={fmtDateTimeLong(trip.startDateTime)} />
            <InfoField label="Trip end" value={fmtDateTimeLong(trip.endDateTime)} />
            <InfoField label="Balance" value={
              <span className={p.balance > 0 ? "text-amber-600 font-bold" : "text-green-600 font-bold"}>
                {p.balance > 0 ? "Balance remaining" : "No balance remaining"}
              </span>
            } />
            <InfoField label="Location" value={trip.location && trip.location !== "—" ? trip.location : null} />
          </InfoSection>

          {sections.map((sec) => (
            <InfoSection key={sec.key} title={sec.title} grid={false} open={isOpen(sec.key)} onToggle={() => toggle(sec.key)}>
              {sec.render()}
            </InfoSection>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="w-full py-2 border rounded-xl text-sm hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}