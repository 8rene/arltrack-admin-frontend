import { useEffect, useState } from "react";
import ArchiveDetailModal from "./ArchiveDetailModal";

/**
 * "Everything archived with this booking" list for one table (penalties, refund requests, reviews, maintenance).
 * A booking can have several of each, so this lists them; "Details" opens the full record in ArchiveDetailModal.
 * Read-only: Restore and permanent delete happen on the booking itself.
 *
 *   state    { loading, data: [records], error, message }
 *   summary  (record) => { main: string, sub: string[] }   the one-line description of a record
 */
export default function LinkedRecordsModal({ title, state, onClose, summary, labelOverrides = {} }) {
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !open) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const rows = Array.isArray(state?.data) ? state.data : [];

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-800">
              {title}{!state?.loading && !state?.error ? ` (${rows.length})` : ""}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>

          {state?.loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : state?.error ? (
            <p className="text-sm text-red-500">{state.error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400">{state?.message || "Nothing was archived with this booking."}</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const { main, sub = [] } = summary(r);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl p-3 bg-gray-50/60">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{main}</p>
                      {sub.filter(Boolean).length > 0 && (
                        <p className="text-xs text-gray-500 truncate">{sub.filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setOpen(r)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 whitespace-nowrap"
                    >
                      Details
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {open && (
        <ArchiveDetailModal
          title={title}
          record={open}
          onClose={() => setOpen(null)}
          labelOverrides={labelOverrides}
        />
      )}
    </>
  );
}
