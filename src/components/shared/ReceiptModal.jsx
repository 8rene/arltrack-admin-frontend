import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCurrency } from "../../context/CurrencyContext";

// Printable receipt / slip for ONE money movement (a paymentEntries row).
//   <ReceiptModal entryID="..." onClose={() => ...} />
// Reads GET /api/payment-entries/:entryID/receipt. Every open is written to the audit log by the server,
// so a second print shows as a COPY. "Print / Save as PDF" uses the browser's print dialog.

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

// Print only the receipt: hide everything else on the page while the print dialog is open.
const PRINT_CSS = `
@media print {
  body > *:not(#receipt-print-root) { display: none !important; }
  #receipt-print-root { position: static !important; background: #fff !important; padding: 0 !important; overflow: visible !important; }
  #receipt-print-root .no-print { display: none !important; }
  #receipt-print-root .receipt-sheet { box-shadow: none !important; border: none !important; max-width: none !important; margin: 0 !important; }
  @page { margin: 14mm; }
}`;

function Row({ label, children }) {
  if (children == null || children === "") return null;
  return (
    <div className="flex justify-between gap-4 text-sm py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 text-right break-all">{children}</span>
    </div>
  );
}

export default function ReceiptModal({ entryID, onClose }) {
  const { fmt } = useCurrency();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  // email to the customer: idle -> confirm (shows where it will go) -> sending -> idle again with a result message
  const [mail, setMail] = useState({ stage: "idle", ok: null, msg: "" });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });
    fetch(`${process.env.REACT_APP_API_URL}/api/payment-entries/${encodeURIComponent(entryID)}/receipt`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then(async (res) => { const json = await res.json(); if (!res.ok) throw new Error(json.message || "Could not load the receipt."); return json.data; })
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((e) => alive && setState({ loading: false, error: e.message, data: null }));
    return () => { alive = false; };
  }, [entryID]);

  // Escape closes ONLY the receipt. Some screens that embed the panel (the archive detail modal) also close
  // themselves on Escape; listening in the capture phase and stopping the event keeps them open underneath.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const sendEmail = async () => {
    setMail({ stage: "sending", ok: null, msg: "" });
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payment-entries/${encodeURIComponent(entryID)}/receipt/email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const json = await res.json().catch(() => ({}));
      setMail({ stage: "idle", ok: res.ok, msg: json.message || (res.ok ? "Receipt emailed." : "Couldn't send the email.") });
    } catch {
      setMail({ stage: "idle", ok: false, msg: "Couldn't reach the server. Please try again." });
    }
  };

  const { loading, error, data: r } = state;
  const out = r?.direction === "out";

  // z-[2100]: above the Car Tracking payment popup (z-[2000]) and the map, so the receipt is never hidden behind them.
  // The click handlers stop the event here: React sends events from a portal up through the component that opened
  // it, and the screens underneath (payment popup, archive modal) close themselves on a backdrop click.
  return createPortal(
    <div
      id="receipt-print-root"
      className="fixed inset-0 z-[2100] bg-black/50 overflow-auto p-4"
      onClick={(e) => { e.stopPropagation(); onClose?.(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <style>{PRINT_CSS}</style>
      <div className="receipt-sheet relative mx-auto max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-6" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        {loading && <p className="text-sm text-gray-400 py-10 text-center">Preparing receipt…</p>}
        {error && (
          <div className="space-y-3">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
            <button onClick={onClose} className="no-print w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
          </div>
        )}

        {r && (
          <div className="space-y-4" data-testid="receipt">
            {r.isCopy && (
              <p className="absolute top-4 right-4 rotate-6 border-2 border-gray-400 text-gray-400 text-xs font-bold tracking-widest px-2 py-0.5 rounded">COPY</p>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <img src={`${process.env.PUBLIC_URL || ""}/logo192.png`} alt="ARL Car Rental" className="h-14 w-14 shrink-0 object-contain" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-lg font-bold leading-tight text-gray-900">{r.business.name}</p>
                  {r.business.address && <p className="text-xs text-gray-500">{r.business.address}</p>}
                  {(r.business.phone || r.business.email) && <p className="text-xs text-gray-500">{[r.business.phone, r.business.email].filter(Boolean).join(" · ")}</p>}
                </div>
              </div>
              <p className="border-t border-gray-200 pt-2 text-center text-sm font-semibold tracking-wide uppercase text-gray-700">{r.title}</p>
            </div>

            <div className="border-t border-dashed border-gray-300 pt-3">
              <Row label="Receipt no.">{r.receiptNo}</Row>
              <Row label="Date">{fmtDate(r.date)}</Row>
              <Row label={out ? "Paid to" : "Received from"}>{r.customer.name}</Row>
              <Row label="Booking">{r.booking.bookingID}</Row>
              <Row label="Vehicle">{r.booking.vehicle}</Row>
              {r.booking.startDateTime && <Row label="Rental period">{fmtDay(r.booking.startDateTime)} – {fmtDay(r.booking.endDateTime)}</Row>}
            </div>

            <div className="border-t border-dashed border-gray-300 pt-3 space-y-1">
              {r.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-4 text-sm">
                  <span className="text-gray-800">{l.label}</span>
                  <span className="text-gray-900 font-medium whitespace-nowrap">{fmt(l.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-gray-300 mt-2 pt-2">
                <span className="text-sm font-bold text-gray-900">{out ? "Total returned" : "Total received"}</span>
                <span className="text-base font-bold text-gray-900">{fmt(r.total)}</span>
              </div>
            </div>

            {r.note && <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2">{r.note}</p>}

            {r.penalties?.length > 0 && (
              <div className="border-t border-dashed border-gray-300 pt-3 space-y-3">
                {r.penalties.map((p, i) => (
                  <div key={p.penaltyID || i} className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{r.penalties.length > 1 ? `Penalty ${i + 1}` : "Penalty charges"}</p>
                    {p.items.map((it, j) => (
                      <div key={j} className="flex justify-between gap-4 text-sm">
                        <span className="text-gray-700">{it.description}</span>
                        <span className="text-gray-900 whitespace-nowrap">{fmt(it.amount)}</span>
                      </div>
                    ))}
                    {p.total != null && (
                      <div className="border-t border-gray-200 mt-1 pt-1">
                        <Row label="Penalty total">{fmt(p.total)}</Row>
                        {p.paidBefore > 0 && <Row label="Paid before">{fmt(p.paidBefore)}</Row>}
                        {p.coveredByDeposit > 0 && <Row label="Covered by security deposit">{fmt(p.coveredByDeposit)}</Row>}
                        <Row label="This payment">{fmt(p.thisPayment)}</Row>
                        <div className="flex justify-between gap-4 text-sm py-0.5 font-semibold">
                          <span className="text-gray-800">Remaining</span>
                          <span className="text-gray-900">{fmt(p.remaining)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {r.depositSummary && (
              <div className="border-t border-dashed border-gray-300 pt-3">
                <Row label="Security deposit held">{fmt(r.depositSummary.held)}</Row>
                <Row label="Used for penalties">{fmt(r.depositSummary.usedForPenalties)}</Row>
                <Row label="Returned to customer">{fmt(r.depositSummary.returned)}</Row>
              </div>
            )}

            <div className="border-t border-dashed border-gray-300 pt-3">
              <Row label="Method">{METHOD[r.method] || r.method}</Row>
              <Row label="Channel">{r.source === "in_person" ? "In person" : "Online (PayMongo)"}</Row>
              <Row label="Reference no.">{r.referenceNumber}</Row>
              <Row label={out ? "Handed back by" : "Received by"}>{r.handledBy}</Row>
            </div>

            {r.summary && (
              <div className="border-t border-dashed border-gray-300 pt-3">
                <Row label="Booking total">{fmt(r.summary.bookingTotal)}</Row>
                <Row label="Paid to date">{fmt(r.summary.paidToDate)}</Row>
                <Row label="Balance remaining">{fmt(r.summary.balanceAfter)}</Row>
              </div>
            )}

            <p className="text-[11px] text-gray-400 text-center border-t border-dashed border-gray-300 pt-3">
              Printed {fmtDate(r.printedAt)}{r.printedBy ? ` by ${r.printedBy}` : ""}. System-generated acknowledgment of the transaction above.
            </p>

            <div className="no-print space-y-2 pt-1">
              {mail.msg && (
                <p className={`text-xs rounded-lg border p-2 ${mail.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-600 bg-red-50 border-red-200"}`}>{mail.msg}</p>
              )}

              {mail.stage === "idle" ? null : (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <p className="text-sm text-blue-900">Send this {out ? "slip" : "receipt"} to <b>{r.customer.emailMasked}</b>?</p>
                  <div className="flex gap-2">
                    <button disabled={mail.stage === "sending"} onClick={() => setMail({ stage: "idle", ok: null, msg: "" })} className="flex-1 rounded-lg border border-gray-300 bg-white py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                    <button disabled={mail.stage === "sending"} onClick={sendEmail} className="flex-1 rounded-lg bg-blue-900 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{mail.stage === "sending" ? "Sending…" : "Send"}</button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
                <button
                  disabled={!r.customer.emailMasked || mail.stage !== "idle"}
                  title={r.customer.emailMasked ? `Email to ${r.customer.emailMasked}` : "This customer has no email on their account"}
                  onClick={() => setMail({ stage: "confirm", ok: null, msg: "" })}
                  className="flex-1 rounded-lg border border-blue-900 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >Email to customer</button>
                <button onClick={() => window.print()} className="flex-1 rounded-lg bg-blue-900 py-2 text-sm font-semibold text-white hover:bg-blue-800">Print / Save as PDF</button>
              </div>
              {!r.customer.emailMasked && <p className="text-[11px] text-gray-400">No email address on this customer's account.</p>}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}