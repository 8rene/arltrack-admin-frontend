import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;
const REFUND_METHODS = ["Cash", "GCash", "Maya", "BankTransfer"];

/**
 * Return checklist — the Return button always opens this instead of being
 * disabled or silently redirecting. It shows every requirement and its state
 * (dropped off, after-trip inspection, penalties covered, GPS device unassigned),
 * the deposit / penalty / amount-to-return summary, and the driver on the
 * trip. "Confirm Return" stays disabled until every requirement is met —
 * there is no override; the server enforces the same rules.
 *
 * Shared by Car Tracking (supervisor) and My Trips (driver); the caller
 * supplies the data/actions so each uses its own endpoints:
 *   loadChecklist()        -> checklist data (see getReturnChecklist)
 *   onSettleDeposit({method, referenceNumber}) -> settles the deposit (throw on error)
 *   onConfirmReturn()      -> completes the return (throw on error)
 *   onNotePenalty()        -> optional, opens the caller's penalty flow
 *   onMarkDroppedOff()     -> optional, lets them mark dropped off from here
 *   depositOnly            -> "Return deposit" view: just the deposit hand-back (plus the
 *                             drop-off prerequisite), no inspection/GPS rows or Confirm Return
 */
export default function ReturnChecklistModal({
  open, onClose, title, driverName, depositOnly = false,
  loadChecklist, onSettleDeposit, onConfirmReturn, onNotePenalty, onMarkDroppedOff,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refundMethod, setRefundMethod] = useState(REFUND_METHODS[0]);
  const [refundRef, setRefundRef] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await loadChecklist()); }
    catch (e) { setError(e.message || "Couldn't load the checklist."); }
    finally { setLoading(false); }
  }, [loadChecklist]);

  useEffect(() => {
    if (open) refresh();
    else setData(null);
  }, [open, refresh]);

  if (!open) return null;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try { await fn(); }
    catch (e) { setError(e.message || "Something went wrong."); }
    finally { setBusy(false); }
  };

  const item = (key) => data?.items?.find((i) => i.key === key);
  const refundDue = (data?.amountToReturn ?? 0) > 0;
  const owes = (data?.amountToReturn ?? 0) < 0;

  // Portaled to <body> so no parent stacking context (animated wrappers, the
  // Leaflet map cards with z-[1000] overlays, etc.) can ever cover the modal.
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-arl-dark">{depositOnly ? "Return deposit" : "Drop-off & return"}</h3>
            {title && <p className="text-xs text-gray-400 mt-0.5">{title}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        {loading && !data && <p className="text-sm text-gray-400">Checking…</p>}
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

        {data && (
          <>
            <ul className="space-y-2">
              {data.items.filter((i) => !depositOnly || i.key === "droppedOff").map((i) => (
                <li key={i.key} className="flex gap-2 items-start">
                  <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center ${i.complete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {i.complete ? "✓" : "!"}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${i.complete ? "text-gray-500" : "text-arl-dark"}`}>{i.label}</p>
                    {!i.complete && i.detail && <p className="text-[11px] text-amber-700">{i.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>

            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Deposit &amp; penalties</p>
              <div className="flex justify-between"><span className="text-gray-500">Driver</span><span className="font-medium text-arl-dark">{driverName || "No driver"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Deposit held <span className="text-[11px] text-gray-400">({data.depositStatus})</span></span><span className="font-medium">{data.depositHeld == null ? "—" : peso(data.depositHeld)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Penalties given ({data.penalties?.filter((p) => p.status === "Confirmed").length || 0})</span><span className="font-medium text-red-600">− {peso(data.penaltyTotal)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                <span className="font-semibold text-arl-dark">
                  {data.depositSettled ? (owes ? "Settled — customer owed" : "Settled — deposit returned") : (owes ? "Customer will owe" : "Deposit to return")}
                </span>
                <span className={`font-bold ${owes ? "text-red-600" : "text-green-700"}`}>{peso(Math.abs(data.amountToReturn))}</span>
              </div>
              {owes && <p className="text-[11px] text-gray-400">The deposit is used up first; the rest is collected with Mark Paid on the Penalties page (or the customer pays online).</p>}
              {data.depositSettled && data.stillOwed > 0 && (
                <p className="text-[11px] text-red-600">{peso(data.stillOwed)} in penalties is still unpaid (Penalties page → Mark Paid). This doesn&apos;t block Return.</p>
              )}
            </div>

            {onNotePenalty && (
              <button onClick={onNotePenalty} className="w-full py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50">
                + Note a penalty
              </button>
            )}

            {!item("droppedOff")?.complete && onMarkDroppedOff && (
              <button disabled={busy} onClick={() => run(async () => { await onMarkDroppedOff(); await refresh(); })}
                className="w-full py-2 rounded-xl text-sm font-semibold border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                Mark vehicle dropped off
              </button>
            )}

            {(depositOnly ? (data.depositStatus === "Held" && !data.depositSettled) : data.canSettle) && (
              <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-sm font-semibold text-arl-dark">Settle security deposit</p>
                <p className="text-[11px] text-gray-500">
                  {refundDue ? `Hand ${peso(data.amountToReturn)} back to the customer, after deducting penalties.`
                    : owes ? `Penalties use the whole deposit; ${peso(Math.abs(data.amountToReturn))} is still owed.`
                    : "Penalties use the whole deposit — nothing to hand back."}
                </p>
                {refundDue && (
                  <>
                    <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                      {REFUND_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input value={refundRef} onChange={(e) => setRefundRef(e.target.value)} placeholder="Reference number (optional)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                  </>
                )}
                <button disabled={busy || !data.canSettle}
                  onClick={() => run(async () => { await onSettleDeposit({ method: refundDue ? refundMethod : undefined, referenceNumber: refundRef.trim() }); await refresh(); })}
                  className="w-full py-2 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40">
                  {refundDue ? "Confirm deposit returned" : "Confirm settlement"}
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">Close</button>
              {!depositOnly && <button disabled={!data.canReturn || busy}
                onClick={() => run(async () => { await onConfirmReturn(); onClose(); })}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? "…" : data.canReturn ? "Confirm Return" : "Not ready yet"}
              </button>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}