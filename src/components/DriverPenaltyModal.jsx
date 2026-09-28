import { useEffect, useState } from "react";

const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;

const fmtWhen = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

/**
 * Read-only "when was it due vs. when did it come back" panel shown above the
 * penalty fields (admin Penalties form and the driver's "Note a penalty"
 * form). `info` is the payload from GET /api/penalties/late-fee-preview/:id.
 *
 * It only SUGGESTS — nothing here fills in or adds a charge. Whoever is
 * noting the penalty types the amount themselves; this is just the system
 * remembering the end time and drop-off time so a late return isn't missed.
 */
function LateFeeSuggestion({ info, loading = false }) {
  if (!info) {
    return loading ? <p className="text-xs text-gray-400">Checking end time and drop-off…</p> : null;
  }

  const { scheduledEndAt, actualReturnAt, lateMinutes, billableHours, graceMinutes, ratePerHour, computedAmount } = info;

  let suggestion;
  let tone = "text-gray-600";
  if (!actualReturnAt) {
    suggestion = "Not dropped off yet — nothing to suggest.";
  } else if (billableHours > 0) {
    suggestion = `${billableHours} hour${billableHours === 1 ? "" : "s"} late: ${peso(computedAmount)}`;
    tone = "text-amber-700 font-semibold";
  } else if (lateMinutes > 0) {
    suggestion = `${lateMinutes} min past the end time, within the ${graceMinutes}-min grace — no late fee.`;
  } else {
    suggestion = "Returned on time — no late fee.";
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs space-y-1">
      <div className="flex justify-between gap-3">
        <span className="text-gray-400">Booking ends</span>
        <span className="text-gray-700">{fmtWhen(scheduledEndAt)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-gray-400">Dropped off</span>
        <span className="text-gray-700">{fmtWhen(actualReturnAt)}</span>
      </div>
      <div className="flex justify-between gap-3 pt-1 border-t border-gray-100">
        <span className="text-gray-400">Suggestion</span>
        <span className={`text-right ${tone}`}>{suggestion}</span>
      </div>
      {billableHours > 0 && (
        <p className="text-[11px] text-gray-400 text-right">
          {lateMinutes} min past the end time · {graceMinutes}-min grace · {peso(ratePerHour)}/hr
        </p>
      )}
    </div>
  );
}

/**
 * Driver's "Note a penalty" form. Every charge is typed as a line item. The
 * booking's end time, drop-off time and a suggestion ("3 hours late: ₱300")
 * are shown above the fields from the server's late-fee preview, for
 * reference only — nothing is auto-added. Submitting confirms the penalty
 * right away — the customer and staff are notified, and it counts against
 * the deposit (shown as "amount to return") from that moment.
 *
 *   loadLateFee()         -> late-fee preview (end/drop-off times + suggestion) or null
 *   onSubmit(body)        -> POSTs the penalty (throw on error)
 */
export default function DriverPenaltyModal({ open, onClose, title, loadLateFee, onSubmit }) {
  const [items, setItems] = useState([{ description: "", amount: "" }]);
  const [late, setLate] = useState(null);      // preview payload
  const [lateLoading, setLateLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setItems([{ description: "", amount: "" }]); setError(null); setLate(null);
    if (!loadLateFee) return undefined;
    let cancelled = false;
    setLateLoading(true);
    loadLateFee()
      .then((d) => { if (!cancelled) setLate(d || null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLateLoading(false); });
    return () => { cancelled = true; };
  }, [open, loadLateFee]);

  if (!open) return null;

  const typed = items.filter((i) => i.description.trim() || Number(i.amount) > 0);
  const lineItems = typed.map((i) => ({ description: i.description.trim(), amount: Number(i.amount) || 0 }));
  const total = lineItems.reduce((s, i) => s + i.amount, 0);
  const valid = lineItems.length > 0 && lineItems.every((i) => i.description && i.amount > 0);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await onSubmit({ lineItems, computedAmount: total, amount: total });
      onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const setItem = (idx, patch) => setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-arl-dark">Note a penalty</h3>
            {title && <p className="text-xs text-gray-400">{title}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <p className="text-[11px] text-gray-400">The customer is notified right away and this is deducted from their deposit.</p>

        <LateFeeSuggestion info={late} loading={lateLoading} />

        {items.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <input value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} placeholder="e.g. Cleaning, missing floor mat"
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
            <input type="number" value={it.amount} onChange={(e) => setItem(idx, { amount: e.target.value })} placeholder="₱"
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
          </div>
        ))}
        <button onClick={() => setItems((a) => [...a, { description: "", amount: "" }])} className="text-xs font-semibold text-teal-600">+ Add another item</button>

        <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
          <span className="font-semibold text-arl-dark">Total</span><span className="font-bold text-red-600">{peso(total)}</span>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={submit} disabled={!valid || busy} className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white disabled:opacity-40">
            {busy ? "Saving…" : "Charge penalty"}
          </button>
        </div>
      </div>
    </div>
  );
}