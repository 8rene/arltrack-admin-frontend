import { useEffect, useState } from "react";
import { useCurrency } from "../../context/CurrencyContext";

// "Where did the money go?" for ONE payment, penalty, refund request or booking.
// Reads GET /api/payment-entries and lists every movement (money in AND out), who handled it, and the totals.
// Works for live AND archived records (a deleted booking's rows live in paymentEntryArchives and are read from there).
//
//   <PaymentEntriesPanel query={{ paymentID }} />          a payment (deposit, balance, penalties paid on it, refunds)
//   <PaymentEntriesPanel query={{ penaltyID }} />          one penalty's instalments
//   <PaymentEntriesPanel query={{ refundRequestID }} />    one refund's online / in-person / unrefundable rows
//   <PaymentEntriesPanel query={{ bookingID }} />          everything for a booking

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

const METHOD = { gcash: "GCash", maya: "Maya", qrph: "QR Ph", cash: "Cash", bank_transfer: "Bank transfer" };
const PHASE_IN = { deposit: "Deposit paid", balance: "Balance paid", penalty: "Penalty payment" };
const PHASE_OUT = { deposit: "Refund of deposit", balance: "Refund of balance", penalty: "Refund of penalty", deposit_return: "Security deposit returned" };

const STATUS_STYLE = {
  success:      "bg-green-50 text-green-700 border-green-200",
  pending:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  failed:       "bg-red-50 text-red-700 border-red-200",
  cancelled:    "bg-gray-100 text-gray-600 border-gray-200",
  unrefundable: "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL = { success: "Done", pending: "Pending", failed: "Failed", cancelled: "Cancelled", unrefundable: "Can't be refunded" };

const titleOf = (e) => {
  if (e.status === "unrefundable") return "Could not be refunded online";
  if (e.direction === "out") {
    const base = PHASE_OUT[e.phase] || "Refund";
    return e.phase === "deposit_return" ? base : `${base} (${e.source === "in_person" ? "handed back in person" : "online"})`;
  }
  return PHASE_IN[e.phase] || "Payment";
};

function Chip({ label, value, tone = "gray" }) {
  const tones = { gray: "bg-gray-50 text-gray-700 border-gray-200", green: "bg-green-50 text-green-700 border-green-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200", amber: "bg-amber-50 text-amber-800 border-amber-200", red: "bg-red-50 text-red-700 border-red-200" };
  return (
    <div className={`rounded-lg border px-3 py-1.5 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

export default function PaymentEntriesPanel({ query, title = "Money movements", reloadKey = 0 }) {
  const { fmt } = useCurrency();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [qKey, qVal] = Object.entries(query || {}).find(([, v]) => v) || [];

  useEffect(() => {
    if (!qKey) { setState({ loading: false, error: null, data: { entries: [], summary: null } }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`${process.env.REACT_APP_API_URL}/api/payment-entries?${qKey}=${encodeURIComponent(qVal)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then(async (res) => { const json = await res.json(); if (!res.ok) throw new Error(json.message || "Failed to load money movements."); return json.data; })
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((e) => alive && setState({ loading: false, error: e.message, data: null }));
    return () => { alive = false; };
  }, [qKey, qVal, reloadKey]);

  const { loading, error, data } = state;
  const entries = data?.entries || [];
  const s = data?.summary;
  const groupSize = (g) => entries.filter((x) => x.groupID === g).length;

  return (
    <div className="space-y-3" data-testid="payment-entries-panel">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>

      {loading && <p className="text-sm text-gray-400 py-3">Loading money movements…</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-gray-400 italic border border-dashed border-gray-200 rounded-lg p-3">No money movements are recorded for this yet.</p>
      )}

      {!loading && !error && s && entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {s.paidIn > 0 && <Chip label="Paid in" value={fmt(s.paidIn)} tone="green" />}
          {s.penaltyPaid > 0 && <Chip label="Penalties paid" value={fmt(s.penaltyPaid)} tone="green" />}
          {s.refundedOut > 0 && <Chip label="Refunded" value={fmt(s.refundedOut)} tone="purple" />}
          {s.depositReturned > 0 && <Chip label="Deposit returned" value={fmt(s.depositReturned)} tone="purple" />}
          {s.refundPending > 0 && <Chip label="Refund pending" value={fmt(s.refundPending)} tone="amber" />}
          {s.unrefundable > 0 && <Chip label="Could not refund" value={fmt(s.unrefundable)} tone="red" />}
          {s.failed > 0 && <Chip label="Failed attempts" value={fmt(s.failed)} tone="red" />}
          {s.paidIn > 0 && <Chip label="Held after refunds" value={fmt(s.netHeld)} />}
        </div>
      )}

      {!loading && !error && entries.map((e) => {
        const out = e.direction === "out";
        const when = fmtDate(e.settledAt || e.processedAt || e.createdAt);
        return (
          <div key={e.id} className="rounded-xl border border-gray-200 bg-white p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${out ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`} aria-label={out ? "money out" : "money in"}>{out ? "↑" : "↓"}</span>
                <span className="text-sm font-semibold text-gray-800">{titleOf(e)}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLE[e.status] || STATUS_STYLE.cancelled}`}>{STATUS_LABEL[e.status] || e.status}</span>
                {e.archived && <span className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">Archived</span>}
              </div>
              <span className={`text-sm font-bold whitespace-nowrap ${out ? "text-purple-700" : "text-gray-800"}`}>{out ? "−" : ""}{fmt(e.amount)}</span>
            </div>

            <p className={`text-xs break-all ${e.referenceNumber ? "font-mono text-gray-700" : "text-gray-400 italic"}`}>
              {e.referenceNumber || (e.source === "in_person" ? "No reference — handled in person" : "No reference yet")}
            </p>

            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
              {e.method && <span>{METHOD[e.method] || e.method}</span>}
              {e.source && <span>{e.source === "in_person" ? "In person" : "Online (PayMongo)"}</span>}
              {e.transactionFee != null && <span>PayMongo fee {fmt(e.transactionFee)}</span>}
              {e.processedByName && <span>by {e.processedByName}</span>}
              {when && <span>{when}</span>}
            </div>

            {e.groupID && groupSize(e.groupID) > 1 && (
              <p className="text-xs text-teal-700">One payment covered {groupSize(e.groupID)} penalties — each gets its own line here.</p>
            )}
            {e.errorNote && <p className="text-xs text-red-600">{e.errorNote}</p>}
          </div>
        );
      })}
    </div>
  );
}