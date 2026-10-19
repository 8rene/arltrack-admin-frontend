import { useEffect, useState } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import ReceiptModal from "./ReceiptModal";
import StatementModal from "./StatementModal";

// "Where did the money go?" for ONE payment, penalty, refund request or booking.
// Reads GET /api/payment-entries and lists every movement (money in AND out), who handled it, and the totals.
// Works for live AND archived records (a deleted booking's rows live in paymentEntryArchives and are read from there).
//
//   <PaymentEntriesPanel query={{ paymentID }} />          a payment (deposit, balance, penalties paid on it, refunds)
//   <PaymentEntriesPanel query={{ penaltyID }} />          one penalty's instalments
//   <PaymentEntriesPanel query={{ refundRequestID }} />    one refund's online / in-person / unrefundable rows
//   <PaymentEntriesPanel query={{ bookingID }} />          everything for a booking
//
// Whenever the rows belong to a booking, a "Booking statement" button opens ONE overall printable document for that
// booking (all payments, all penalties, totals). The booking comes from the query, or from the first row.
//
// LOOK: a plain list, not a stack of cards. One line per movement, separated by a hairline, newest on top:
//
//   4   Refund of deposit (online)   ● Done                      −₱500.00
//       Print slip   See more ▾
//   3   Balance paid                 ● Done                       ₱2,000.00
//       Print receipt   See less ▴
//       Payment ref / Method / Source / PayMongo fee / Handled by / Settled   (labelled lines, only after "See more")
//   ...
//
// The number on the left is the movement's place in time (1 = the first one that happened), so the newest carries
// the highest number. Pass newestFirst={false} for oldest-first.

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

const METHOD = { gcash: "GCash", maya: "Maya", qrph: "QR Ph", cash: "Cash", bank_transfer: "Bank transfer" };
const PHASE_IN = { deposit: "Deposit paid", balance: "Balance paid", penalty: "Penalty payment" };
const PHASE_OUT = { deposit: "Refund of deposit", balance: "Refund of balance", penalty: "Refund of penalty", discount: "Discount refund", deposit_return: "Security deposit returned" };

// A small dot + plain text (same dot colours as the status badges on the Payments page), not a coloured pill.
const STATUS_DOT = {
  success:      "bg-green-500",
  pending:      "bg-yellow-400",
  failed:       "bg-red-500",
  cancelled:    "bg-gray-400",
  unrefundable: "bg-red-500",
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

// A "no cash moved" line (a discount, or a penalty covered by the held deposit). Shown in the same list for the full
// story of the booking, but it is plain text: no sign, no colour, no number, and it is never part of the totals above.
const ADJ_NOTE = {
  discount: "No money moved. The amount owed was reduced.",
  deposit_offset: "No money moved. Taken from the held security deposit.",
  discount_applied_balance: "No money moved. The amount owed was reduced.",
  discount_credit: "No money moved. The customer had already paid this, so it is held and goes back with the security deposit.",
  discount_applied_penalty: "No money moved. The deposit didn't cover the penalty, so the discount credit held for the customer paid it.",
  discount_return: "No money moved here. It went back to the customer in the same payout as the security deposit.",
};
// "internal" entries (direction "internal") are a discount moving between its parts. No cash, so they are listed like the
// other no-cash lines: no number, no receipt, no colour, and never in the totals.
const INTERNAL_LABEL = {
  discount_applied_balance: "Discount taken off the balance",
  discount_credit: "Discount held for the customer",
  discount_applied_penalty: "Discount credit used for a penalty",
  discount_return: "Discount returned with the deposit",
};

const TONE = { green: "text-green-700", purple: "text-purple-700", amber: "text-amber-700", red: "text-red-600", gray: "text-gray-800" };

// One total in the optional summary line: small label, bold value, no box.
function Stat({ label, value, tone = "gray" }) {
  return (
    <span className="text-xs text-gray-500">
      {label} <span className={`font-semibold ${TONE[tone]}`}>{value}</span>
    </span>
  );
}

// One labelled line inside "See more": label on the left, value on the right.
function Detail({ label, value, mono = false }) {
  return (
    <div className="flex justify-between items-start gap-6 py-1.5">
      <dt className="text-sm text-gray-500 shrink-0">{label}</dt>
      <dd className={`text-sm text-gray-800 text-right break-all ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

// headerSlot: optional node rendered right under the title (e.g. a Total / Paid / Balance summary).
// hideSummary: hide the Paid in / Refunded / Held totals (when the caller already shows those numbers).
// onLoaded(summary): called with the totals once the entries load (lets the caller show e.g. the refunded amount).
// newestFirst: newest movement on top (default). false = oldest first.
export default function PaymentEntriesPanel({ query, title = "Money movements", reloadKey = 0, headerSlot = null, hideSummary = false, onLoaded = null, newestFirst = true }) {
  const { fmt } = useCurrency();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [qKey, qVal] = Object.entries(query || {}).find(([, v]) => v) || [];
  const [receiptFor, setReceiptFor] = useState(null);   // entry id whose receipt is open
  const [statementOpen, setStatementOpen] = useState(false);   // the booking statement is open
  const [openRows, setOpenRows] = useState({});                  // entry id -> its details are shown ("See more")
  const toggleRow = (id) => setOpenRows((o) => ({ ...o, [id]: !o[id] }));

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
  const allEntries = data?.entries || [];   // the server sends them oldest first
  const entries = allEntries.filter((e) => e.direction !== "internal");   // real money movements only
  const internalEntries = allEntries.filter((e) => e.direction === "internal");
  const adjustments = [
    ...(data?.adjustments || []),   // legacy discounts / deposit offsets: no cash moved
    ...internalEntries.map((e) => ({
      id: e.id, kind: e.phase, label: INTERNAL_LABEL[e.phase] || "Discount", amount: e.amount,
      date: e.settledAt || e.processedAt || e.createdAt || "", byName: e.processedByName || null, reason: null,
    })),
  ];
  const s = data?.summary;
  useEffect(() => { if (onLoaded && data) onLoaded(data.summary || null); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const groupSize = (g) => entries.filter((x) => x.groupID === g).length;
  const statementBookingID = (qKey === "bookingID" ? qVal : null) || entries.find((x) => x.bookingID)?.bookingID || null;

  // Number each movement by when it happened (1 = first), then flip for newest-first.
  const numbered = entries.map((e, i) => ({ e, n: i + 1 }));
  // The no-cash lines sit in the same list, in date order. Only real movements get a number.
  const stamp = (e) => e.settledAt || e.processedAt || e.createdAt || "";
  const items = [
    ...numbered.map(({ e, n }, i) => ({ type: "entry", e, n, t: stamp(e), i })),
    ...adjustments.map((a, i) => ({ type: "adj", a, t: a.date || "", i: entries.length + i })),
  ].sort((x, y) => x.t.localeCompare(y.t) || x.i - y.i);
  const rows = newestFirst ? [...items].reverse() : items;

  return (
    <div className="space-y-3" data-testid="payment-entries-panel">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {!loading && !error && statementBookingID && entries.length > 0 && (
          <button type="button" onClick={() => setStatementOpen(true)} className="text-xs font-semibold text-teal-700 hover:underline whitespace-nowrap">
            Booking statement
          </button>
        )}
      </div>

      {headerSlot}

      {loading && <p className="text-sm text-gray-400 py-3">Loading money movements…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && entries.length === 0 && adjustments.length === 0 && (
        <p className="text-sm text-gray-400 py-3">No money movements are recorded for this yet.</p>
      )}

      {!hideSummary && !loading && !error && s && entries.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {s.paidIn > 0 && <Stat label="Paid in" value={fmt(s.paidIn)} tone="green" />}
          {s.penaltyPaid > 0 && <Stat label="Penalties paid" value={fmt(s.penaltyPaid)} tone="green" />}
          {s.refundedOut > 0 && <Stat label="Refunded" value={fmt(s.refundedOut)} tone="purple" />}
          {s.depositReturned > 0 && <Stat label="Deposit returned" value={fmt(s.depositReturned)} tone="purple" />}
          {s.refundPending > 0 && <Stat label="Refund pending" value={fmt(s.refundPending)} tone="amber" />}
          {s.unrefundable > 0 && <Stat label="Could not refund" value={fmt(s.unrefundable)} tone="red" />}
          {s.failed > 0 && <Stat label="Failed attempts" value={fmt(s.failed)} tone="red" />}
          {s.paidIn > 0 && <Stat label="Held after refunds" value={fmt(s.netHeld)} />}
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <ol className="border-t border-gray-100 divide-y divide-gray-100">
          {rows.map((item) => {
            if (item.type === "adj") {
              const a = item.a;
              const adjDate = fmtDate(a.date);
              return (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <span className="w-5 shrink-0 pt-0.5 text-xs text-gray-300 text-right" title="No money moved">•</span>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-gray-600">{a.label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{ADJ_NOTE[a.kind] || "No money moved."}</p>
                    {(a.reason || a.byName || adjDate) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {[a.reason && `Reason: ${a.reason}`, a.byName && `By ${a.byName}`, adjDate].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-semibold whitespace-nowrap text-right text-gray-500" title="No money moved">{fmt(a.amount)}</p>
                </li>
              );
            }
            const { e, n } = item;
            const out = e.direction === "out";
            const when = fmtDate(e.settledAt || e.processedAt || e.createdAt);
            const open = !!openRows[e.id];
            return (
              <li key={e.id} className="flex items-start gap-3 py-3">
                <span className="w-5 shrink-0 pt-0.5 text-xs text-gray-400 tabular-nums text-right" title={`Movement ${n}`}>{n}</span>

                <div className="min-w-0 flex-1">
                  {/* Title + status */}
                  <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{titleOf(e)}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[e.status] || STATUS_DOT.cancelled}`} />
                      {STATUS_LABEL[e.status] || e.status}
                    </span>
                    {e.archived && <span className="text-xs text-gray-400">Archived</span>}
                  </div>

                  {/* Under the title, left side: print + see more */}
                  <div className="flex items-center gap-4 mt-0.5">
                    {e.status === "success" && (
                      <button type="button" onClick={() => setReceiptFor(e.id)} className="text-xs font-semibold text-teal-700 hover:underline">
                        {out ? "Print slip" : "Print receipt"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleRow(e.id)}
                      aria-expanded={open}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      {open ? "See less" : "See more"}
                      <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  {/* Details: hidden until "See more", one labelled line per field */}
                  {open && (
                    <dl className="mt-2 w-full divide-y divide-gray-100">
                      <Detail label="Payment ref" value={e.referenceNumber || (e.source === "in_person" ? "Handled in person" : "No reference yet")} mono={!!e.referenceNumber} />
                      {e.method && <Detail label="Method" value={METHOD[e.method] || e.method} />}
                      {e.source && <Detail label="Source" value={e.source === "in_person" ? "In person" : "Online (PayMongo)"} />}
                      {e.transactionFee != null && <Detail label="PayMongo fee" value={fmt(e.transactionFee)} />}
                      {e.processedByName && <Detail label="Handled by" value={e.processedByName} />}
                      {when && <Detail label={e.status === "success" ? "Settled" : "Date"} value={when} />}
                      {e.groupID && groupSize(e.groupID) > 1 && (
                        <Detail label="Covers" value={`${groupSize(e.groupID)} penalties (one payment, one line each)`} />
                      )}
                    </dl>
                  )}
                  {/* A problem is always shown, not tucked away */}
                  {e.errorNote && <p className="text-xs text-red-600 mt-1">{e.errorNote}</p>}
                </div>

                <p className={`shrink-0 text-sm font-bold whitespace-nowrap text-right ${out ? "text-purple-700" : "text-gray-800"}`} title={out ? "Money out" : "Money in"}>
                  {out ? "−" : ""}{fmt(e.amount)}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {receiptFor && <ReceiptModal entryID={receiptFor} onClose={() => setReceiptFor(null)} />}
      {statementOpen && statementBookingID && <StatementModal bookingID={statementBookingID} onClose={() => setStatementOpen(false)} />}
    </div>
  );
}