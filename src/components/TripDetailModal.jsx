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

const IconMap = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path strokeLinecap="round" d="M9 4v14M15 6v14" />
  </svg>
);

// One show / hide block. The body is only rendered while open, so heavy content (maps, inspection photos) loads on demand.
function Section({ title, open, onToggle, children }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
          {open ? "Hide" : "Show"}
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

function Row({ label, value, bold, color }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? "font-bold" : "font-semibold"} ${color || "text-arl-dark"}`}>{value}</span>
    </div>
  );
}

/**
 * Read-only "View" modal for a completed trip in My Trips' History tab —
 * consolidates what used to be a bare "Show Map" button into one place:
 * who booked it and when, the payment breakdown (including mode of
 * payment, now that confirm/collect capture it), and Show Map at the
 * bottom. Nothing here is editable — corrections happen on Payments
 * (staff), not from this screen.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {object} trip - shaped trip object from /my-trips/history
 * @param {Array<{key:string,title:string,render:() => any}>} sections - extra show/hide sections (locations, inspection)
 */
export default function TripDetailModal({ open, onClose, trip, sections = [] }) {
  // Booking info + payment start open; the extra sections (locations, inspection) start hidden until asked for.
  const [openKeys, setOpenKeys] = useState({ info: true, payment: true });
  const isOpen = (k) => !!openKeys[k];
  const toggle = (k) => setOpenKeys((o) => ({ ...o, [k]: !o[k] }));

  if (!open || !trip) return null;

  const p = trip.payment || {};
    const codingByCity = warningsByCity(readCodingWarnings(trip.codingWarnings));

  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-arl-dark text-base">Booking Details</h2>
            {trip.customerName && <p className="text-sm text-gray-400">{trip.customerName}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <IconX />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
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

          <div className="grid gap-4 md:grid-cols-2 items-start">
            {/* Booking info — who booked it and when, distinct from the trip's own start/end dates. */}
            <Section title="Booking Info" open={isOpen("info")} onToggle={() => toggle("info")}>
              <div className="space-y-2.5">
                <Row label="Booked by" value={trip.customerName || "—"} />
                <Row label="Phone" value={trip.customerPhone || "—"} />
                <Row label="Booked on" value={fmtDateTimeLong(trip.bookingCreatedAt)} />
                <div className="h-px bg-gray-200" />
                <Row label="Trip dates" value={`${fmtDateTimeLong(trip.startDateTime)} → ${fmtDateTimeLong(trip.endDateTime)}`} />
                <Row label="Vehicle" value={trip.vehicleName || "—"} />
              </div>
            </Section>

            {/* Payment: a driver only needs to know whether any balance is still owed, not the amounts or how it was paid. */}
            <Section title="Payment" open={isOpen("payment")} onToggle={() => toggle("payment")}>
              <Row label="Balance" value={p.balance > 0 ? "Balance remaining" : "No balance remaining"} color={p.balance > 0 ? "text-amber-600" : "text-green-600"} bold />
            </Section>
          </div>

          {sections.map((sec) => (
            <Section key={sec.key} title={sec.title} open={isOpen(sec.key)} onToggle={() => toggle(sec.key)}>
              {sec.render()}
            </Section>
          ))}
        </div>
      </div>
    </div>
  );
}