import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;
const REFUND_METHODS = ["Cash", "GCash", "Maya", "BankTransfer"];

/**
 * Return checklist — the Return button always opens this instead of being
 * disabled or silently redirecting. It shows every requirement and its state
 * (dropped off, after-trip inspection, penalties covered, GPS device unassigned),
 * the deposit / penalty / amount-to-return summary, and the driver on the
 * trip. "Confirm Complete" stays disabled until every requirement is met —
 * there is no override; the server enforces the same rules.
 *
 * Shared by Car Tracking (supervisor) and My Trips (driver); the caller
 * supplies the data/actions so each uses its own endpoints:
 *   loadChecklist()        -> checklist data (see getReturnChecklist)
 *   onSettleDeposit({method, referenceNumber, online}) -> settles the deposit (throw on error). Resolves with the
 *                          server's result; result.online.state is "processing" | "failed" when it went through PayMongo.
 *   onConfirmReturn()      -> completes the return (throw on error)
 *   onNotePenalty()        -> optional, opens the caller's penalty flow
 *   onMarkDroppedOff()     -> optional, lets them mark dropped off from here
 *   onOpenPayments()       -> optional. When given (Car Tracking), the deposit/penalty summary and the settle section are
 *                             hidden and replaced by one "deposit still held -- return it on Payments" line that calls
 *                             this. The deposit is returned from the Payments page (depositOnly view), never from here.
 *   depositOnly            -> "Return deposit" view: just the deposit hand-back (plus the
 *                             drop-off prerequisite), no inspection/GPS rows or Confirm Return
 */
export default function ReturnChecklistModal({
  open, onClose, title, driverName, depositOnly = false,
  loadChecklist, onSettleDeposit, onConfirmReturn, onNotePenalty, onMarkDroppedOff, onOpenPayments, onOpenRefunds,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refundMethod, setRefundMethod] = useState(REFUND_METHODS[0]);
  const [refundRef, setRefundRef] = useState("");
  const [returnMode, setReturnMode] = useState("store");   // "store" = hand it back in person, "online" = refund through PayMongo
  const [notice, setNotice] = useState(null);              // { type: "info" | "warn", text } -- survives the refresh after settling
  const [showPenalties, setShowPenalties] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await loadChecklist()); }
    catch (e) { setError(e.message || "Couldn't load the checklist."); }
    finally { setLoading(false); }
  }, [loadChecklist]);

  useEffect(() => {
    if (open) refresh();
    else { setData(null); setShowPenalties(false); setReturnMode("store"); setNotice(null); }
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
  const compact = !!onOpenPayments && !depositOnly;   // Car Tracking: no money section here, just a pointer to Payments
  const depositHeldNow = data?.depositStatus === "Held" && !data?.depositSettled;
  const refundDue = (data?.amountToReturn ?? 0) > 0;
  const owes = (data?.amountToReturn ?? 0) < 0;
  const onlineOpt = data?.onlineReturn || null;                 // { available, channel?, reason? } from the server
  const canOnline = refundDue && !!onlineOpt?.available;
  const goOnline = canOnline && returnMode === "online";
  const channelName = onlineOpt?.channel === "paymaya" ? "Maya" : onlineOpt?.channel === "gcash" ? "GCash" : "their e-wallet";

  const settle = () => run(async () => {
    const result = await onSettleDeposit({
      online: goOnline,
      method: refundDue && !goOnline ? refundMethod : undefined,
      referenceNumber: goOnline ? "" : refundRef.trim(),
    });
    const o = result?.online;
    if (o?.state === "failed") {
      setNotice({ type: "warn", text: `Deposit settled, but PayMongo refused the refund${o.error ? ` (${o.error})` : ""}. Retry it or hand it back in store from the Refunds page.` });
    } else if (o?.state === "processing") {
      setNotice({ type: "info", text: `Deposit settled. PayMongo is returning ${peso(result.net)} to the customer's ${channelName}. This can take up to 24 hours; track it on the Refunds page under Under Process.` });
    }
    await refresh();
  });

  // Portaled to <body> so no parent stacking context (animated wrappers, the
  // Leaflet map cards with z-[1000] overlays, etc.) can ever cover the modal.
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-arl-dark">{depositOnly ? "Return deposit" : "Drop-off & complete"}</h3>
            {title && <p className="text-xs text-gray-400 mt-0.5">{title}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        {loading && !data && <p className="text-sm text-gray-400">Checking…</p>}
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {notice && (
          <p className={`text-xs rounded-lg px-3 py-2 border ${notice.type === "warn" ? "text-amber-800 bg-amber-50 border-amber-200" : "text-blue-800 bg-blue-50 border-blue-200"}`}>{notice.text}</p>
        )}

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

            {/* An online deposit return that PayMongo hasn't finished (or refused): it is followed on the Refunds page. */}
            {onOpenRefunds && data.depositReturn?.via === "paymongo" && ["processing", "failed"].includes(data.depositReturn.state) && (
              <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs border ${data.depositReturn.state === "failed" ? "bg-red-50 border-red-200 text-red-800" : "bg-blue-50 border-blue-200 text-blue-800"}`}>
                <span>{data.depositReturn.state === "failed"
                  ? "PayMongo could not return this deposit. Retry it or record an in-store hand-back on the Refunds page."
                  : "The deposit is being returned through PayMongo. It can take up to 24 hours. Follow it on the Refunds page."}</span>
                <button type="button" onClick={onOpenRefunds} className="shrink-0 font-semibold underline">Open Refunds</button>
              </div>
            )}

            {compact && depositHeldNow && (
              <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                <span>Deposit still held ({data.depositHeld == null ? "—" : peso(data.depositHeld)}). Return it on Payments.</span>
                <button type="button" onClick={onOpenPayments} className="shrink-0 font-semibold underline hover:text-amber-900">Open Payments</button>
              </div>
            )}

            {!compact && (<div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Deposit &amp; penalties</p>
              <div className="flex justify-between"><span className="text-gray-500">Driver</span><span className="font-medium text-arl-dark">{driverName || "No driver"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Security deposit <span className="text-[11px] text-gray-400">({data.depositStatus})</span></span><span className="font-medium">{data.depositHeld == null ? "—" : peso(data.depositHeld)}</span></div>
              <div className="flex justify-between items-center">
                <button type="button" onClick={() => setShowPenalties((v) => !v)} disabled={!data.penalties?.length}
                  aria-expanded={showPenalties}
                  className="flex items-center gap-1 text-gray-500 hover:text-arl-dark disabled:hover:text-gray-500 disabled:cursor-default">
                  <span>Penalties given ({data.penalties?.filter((p) => p.status === "Confirmed").length || 0})</span>
                  {!!data.penalties?.length && (
                    <svg className={`w-3.5 h-3.5 transition-transform ${showPenalties ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                  )}
                </button>
                <span className="font-medium text-red-600">− {peso(data.penaltyTotal)}</span>
              </div>
              {showPenalties && !!data.penalties?.length && (
                <ul className="bg-white border border-gray-100 rounded-lg divide-y divide-gray-100 text-xs">
                  {data.penalties.map((pen, idx) => {
                    const items = Array.isArray(pen.lineItems) ? pen.lineItems : [];
                    const inactive = pen.status && pen.status !== "Confirmed";
                    const unpaid = Math.max(0, (pen.amount || 0) - (pen.paidAmount || 0));
                    return (
                      <li key={pen.penaltyID || pen.id || idx} className={`px-3 py-2 ${inactive ? "opacity-60" : ""}`}>
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-arl-dark">
                            {items.length ? items.map((li) => li.description).filter(Boolean).join(", ") : (pen.description || pen.type || "Penalty")}
                          </span>
                          <span className={`font-semibold ${inactive ? "line-through text-gray-400" : "text-red-600"}`}>{peso(pen.amount)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-gray-400 mt-0.5">
                          <span>{pen.status === "UnderReview" ? "Under review — not counted yet" : inactive ? pen.status : unpaid > 0 ? "Unpaid" : "Paid"}</span>
                          {!inactive && unpaid > 0 && (pen.paidAmount || 0) > 0 && <span>{peso(unpaid)} left</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex justify-between"><span className="text-gray-500">Deducted from deposit <span className="text-[11px] text-gray-400">(deposit settled)</span></span><span className="font-medium text-red-600">− {peso(data.depositDeducted || 0)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                <span className="font-semibold text-arl-dark">
                  {data.depositSettled ? (owes ? "Settled — customer owed" : "Settled — deposit returned") : (owes ? "Customer will owe" : "Deposit to return")}
                </span>
                <span className={`font-bold ${owes ? "text-red-600" : "text-green-700"}`}>{peso(Math.abs(data.amountToReturn))}</span>
              </div>
              {owes && <p className="text-[11px] text-gray-400">The deposit is used up first; the rest is collected with Mark Paid on the Penalties page (or the customer pays online).</p>}
              {data.depositSettled && data.stillOwed > 0 && (
                <p className="text-[11px] text-red-600">{peso(data.stillOwed)} in penalties is still unpaid (Penalties page → Mark Paid). This doesn&apos;t block completing the booking.</p>
              )}
            </div>)}

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

            {!compact && (depositOnly ? (data.depositStatus === "Held" && !data.depositSettled) : data.canSettle) && (
              <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-sm font-semibold text-arl-dark">Settle security deposit</p>
                {data.underReviewCount > 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {data.underReviewCount} penalt{data.underReviewCount === 1 ? "y is" : "ies are"} still waiting for a supervisor's review. Confirm or discard
                    {data.underReviewCount === 1 ? " it" : " them"} on the Penalties page first — until then they aren't counted and the deposit can't be settled.
                  </p>
                )}
                <p className="text-[11px] text-gray-500">
                  {refundDue ? `${goOnline ? "Refund" : "Hand"} ${peso(data.amountToReturn)} ${goOnline ? "to the customer online" : "back to the customer"}, after deducting penalties.`
                    : owes ? `Penalties use the whole deposit; ${peso(Math.abs(data.amountToReturn))} is still owed.`
                    : "Penalties use the whole deposit — nothing to hand back."}
                </p>
                {canOnline && (
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to return the deposit">
                    {[{ k: "store", t: "Hand back in store" }, { k: "online", t: `Refund online (${channelName})` }].map((o) => (
                      <button key={o.k} type="button" role="radio" aria-checked={returnMode === o.k} onClick={() => setReturnMode(o.k)}
                        className={`px-2 py-2 rounded-lg border text-xs font-semibold ${returnMode === o.k ? "border-teal-600 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        {o.t}
                      </button>
                    ))}
                  </div>
                )}
                {refundDue && !canOnline && onlineOpt?.reason && (
                  <p className="text-[11px] text-gray-400">Online refund isn't available: {onlineOpt.reason}</p>
                )}
                {goOnline && (
                  <p className="text-[11px] text-gray-500">
                    PayMongo sends it back to the customer's {channelName}, taken from your PayMongo payout balance. It can take up to 24 hours and will show on the Refunds page until it is confirmed.
                  </p>
                )}
                {refundDue && !goOnline && (
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
                  onClick={settle}
                  className="w-full py-2 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40">
                  {busy ? "…" : goOnline ? `Refund ${peso(data.amountToReturn)} online` : refundDue ? "Confirm deposit returned" : "Confirm settlement"}
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">Close</button>
              {!depositOnly && <button disabled={!data.canReturn || busy}
                onClick={() => run(async () => { await onConfirmReturn(); onClose(); })}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? "…" : data.canReturn ? "Confirm Complete" : "Not ready yet"}
              </button>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}