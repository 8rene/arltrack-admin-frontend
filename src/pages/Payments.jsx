import { useEffect, useState, useCallback } from "react";
import { useCurrency } from "../context/CurrencyContext";

/* ── helpers ── */
function peso(n, fmtFn) {
  if (n == null || n === "") return "—";
  if (fmtFn) return fmtFn(n);
  return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

/* ── badge maps ── */
const statusColor = {
  Pending:   "bg-yellow-100 text-yellow-700",
  Approved:  "bg-green-100 text-green-700",
  Rejected:  "bg-red-100 text-red-600",
  Cancelled: "bg-gray-100 text-gray-500",
  Paid:      "bg-green-100 text-green-700",
};

const PAGE_SIZE = 15;
const STATUSES  = ["All", "Pending", "Approved", "Rejected", "Cancelled"];

export default function Payments() {
  const [payments, setPayments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [statusF, setStatusF]     = useState("All");
  const [methodF, setMethodF]     = useState("All");
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState(null);   // detail drawer
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast]         = useState(null);
  const [updating, setUpdating]   = useState(false);

  const token = localStorage.getItem("token");
  const { fmt: fmtCurrency } = useCurrency();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPayments = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/payments`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load payments.");
      setPayments(data.data || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const openDetail = async (id) => {
    setDetailLoading(true); setSelected(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSelected(data.data);
    } catch (e) { showToast(e.message, "error"); }
    finally { setDetailLoading(false); }
  };

  const updateStatus = async (id, status) => {
    setUpdating(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payments/${id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast(`Status updated to ${status}.`);
      setPayments((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
      setSelected((prev) => prev ? { ...prev, status } : prev);
    } catch (e) { showToast(e.message, "error"); }
    finally { setUpdating(false); }
  };

  /* ── filter ── */
  const methods = ["All", ...new Set(payments.map((p) => p.paymentMethod).filter((m) => m && m !== "—"))];

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase();
    const matchQ = !q || (p.paymentID || "").toLowerCase().includes(q)
      || (p.customerName || "").toLowerCase().includes(q)
      || (p.bookingID || "").toLowerCase().includes(q)
      || (p.vehicleName || "").toLowerCase().includes(q);
    const matchS = statusF === "All" || p.status === statusF;
    const matchM = methodF === "All" || p.paymentMethod === methodF;
    return matchQ && matchS && matchM;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [search, statusF, methodF]);

  /* ── stat cards ── */
  const totalCollected = payments.filter(p => ["Approved","Paid"].includes(p.status)).reduce((s,p) => s + p.amountPaid, 0);
  const approved  = payments.filter(p => ["Approved","Paid"].includes(p.status)).length;
  const pending   = payments.filter(p => p.status === "Pending").length;
  const totalBal  = payments.filter(p => !["Cancelled","Rejected"].includes(p.status)).reduce((s,p) => s + p.balance, 0);

  return (
    <div className="w-full px-4 space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      {/* Detail Drawer */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="w-full max-w-xl bg-white shadow-2xl overflow-y-auto flex flex-col">
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
            ) : selected && (
              <>
                {/* Drawer Header */}
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Payment Detail</p>
                    <p className="font-bold text-arl-dark text-sm">{selected.paymentID}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                </div>

                <div className="p-6 space-y-5">
                  {/* Status + Actions */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor[selected.status] || "bg-gray-100 text-gray-500"}`}>
                      {selected.status}
                    </span>
                    {!["Cancelled","Approved"].includes(selected.status) && (
                      <>
                        <button disabled={updating} onClick={() => updateStatus(selected.id, "Approved")}
                          className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
                          Approve
                        </button>
                        <button disabled={updating} onClick={() => updateStatus(selected.id, "Rejected")}
                          className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                          Reject
                        </button>
                      </>
                    )}
                  </div>

                  {/* Customer */}
                  <Section title="Customer">
                    <Row label="Name" value={selected.customerName} />
                    <Row label="Booking ID" value={selected.bookingID} mono />
                    <Row label="Vehicle" value={selected.vehicleName} />
                  </Section>

                  {/* Payment Info */}
                  <Section title="Payment Info">
                    <Row label="Payment ID" value={selected.paymentID} mono />
                    <Row label="Reference #" value={selected.referenceNumber} />
                    <Row label="Payment Type" value={selected.methodOfPayment} />
                    <Row label="Gateway" value={selected.paymentMethod} />
                    <Row label="Submitted" value={fmtDate(selected.createdAt)} />
                  </Section>

                  {/* Fees */}
                  <Section title="Fee Breakdown">
                    <Row label="Rental Fee" value={peso(selected.rentalFee, fmtCurrency)} />
                    <Row label="Deposit Fee" value={peso(selected.depositFee, fmtCurrency)} />
                    <Row label="Extra Fee" value={peso(selected.extraFee, fmtCurrency)} />
                    <Row label="Service Fee" value={peso(selected.serviceFee, fmtCurrency)} />
                    <div className="border-t pt-2 mt-1">
                      <Row label="Total Fee" value={peso(selected.totalFee, fmtCurrency)} bold />
                      <Row label="Amount Paid" value={peso(selected.amountPaid, fmtCurrency)} bold />
                      <Row label="Balance" value={peso(selected.balance, fmtCurrency)} bold color={selected.balance > 0 ? "text-red-500" : "text-green-600"} />
                    </div>
                  </Section>

                  {/* Proof of Payment */}
                  <Section title="Proof of Payment">
                    {selected.proofUrl ? (
                      <a href={selected.proofUrl} target="_blank" rel="noreferrer"
                        className="block mt-2 rounded-xl overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity">
                        <img src={selected.proofUrl} alt="Proof" className="w-full object-cover max-h-72" />
                      </a>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No proof image uploaded.</p>
                    )}
                  </Section>

                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon="💰" value={peso(totalCollected)} label="Total Collected" />
        <StatCard icon="✅" value={approved} label="Approved Payments" />
        <StatCard icon="⏳" value={pending} label="Awaiting Review" />
        <StatCard icon="💳" value={peso(totalBal)} label="Total Balance Due" />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-soft flex flex-wrap gap-3 items-center">
        <input type="text" placeholder="Search by customer, ref, booking…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-arl-light" />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm">
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={methodF} onChange={(e) => setMethodF(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm">
          {methods.map((m) => <option key={m}>{m}</option>)}
        </select>
        <button onClick={fetchPayments} disabled={loading}
          className="px-4 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 disabled:opacity-50">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {/* Error */}
      {error && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-x-auto">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-arl-dark">
            All Payment Records{" "}
            <span className="text-gray-400 text-sm font-normal">({filtered.length} results)</span>
          </h2>
        </div>
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {["Ref #", "Customer", "Car", "Total Fee", "Amount Paid", "Balance", "Method", "Payment Ref", "Status", "Submitted", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-16 text-gray-400 text-sm">
                {search || statusF !== "All" || methodF !== "All" ? "No payments match your filters." : "No payments found."}
              </td></tr>
            ) : paginated.map((p, i) => (
              <tr key={p.id} className={`border-b border-gray-50 last:border-0 hover:bg-arl-light/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                {/* Ref */}
                <td className="px-4 py-3 font-mono text-xs text-arl-dark font-semibold">{p.paymentID}</td>
                {/* Customer + BookingID */}
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-800 text-xs">{p.customerName}</div>
                  <div className="text-xs text-gray-400 font-mono">{p.bookingID}</div>
                </td>
                {/* Car */}
                <td className="px-4 py-3 text-xs text-gray-600">{p.vehicleName}</td>
                {/* Total Fee + methodOfPayment */}
                <td className="px-4 py-3">
                  <div className="text-xs font-semibold text-gray-800">{peso(p.totalFee, fmtCurrency)}</div>
                  {p.methodOfPayment && p.methodOfPayment !== "—" && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.methodOfPayment.toLowerCase().includes("full")
                        ? "bg-blue-100 text-blue-700"
                        : p.methodOfPayment.toLowerCase().includes("down")
                        ? "bg-purple-100 text-purple-700"
                        : "bg-orange-100 text-orange-700"
                    }`}>{p.methodOfPayment}</span>
                  )}
                </td>
                {/* Amount Paid */}
                <td className="px-4 py-3 text-xs font-semibold text-gray-800">{peso(p.amountPaid, fmtCurrency)}</td>
                {/* Balance */}
                <td className={`px-4 py-3 text-xs font-semibold ${p.balance > 0 ? "text-red-500" : "text-green-600"}`}>
                  {peso(p.balance, fmtCurrency)}
                </td>
                {/* Method */}
                <td className="px-4 py-3 text-xs text-gray-600">{p.paymentMethod}</td>
                {/* Payment Ref */}
                <td className="px-4 py-3 text-xs font-mono text-gray-600">{p.referenceNumber || "—"}</td>
                {/* Status */}
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor[p.status] || "bg-gray-100 text-gray-500"}`}>
                    {p.status}
                  </span>
                </td>
                {/* Submitted */}
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                {/* View */}
                <td className="px-4 py-3">
                  <button onClick={() => openDetail(p.id)}
                    className="px-3 py-1.5 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">← Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── sub-components ── */
function StatCard({ icon, value, label }) {
  return (
    <div className="bg-white rounded-2xl shadow-soft p-4 flex items-center gap-4">
      <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-100 text-xl">{icon}</div>
      <div>
        <div className="text-xl font-bold text-arl-dark">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, mono, bold, color }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-xs text-right break-all ${mono ? "font-mono" : ""} ${bold ? "font-semibold" : ""} ${color || "text-gray-800"}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}
