import React from "react";

// ─── DATA ────────────────────────────────────────────────────────────────────

const STATS = [
  {
    icon: "📋",
    value: "24",
    label: "TOTAL BOOKINGS",
    delta: "↑ 12%",
    deltaNote: "vs last month",
    accentColor: "border-arl-primary",
  },
  {
    icon: "💰",
    value: "₱87,400",
    label: "TOTAL REVENUE",
    delta: "↑ 8%",
    deltaNote: "vs last month",
    accentColor: "border-arl-primary",
  },
  {
    icon: "🚗",
    value: "4 / 6",
    label: "VEHICLES ACTIVE",
    delta: "↑ 1",
    deltaNote: "from yesterday",
    accentColor: "border-arl-primary",
  },
  {
    icon: "⏳",
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

const FLEET = [
  { name: "L300",     plate: "ABC 123", status: "Rented",      color: "bg-blue-100 text-blue-700",   icon: "🚐" },
  { name: "S.PRESSO", plate: "DEF 456", status: "Available",   color: "bg-green-100 text-green-700", icon: "🚗" },
  { name: "Avanza",   plate: "GHI 789", status: "Maintenance", color: "bg-red-100 text-red-700",     icon: "🚙" },
  { name: "EON",      plate: "JKL 012", status: "Available",   color: "bg-green-100 text-green-700", icon: "🚗" },
  { name: "Wigo",     plate: "MNO 345", status: "Reserved",    color: "bg-amber-100 text-amber-700", icon: "🚗" },
  { name: "Veloz",    plate: "PQR 678", status: "Rented",      color: "bg-blue-100 text-blue-700",   icon: "🚗" },
];

// ─── DONUT CHART ─────────────────────────────────────────────────────────────

function DonutChart({ segments }) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  const r = 60, cx = 80, cy = 80, strokeW = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      {segments.map((seg, i) => {
        const pct  = seg.count / total;
        const dash = pct * circ;
        const gap  = circ - dash;
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
      {/* inner white hole */}
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
          <span>⚠️</span>
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
            <div className="text-2xl mb-3">{s.icon}</div>
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
              <div className="font-display text-base font-bold text-arl-dark">
                Booking Activity
              </div>
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

          {/* Donut + Legend */}
          <div className="flex items-center gap-4 mb-5">
            <DonutChart segments={DONUT_SEGMENTS} />
            <div className="flex flex-col gap-2">
              {DONUT_SEGMENTS.map((seg, i) => (
                <div key={i} className="flex items-center gap-2 text-sm font-sans">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: seg.color }}
                  />
                  <span className="text-gray-600 flex-1">{seg.label}</span>
                  <span className="font-bold text-arl-dark">{seg.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Vehicle Grid */}
          <div className="grid grid-cols-2 gap-2">
            {FLEET.map((v, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-arl-light border border-gray-200"
              >
                <span className="text-lg">{v.icon}</span>
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