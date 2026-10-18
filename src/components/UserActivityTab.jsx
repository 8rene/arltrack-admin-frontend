import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ROLES } from "../config/pagePermissions";

// Activity tab inside Users > (Driver | Supervisor) > View Details. Read-only.
//   Driver     -> current trips + history of completed trips (GET /api/driver-dispatch/drivers/:id/activity)
//   Supervisor / Admin -> their own audit-log entries      (GET /api/audit-logs/by-user/:id)
//   Customer   -> recent feed: booked, completed, cancelled, paid, refunded, penalties (GET /api/users/:id/activity)
// Deliberately small: no stats, no filters. Anything report-like belongs on the Reports page.

const PAGE_SIZE = 10;

const fmtDT = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

async function apiGet(path) {
  const res = await fetch(`${process.env.REACT_APP_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json.data;
}

const ACTION_STYLE = {
  create: "bg-green-50 border-green-200 text-green-700",
  update: "bg-blue-50 border-blue-200 text-blue-700",
  delete: "bg-red-50 border-red-200 text-red-700",
  export: "bg-yellow-50 border-yellow-200 text-yellow-700",
  system: "bg-purple-50 border-purple-200 text-purple-700",
  auth:   "bg-gray-50 border-gray-200 text-gray-600",
};

const EVENT_STYLE = {
  booked:         "bg-blue-50 border-blue-200 text-blue-700",
  completed:      "bg-green-50 border-green-200 text-green-700",
  cancelled:      "bg-red-50 border-red-200 text-red-700",
  cancel_request: "bg-yellow-50 border-yellow-200 text-yellow-700",
  paid:           "bg-teal-50 border-teal-200 text-teal-700",
  refunded:       "bg-purple-50 border-purple-200 text-purple-700",
  penalty:        "bg-orange-50 border-orange-200 text-orange-700",
};
const EVENT_LABEL = {
  booked: "Booked", completed: "Completed", cancelled: "Cancelled", cancel_request: "Cancel request",
  paid: "Payment", refunded: "Refund", penalty: "Penalty",
};

const TRIP_STYLE = {
  ongoing:   "bg-green-50 border-green-200 text-green-700",
  upcoming:  "bg-yellow-50 border-yellow-200 text-yellow-700",
  completed: "bg-gray-50 border-gray-200 text-gray-600",
};

const Pill = ({ className, children }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-medium capitalize ${className}`}>{children}</span>
);

function Card({ title, count, aside, children }) {
  return (
    <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {title}{count !== undefined && <span className="ml-1.5 text-gray-400 normal-case font-medium">({count})</span>}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Pager({ page, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const btn = "px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t bg-gray-50/50">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</button>
      <span className="text-xs text-gray-400">Page {page} of {pages}</span>
      <button type="button" className={btn} disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}

const Empty = ({ children }) => <p className="px-4 py-6 text-center text-sm text-gray-400">{children}</p>;

function TripRow({ trip, history, onOpen }) {
  const end = history ? (trip.completedAt || trip.endDateTime) : trip.endDateTime;
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Pill className={TRIP_STYLE[String(trip.status).toLowerCase()] || TRIP_STYLE.completed}>{trip.status}</Pill>
          {trip.archived && <Pill className="bg-gray-50 border-gray-200 text-gray-500">Archived</Pill>}
          <span className="text-sm font-semibold text-gray-800 truncate">{trip.vehicleName} · {trip.customerName}</span>
        </div>
        <p className="text-xs text-gray-500">
          {fmtDT(trip.startDateTime)} → {fmtDT(end)}{history && trip.completedAt ? " (returned)" : ""}
        </p>
        {trip.location && trip.location !== "—" && <p className="text-xs text-gray-400 truncate">{trip.location}</p>}
      </div>
      {/* An archived trip has no live booking to open. */}
      {!trip.archived && (
        <button type="button" onClick={() => onOpen(trip.id)}
          className="shrink-0 text-[11px] font-semibold text-gray-700 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50">
          View Booking
        </button>
      )}
    </li>
  );
}

function DriverActivity({ user }) {
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setData(await apiGet(`/api/driver-dispatch/drivers/${encodeURIComponent(user.id)}/activity`));
      setPage(1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Loading…</p>;
  if (error) return (
    <div className="text-center py-8 space-y-2">
      <p className="text-sm text-red-600">{error}</p>
      <button type="button" onClick={load} className="text-xs font-semibold text-teal-700 hover:underline">Try again</button>
    </div>
  );

  const openBooking = (id) => navigate(`/bookings?open=${encodeURIComponent(id)}`);
  const history = data?.history || [];
  const current = data?.current || [];
  const start = (page - 1) * PAGE_SIZE;

  return (
    <>
      <Card title="Current Trips" count={current.length}>
        {current.length === 0
          ? <Empty>No upcoming or ongoing trips.</Empty>
          : <ul className="divide-y">{current.map((t) => <TripRow key={t.id} trip={t} onOpen={openBooking} />)}</ul>}
      </Card>
      <Card title="Trip History" count={history.length}>
        {history.length === 0
          ? <Empty>No completed trips yet.</Empty>
          : <ul className="divide-y">{history.slice(start, start + PAGE_SIZE).map((t) => <TripRow key={t.id} trip={t} history onOpen={openBooking} />)}</ul>}
        <Pager page={page} total={history.length} onChange={setPage} />
      </Card>
    </>
  );
}

function StaffActivity({ user, kind, viewerRole }) {
  const navigate = useNavigate();
  const [logs, setLogs]       = useState([]);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setLogs(await apiGet(`/api/audit-logs/by-user/${encodeURIComponent(user.id)}?limit=100`));
      setPage(1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Loading…</p>;
  if (error) return (
    <div className="text-center py-8 space-y-2">
      <p className="text-sm text-red-600">{error}</p>
      <button type="button" onClick={load} className="text-xs font-semibold text-teal-700 hover:underline">Try again</button>
    </div>
  );

  const start = (page - 1) * PAGE_SIZE;
  // The full Audit Log page is Admin-only (pagePermissions "/audit-log"), so an Owner gets no link to it.
  const viewAll = viewerRole === ROLES.ADMIN && (
    <button type="button" onClick={() => navigate("/audit-log")} className="text-[11px] font-semibold text-teal-700 hover:underline">
      View all in Audit Log
    </button>
  );

  return (
    <Card title="Recent Actions" count={logs.length} aside={viewAll}>
      {logs.length === 0
        ? <Empty>No recorded actions for this {kind.toLowerCase()} yet.</Empty>
        : (
          <ul className="divide-y">
            {logs.slice(start, start + PAGE_SIZE).map((log) => (
              <li key={log.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Pill className={ACTION_STYLE[String(log.action).toLowerCase()] || ACTION_STYLE.auth}>{log.action}</Pill>
                    <span className="text-xs text-gray-400">{fmtDT(log.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 break-words">{log.description}</p>
                </div>
                {log.bookingID && (
                  <button type="button" onClick={() => navigate(`/bookings?open=${encodeURIComponent(log.bookingID)}`)}
                    className="shrink-0 text-[11px] font-semibold text-gray-700 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50">
                    View Booking
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      <Pager page={page} total={logs.length} onChange={setPage} />
    </Card>
  );
}

function CustomerActivity({ user }) {
  const navigate = useNavigate();
  const [events, setEvents]   = useState([]);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setEvents(await apiGet(`/api/users/${encodeURIComponent(user.id)}/activity`));
      setPage(1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Loading…</p>;
  if (error) return (
    <div className="text-center py-8 space-y-2">
      <p className="text-sm text-red-600">{error}</p>
      <button type="button" onClick={load} className="text-xs font-semibold text-teal-700 hover:underline">Try again</button>
    </div>
  );

  const start = (page - 1) * PAGE_SIZE;
  return (
    <Card title="Recent Activity" count={events.length}>
      {events.length === 0
        ? <Empty>No activity yet.</Empty>
        : (
          <ul className="divide-y">
            {events.slice(start, start + PAGE_SIZE).map((ev, i) => (
              <li key={`${ev.type}-${ev.at}-${i}`} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Pill className={EVENT_STYLE[ev.type] || ACTION_STYLE.auth}>{EVENT_LABEL[ev.type] || ev.type}</Pill>
                    <span className="text-xs text-gray-400">{fmtDT(ev.at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 break-words">{ev.text}</p>
                </div>
                {ev.bookingID && (
                  <button type="button" onClick={() => navigate(`/bookings?open=${encodeURIComponent(ev.bookingID)}`)}
                    className="shrink-0 text-[11px] font-semibold text-gray-700 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50">
                    View Booking
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      <Pager page={page} total={events.length} onChange={setPage} />
    </Card>
  );
}

export default function UserActivityTab({ user, kind, viewerRole }) {
  if (kind === "Driver") return <DriverActivity user={user} />;
  if (kind === "Supervisor" || kind === "Admin") return <StaffActivity user={user} kind={kind} viewerRole={viewerRole} />;
  if (kind === "Customer") return <CustomerActivity user={user} />;
  return null;
}