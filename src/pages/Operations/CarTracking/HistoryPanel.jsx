import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import TracebackPanel from "./TracebackPanel";

const API = process.env.REACT_APP_API_URL;

function fmtDateTime(val) {
  if (!val) return "—";
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

function toDateObj(val) {
  if (!val) return null;
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

// 95 minutes -> "1h 35m", 40 hours -> "1d 16h".
function fmtSpan(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

// Date and time as separate pieces, like the Bookings table ("Oct 26, 2026 | 12:39 PM").
const fmtDate = (val) => { const d = toDateObj(val); return d ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"; };
const fmtTime = (val) => { const d = toDateObj(val); return d ? d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "—"; };
function DateTime({ value }) {
  if (!toDateObj(value)) return <span className="text-gray-300">—</span>;
  return (
    <>
      <span className="text-gray-700">{fmtDate(value)}</span>
      <span className="mx-1.5 text-gray-300">|</span>
      <span className="text-gray-500">{fmtTime(value)}</span>
    </>
  );
}

// { ms, text, open }. Finished trips: start -> end. A trip with no end (stolen / still going) counts up to now and is marked open.
function tripDuration(item) {
  const a = toDateObj(item.startedAt);
  if (!a) return null;
  const b = toDateObj(item.endedAt);
  // A stolen trip has no end time, so it stops at the moment it was flagged stolen (a fixed record, not a growing number).
  const stolenAt = item.status === "stolen" ? toDateObj(item.stolenAt) : null;
  const end = b || stolenAt || new Date();
  if (end < a) return null;
  const ms = end - a;
  const text = fmtSpan(ms);
  return { ms, text, open: !b && !stolenAt };
}

// Same wording as the Bookings table: a finished trip reads "completed", a live one "ongoing".
const DISPLAY_STATUS = { ended: "completed", active: "ongoing", stolen: "stolen", cancelled: "cancelled" };
const displayStatus = (st) => DISPLAY_STATUS[st] || st || "";

// StatusBadge: same look as Bookings.jsx / Dashboard.jsx.
const STATUS_DOT = {
  ongoing:   "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
  stolen:    "bg-red-700",
};
const STATUS_BG = {
  ongoing:   "bg-blue-50 border border-blue-200",
  completed: "bg-green-50 border border-green-200",
  cancelled: "bg-red-50 border border-red-200",
  stolen:    "bg-red-100 border border-red-300",
};
function StatusBadge({ status }) {
  const s = (status || "").toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${STATUS_BG[s] || "bg-gray-50 border border-gray-200"}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s] || "bg-gray-400"}`} />
      {status || "—"}
    </span>
  );
}

// Sortable header: same look as Bookings.jsx.
const IconChevronsUpDown = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconSortArrow = ({ dir }) => (
  <svg className={`w-3.5 h-3.5 transition-transform ${dir === "desc" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
function SortableTh({ label, sortKey, activeKey, dir, onSort }) {
  const active = activeKey === sortKey;
  return (
    <th className="px-4 py-3 text-left select-none">
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={dir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

const PAGE_SIZE = 10;

// Same as Bookings.jsx.
function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);   // clamp if the list shrinks
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { page: safePage, setPage, totalPages, pageItems, start, count: items.length };
}

function Pagination({ page, totalPages, onChange, start, pageSize, count }) {
  if (count === 0) return null;
  const nums = [1];
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) nums.push(n);
  if (totalPages > 1) nums.push(totalPages);
  const dedup = [...new Set(nums)].sort((a, b) => a - b);
  const rangeEnd = Math.min(start + pageSize, count);
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50/50">
      <p className="text-xs text-gray-400">Showing {start + 1}–{rangeEnd} of {count}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Prev
        </button>
        {dedup.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - dedup[i - 1] > 1 && <span className="px-1.5 text-gray-300 text-xs">…</span>}
            <button onClick={() => onChange(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${n === page ? "bg-arl-primary text-white shadow" : "border text-gray-600 hover:bg-white"}`}>
              {n}
            </button>
          </span>
        ))}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Next
        </button>
      </div>
    </div>
  );
}

// Card + label-over-value cell, same look as the Bookings view window.
function InfoSection({ title, aside, children, cols = 2 }) {
  return (
    <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
        {aside}
      </div>
      <div className={`p-4 grid ${cols === 3 ? "grid-cols-3" : "grid-cols-2"} gap-x-6 gap-y-4`}>{children}</div>
    </section>
  );
}
function InfoField({ label, value, wide }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className="text-sm font-medium text-gray-800 mt-0.5 break-words">{value || "—"}</div>
    </div>
  );
}

// "View" window: everything about the archive itself, kept out of the table so the rows stay light.
function TripDetailsModal({ item, onClose, onFlush, onReview, flushing, busy, note }) {
  const status = displayStatus(item.status);
  const dur = tripDuration(item);
  const stolen = item.status === "stolen";
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-3 shrink-0">
          <h2 className="font-bold text-lg text-gray-800">Trip Details</h2>
        </div>

        <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1">
        <InfoSection title="Trip Information">
          <InfoField label="Start" value={<DateTime value={item.startedAt} />} />
          <InfoField
            label="End"
            value={item.endedAt ? <DateTime value={item.endedAt} />
              : stolen ? null
              : item.status === "ended" ? null : "Ongoing"}
          />
          <InfoField label="Duration" value={dur ? dur.text : null} />
          <InfoField label="Status" value={<StatusBadge status={status} />} />
        </InfoSection>

        <InfoSection title="Archive Information">
          <InfoField
            label="Recorded Points"
            value={typeof item.pointCount !== "number" ? null
              : item.pointCount === 0 ? <span className="text-amber-600">No GPS points</span>
              : item.pointCount.toLocaleString()}
          />
          <InfoField label="Last Archived" value={<DateTime value={item.lastArchivedAt} />} />
          {item.droppedOffAt && <InfoField label="Dropped Off" value={<DateTime value={item.droppedOffAt} />} />}
          {item.stolenAt && <InfoField label="Flagged Stolen" value={<DateTime value={item.stolenAt} />} />}
        </InfoSection>

        {note && (
          <p className={`text-xs font-medium ${note.ok ? "text-teal-600" : "text-red-500"}`}>{note.msg}</p>
        )}

        </div>

        {/* Actions: fixed at the bottom, same layout as the booking details window. */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex flex-col gap-1.5">
          <button
            onClick={onReview}
            disabled={flushing || busy}
            className="w-full px-3 py-2 rounded-xl text-sm font-semibold bg-arl-primary text-white hover:bg-[#16526a] transition-colors disabled:opacity-50"
          >
            {busy ? "…" : "Review"}
          </button>
          {/* Only a trip that is still active can receive new GPS points. Completed and stolen trips were saved for the
              last time when they changed status, so a Flush there would only rewrite the same file. */}
          {item.status === "active" && (
            <button
              onClick={onFlush}
              disabled={flushing || busy}
              title="Save this trip's latest GPS points to its archive now, instead of waiting for midnight"
              className="w-full px-3 py-2 rounded-xl text-sm font-semibold border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors disabled:opacity-50"
            >
              {flushing ? "Saving…" : "Flush now"}
            </button>
          )}
          <button onClick={onClose} className="w-full py-2 rounded-xl text-sm border text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

// Session info for a trip being reviewed. A FINISHED trip (ended / stolen) has a final file -- the last save is made
// when it ends, and the nightly job retries it if that save failed -- so the file is the record and the trip list
// only fills what an older file lacks. A trip still going has a file up to a day old, so there the list is fresher.
function mergeSessionMeta(fileSession, listFields) {
  const strip = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null));
  const fromFile = strip(fileSession);
  const fromList = strip(listFields);
  const finished = fromFile.status === "ended" || fromFile.status === "stolen";
  return finished ? { ...fromList, ...fromFile } : { ...fromFile, ...fromList };
}

// Fallback when a car has no photo (HistoryPanel has no icon set of its own).
const CarGlyph = ({ style }) => (
  <svg style={style} className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 16V11l2-5h10l2 5v5" />
    <path d="M3 16h18v3H3z" />
    <circle cx="7.5" cy="16" r="0.5" />
    <circle cx="16.5" cy="16" r="0.5" />
  </svg>
);

/**
 * Car Tracking's History tab. Left column: pick a car. Right column: every
 * archived (Firebase-Storage-flushed) trip for that car, newest first, with
 * a "No GPS record" fallback when the list comes back empty. "Review" loads
 * that trip's archive JSON and hands it to the Review tab (onOpenReview). Without that callback it falls back to
 * showing the review in place.
 */
export default function HistoryPanel({ cars, token, refreshTick = 0, autoOpen = null, onOpenReview = null }) {
  const [selectedCar, setSelectedCar] = useState(null);
  const [history, setHistory]         = useState([]);
  // Which car the current `history` list belongs to. The auto-open below must wait for this, otherwise it runs in the
  // same render that selects the car (before the fetch has even started), sees an empty list and gives up.
  const [loadedCarID, setLoadedCarID] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [reviewData, setReviewData]   = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [deepLinkNotice, setDeepLinkNotice] = useState(null);
  const [flushingId, setFlushingId] = useState(null); // trip being saved right now by the manual flush
  const [flushNote, setFlushNote]   = useState(null); // { id, ok, msg } -- result of the last manual flush
  const [sortKey, setSortKey] = useState("start");
  const [sortDir, setSortDir] = useState("desc");   // newest first, like before
  // { [carID]: number of past trips } — shown as a badge on each car card (same look as the Reviews car list).
  const [tripCounts, setTripCounts] = useState({});
  useEffect(() => {
    if (!API || !token || !cars.length) return undefined;
    let cancelled = false;
    Promise.all(cars.map(async (c) => {
      try {
        const res = await fetch(`${API}/api/gps/${c.id}/history`, { headers: { Authorization: `Bearer ${token}` } });
        if (!(res.headers.get("content-type") || "").includes("application/json")) return null;
        const json = await res.json();
        return res.ok ? [c.id, (json.data || []).length] : null;
      } catch { return null; }
    })).then((entries) => {
      if (!cancelled) setTripCounts(Object.fromEntries(entries.filter(Boolean)));
    });
    return () => { cancelled = true; };
  }, [cars, token, refreshTick]);

  function handleSort(key) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const [detailId, setDetailId] = useState(null);   // trip whose "View" window is open

  const rows = useMemo(() => {
    const val = (h) => {
      switch (sortKey) {
        case "end":      return toDateObj(h.endedAt)?.getTime() ?? Infinity;   // open trips count as "latest"
        case "points":   return typeof h.pointCount === "number" ? h.pointCount : -1;
        case "duration": return tripDuration(h)?.ms ?? -1;
        case "status":   return displayStatus(h.status);
        default:         return toDateObj(h.startedAt)?.getTime() ?? 0;
      }
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...history].sort((x, y) => {
      const a = val(x), b = val(y);
      return a < b ? -dir : a > b ? dir : 0;
    });
  }, [history, sortKey, sortDir]);

  const { page, setPage, totalPages, pageItems, start, count } = usePagination(rows);
  useEffect(() => { setPage(1); setDetailId(null); }, [selectedCar, setPage]);   // new car: back to page 1
  const detailItem = detailId ? history.find(h => h.bookingSessionID === detailId) : null;

  // Deep-link from Bookings' "Trip History" button: select the car once —
  // guarded so it doesn't fight the user if they click a different car
  // afterward (only runs while nothing else is selected yet).
  useEffect(() => {
    if (autoOpen?.carID && !selectedCar) {
      setSelectedCar(autoOpen.carID);
    }
  }, [autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoOpenedRef = useRef(false);
  // Once that car's history has actually loaded, auto-open the matching
  // trip's Review — one-shot only, so switching tabs away and back doesn't
  // keep re-opening the same trip.
  useEffect(() => {
    if (!autoOpen?.bookingID || autoOpenedRef.current) return;
    if (loading || selectedCar !== autoOpen.carID || loadedCarID !== autoOpen.carID) return;
    autoOpenedRef.current = true;
    const match = history.find(h => h.bookingID === autoOpen.bookingID);
    if (match) {
      handleReview(match);
    } else {
      setDeepLinkNotice("Couldn't find that trip's archived record for this car.");
    }
  }, [history, loading, selectedCar, loadedCarID, autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchHistory = useCallback(async (carId) => {
    setLoading(true);
    setError(null);
    setLoadedCarID(null);
    if (!API) {
      setError("REACT_APP_API_URL is not set — check your .env and restart the dev server.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/api/gps/${carId}/history`, { headers: { Authorization: `Bearer ${token}` } });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Backend returned ${res.status} (non-JSON) — is REACT_APP_API_URL correct and is the backend deployed with the history route?`);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load history.");
      setHistory(json.data || []);
    } catch (e) {
      setError(e.message);
      setHistory([]);
    } finally {
      setLoading(false);
      setLoadedCarID(carId);   // last, so the auto-open only ever sees a finished list
    }
  }, [token]);

  useEffect(() => {
    if (selectedCar) fetchHistory(selectedCar);
  }, [selectedCar, fetchHistory, refreshTick]);

  // Manual flush: save this trip's latest GPS points to its archive file now (the nightly job does the same at
  // midnight), then reload the list so the new "Archived" time and point count show.
  async function handleFlush(item) {
    setFlushingId(item.bookingSessionID);
    setFlushNote(null);
    try {
      const res = await fetch(`${API}/api/gps/sessions/${item.bookingSessionID}/flush`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== "ok") throw new Error(json.message || "Couldn't save this trip's data right now.");
      const n = json.data?.pointCount;
      setFlushNote({ id: item.bookingSessionID, ok: true, msg: typeof n === "number" ? `Saved — ${n.toLocaleString()} points` : "Saved" });
      await fetchHistory(selectedCar);
    } catch (e) {
      setFlushNote({ id: item.bookingSessionID, ok: false, msg: e.message });
    } finally {
      setFlushingId(null);
    }
  }

  async function handleReview(item) {
    const car = cars.find(c => c.id === selectedCar);
    setReviewLoading(true);
    try {
      if (!item.archiveUrl) throw new Error("This trip hasn't been archived yet — check back once it's finished.");
      let res;
      try {
        res = await fetch(item.archiveUrl);
      } catch (networkErr) {
        // A thrown TypeError here (the browser's generic "Failed to fetch")
        // means the request never got a response at all — almost always the
        // Storage bucket blocking cross-origin reads (no CORS config for
        // this frontend's origin), not a "file isn't ready" situation, since
        // getCarHistory only ever returns sessions that already have an
        // archiveUrl. Surface that instead of the opaque browser message.
        throw new Error("Couldn't reach the archive file (likely a CORS/network issue on the storage bucket) — this isn't about the trip not being ready. Try again, or check the bucket's CORS settings.");
      }
      if (!res.ok) throw new Error(`Could not load this trip's archive file (server returned ${res.status}).`);
      const parsed = await res.json();
      // New archives are { points, geofenceZones, geofenceAlerts, codingAlerts };
      // older archives already sitting in Storage are still a bare array of
      // { lat, lng, at } with no zone/alert data — handle both.
      const isLegacyArray = Array.isArray(parsed);
      const points = isLegacyArray ? parsed : (parsed.points || []);
      const meta = mergeSessionMeta(isLegacyArray ? null : parsed.session, {
        bookingSessionID: item.bookingSessionID,
        bookingID:        item.bookingID,
        status:           item.status,
        startedAt:        item.startedAt,
        endedAt:          item.endedAt,
      });
      const data = {
        label: `${car?.name || selectedCar} · ${fmtDateTime(meta.startedAt)} → ${meta.endedAt ? fmtDateTime(meta.endedAt) : meta.status === "ended" ? "—" : "ongoing"}`,
        cars: [{ id: selectedCar, name: car?.name || selectedCar, imageURL: car?.imageURL || null }],
        records: { [selectedCar]: points },
        zonesAlerts: isLegacyArray ? undefined : {
          [selectedCar]: {
            geofenceZones:  parsed.geofenceZones  || [],
            geofenceAlerts: parsed.geofenceAlerts || [],
            codingAlerts:   parsed.codingAlerts   || [],
            codingWarnings: parsed.codingWarnings || [],
            // Review details saved with newer history files; older files
            // simply don't have them (null / empty -> "not recorded").
            droppedOffAt:   parsed.droppedOffAt || parsed.session?.droppedOffAt || null,
            completedAt:    parsed.completedAt  || parsed.session?.completedAt  || null,
            stolenAt:       parsed.session?.stolenAt || null,
            holidays:       parsed.holidays     || [],
            // Trip-level plate (masked) if the file has one; Trip Summary otherwise falls back to the
            // plate stamped on the coding alerts.
            plate:          parsed.session?.plate || parsed.plate || null,
          },
        },
        // See mergeSessionMeta: the file is the record for a finished trip; the list only fills gaps.
        sessionMeta: { [selectedCar]: meta },
      };
      if (onOpenReview) onOpenReview(data);   // the Review tab shows it
      else setReviewData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setReviewLoading(false);
    }
  }

  // ── Review mode: hand off entirely to TracebackPanel ─────────────────────
  if (reviewData) {
    return <TracebackPanel cars={cars} token={token} reviewData={reviewData} onExitReview={() => setReviewData(null)} />;
  }

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* ── Sidebar: car list ──────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col gap-2 overflow-y-auto scrollbar-hide">
        {cars.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6 text-center">
            <p className="text-sm text-gray-500 font-semibold">No cars in database</p>
          </div>
        ) : (
          cars.map(car => (
            <button
              key={car.id}
              onClick={() => setSelectedCar(car.id)}
              className={`text-left bg-white rounded-2xl border-2 shadow-soft p-3 transition-all ${
                selectedCar === car.id ? "border-teal-500 ring-1 ring-teal-200" : "border-gray-100 hover:border-teal-300"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Same car photo as the Live list; falls back to a car glyph when there is none or it fails to load. */}
                <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-400 flex items-center justify-center shrink-0 overflow-hidden">
                  {car.imageURL ? (
                    <img
                      src={car.imageURL}
                      alt={car.name}
                      className="w-full h-full object-cover"
                      onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling.style.display = "block"; }}
                    />
                  ) : null}
                  <CarGlyph style={car.imageURL ? { display: "none" } : undefined} />
                </div>
                <p className="font-bold text-gray-800 text-sm truncate min-w-0 flex-1">{car.name}</p>
                {(() => {
                  // the open car's list is the freshest number; the rest come from the up-front count
                  const n = loadedCarID === car.id ? history.length : tripCounts[car.id];
                  return n > 0 ? (
                    <span
                      className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold"
                      title={`${n} trip${n !== 1 ? "s" : ""}`}
                    >
                      {n}
                    </span>
                  ) : null;
                })()}
              </div>
            </button>
          ))
        )}
      </div>

      {/* ── History list for the selected car ────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {!selectedCar ? (
          <div className="flex-1 flex items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-soft">
            <p className="text-sm text-gray-400">Select a car to see its trip history.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 shadow-soft overflow-y-auto scrollbar-hide">
            <p className="font-bold text-arl-dark text-sm px-4 pt-4 pb-3">
              {cars.find(c => c.id === selectedCar)?.name} — Trip History
            </p>

            {deepLinkNotice && (
              <div className="mx-4 mb-3 bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                {deepLinkNotice}
              </div>
            )}

            {error ? (
              <p className="text-xs text-red-500 px-4 pb-4">{error}</p>
            ) : !loading && history.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm font-semibold text-gray-400 italic">No GPS record</p>
                <p className="text-xs text-gray-300 mt-1">This car has no archived trips yet.</p>
              </div>
            ) : (
              <div className="mx-4 mb-4 rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                    <tr>
                      <SortableTh label="Start" sortKey="start" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="End" sortKey="end" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Duration" sortKey="duration" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <th className="pl-4 pr-8 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-t">
                          {Array.from({ length: 5 }).map((__, j) => (
                            <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      pageItems.map(item => {
                        const dur    = tripDuration(item);
                        const stolen = item.status === "stolen";
                        const status = displayStatus(item.status);
                        return (
                          <tr
                            key={item.bookingSessionID}
                            className={`border-t hover:bg-gray-50 transition-colors ${stolen ? "bg-red-50/60 border-l-4 border-l-red-500" : ""}`}
                          >
                            <td className="px-4 py-3 whitespace-nowrap"><DateTime value={item.startedAt} /></td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {item.endedAt ? <DateTime value={item.endedAt} />
                                : stolen ? <span className="text-gray-400">—</span>
                                : <span className="text-gray-400">{item.status === "ended" ? "—" : "Ongoing"}</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {dur ? dur.text : "—"}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={status} /></td>
                            <td className="pl-4 pr-8 py-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  onClick={() => { setFlushNote(null); setDetailId(item.bookingSessionID); }}
                                  title="View archive details"
                                  className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-arl-primary text-white hover:bg-[#16526a] transition-colors"
                                >
                                  View
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                    {/* Same as Bookings: pad a short page with empty rows so the table always keeps its 10-row height. */}
                    {!loading && pageItems.length > 0 && Array.from({ length: Math.max(0, PAGE_SIZE - pageItems.length) }).map((_, i) => (
                      <tr key={`filler-${i}`} aria-hidden="true" className="border-t">
                        <td colSpan={5} className="h-[53px]">&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
              </div>
            )}
          </div>
        )}
      </div>

      {detailItem && (
        <TripDetailsModal
          item={detailItem}
          onClose={() => setDetailId(null)}
          onFlush={() => handleFlush(detailItem)}
          onReview={() => { setDetailId(null); handleReview(detailItem); }}
          flushing={flushingId === detailItem.bookingSessionID}
          busy={reviewLoading}
          note={flushNote?.id === detailItem.bookingSessionID ? flushNote : null}
        />
      )}
    </div>
  );
}