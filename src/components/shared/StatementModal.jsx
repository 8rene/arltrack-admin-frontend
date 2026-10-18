import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCurrency } from "../../context/CurrencyContext";

// Printable Booking Statement: ONE overall document for a whole booking.
//   <StatementModal bookingID="..." onClose={() => ...} />
// Reads GET /api/payment-entries/booking/:bookingID/statement -- every payment, every penalty, the totals, all as of
// the moment it is opened. Every open is written to the audit log by the server. "Print / Save as PDF" uses the
// browser's print dialog; "Email to customer" sends it to the address on the customer's account.

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};
const fmtDay = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
const METHOD = { gcash: "GCash", maya: "Maya", qrph: "QR Ph", cash: "Cash", bank_transfer: "Bank transfer" };
const PENDING_LABEL = { pending: "Pending", unrefundable: "Can't be refunded" };
const DEPOSIT_LABEL = { Held: "Still held", Settled: "Settled", Waived: "Waived", Forfeited: "Forfeited", Refunded: "Refunded" };

// Print only the statement: hide everything else on the page while the print dialog is open.
const PRINT_CSS = `
@media print {
  body > *:not(#statement-print-root) { display: none !important; }
  #statement-print-root { position: static !important; background: #fff !important; padding: 0 !important; overflow: visible !important; }
  #statement-print-root .no-print { display: none !important; }
  #statement-print-root .statement-sheet { box-shadow: none !important; border: none !important; max-width: none !important; margin: 0 !important; }
  #statement-print-root .keep-together { break-inside: avoid; }
  @page { margin: 14mm; }
}`;

function Row({ label, children, strong = false, tone }) {
  if (children == null || children === "") return null;
  return (
    <div className={`flex justify-between gap-4 text-sm py-0.5 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "text-gray-800" : "text-gray-500"}>{label}</span>
      <span className={`text-right break-all ${tone || "text-gray-900"}`}>{children}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-t border-dashed border-gray-300 pt-3 space-y-2 keep-together">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      {children}
    </div>
  );
}

// one money movement: label + amount, with a small grey line (date · method · reference) under it
function Move({ n, l, fmt, bold = true }) {
  const detail = [fmtDate(l.date), METHOD[l.method] || l.method, l.source === "in_person" ? "In person" : null, l.referenceNumber ? `Ref. ${l.referenceNumber}` : null]
    .filter((v) => v && v !== "—").join(" · ");
  return (
    <div className="flex justify-between gap-4 text-sm">
      <div className="min-w-0">
        <p className="text-gray-800">{n ? `${n}. ` : ""}{l.label}</p>
        {detail && <p className="text-xs text-gray-500 break-words">{detail}</p>}
      </div>
      <span className={`text-gray-900 whitespace-nowrap ${bold ? "font-medium" : ""}`}>{fmt(l.amount)}</span>
    </div>
  );
}

export default function StatementModal({ bookingID, onClose }) {
  const { fmt } = useCurrency();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  // email to the customer: idle -> confirm (shows where it will go) -> sending -> idle again with a result message
  const [mail, setMail] = useState({ stage: "idle", ok: null, msg: "" });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });
    fetch(`${process.env.REACT_APP_API_URL}/api/payment-entries/booking/${encodeURIComponent(bookingID)}/statement`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then(async (res) => { const json = await res.json(); if (!res.ok) throw new Error(json.message || "Could not load the statement."); return json.data; })
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((e) => alive && setState({ loading: false, error: e.message, data: null }));
    return () => { alive = false; };
  }, [bookingID]);

  // Escape closes ONLY the statement (capture phase + stopImmediatePropagation, same as the receipt modal), so a screen
  // underneath that also closes on Escape stays open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const sendEmail = async () => {
    setMail({ stage: "sending", ok: null, msg: "" });
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payment-entries/booking/${encodeURIComponent(bookingID)}/statement/email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const json = await res.json().catch(() => ({}));
      setMail({ stage: "idle", ok: res.ok, msg: json.message || (res.ok ? "Statement emailed." : "Couldn't send the email.") });
    } catch {
      setMail({ stage: "idle", ok: false, msg: "Couldn't reach the server. Please try again." });
    }
  };

  const { loading, error, data: s } = state;
  const o = s?.overall;

  // z-[2100]: above the Car Tracking payment popup and the map. The click handlers stop the event here because React
  // sends events from a portal up through the component that opened it, and the screens underneath close on a backdrop click.
  return createPortal(
    <div
      id="statement-print-root"
      className="fixed inset-0 z-[2100] bg-black/50 overflow-auto p-4"
      onClick={(e) => { e.stopPropagation(); onClose?.(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <style>{PRINT_CSS}</style>
      <div className="statement-sheet relative mx-auto max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 p-6" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        {loading && <p className="text-sm text-gray-400 py-10 text-center">Preparing statement…</p>}
        {error && (
          <div className="space-y-3">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
            <button onClick={onClose} className="no-print w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
          </div>
        )}

        {s && (
          <div className="space-y-4" data-testid="statement">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <img src={`${process.env.PUBLIC_URL || ""}/logo192.png`} alt="ARL Car Rental" className="h-14 w-14 shrink-0 object-contain" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-lg font-bold leading-tight text-gray-900">{s.business.name}</p>
                  {s.business.address && <p className="text-xs text-gray-500">{s.business.address}</p>}
                  {(s.business.phone || s.business.email) && <p className="text-xs text-gray-500">{[s.business.phone, s.business.email].filter(Boolean).join(" · ")}</p>}
                </div>
              </div>
              <div className="border-t border-gray-200 pt-2 text-center">
                <p className="text-sm font-semibold tracking-wide uppercase text-gray-700">{s.title}</p>
                <p className="text-xs text-gray-500">As of {fmtDate(s.asOf)}</p>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-300 pt-3">
              <Row label="Statement no.">{s.statementNo}</Row>
              <Row label="Customer">{s.customer.name}</Row>
              <Row label="Booking">{s.booking.bookingID}</Row>
              <Row label="Vehicle">{s.booking.vehicle}</Row>
              {s.booking.startDateTime && <Row label="Rental period">{fmtDay(s.booking.startDateTime)} – {fmtDay(s.booking.endDateTime)}</Row>}
              <Row label="Booking status"><span className="capitalize">{String(s.booking.status || "").replace(/_/g, " ")}</span></Row>
            </div>

            {/* 1. payments */}
            <Section title="Payments">
              {s.payments.length === 0
                ? <p className="text-sm text-gray-400 italic">No payments have been recorded yet.</p>
                : s.payments.map((l, i) => <Move key={l.id} n={i + 1} l={l} fmt={fmt} />)}
              {s.charges && (
                <div className="border-t border-gray-200 pt-1 mt-1">
                  <Row label="Booking total">{fmt(s.charges.total)}</Row>
                  {s.charges.discount > 0 && <Row label={`Discount applied${s.charges.discountReason ? ` (${s.charges.discountReason})` : ""}`}>−{fmt(s.charges.discount)}</Row>}
                  <Row label="Total paid">{fmt(s.paymentTotals.paid)}</Row>
                  <Row label="Balance remaining" strong>{fmt(s.paymentTotals.balanceRemaining)}</Row>
                </div>
              )}
            </Section>

            {/* money movements that are not done yet: listed, never counted */}
            {s.pending.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 keep-together">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Pending · not counted in any total</p>
                {s.pending.map((l) => (
                  <div key={l.id} className="flex justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <p className="text-gray-800">{l.label}{l.direction === "out" ? " (money back to customer)" : ""}</p>
                      <p className="text-xs text-amber-800">{[PENDING_LABEL[l.status] || l.status, METHOD[l.method] || l.method, fmtDate(l.date) !== "—" ? fmtDate(l.date) : null].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className="text-gray-900 whitespace-nowrap">{fmt(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 2. penalties */}
            <Section title="Penalties">
              {s.penalties.length === 0 && <p className="text-sm text-gray-400 italic">No penalties on this booking.</p>}
              {s.penalties.map((p, i) => (
                <div key={p.penaltyID || i} className={`rounded-lg border p-3 space-y-1 keep-together ${p.active ? "border-gray-200" : "border-gray-200 bg-gray-50"}`}>
                  <p className="text-xs font-semibold text-gray-600">
                    Penalty {i + 1}{!p.active && <span className="ml-1 font-medium text-gray-500">· {p.status} (not counted)</span>}
                  </p>
                  {p.items.map((it, j) => (
                    <div key={j} className="flex justify-between gap-4 text-sm">
                      <span className="text-gray-700">{it.description}</span>
                      <span className="text-gray-900 whitespace-nowrap">{fmt(it.amount)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 mt-1 pt-1">
                    <Row label="Penalty total">{fmt(p.amount)}</Row>
                    {p.active ? (
                      <>
                        {p.payments.map((l) => (
                          <React.Fragment key={l.id}>
                            <Move l={{ ...l, label: "Paid" }} fmt={fmt} bold={false} />
                            {Number(l.fee) > 0 && <Row label="Online payment fee">{fmt(l.fee)}</Row>}
                          </React.Fragment>
                        ))}
                        {p.coveredByDeposit > 0 && <Row label="Covered by security deposit">{fmt(p.coveredByDeposit)}</Row>}
                        <Row label="Still owed on this penalty" strong>{fmt(p.outstanding)}</Row>
                      </>
                    ) : (p.reason && <p className="text-xs text-gray-500 pt-0.5">{p.reason}</p>)}
                  </div>
                </div>
              ))}
              {s.penaltyTotals.count > 0 && (
                <div className="border-t border-gray-300 pt-1">
                  <Row label="Total penalties">{fmt(s.penaltyTotals.charged)}</Row>
                  <Row label="Paid (cash / online)">{fmt(s.penaltyTotals.paid)}</Row>
                  {s.penaltyTotals.coveredByDeposit > 0 && <Row label="Covered by security deposit">{fmt(s.penaltyTotals.coveredByDeposit)}</Row>}
                  <Row label="Still owed on penalties" strong>{fmt(s.penaltyTotals.outstanding)}</Row>
                </div>
              )}
            </Section>

            {/* 3. deposit + refunds, only when there is something to show */}
            {s.deposit && (
              <Section title="Security deposit">
                <div>
                  <Row label="Deposit held">{fmt(s.deposit.held)}</Row>
                  <Row label="Used for penalties">{fmt(s.deposit.usedForPenalties)}</Row>
                  <Row label="Returned to customer">{fmt(s.deposit.returned)}</Row>
                  {s.deposit.status && <Row label="Status" strong>{DEPOSIT_LABEL[s.deposit.status] || s.deposit.status}</Row>}
                </div>
              </Section>
            )}
            {s.refunds.length > 0 && (
              <Section title="Refunds">
                {s.refunds.map((l) => <Move key={l.id} l={l} fmt={fmt} />)}
              </Section>
            )}

            {/* 5. overall */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 keep-together">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 pb-1">Overall</p>
              <Row label="Total charges">{fmt(o.totalCharges)}</Row>
              <Row label="Total paid">{fmt(o.paidIn)}</Row>
              {o.coveredByDeposit > 0 && <Row label="Covered by security deposit">{fmt(o.coveredByDeposit)}</Row>}
              {o.refunded > 0 && <Row label="Refunded to customer">{fmt(o.refunded)}</Row>}
              {o.depositReturned > 0 && <Row label="Security deposit returned">{fmt(o.depositReturned)}</Row>}
              {o.onlineFees > 0 && <Row label="Online payment fees (not counted above)">{fmt(o.onlineFees)}</Row>}
              <div className="border-t border-blue-200 mt-1 pt-1">
                <Row label="Net received">{fmt(o.netReceived)}</Row>
                <div className="flex justify-between gap-4 pt-0.5">
                  <span className="text-sm font-bold text-blue-900">Amount still owed</span>
                  <span className="text-base font-bold text-blue-900">{fmt(o.stillOwed)}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 text-center border-t border-dashed border-gray-300 pt-3">
              Statement as of {fmtDate(s.asOf)}{s.printedBy ? `, printed by ${s.printedBy}` : ""}. It shows this booking at that moment; later payments or charges are not included. System-generated, not an official receipt.
            </p>

            <div className="no-print space-y-2 pt-1">
              {mail.msg && (
                <p className={`text-xs rounded-lg border p-2 ${mail.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-600 bg-red-50 border-red-200"}`}>{mail.msg}</p>
              )}

              {mail.stage === "idle" ? null : (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <p className="text-sm text-blue-900">Send this statement to <b>{s.customer.emailMasked}</b>?</p>
                  <div className="flex gap-2">
                    <button disabled={mail.stage === "sending"} onClick={() => setMail({ stage: "idle", ok: null, msg: "" })} className="flex-1 rounded-lg border border-gray-300 bg-white py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                    <button disabled={mail.stage === "sending"} onClick={sendEmail} className="flex-1 rounded-lg bg-blue-900 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{mail.stage === "sending" ? "Sending…" : "Send"}</button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
                <button
                  disabled={!s.customer.emailMasked || mail.stage !== "idle"}
                  title={s.customer.emailMasked ? `Email to ${s.customer.emailMasked}` : "This customer has no email on their account"}
                  onClick={() => setMail({ stage: "confirm", ok: null, msg: "" })}
                  className="flex-1 rounded-lg border border-blue-900 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >Email to customer</button>
                <button onClick={() => window.print()} className="flex-1 rounded-lg bg-blue-900 py-2 text-sm font-semibold text-white hover:bg-blue-800">Print / Save as PDF</button>
              </div>
              {!s.customer.emailMasked && <p className="text-[11px] text-gray-400">No email address on this customer's account.</p>}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}