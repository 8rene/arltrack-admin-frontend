import { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { useCurrency } from "../context/CurrencyContext";
import { downloadReportPdf } from "../utils/reportPdf";

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconCalendarDay = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M8 13h.01M12 13h.01M8 17h.01M12 17h.01M16 13h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconCalendarWeek = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M7 14h10M7 18h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconCalendarMonth = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <rect x="7" y="13" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.25" />
    <rect x="13" y="13" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.25" />
  </svg>
);

const IconBarChart = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 20h18M7 20V10M12 20V4M17 20v-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconDownload = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconPrinter = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 9V2h12v7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="3" y="9" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M6 14h12M6 18h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconClipboard = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

const IconTrendUp = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 17l6-6 4 4 8-8M21 7h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconDoc = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    <path d="M14 2v5h5M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconChecklist = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.75" />
    <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconCar = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 13l1.5-5A2 2 0 016.4 6.5h11.2A2 2 0 0119.5 8l1.5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2.5" y="13" width="19" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="7" cy="19" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="17" cy="19" r="1.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const IconUsers = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.75" />
    <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M16 4.5a3.25 3.25 0 010 6.5M21.5 20c0-3-2.2-5.3-5-5.9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconMail = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3.5 6.5L12 13l8.5-6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconCreditCard = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
    <path d="M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconPackage = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconChevron = ({ className = "w-4 h-4", open }) => (
  <svg className={`${className} transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── DATA ────────────────────────────────────────────────────────────────────

const PERIODS = [
  { key: "daily",   label: "Daily",   Icon: IconCalendarDay,   desc: "Pick a day" },
  { key: "weekly",  label: "Weekly",  Icon: IconCalendarWeek,  desc: "Pick a week" },
  { key: "monthly", label: "Monthly", Icon: IconCalendarMonth, desc: "Pick a month" },
  { key: "yearly",  label: "Yearly",  Icon: IconBarChart,      desc: "Pick a year" },
];

const MAIN_TABS = [
  { key: "view",    label: "View Reports" },
  { key: "receive", label: "Receive Reports" },
];

const TOTALS_TABS = [
  { key: "day",   label: "Day" },
  { key: "week",  label: "Week" },
  { key: "month", label: "Month" },
  { key: "year",  label: "Year" },
];

const DETAIL_TABS = [
  { key: "payments", label: "Payments", Icon: IconCreditCard },
  { key: "bookings", label: "Bookings", Icon: IconPackage },
];

const STATUS_COLORS = {
  Approved: "bg-green-50 border border-green-200",
  Pending:  "bg-yellow-50 border border-yellow-200",
  Rejected: "bg-red-50 border border-red-200",
  Cancelled:"bg-gray-100 text-gray-500",
  confirmed:"bg-green-50 border border-green-200",
  pending:  "bg-yellow-50 border border-yellow-200",
  cancelled:"bg-gray-100 text-gray-500",
  completed:"bg-blue-100 text-blue-700",
  ongoing:  "bg-teal-50 border border-teal-200",
  upcoming: "bg-purple-50 border border-purple-200",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmt2(n) {
  return Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const now = new Date();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i); // this year + past 5
const WEEK_OPTIONS = [1, 2, 3, 4, 5];

function daysInMonth(year, month /* 1-12 */) {
  return new Date(Number(year), Number(month), 0).getDate();
}

export default function Reports() {
  const { fmt, currency } = useCurrency();
  const [period, setPeriod]       = useState("monthly");
  const [selYear, setSelYear]     = useState(now.getFullYear());
  const [selMonth, setSelMonth]   = useState(now.getMonth() + 1); // 1-12
  const [selWeek, setSelWeek]     = useState(1);
  const [selDay, setSelDay]       = useState(now.getDate());
  const [report, setReport]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [mainTab, setMainTab]     = useState("view");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab]   = useState("payments");
  const [totalsTab, setTotalsTab]   = useState("day");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(true);   // the "Select Report Period" card can be minimized
  const [pdfBusy, setPdfBusy]       = useState(false);
  const cacheRef = useRef(new Map());   // query string -> { at, data }, so flipping back to a period is instant
  const reqRef   = useRef(0);           // only the newest request may update the page
  const printRef = useRef(null);
  const token = localStorage.getItem("token");

  // Keep the day selector valid whenever the year/month changes (e.g. Feb 30 → 28).
  const maxDay = daysInMonth(selYear, selMonth);
  useEffect(() => {
    if (selDay > maxDay) setSelDay(maxDay);
  }, [maxDay, selDay]);

  // Loads the report for the current selection. Runs by itself whenever a dropdown changes (see the effect below),
  // so there is no Generate button. Results are kept for a minute; Refresh bypasses that.
  const load = useCallback(async ({ force = false } = {}) => {
    const params = new URLSearchParams({ period, year: String(selYear) });
    if (period === "monthly" || period === "weekly" || period === "daily") params.set("month", String(selMonth));
    if (period === "weekly") params.set("week", String(selWeek));
    if (period === "daily")  params.set("day", String(selDay));
    const qs = params.toString();

    const hit = cacheRef.current.get(qs);
    if (!force && hit && Date.now() - hit.at < 60000) {
      reqRef.current += 1;
      setReport(hit.data); setError(null); setLoading(false);
      return;
    }

    const id = ++reqRef.current;
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/reports?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load the report.");
      if (id !== reqRef.current) return;               // a newer selection already took over
      cacheRef.current.set(qs, { at: Date.now(), data: json.data });
      setReport(json.data);
    } catch (e) {
      if (id !== reqRef.current) return;
      setReport(null); setError(e.message);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [token, period, selYear, selMonth, selWeek, selDay]);

  // Auto-load: on first open and whenever the period or any dropdown changes (short delay so quick changes
  // don't each fire a request).
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  // The PDF is a real file download (no print dialog).
  const downloadPdf = async () => {
    if (!report) return;
    setPdfBusy(true);
    try {
      await downloadReportPdf(report, {
        fmt, fmtDate, fmtDateTime, currency, totalsKey: totalsTab,
        fileName: `report-${report.period}-${report.label.replace(/[\s/–→·,]+/g, "-")}`,
      });
    } catch (e) {
      setError(`Couldn't create the PDF: ${e.message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  // ── Excel Export ──
  const exportCSV = () => {
    if (!report) return;
    const wb = XLSX.utils.book_new();

    const autoWidth = (ws, rows) => {
      const maxLens = [];
      rows.forEach((row) => {
        row.forEach((cell, ci) => {
          const len = String(cell ?? "").length;
          if (!maxLens[ci] || len > maxLens[ci]) maxLens[ci] = len;
        });
      });
      ws["!cols"] = maxLens.map((w) => ({ wch: Math.min(Math.max(w + 2, 8), 60) }));
    };

    const summaryRows = [
      ["Report Period", report.label],
      ["Generated At",  fmtDateTime(report.generatedAt)],
      ["Currency",      currency],
      [],
      ["Metric", "Value"],
      ["Total Sales (after maintenance)", fmt(report.topStats.totalSales)],
      ["Gross Sales",              fmt(report.topStats.grossSales)],
      ["Maintenance Expense",      fmt(report.topStats.maintenanceExpense)],
      ["Refunded",                 fmt(report.topStats.refundedAmount)],
      ["Number of Rentals",        report.topStats.numberOfRentals],
      ["Average Sale",             fmt(report.topStats.averageSale)],
      [],
      ["Revenue Report"],
      ["Total Revenue",   fmt(report.revenueReport.totalRevenue)],
      ["Paid Amount",     fmt(report.revenueReport.paidAmount)],
      ["Pending Amount",  fmt(report.revenueReport.pendingAmount)],
      ["Refunded Amount", fmt(report.revenueReport.refundedAmount)],
      [],
      ["Rental Report"],
      ["Total Rentals", report.rentalReport.totalRentals],
      ["Completed",      report.rentalReport.completed],
      ["Ongoing",        report.rentalReport.ongoing],
      ["Upcoming",       report.rentalReport.upcoming],
      ["Cancelled",      report.rentalReport.cancelled],
      [],
      ["Vehicle Report"],
      ["Total Vehicles Rented", report.vehicleReport.totalVehiclesRented],
      ["Revenue per Vehicle",   fmt(report.vehicleReport.revenuePerVehicle)],
      ["Most Rented Vehicle",   report.vehicleReport.mostRented ? `${report.vehicleReport.mostRented.name} (${report.vehicleReport.mostRented.rentals} rentals)` : "—"],
      ["Least Rented Vehicle",  report.vehicleReport.leastRented ? `${report.vehicleReport.leastRented.name} (${report.vehicleReport.leastRented.rentals} rentals)` : "—"],
      [],
      ["Customer Report"],
      ["Total Customers",           report.customerReport.totalCustomers],
      ["New Customers (in this period)", report.customerReport.newCustomers],
      ["Top Customer", "Amount Paid", "Rentals"],
      ...report.customerReport.topCustomers.map((c) => [c.name, fmt(c.amountPaid), c.rentals]),
      [],
      ["Top Vehicles", "Rentals", "Revenue"],
      ...report.vehicleReport.topVehicles.map((v) => [v.name, v.rentals, fmt(v.revenue)]),
      [],
      ["Payment Methods", "Payments", "Amount"],
      ...report.paymentReport.byMethod.map((m) => [m.method, m.count, fmt(m.amount)]),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    autoWidth(wsSummary, summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    const payHeaders = ["Payment ID","Booking ID","Total Fee","Amount Paid","Balance","Status","Payment Type","Gateway","Reference #","Date"];
    const payRows = report.payments.map((p) => [
      p.paymentID, p.bookingID,
      Number(p.amount), Number(p.amountPaid), Number(p.balance),
      p.status, p.methodOfPayment, p.paymentMethod, p.referenceNumber,
      fmtDate(p.createdAt),
    ]);
    const wsPayments = XLSX.utils.aoa_to_sheet([payHeaders, ...payRows]);
    autoWidth(wsPayments, [payHeaders, ...payRows]);
    XLSX.utils.book_append_sheet(wb, wsPayments, "Payments");

    const bookHeaders = ["Booking ID","Status","Location","Total Fee","Days","Start Date","End Date","Created At"];
    const bookRows = report.bookings.map((b) => [
      b.bookingID, b.status, b.location,
      Number(b.totalFee), b.totalDays,
      fmtDate(b.startDate), fmtDate(b.endDate), fmtDate(b.createdAt),
    ]);
    const wsBookings = XLSX.utils.aoa_to_sheet([bookHeaders, ...bookRows]);
    autoWidth(wsBookings, [bookHeaders, ...bookRows]);
    XLSX.utils.book_append_sheet(wb, wsBookings, "Bookings");

    const mxHeaders = ["Date","Vehicle","Basis","Services","Amount"];
    const mxRows = report.maintenanceExpenses.map((m) => [fmtDate(m.date), m.carName, m.basis, m.services, Number(m.amount)]);
    const wsMx = XLSX.utils.aoa_to_sheet([mxHeaders, ...mxRows]);
    autoWidth(wsMx, [mxHeaders, ...mxRows]);
    XLSX.utils.book_append_sheet(wb, wsMx, "Maintenance");

    const totHeaders = ["Period","Sales","Pending","Refunded","Payments","Rentals","Completed","Cancelled","New Customers","Vehicles Rented"];
    TOTALS_TABS.forEach((t) => {
      const rows = (report.periodTotals?.[t.key] || []).map((b) => [
        b.label, Number(b.sales), Number(b.pending), Number(b.refunded), b.payments, b.rentals, b.completed, b.cancelled, b.newCustomers, b.vehiclesRented,
      ]);
      const ws = XLSX.utils.aoa_to_sheet([totHeaders, ...rows]);
      autoWidth(ws, [totHeaders, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, `By ${t.label}`);
    });

    XLSX.writeFile(wb, `report-${report.period}-${report.label.replace(/[\s/–→]/g, "-")}.xlsx`);
  };

  // ── Print / PDF ──
  const printReport = () => {
    const printContent = printRef.current?.querySelector(".report-printable");
    if (!printContent) return;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Report – ${report?.label || ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }
    body { padding: 32px; color: #111; font-size: 12px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .sub { color: #6b7280; font-size: 11px; margin-bottom: 24px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; margin: 20px 0 8px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
    .card-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px; }
    .card-value { font-size: 16px; font-weight: 700; color: #111; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; color: #9ca3af; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
    td { padding: 6px 8px; font-size: 11px; border-bottom: 1px solid #f3f4f6; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; background: #f3f4f6; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  ${printContent.innerHTML}
</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;left:-9999px;top:-9999px;";
    document.body.appendChild(iframe);
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();
    iframe.contentWindow.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    };
  };

  return (
    <div className="w-full px-4 space-y-5" ref={printRef}>

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Reports</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {report ? `${report.label} · Generated ${fmtDateTime(report.generatedAt)}` : loading ? "Loading report…" : "Pick a period to see its report"}
          </p>
        </div>
        {report && mainTab === "view" && (
          <div className="relative">
            <button onClick={() => setDownloadOpen((v) => !v)} disabled={pdfBusy}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 disabled:opacity-60">
              <IconDownload className="w-4 h-4" /> {pdfBusy ? "Creating PDF…" : "Download"} <IconChevron className="w-3.5 h-3.5" open={downloadOpen} />
            </button>
            {downloadOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDownloadOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-100 shadow-lg z-20 py-1.5 text-sm">
                  <button onClick={() => { setDownloadOpen(false); exportCSV(); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50">
                    <span className="font-semibold text-gray-800">Excel (.xlsx)</span>
                    <span className="block text-xs text-gray-400">All figures, ready to calculate with</span>
                  </button>
                  <button onClick={() => { setDownloadOpen(false); downloadPdf(); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50">
                    <span className="font-semibold text-gray-800">PDF (.pdf)</span>
                    <span className="block text-xs text-gray-400">To share, send or file</span>
                  </button>
                  <button onClick={() => { setDownloadOpen(false); printReport(); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-t border-gray-100">
                    <span className="font-semibold text-gray-800">Print</span>
                    <span className="block text-xs text-gray-400">Open the print dialog</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* MAIN TABS */}
      <div className="border-b border-gray-100 flex gap-6">
        {MAIN_TABS.map((t) => (
          <button key={t.key} onClick={() => setMainTab(t.key)}
            className={`pb-3 -mb-px text-sm font-medium border-b-2 transition-colors ${
              mainTab === t.key
                ? "border-arl-dark text-arl-dark font-semibold"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === "receive" ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft flex flex-col items-center justify-center py-20 gap-3 text-gray-300">
          <IconMail className="w-12 h-12" />
          <p className="text-gray-500 font-semibold">Scheduled reports coming soon</p>
          <p className="text-gray-400 text-sm max-w-sm text-center">
            This will let you have reports emailed to you automatically on a daily, weekly, or monthly schedule.
          </p>
        </div>
      ) : (
        <>
          {/* PERIOD SELECTOR */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Select Report Period</p>
              <button onClick={() => setPeriodOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800">
                {periodOpen ? "Minimize" : "Change"} <IconChevron className="w-3.5 h-3.5" open={periodOpen} />
              </button>
            </div>

            {!periodOpen && (
              <p className="mt-3 text-sm text-gray-700">
                <span className="inline-block px-2.5 py-1 rounded-lg bg-arl-dark text-white text-xs font-semibold mr-2 align-middle">
                  {PERIODS.find((x) => x.key === period)?.label}
                </span>
                <span className="font-semibold align-middle">
                  {period === "daily"   ? `${MONTH_NAMES[selMonth - 1]} ${selDay}, ${selYear}`
                : period === "weekly"  ? `Week ${selWeek} · ${MONTH_NAMES[selMonth - 1]} ${selYear}`
                : period === "monthly" ? `${MONTH_NAMES[selMonth - 1]} ${selYear}`
                : String(selYear)}
                </span>
              </p>
            )}

            {periodOpen && (
              <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PERIODS.map((p) => (
                  <button key={p.key} onClick={() => setPeriod(p.key)}
                    className={`flex flex-col items-center gap-1 px-4 py-4 rounded-xl border-2 transition-all ${
                      period === p.key
                        ? "border-arl-dark bg-arl-dark text-white"
                        : "border-gray-100 hover:border-gray-300 text-gray-600"
                    }`}>
                    <p.Icon className="w-7 h-7" />
                    <span className="font-semibold text-sm">{p.label}</span>
                    <span className={`text-xs ${period === p.key ? "text-white/70" : "text-gray-400"}`}>{p.desc}</span>
                  </button>
                ))}
              </div>

              {/* WHICH WEEK / MONTH / YEAR */}
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Which {period === "daily" ? "day" : period === "weekly" ? "week" : period === "monthly" ? "month" : "year"}?
                </p>
                <div className="flex flex-wrap gap-3">
                  {/* Year — always shown */}
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-400">Year</span>
                    <select value={selYear} onChange={(e) => setSelYear(Number(e.target.value))}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-arl-dark">
                      {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </label>

                  {/* Month — for daily / weekly / monthly */}
                  {(period === "daily" || period === "weekly" || period === "monthly") && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400">Month</span>
                      <select value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-arl-dark">
                        {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                      </select>
                    </label>
                  )}

                  {/* Week — for weekly only */}
                  {period === "weekly" && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400">Week</span>
                      <select value={selWeek} onChange={(e) => setSelWeek(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-arl-dark">
                        {WEEK_OPTIONS.map((w) => <option key={w} value={w}>Week {w}</option>)}
                      </select>
                    </label>
                  )}

                  {/* Day — for daily only */}
                  {period === "daily" && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400">Day</span>
                      <select value={selDay} onChange={(e) => setSelDay(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-arl-dark">
                        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </div>

              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-3">
              <span className="text-xs text-gray-400 flex items-center gap-2">
                {loading && (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                )}
                {loading ? "Loading…" : report ? `Updated ${fmtDateTime(report.generatedAt)}` : ""}
              </span>
              <button onClick={() => load({ force: true })} disabled={loading}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Refresh
              </button>
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <IconWarning className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* REPORT OUTPUT */}
          {report && (
            <div className={`report-printable space-y-4 transition-opacity ${loading ? "opacity-50 pointer-events-none" : ""}`}>

              {/* TOP STAT CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TopStatCard icon={IconBarChart}  label="Total Sales"         value={fmt(report.topStats.totalSales)} hint="Money received minus completed maintenance" />
                <TopStatCard icon={IconCreditCard} label="Gross Sales"        value={fmt(report.topStats.grossSales)} hint="Money actually received" />
                <TopStatCard icon={IconPackage}   label="Maintenance Expense" value={fmt(report.topStats.maintenanceExpense)} hint="Completed maintenance only" />
                <TopStatCard icon={IconWarning}   label="Refunded"            value={fmt(report.topStats.refundedAmount)} hint="Handed back to customers (not deducted)" />
                <TopStatCard icon={IconDoc}       label="Number of Rentals"   value={report.topStats.numberOfRentals} />
                <TopStatCard icon={IconTrendUp}   label="Average Sale"        value={fmt(report.topStats.averageSale)} hint="Gross sales per rental" />
              </div>

              {/* REVENUE REPORT */}
              <ReportSection icon={IconDoc} title="Revenue Report">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <MiniStat label="Total Revenue"   value={fmt(report.revenueReport.totalRevenue)} />
                  <MiniStat label="Paid Amount"     value={fmt(report.revenueReport.paidAmount)}     color="text-green-600" />
                  <MiniStat label="Pending Amount"  value={fmt(report.revenueReport.pendingAmount)}  color="text-amber-500" />
                  <MiniStat label="Refunded Amount" value={fmt(report.revenueReport.refundedAmount)} color="text-red-500" />
                </div>
                <div className="mt-4">
                  <ChartCard title="Revenue breakdown">
                    <DonutChart
                      data={[
                        { label: "Collected",   value: report.revenueReport.paidAmount,     color: C_GREEN },
                        { label: "Outstanding", value: report.revenueReport.pendingAmount,  color: C_AMBER },
                        { label: "Refunded",    value: report.revenueReport.refundedAmount, color: C_RED },
                      ]}
                      format={fmt}
                      centerLabel="Revenue (excl. refunds)"
                      centerValue={fmt(report.revenueReport.totalRevenue)} />
                  </ChartCard>
                </div>
              </ReportSection>

              {/* MAINTENANCE EXPENSES */}
              <ReportSection icon={IconPackage} title="Maintenance Expenses">
                {report.maintenanceExpenses.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No completed maintenance in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                          {["Date", "Vehicle", "Basis", "Services", "Amount"].map((h) => (
                            <th key={h} className={`py-2 pr-4 font-semibold ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.maintenanceExpenses.map((m) => (
                          <tr key={m.id} className="border-b border-gray-50 last:border-0">
                            <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">{fmtDate(m.date)}</td>
                            <td className="py-2 pr-4 text-xs font-semibold text-gray-800">{m.carName}</td>
                            <td className="py-2 pr-4 text-xs text-gray-600">{m.basis || "—"}</td>
                            <td className="py-2 pr-4 text-xs text-gray-600">{m.services || "—"}</td>
                            <td className="py-2 text-right text-xs font-semibold text-red-500">{fmt(m.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ReportSection>

              {/* RENTAL REPORT */}
              <ReportSection icon={IconChecklist} title="Rental Report">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <MiniStat label="Total Rentals" value={report.rentalReport.totalRentals} />
                  <MiniStat label="Completed" value={report.rentalReport.completed} color="text-green-600" />
                  <MiniStat label="Ongoing"   value={report.rentalReport.ongoing}   color="text-teal-600" />
                  <MiniStat label="Upcoming"  value={report.rentalReport.upcoming}  color="text-purple-600" />
                  <MiniStat label="Cancelled" value={report.rentalReport.cancelled} color="text-red-500" />
                </div>
                <div className="mt-4">
                  <ChartCard title="Rentals by status">
                    <DonutChart
                      data={[
                        { label: "Completed", value: report.rentalReport.completed, color: C_GREEN },
                        { label: "Ongoing",   value: report.rentalReport.ongoing,   color: C_BLUE },
                        { label: "Upcoming",  value: report.rentalReport.upcoming,  color: C_AMBER },
                        { label: "Cancelled", value: report.rentalReport.cancelled, color: C_RED },
                      ]}
                      format={(v) => String(v)}
                      centerLabel="Rentals"
                      centerValue={String(report.rentalReport.totalRentals)} />
                  </ChartCard>
                </div>
              </ReportSection>

              {/* VEHICLE REPORT */}
              <ReportSection icon={IconCar} title="Vehicle Report">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <MiniStat label="Total Vehicles Rented" value={report.vehicleReport.totalVehiclesRented} />
                  <MiniStat label="Revenue per Vehicle"   value={fmt(report.vehicleReport.revenuePerVehicle)} />
                </div>
                {report.vehicleReport.totalVehiclesRented > 0 ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-2">
                      <ChartCard title="Rentals per vehicle (top 5)">
                        <BarChart data={report.vehicleReport.topVehicles.slice(0, 5).map((v) => ({ label: v.name, value: v.rentals, color: C_BLUE }))} format={(v) => String(v)} />
                      </ChartCard>
                      <ChartCard title="Revenue per vehicle (top 5)">
                        <BarChart data={report.vehicleReport.topVehicles.slice(0, 5).map((v) => ({ label: v.name, value: v.revenue, color: C_GREEN }))} format={fmt} />
                      </ChartCard>
                    </div>
                    <RankRow icon="up"   label="Most Rented Vehicle"  name={report.vehicleReport.mostRented?.name}  countLabel={`${report.vehicleReport.mostRented?.rentals} rentals`} />
                    <RankRow icon="down" label="Least Rented Vehicle" name={report.vehicleReport.leastRented?.name} countLabel={`${report.vehicleReport.leastRented?.rentals} rentals`} />
                    {report.vehicleReport.topVehicles.length > 1 && (
                      <div className="pt-3">
                        <p className="text-xs text-gray-400 font-semibold mb-2">Top Vehicles</p>
                        <div className="space-y-1.5">
                          {report.vehicleReport.topVehicles.map((v, i) => (
                            <div key={v.carID} className="flex items-center gap-3 py-1">
                              <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                              <span className="text-sm text-gray-700 flex-1 truncate">{v.name}</span>
                              <span className="text-xs text-gray-500">{v.rentals} rental{v.rentals === 1 ? "" : "s"}</span>
                              <span className="text-sm font-semibold text-blue-600 w-28 text-right">{fmt(v.revenue)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No vehicles rented in this period.</p>
                )}
              </ReportSection>

              {/* CUSTOMER REPORT */}
              <ReportSection icon={IconUsers} title="Customer Report">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <MiniStat label="Total Customers" value={report.customerReport.totalCustomers} />
                  <MiniStat label="New Customers (in this period)" value={report.customerReport.newCustomers} color="text-green-600" />
                </div>
                {report.customerReport.topCustomers.length > 0 ? (
                  <div>
                    <p className="text-xs text-gray-400 font-semibold mb-2">Top Customers</p>
                    <div className="space-y-1.5">
                      {report.customerReport.topCustomers.map((c, i) => (
                        <div key={c.userID} className="flex items-center gap-3 py-1">
                          <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                          <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 text-xs font-semibold flex items-center justify-center shrink-0">
                            {c.name?.[0]?.toUpperCase() || "?"}
                          </span>
                          <span className="text-sm text-gray-700 flex-1 truncate">{c.name}</span>
                          <span className="text-xs text-gray-500">{c.rentals} rental{c.rentals === 1 ? "" : "s"}</span>
                          <span className="text-sm font-semibold text-blue-600 w-28 text-right">{fmt(c.amountPaid)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No paying customers in this period.</p>
                )}
              </ReportSection>

              {/* PAYMENT REPORT */}
              <ReportSection icon={IconCreditCard} title="Payment Report">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <MiniStat label="Total Payments" value={report.paymentReport.totalPayments} />
                  {report.paymentReport.byMethod.map((m) => (
                    <MiniStat key={m.method} label={`${m.method} · ${m.count} payment${m.count === 1 ? "" : "s"}`} value={fmt(m.amount)} color="text-green-600" />
                  ))}
                </div>
                {report.paymentReport.byMethod.length === 0 ? (
                  <p className="text-sm text-gray-400 italic mt-3">No confirmed payments in this period.</p>
                ) : (
                  <div className="mt-4">
                    <ChartCard title="Amount by payment method">
                      <BarChart data={report.paymentReport.byMethod.map((m) => ({ label: m.method, value: m.amount, color: C_BLUE }))} format={fmt} />
                    </ChartCard>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-3">Counted by where each peso actually came in, so a deposit paid online and a balance paid in cash show under both.</p>
              </ReportSection>

              {/* TOTALS PER DAY / WEEK / MONTH / YEAR */}
              <ReportSection icon={IconBarChart} title="Totals by Day / Week / Month / Year">
                <div className="flex gap-1 mb-3">
                  {TOTALS_TABS.map((t) => (
                    <button key={t.key} onClick={() => setTotalsTab(t.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        totalsTab === t.key ? "bg-arl-dark text-white" : "bg-gray-100 text-gray-500 hover:text-gray-700"
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        {["Period", "Sales", "Pending", "Refunded", "Payments", "Rentals", "Done", "Cancelled", "New Cust.", "Vehicles"].map((h) => (
                          <th key={h} className={`py-2 pr-3 font-semibold ${h === "Period" ? "text-left" : "text-right"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(report.periodTotals?.[totalsTab] || []).length === 0 ? (
                        <tr><td colSpan={10} className="text-center py-8 text-gray-400 text-sm">No activity in this period.</td></tr>
                      ) : report.periodTotals[totalsTab].map((b) => (
                        <tr key={b.start} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-3 text-xs font-semibold text-gray-800 whitespace-nowrap">{b.label}</td>
                          <td className="py-2 pr-3 text-right text-xs font-semibold text-green-700">{fmt(b.sales)}</td>
                          <td className="py-2 pr-3 text-right text-xs text-amber-600">{fmt(b.pending)}</td>
                          <td className="py-2 pr-3 text-right text-xs text-red-500">{fmt(b.refunded)}</td>
                          <td className="py-2 pr-3 text-right text-xs text-gray-600">{b.payments}</td>
                          <td className="py-2 pr-3 text-right text-xs text-gray-600">{b.rentals}</td>
                          <td className="py-2 pr-3 text-right text-xs text-gray-600">{b.completed}</td>
                          <td className="py-2 pr-3 text-right text-xs text-gray-600">{b.cancelled}</td>
                          <td className="py-2 pr-3 text-right text-xs text-gray-600">{b.newCustomers}</td>
                          <td className="py-2 text-right text-xs text-gray-600">{b.vehiclesRented}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-3">Sales, pending and refunds are dated by when the payment was made; rentals by when the trip starts; new customers by sign-up date.</p>
              </ReportSection>

              {/* DETAIL RECORDS (collapsible — raw payments/bookings tables) */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
                <button onClick={() => setDetailOpen((v) => !v)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50/50">
                  <span className="font-semibold text-gray-800 text-sm">Detailed Records</span>
                  <IconChevron open={detailOpen} />
                </button>

                {detailOpen && (
                  <div className="border-t border-gray-100">
                    <div className="px-5 pt-4 flex gap-1 bg-gray-50/50">
                      {DETAIL_TABS.map((t) => (
                        <button key={t.key} onClick={() => setDetailTab(t.key)}
                          className={`px-4 py-2 rounded-t-lg text-sm font-medium flex items-center gap-1.5 ${
                            detailTab === t.key ? "bg-white text-arl-dark font-semibold border border-b-0 border-gray-100" : "text-gray-500 hover:text-gray-700"
                          }`}>
                          <t.Icon className="w-3.5 h-3.5" />
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {detailTab === "payments" && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[750px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                              {["Payment ID","Total","Paid","Balance","Status","Type","Gateway","Ref #","Date"].map(h => (
                                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {report.payments.length === 0 ? (
                              <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">No payment records in this period.</td></tr>
                            ) : report.payments.map((p, i) => (
                              <tr key={p.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 ${i%2===1?"bg-gray-50/30":""}`}>
                                <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-[130px]">{p.paymentID}</td>
                                <td className="px-4 py-3 text-xs font-semibold">{fmt(p.amount)}</td>
                                <td className="px-4 py-3 text-xs text-green-700 font-semibold">{fmt(p.amountPaid)}</td>
                                <td className={`px-4 py-3 text-xs font-semibold ${p.balance > 0 ? "text-red-500" : "text-green-600"}`}>{fmt(p.balance)}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[p.status]||"bg-gray-100 text-gray-500"}`}>{p.status}</span>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-600">{p.methodOfPayment}</td>
                                <td className="px-4 py-3 text-xs text-gray-600">{p.paymentMethod}</td>
                                <td className="px-4 py-3 text-xs font-mono text-gray-500">{p.referenceNumber}</td>
                                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {detailTab === "bookings" && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[700px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                              {["Booking ID","Status","Location","Total Fee","Days","Start","End","Created"].map(h => (
                                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {report.bookings.length === 0 ? (
                              <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No booking records in this period.</td></tr>
                            ) : report.bookings.map((b, i) => (
                              <tr key={b.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 ${i%2===1?"bg-gray-50/30":""}`}>
                                <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-[130px]">{b.bookingID}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[b.status]||"bg-gray-100 text-gray-500"}`}>{b.status}</span>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate">{b.location}</td>
                                <td className="px-4 py-3 text-xs font-semibold text-gray-800">{fmt(b.totalFee)}</td>
                                <td className="px-4 py-3 text-xs text-gray-600">{b.totalDays}d</td>
                                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(b.startDate)}</td>
                                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(b.endDate)}</td>
                                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!report && (loading || !error) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft flex flex-col items-center justify-center py-20 gap-3 text-gray-300">
              <IconClipboard className="w-12 h-12" />
              <p className="text-gray-500 font-semibold">Loading report…</p>
              <p className="text-gray-400 text-sm">It updates by itself when you change the period above</p>
            </div>
          )}
        </>
      )}

    </div>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

// ─── CHARTS (inline styles / SVG so they also look right when printed) ──────────

const C_GREEN = "#16a34a", C_AMBER = "#ca8a04", C_RED = "#ef4444", C_BLUE = "#2563eb";

function ChartCard({ title, children }) {
  return (
    <div style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 16, background: "#fff" }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 12 }}>{title}</p>
      {children}
    </div>
  );
}

function NoData() {
  return <p style={{ fontSize: 14, color: "#9ca3af", fontStyle: "italic" }}>No data yet.</p>;
}

/** Ring chart with a legend. `data` = [{ label, value, color }]. */
function DonutChart({ data, format, centerLabel, centerValue }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return <NoData />;
  const R = 52, CIRC = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
        <svg viewBox="0 0 140 140" width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f3f4f6" strokeWidth="18" />
          {data.filter((d) => d.value > 0).map((d) => {
            const len = (d.value / total) * CIRC;
            const el = <circle key={d.label} cx="70" cy="70" r={R} fill="none" stroke={d.color} strokeWidth="18" strokeDasharray={`${len} ${CIRC - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        </svg>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 24px" }}>
          <span style={{ fontSize: 9, color: "#9ca3af", lineHeight: 1.2 }}>{centerLabel}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{centerValue}</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 150 }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: d.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: "#374151" }}>{d.label}</span>
            <span style={{ fontWeight: 700, color: "#111827" }}>{format(d.value)}</span>
            <span style={{ width: 38, textAlign: "right", color: "#9ca3af" }}>{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars scaled to the largest value. `data` = [{ label, value, color }]. */
function BarChart({ data, format }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (data.length === 0 || max <= 0) return <NoData />;
  return (
    <div>
      {data.map((d) => (
        <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
          <span title={d.label} style={{ width: 100, fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
          <div style={{ flex: 1, height: 12, borderRadius: 6, background: "#f3f4f6" }}>
            <div style={{ width: `${Math.min(100, (d.value / max) * 100)}%`, height: 12, borderRadius: 6, background: d.color }} />
          </div>
          <span style={{ width: 92, textAlign: "right", fontSize: 12, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

function TopStatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      </div>
    </div>
  );
}

function ReportSection({ icon: Icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-arl-dark" />
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MiniStat({ label, value, color = "text-gray-900" }) {
  return (
    <div className="bg-gray-50/70 rounded-xl p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function RankRow({ icon, label, name, countLabel }) {
  const up = icon === "up";
  return (
    <div className="flex items-center justify-between bg-gray-50/70 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`w-6 h-6 flex items-center justify-center ${up ? "text-green-600" : "text-red-500"}`}>
          {up ? <IconTrendUp className="w-4 h-4" /> : <IconTrendUp className="w-4 h-4 rotate-180" />}
        </span>
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="text-sm font-semibold text-gray-800">{name || "—"}</p>
        </div>
      </div>
      <span className={`text-sm font-semibold ${up ? "text-green-600" : "text-red-500"}`}>{countLabel}</span>
    </div>
  );
}