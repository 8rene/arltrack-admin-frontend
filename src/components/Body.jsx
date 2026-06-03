import React from "react";

// ─── DATA ────────────────────────────────────────────────────────────────────

const STATS = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
    ),
    value: "24",
    label: "TOTAL BOOKINGS",
    delta: "↑ 12%",
    deltaNote: "vs last month",
    accentColor: "border-arl-primary",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2 0-4 1-4 3s2 3 4 3 4 1 4 3-2 3-4 3m0-12v12" />
      </svg>
    ),
    value: "₱87,400",
    label: "TOTAL REVENUE",
    delta: "↑ 8%",
    deltaNote: "vs last month",
    accentColor: "border-arl-primary",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 13l2-5h14l2 5M5 13h14v5H5zM7 18h.01M17 18h.01" />
      </svg>
    ),
    value: "4 / 6",
    label: "VEHICLES ACTIVE",
    delta: "↑ 1",
    deltaNote: "from yesterday",
    accentColor: "border-arl-primary",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="9" strokeWidth="2" />
        <path strokeWidth="2" strokeLinecap="round" d="M12 7v5l3 3" />
      </svg>
    ),
    value: "5",
    label: "PENDING APPROVAL",
    delta: "↑ 3",
    deltaNote: "awaiting review",
    accentColor: "border-arl-cta",
  },
];

const WEEK_DATA = [
  { day: "Mon", a: 3, b: 2 },
  { day: "Tue", a: 5, b: 3 },
  { day: "Wed", a: 4, b: 4 },
  { day: "Thu", a: 7, b: 4 },
  { day: "Fri", a: 4, b: 3 },
  { day: "Sat", a: 6, b: 2 },
  { day: "Sun", a: 2, b: 3 },
];

const DONUT_SEGMENTS = [
  { label: "Available",   count: 2, color: "#16a34a" },
  { label: "Rented",      count: 2, color: "#2563eb" },
  { label: "Reserved",    count: 1, color: "#d97706" },
  { label: "Maintenance", count: 1, color: "#dc2626" },
];

// ─── VEHICLE ICONS ───────────────────────────────────────────────────────────

// Van / L300
const IconVan = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="1" y="9" width="16" height="9" rx="1.5" />
    <path d="M17 12l3.5 1.5V18H17" />
    <circle cx="5.5" cy="18.5" r="1.5" />
    <circle cx="13.5" cy="18.5" r="1.5" />
    <path d="M1 13h16M5 9V6a1 1 0 011-1h7l3 4" />
  </svg>
);

// Small hatchback — S.PRESSO, EON, Wigo
const IconHatchback = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 13h18v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3z" />
    <path d="M3 13l2.5-5h9l3.5 5" />
    <path d="M6 8.5l1-2.5h6l2 2.5" />
    <circle cx="6.5" cy="16.5" r="1.5" />
    <circle cx="17.5" cy="16.5" r="1.5" />
  </svg>
);

// MPV — Avanza, Veloz
const IconMPV = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 13h20v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3z" />
    <path d="M2 13l3-6h11l4 6" />
    <path d="M5 7l1.5-2h8l2 2" />
    <circle cx="6" cy="16.5" r="1.5" />
    <circle cx="18" cy="16.5" r="1.5" />
  </svg>
);

const FLEET = [
  { name: "L300",     plate: "ABC 123", status: "Rented",      color: "bg-blue-100 text-blue-700",   Icon: IconVan },
  { name: "S.PRESSO", plate: "DEF 456", status: "Available",   color: "bg-green-100 text-green-700", Icon: IconHatchback },
  { name: "Avanza",   plate: "GHI 789", status: "Maintenance", color: "bg-red-100 text-red-700",     Icon: IconMPV },
  { name: "EON",      plate: "JKL 012", status: "Available",   color: "bg-green-100 text-green-700", Icon: IconHatchback },
  { name: "Wigo",     plate: "MNO 345", status: "Reserved",    color: "bg-amber-100 text-amber-700", Icon: IconHatchback },
  { name: "Veloz",    plate: "PQR 678", status: "Rented",      color: "bg-blue-100 text-blue-700",   Icon: IconMPV },
];

// ─── ALERT ICON ──────────────────────────────────────────────────────────────

const IconWarning = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// ─── DONUT CHART ─────────────────────────────────────────────────────────────

function DonutChart({ segments }) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  const r = 60, cx = 80, cy = 80, strokeW = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      {segments.map((seg, i) => {
        const pct = seg.count / total;
        const dash = pct * circ;
        const gap = circ - dash;
        const rotate = offset * 360 - 90;
        offset += pct;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeW}
            strokeDasharray={`${dash} ${gap}`}
            transform={`rotate(${rotate} ${cx} ${cy})`}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r - strokeW / 2 - 2} fill="white" />
    </svg>
  );
}

// ─── BAR CHART ───────────────────────────────────────────────────────────────

function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.a + d.b));
  const H = 160;

  return (
    <div className="flex items-end gap-3" style={{ height: H + 28 }}>
      {data.map((d, i) => {
        const aH = (d.a / max) * H;
        const bH = (d.b / max) * H;
        return (
          <div key={i} className="flex flex-col items-center flex-1 gap-1">
            <div className="flex items-end gap-1" style={{ height: H }}>
              <div
                className="w-4 rounded-t-sm bg-arl-primary transition-all duration-500"
                style={{ height: aH }}
              />
              <div
                className="w-4 rounded-t-sm bg-arl-secondary/40 transition-all duration-500"
                style={{ height: bH }}
              />
            </div>
            <span className="text-[11px] text-gray-400 mt-1">{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function SBody() {
  return (
    <div className="flex-1 overflow-y-auto bg-arl-light p-7 space-y-6">

      {/* Maintenance Alert */}
      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-3 text-sm text-amber-800 font-sans">
          <IconWarning className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <span>
            <strong>2 vehicles</strong> are due for maintenance this week — L300 (Mar 30) and Avanza (Apr 1).
          </span>
        </div>
        <button className="text-sm font-semibold text-arl-primary hover:underline transition-all font-sans whitespace-nowrap">
          View schedule →
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-5">
        {STATS.map((s, i) => (
          <div
            key={i}
            className={`bg-white rounded-2xl p-5 border-t-4 ${s.accentColor} shadow-soft`}
          >
            <div className="text-arl-primary mb-3">{s.icon}</div>

            <div className="font-display text-3xl font-bold text-arl-dark leading-none">
              {s.value}
            </div>

            <div className="font-sans text-[11px] font-semibold text-gray-400 tracking-wide uppercase mt-2 mb-2">
              {s.label}
            </div>

            <div className="font-sans text-xs text-green-600">
              <span className="font-bold">{s.delta}</span>{" "}
              <span className="text-gray-400">{s.deltaNote}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-[1fr_380px] gap-5">

        {/* Booking Activity */}
        <div className="bg-white rounded-2xl p-6 shadow-soft">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="font-display text-base font-bold text-arl-dark">Booking Activity</div>
              <div className="font-sans text-xs text-gray-400 mt-0.5">Last 7 days</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 font-sans">
                <span className="w-2.5 h-2.5 rounded-sm bg-arl-primary inline-block" />
                Bookings
              </div>
              <button className="text-xs font-semibold text-arl-primary hover:underline font-sans">
                View all
              </button>
            </div>
          </div>
          <BarChart data={WEEK_DATA} />
        </div>

        {/* Fleet Status */}
        <div className="bg-white rounded-2xl p-6 shadow-soft">
          <div className="font-display text-base font-bold text-arl-dark">Fleet Status</div>
          <div className="font-sans text-xs text-gray-400 mt-0.5 mb-4">6 vehicles total</div>

          <div className="flex items-center gap-4 mb-5">
            <DonutChart segments={DONUT_SEGMENTS} />
            <div className="flex flex-col gap-2">
              {DONUT_SEGMENTS.map((seg, i) => (
                <div key={i} className="flex items-center gap-2 text-sm font-sans">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                  <span className="text-gray-600 flex-1">{seg.label}</span>
                  <span className="font-bold text-arl-dark">{seg.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {FLEET.map((v, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-arl-light border border-gray-200"
              >
                <v.Icon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-sans text-xs font-bold text-arl-dark truncate">{v.name}</div>
                  <div className="font-sans text-[10px] text-gray-400">{v.plate}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${v.color}`}>
                  {v.status}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}