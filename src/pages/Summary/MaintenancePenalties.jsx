import { useState, useEffect, useRef, useCallback } from "react";
import { useCurrency } from "../../context/CurrencyContext";

// Maintenance & Penalties. Receives the selected period from Reports.jsx: { period, year, month, week, day }
//
//   Cards      total maintenance · penalties collected · penalties pending
//   Per car    maintenance cost per car, split into "recovered by penalties" (green) and "not recovered" (red)
//   Customers  who was penalized on which car — one list, shown as a graph or a table, with sort / search / paging
//
// Only Confirmed penalties count. "Recovered" = penalties actually collected on that car in the period, capped at its
// maintenance cost; it does not link a specific penalty to a specific repair.

const IconPackage = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconCreditCard = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
    <path d="M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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


const C_GREEN = "#16a34a", C_RED = "#ef4444";

// Same stat card as the Users page (flat style): colored icon square on the left, number and title on the right.
function StatCard({ title, value, Icon, color }) {
  return (
    <div className="rounded-2xl border border-transparent bg-gray-50 p-4 flex items-center gap-3">
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-gray-800 truncate">{value}</div>
        <div className="text-xs text-gray-500">{title}</div>
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

const PAGE_SIZE = 5;

export default function MaintenancePenalties({ period, year, month, week, day }) {
  const { fmt } = useCurrency();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const [sort, setSort]       = useState("total");     // total | unpaid
  const [view, setView]       = useState("graph");     // graph | table
  const [page, setPage]       = useState(1);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch]   = useState("");          // debounced copy of searchText

  const reqRef = useRef(0);   // only the newest request may update the page
  const token = localStorage.getItem("token");

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // any change to the period, sort or search starts again from page 1
  useEffect(() => { setPage(1); }, [period, year, month, week, day, sort, search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ period, year: String(year), sort, page: String(page), pageSize: String(PAGE_SIZE) });
    if (period === "monthly" || period === "weekly" || period === "daily") params.set("month", String(month));
    if (period === "weekly") params.set("week", String(week));
    if (period === "daily")  params.set("day", String(day));
    if (search) params.set("search", search);

    const id = ++reqRef.current;
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/reports/maintenance-penalties?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load the report.");
      if (id !== reqRef.current) return;
      setData(json.data);
    } catch (e) {
      if (id !== reqRef.current) return;
      setData(null); setError(e.message);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [token, period, year, month, week, day, sort, search, page]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
        <IconWarning className="w-4 h-4 shrink-0" /> {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft py-16 text-center text-sm text-gray-400">
        {loading ? "Loading…" : "No data yet."}
      </div>
    );
  }

  const { cards, cars, customers } = data;
  const from = customers.totalRows === 0 ? 0 : (customers.page - 1) * customers.pageSize + 1;
  const to   = Math.min(customers.page * customers.pageSize, customers.totalRows);
  const maxCar = Math.max(1, ...cars.map((c) => c.total));

  return (
    <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>

      {/* CARDS */}
      <div className="bg-white rounded-2xl shadow-sm border">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 p-4">
          <StatCard title="Total Maintenance" value={fmt(cards.totalMaintenance)} Icon={IconPackage} color="bg-orange-50 text-orange-600" />
          <StatCard title="Penalties Collected" value={fmt(cards.penaltiesCollected)} Icon={IconCreditCard} color="bg-green-50 text-green-600" />
          <StatCard title="Penalties Pending" value={fmt(cards.penaltiesPending)} Icon={IconWarning} color="bg-red-50 text-red-600" />
        </div>
      </div>

      {/* MAINTENANCE PER CAR */}
      <ReportSection icon={IconCar} title="Maintenance cost per car">
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-3">
          <Legend color={C_GREEN} label="Recovered by penalties" />
          <Legend color={C_RED} label="Not recovered" />
        </div>

        {cars.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No completed maintenance in this period.</p>
        ) : (
          <div className="space-y-3">
            {cars.map((c) => (
              <div key={c.carID || c.name}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-sm font-semibold text-gray-800 truncate">{c.name}</span>
                  <span className="text-sm font-bold text-gray-800 shrink-0">{fmt(c.total)}</span>
                </div>
                <div className="h-5 bg-gray-50 rounded-md overflow-hidden">
                  <div className="h-full flex" style={{ width: `${(c.total / maxCar) * 100}%` }}>
                    <div style={{ width: `${(c.recovered / c.total) * 100}%`, background: C_GREEN }} />
                    <div style={{ width: `${(c.absorbed / c.total) * 100}%`, background: C_RED }} />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  <span className="text-green-600">{fmt(c.recovered)} recovered</span> · <span className="text-red-500">{fmt(c.absorbed)} not recovered</span>
                </p>
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-1">Not recovered includes routine servicing, which has no penalty behind it.</p>
          </div>
        )}
      </ReportSection>

      {/* PENALTIES BY CUSTOMER */}
      <ReportSection icon={IconUsers} title="Penalties by customer">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 font-semibold">Sort by</span>
            <Toggle options={[{ key: "total", label: "Total penalties" }, { key: "unpaid", label: "Total unpaid" }]} value={sort} onChange={setSort} />
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search customer or car"
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs w-48 focus:outline-none focus:border-arl-dark" />
          </div>
          <Toggle options={[{ key: "graph", label: "Graph" }, { key: "table", label: "Table" }]} value={view} onChange={setView} />
        </div>

        <p className="text-xs text-gray-400 mb-3">
          {customers.totalRows === 0 ? "Showing 0 of 0" : `Showing ${from}–${to} of ${customers.totalRows}`}
        </p>

        {customers.totalRows === 0 ? (
          <p className="text-sm text-gray-400 italic">{search ? "No customer matches your search." : "No penalties in this period."}</p>
        ) : view === "graph" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
              <Legend color={C_GREEN} label="Paid" />
              <Legend color={C_RED} label="Unpaid" />
            </div>
            {customers.rows.map((r) => (
              <div key={`${r.userID}|${r.carID}`}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-sm text-gray-800 truncate"><span className="font-semibold">{r.customer}</span> · {r.car}</span>
                  <span className="text-sm font-bold text-gray-800 shrink-0">{fmt(r.total)}</span>
                </div>
                <div className="h-5 bg-gray-50 rounded-md overflow-hidden">
                  <div className="h-full flex" style={{ width: `${customers.maxTotal > 0 ? (r.total / customers.maxTotal) * 100 : 0}%` }}>
                    <div style={{ width: `${r.total > 0 ? (r.paid / r.total) * 100 : 0}%`, background: C_GREEN }} />
                    <div style={{ width: `${r.total > 0 ? (r.pending / r.total) * 100 : 0}%`, background: C_RED }} />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {r.penalties} penalt{r.penalties === 1 ? "y" : "ies"} · <span className="text-green-600">{fmt(r.paid)} paid</span> · <span className={r.pending > 0 ? "text-red-500" : ""}>{fmt(r.pending)} unpaid</span>
                </p>
              </div>
            ))}
            <p className="text-xs text-gray-400">Bar lengths use the same scale on every page.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 560 }}>
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  <th className="py-2 pr-3 font-semibold">Car</th>
                  <th className="py-2 pr-3 font-semibold text-right">Penalties</th>
                  <th className="py-2 pr-3 font-semibold text-right">Total</th>
                  <th className="py-2 pr-3 font-semibold text-right">Paid</th>
                  <th className="py-2 font-semibold text-right">Unpaid</th>
                </tr>
              </thead>
              <tbody>
                {customers.rows.map((r) => (
                  <tr key={`${r.userID}|${r.carID}`} className="border-b border-gray-50">
                    <td className="py-2.5 pr-3 font-semibold text-gray-800">{r.customer}</td>
                    <td className="py-2.5 pr-3 text-gray-600">{r.car}</td>
                    <td className="py-2.5 pr-3 text-right">{r.penalties}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold">{fmt(r.total)}</td>
                    <td className="py-2.5 pr-3 text-right text-green-700">{fmt(r.paid)}</td>
                    <td className={`py-2.5 text-right font-semibold ${r.pending > 0 ? "text-red-500" : "text-gray-400"}`}>{fmt(r.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={customers.page <= 1 || loading}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            ‹ Prev
          </button>
          <span className="text-xs text-gray-400">Page {customers.page} of {customers.totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(customers.totalPages, p + 1))} disabled={customers.page >= customers.totalPages || loading}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            Next ›
          </button>
        </div>
      </ReportSection>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm" style={{ background: color }} /> {label}
    </span>
  );
}

// Same pill style as the tab bar in Reports.jsx.
function Toggle({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 w-fit">
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            value === o.key ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}