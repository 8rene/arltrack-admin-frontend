import { useEffect } from "react";

// Turns a camelCase/PascalCase field name into a readable label, e.g.
// "bookingArchivesId" -> "Booking Archives Id".
function prettyLabel(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// Fields that look like a date/timestamp by name get formatted as one.
const DATE_KEY_RE = /(At|Date|Time)$/;

function formatValue(key, val) {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";

  if (DATE_KEY_RE.test(key)) {
    const d = new Date(val);
    if (!isNaN(d)) {
      return d.toLocaleString("en-PH", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
    }
  }

  if (typeof val === "object") {
    try { return JSON.stringify(val); } catch { return String(val); }
  }

  return String(val);
}

/**
 * Read-only "view full record" modal for archive tables, which otherwise
 * truncate most fields to fit a row. Pass the raw record object; every key
 * on it is shown unless listed in hideKeys.
 */
export default function ArchiveDetailModal({ title, record, onClose, hideKeys = [], labelOverrides = {} }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!record) return null;

  const hide = new Set(hideKeys);
  const entries = Object.entries(record).filter(([k]) => !hide.has(k));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {entries.length === 0 ? (
            <p className="text-sm text-gray-400">No details available.</p>
          ) : (
            entries.map(([key, val]) => (
              <div key={key} className="flex flex-col gap-0.5 border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {labelOverrides[key] || prettyLabel(key)}
                </span>
                <span className="text-sm text-gray-700 break-all whitespace-pre-wrap">
                  {formatValue(key, val)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}