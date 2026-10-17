import { useEffect, useState } from "react";

// The "are you sure?" for deleting a booking: the ONLY delete for a booking and everything that belongs to it.
//
// "Delete" here means ARCHIVE. It first asks the server what would happen (nothing is written) and lists exactly
// what goes with the booking (payment, money entries, refund requests, penalties, reviews, trip session, driver
// assignments, cancellation records, maintenance, vehicle inspection).
// Things still in flight (ongoing trip, open refund, unpaid penalty ...) block the delete. Owner / Admin can
// delete past them after ticking the box; a Supervisor cannot (the server enforces this too).
// A table the server could not read shows up as a warning; the delete can still go ahead.
const COUNT_LABEL = {
  booking: ["booking", "bookings"], payment: ["payment", "payments"], refund: ["refund request", "refund requests"],
  penalty: ["penalty", "penalties"], review: ["review", "reviews"], session: ["trip session", "trip sessions"],
  entry: ["money entry", "money entries"], assignment: ["driver assignment", "driver assignments"],
  cancellation: ["cancellation record", "cancellation records"], maintenance: ["maintenance record", "maintenance records"],
  inspection: ["vehicle inspection record", "vehicle inspection records"],
};

// Reads a response as JSON without ever throwing on a non-JSON body (an HTML 404 page from a missing route, a Vercel
// gateway / timeout page ...). Returns { res, json, notJson }.
const readJson = async (res) => {
  const text = await res.text();
  try { return { res, json: JSON.parse(text), notJson: false }; }
  catch { return { res, json: {}, notJson: true }; }
};

// A message a person can act on, whatever came back.
const failMessage = ({ res, json, notJson }, fallback) => {
  if (json?.message) return json.message;
  if (notJson && res.status === 404) return "The server doesn't have this delete action yet (404). The backend may need to be redeployed.";
  if (notJson && res.status >= 500) return `The server had a problem (${res.status}). Please try again in a moment.`;
  if (notJson) return `The server sent an unexpected response (${res.status}).`;
  return fallback;
};

export default function DeleteBundleModal({ id, label, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [gone, setGone] = useState(false);          // the record itself no longer exists: nothing to delete
  const [blocked, setBlocked] = useState(null);   // fresh blockers returned by the server on a 409
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const base = `${process.env.REACT_APP_API_URL}/api/bookings/${encodeURIComponent(id)}`;
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  useEffect(() => {
    let alive = true;
    fetch(`${base}/delete-preview`, { headers })
      .then(readJson)
      .then((r) => {
        if (r.res.status === 404 && r.json.code === "NOT_FOUND") { const e = new Error(r.json.message); e.gone = true; throw e; }
        if (!r.res.ok) throw new Error(failMessage(r, "Could not check what this delete affects."));
        return r.json.data;
      })
      .then((d) => alive && setPreview(d))
      .catch((e) => { if (!alive) return; if (e.gone) setGone(true); setLoadError(e.message || "Could not check what this delete affects."); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // A record that no longer exists cannot be deleted; closing the dialog refreshes the list so the stale row disappears.
  const close = () => (gone ? onDone({ message: `This booking no longer exists. The list was refreshed.` }) : onClose());

  const blockers = blocked?.blockers ?? preview?.blockers ?? [];
  const warnings = blocked?.warnings ?? preview?.warnings ?? [];
  const canForce = blocked?.canForce ?? preview?.canForce ?? false;
  const mustForce = blockers.length > 0;
  const canSubmit = !!preview && !gone && !busy && (!mustForce || (canForce && force));

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const r = await readJson(await fetch(`${base}${mustForce && force ? "?force=true" : ""}`, { method: "DELETE", headers }));
      const { res, json } = r;
      if (res.status === 409 && json.code === "BLOCKED") { setBlocked(json); setForce(false); throw new Error("Something changed — please review the items below."); }
      if (!res.ok) throw new Error(failMessage(r, "Delete failed."));
      onDone(json);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const counts = preview ? Object.entries(preview.counts || {}).filter(([, n]) => n > 0) : [];

  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <h2 className="font-bold text-lg text-gray-800">Delete booking</h2>
        <p className="text-sm text-gray-600"><span className="font-mono font-semibold text-gray-800 break-all">{label || id}</span></p>

        {!preview && !loadError && <p className="text-sm text-gray-400">Checking what this affects…</p>}
        {loadError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{loadError}</p>}

        {preview && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800">
              This archives the booking together with:
            </p>
            <ul className="text-sm text-amber-700 list-disc ml-4 space-y-0.5">
              {counts.map(([k, n]) => <li key={k}>{n} {COUNT_LABEL[k]?.[n === 1 ? 0 : 1] || k}</li>)}
            </ul>
            <p className="text-xs text-amber-700">
              Nothing is destroyed: all of it moves to the Archive pages and can be restored together.
            </p>
          </div>
        )}

        {warnings.length > 0 && (
          <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1 list-disc ml-0 pl-6">
            {warnings.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        )}

        {preview && preview.missing?.length > 0 && (
          <p className="text-xs text-gray-500">None found (already gone or never existed): {preview.missing.join(", ")}.</p>
        )}

        {mustForce && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-red-700">This can't be deleted yet:</p>
            <ul className="text-sm text-red-700 list-disc ml-4 space-y-0.5">{blockers.map((b, i) => <li key={i}>{b.message}</li>)}</ul>
            {canForce ? (
              <label className="flex items-start gap-2 text-xs text-red-800 pt-1 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={force} onChange={(e) => setForce(e.target.checked)} />
                <span>I understand — delete anyway. The records are archived, not destroyed, and can be restored.</span>
              </label>
            ) : (
              <p className="text-xs text-red-700">Resolve these first, or ask an Owner or Admin to delete it.</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={close} disabled={busy} className="px-4 py-2 border rounded-xl text-sm disabled:opacity-50">Cancel</button>
          <button onClick={confirm} disabled={!canSubmit}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors">
            {busy ? "Archiving…" : mustForce ? "Delete anyway" : "Yes, delete"}
          </button>
        </div>
      </div>
    </div>
  );
}