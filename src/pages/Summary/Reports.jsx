import { useState, useEffect } from "react";
import RevenueExpense from "./RevenueExpense";
import PaymentsTransactions from "./PaymentsTransactions";
import RentalsCustomers from "./RentalsCustomers";
import MaintenancePenalties from "./MaintenancePenalties";

// The viewer: title, one white group with the tabs + period pickers, and the open section below.
// Each section lives in its own file and receives the selected period as props:
//   { period, year, month, week, day }   period = daily | weekly | monthly | yearly, month 1-12

const TABS = [
  { key: "revenue",     label: "Revenue & Expense",       Component: RevenueExpense },
  { key: "payments",    label: "Payments & Transactions", Component: PaymentsTransactions },
  { key: "rentals",     label: "Rentals & Customers",     Component: RentalsCustomers },
  { key: "maintenance", label: "Maintenance & Penalties", Component: MaintenancePenalties },
];

const PERIODS = [
  { key: "daily",   label: "Daily" },
  { key: "weekly",  label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly",  label: "Yearly" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const now = new Date();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i); // this year + past 5
const WEEK_OPTIONS = [1, 2, 3, 4, 5];

const daysInMonth = (year, month /* 1-12 */) => new Date(Number(year), Number(month), 0).getDate();

const selectCls =
  "px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 focus:outline-none focus:border-arl-dark";

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
            <select aria-label="Report period" value={period} onChange={(e) => setPeriod(e.target.value)} className={selectCls}>
              {PERIODS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>

            <select aria-label="Year" value={selYear} onChange={(e) => setSelYear(Number(e.target.value))} className={selectCls}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            {(period === "daily" || period === "weekly" || period === "monthly") && (
              <select aria-label="Month" value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))} className={selectCls}>
                {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </select>
            )}

            {period === "weekly" && (
              <select aria-label="Week" value={selWeek} onChange={(e) => setSelWeek(Number(e.target.value))} className={selectCls}>
                {WEEK_OPTIONS.map((w) => <option key={w} value={w}>Week {w}</option>)}
              </select>
            )}

            {period === "daily" && (
              <select aria-label="Day" value={selDay} onChange={(e) => setSelDay(Number(e.target.value))} className={selectCls}>
                {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Day {d}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {Active && <Active period={period} year={selYear} month={selMonth} week={selWeek} day={selDay} />}
    </div>
  );
}