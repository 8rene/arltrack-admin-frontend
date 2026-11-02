import { useState, useEffect, useMemo, useRef } from "react";
import RevenueExpense from "./RevenueExpense";
import PaymentsTransactions from "./PaymentsTransactions";
import RentalsCustomers from "./RentalsCustomers";
import MaintenancePenalties from "./MaintenancePenalties";
import { downloadTabPdf } from "../../utils/reportTabPdf";
import { downloadTabXlsx } from "../../utils/reportTabXlsx";

// The viewer: title, one white group with the tabs + period pickers, and the open section below.
// Each section lives in its own file and receives the selected period as props:
//   { period, year, month, week, day }   period = daily | weekly | monthly | yearly, month 1-12

const TABS = [
  { key: "revenue",     label: "Revenue & Expense",       Component: RevenueExpense },
  { key: "payments",    label: "Payments & Transactions", Component: PaymentsTransactions },
  { key: "rentals",     label: "Rentals & Customers",     Component: RentalsCustomers },
  { key: "maintenance", label: "Maintenance & Penalties", Component: MaintenancePenalties },
];

// Only Monthly and Yearly are offered: a month already shows its days in the graph and table. The daily / weekly code below
// (the Week and Day pickers) is kept but can no longer be reached from this list.
const PERIODS = [
  { key: "monthly", label: "Monthly" },
  { key: "yearly",  label: "Yearly" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const now = new Date();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i); // this year + past 5

const daysInMonth = (year, month /* 1-12 */) => new Date(Number(year), Number(month), 0).getDate();

const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
const MIN_YEAR = YEAR_OPTIONS[YEAR_OPTIONS.length - 1];
const weeksIn = (year, month) => Math.ceil(daysInMonth(year, month) / 7);   // week 1 = days 1-7, ... the last one runs to the end of the month

/** The selected period in words: "2026", "November 2026", "Week 2 · Nov 2026", "Nov 2, 2026". */
function rangeLabel({ period, year, month, week, day }) {
  if (period === "yearly") return String(year);
  if (period === "monthly") return `${MONTH_NAMES[month - 1]} ${year}`;
  if (period === "weekly") return `Week ${week} · ${MONTH_SHORT[month - 1]} ${year}`;
  return `${MONTH_SHORT[month - 1]} ${day}, ${year}`;
}

/** The period one step before (-1) or after (+1) the given one, or null when that is before the oldest year or still in the future. */
function stepRange(sel, dir) {
  const { period } = sel;
  let { year, month, week, day } = sel;
  if (period === "yearly") {
    year += dir;
  } else if (period === "monthly") {
    month += dir;
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
  } else if (period === "weekly") {
    week += dir;
    if (week < 1) {
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
      week = weeksIn(year, month);
    } else if (week > weeksIn(year, month)) {
      month += 1; week = 1;
      if (month > 12) { month = 1; year += 1; }
    }
  } else {
    const d = new Date(year, month - 1, day + dir);
    year = d.getFullYear(); month = d.getMonth() + 1; day = d.getDate();
  }
  if (year < MIN_YEAR) return null;
  const start = period === "yearly" ? new Date(year, 0, 1)
    : period === "monthly" ? new Date(year, month - 1, 1)
    : period === "weekly" ? new Date(year, month - 1, (week - 1) * 7 + 1)
    : new Date(year, month - 1, day);
  if (start > new Date()) return null;
  return { period, year, month, week, day };
}

const IconChevron = ({ dir }) => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconCalendar = () => (
  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconDownload = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconChevronDown = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const IconClose = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** One pill: ‹ [calendar] November 2026 ›. The arrows step one period at a time; the middle opens the Set range window. */
function RangePill({ label, onPrev, onNext, onOpen }) {
  const arrow = "w-8 h-9 flex items-center justify-center text-gray-500 hover:text-teal-700 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 disabled:cursor-not-allowed";
  return (
    <div className="flex items-stretch rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous period" className={`${arrow} border-r border-gray-100`}><IconChevron dir="left" /></button>
      <button type="button" onClick={onOpen} aria-label={`Set range, now ${label}`}
        className="flex items-center gap-2 px-3.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap">
        <IconCalendar />
        {label}
      </button>
      <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next period" className={`${arrow} border-l border-gray-100`}><IconChevron dir="right" /></button>
    </div>
  );
}

const fieldCls = "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 focus:outline-none focus:border-arl-dark";

/** The Set range window: pick Daily / Weekly / Monthly / Yearly, then only the dropdowns that apply. Nothing changes until Apply. */
function RangeModal({ current, onApply, onClose }) {
  const [d, setD] = useState(current);                       // the draft
  const set = (patch) => setD((prev) => ({ ...prev, ...patch }));
  const dim = daysInMonth(d.year, d.month);
  const weeks = weeksIn(d.year, d.month);
  const draft = { ...d, day: Math.min(d.day, dim), week: Math.min(d.week, weeks) };   // keep day / week valid for the month picked

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const field = (label, control) => (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-400 mb-1">{label}</span>
      {control}
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h2 className="font-bold text-lg text-gray-800">Set range</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><IconClose /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div role="group" aria-label="Report period" className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            {PERIODS.map((x) => (
              <button key={x.key} type="button" onClick={() => set({ period: x.key })} aria-pressed={d.period === x.key}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  d.period === x.key ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                {x.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field("Year", (
              <select value={d.year} onChange={(e) => set({ year: Number(e.target.value) })} className={fieldCls}>
                {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            ))}
            {d.period !== "yearly" && field("Month", (
              <select value={d.month} onChange={(e) => set({ month: Number(e.target.value) })} className={fieldCls}>
                {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </select>
            ))}
            {d.period === "weekly" && field("Week", (
              <select value={draft.week} onChange={(e) => set({ week: Number(e.target.value) })} className={fieldCls}>
                {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => <option key={w} value={w}>Week {w}</option>)}
              </select>
            ))}
            {d.period === "daily" && field("Day", (
              <select value={draft.day} onChange={(e) => set({ day: Number(e.target.value) })} className={fieldCls}>
                {Array.from({ length: dim }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Day {n}</option>)}
              </select>
            ))}
          </div>

          <p className="text-xs text-gray-400">Showing <span className="font-semibold text-gray-600">{rangeLabel(draft)}</span></p>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => onApply(draft)} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors">Apply</button>
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const [tab, setTab]           = useState("revenue");
  const [period, setPeriod]     = useState("monthly");
  const [selYear, setSelYear]   = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1); // 1-12
  const [selWeek, setSelWeek]   = useState(1);
  const [selDay, setSelDay]     = useState(now.getDate());

  // Keep the day valid when the year/month changes (e.g. Feb 30 -> 28).
  const maxDay = daysInMonth(selYear, selMonth);
  useEffect(() => {
    if (selDay > maxDay) setSelDay(maxDay);
  }, [maxDay, selDay]);

  const Active = TABS.find((t) => t.key === tab)?.Component;

  const [rangeOpen, setRangeOpen] = useState(false);

  // The open tab puts a function here that returns its page as sections (cards, graphs, tables); the Download menu runs it.
  const exportRef = useRef(null);
  const menuRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (e.type === "keydown" ? e.key === "Escape" : !menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menuOpen]);

  const download = async (kind) => {                      // kind: "pdf" | "xlsx"
    setMenuOpen(false);
    const spec = exportRef.current?.(kind);
    if (!spec) return;                                     // the report is still loading
    const tabLabel = TABS.find((t) => t.key === tab)?.label || "Report";
    const fileName = `${slug(tabLabel)}-${slug(rangeLabel({ period, year: selYear, month: selMonth, week: selWeek, day: selDay }))}`;
    setExporting(true);
    try {
      await (kind === "xlsx" ? downloadTabXlsx : downloadTabPdf)({ title: tabLabel, ...spec, fileName });
    } catch (err) {
      console.error(`${kind} export failed:`, err);
      window.alert("Could not create the file. Please try again.");
    } finally {
      setExporting(false);
    }
  };
  const sel = useMemo(() => ({ period, year: selYear, month: selMonth, week: selWeek, day: selDay }), [period, selYear, selMonth, selWeek, selDay]);
  // One update for all five values, so the report loads once.
  const applyRange = (r) => { setPeriod(r.period); setSelYear(r.year); setSelMonth(r.month); setSelWeek(r.week); setSelDay(r.day); setRangeOpen(false); };
  const prev = stepRange(sel, -1);
  const next = stepRange(sel, 1);

  return (
    <div className="w-full px-4 space-y-5">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-arl-dark">Reports</h1>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 w-fit overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  tab === t.key ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <RangePill label={rangeLabel(sel)} onOpen={() => setRangeOpen(true)}
              onPrev={prev ? () => applyRange(prev) : undefined} onNext={next ? () => applyRange(next) : undefined} />
            <div className="relative" ref={menuRef}>
              <button type="button" onClick={() => setMenuOpen((o) => !o)} disabled={exporting} aria-haspopup="menu" aria-expanded={menuOpen}
                className="flex items-center gap-2 h-9 px-3.5 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60 disabled:cursor-wait whitespace-nowrap">
                <IconDownload />
                {exporting ? "Creating…" : "Download"}
                <IconChevronDown />
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-44 rounded-xl border border-gray-100 bg-white shadow-card z-30 py-1">
                  <button role="menuitem" type="button" onClick={() => download("pdf")} className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">PDF (.pdf)</button>
                  <button role="menuitem" type="button" onClick={() => download("xlsx")} className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Excel (.xlsx)</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {rangeOpen && <RangeModal current={sel} onApply={applyRange} onClose={() => setRangeOpen(false)} />}

      {Active && <Active period={period} year={selYear} month={selMonth} week={selWeek} day={selDay} exportRef={exportRef} />}
    </div>
  );
}