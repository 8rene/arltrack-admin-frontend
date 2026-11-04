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

// { ms, text, open }. Finished trips: start -> end. A trip with no end (stolen / still going) counts up to now and is marked open.
function tripDuration(item) {
  const a = toDateObj(item.startedAt);
  if (!a) return null;
  const b = toDateObj(item.endedAt);
  const end = b || new Date();
  if (end < a) return null;
  const ms = end - a;
  const mins = Math.floor(ms / 60000);
  let text;
  if (mins < 60) text = `${mins} min`;
  else {
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h < 24) text = m ? `${h}h ${m}m` : `${h}h`;
    else { const d = Math.floor(h / 24), rh = h % 24; text = rh ? `${d}d ${rh}h` : `${d}d`; }
  }
  return { ms, text, open: !b };
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

  function handleSort(key) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

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
                <p className="font-bold text-gray-800 text-sm truncate min-w-0">{car.name}</p>
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                    <tr>
                      <SortableTh label="Start" sortKey="start" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="End" sortKey="end" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Recorded Points" sortKey="points" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Duration" sortKey="duration" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                      <th className="pl-4 pr-8 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-t">
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      rows.map(item => {
                        const dur    = tripDuration(item);
                        const stolen = item.status === "stolen";
                        const status = displayStatus(item.status);
                        return (
                          <tr
                            key={item.bookingSessionID}
                            className={`border-t hover:bg-gray-50 transition-colors ${stolen ? "bg-red-50/60 border-l-4 border-l-red-500" : ""}`}
                          >
                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDateTime(item.startedAt)}</td>
                            <td className="px-4 py-3 whitespace-nowrap" title={item.droppedOffAt ? `Dropped off ${fmtDateTime(item.droppedOffAt)}` : undefined}>
                              {item.endedAt ? (
                                <span className="text-gray-700">{fmtDateTime(item.endedAt)}</span>
                              ) : stolen ? (
                                <>
                                  <span className="text-gray-400 italic">Not recovered</span>
                                  {item.stolenAt && <p className="text-[11px] font-semibold text-red-600 mt-0.5">Flagged {fmtDateTime(item.stolenAt)}</p>}
                                </>
                              ) : (
                                <span className="text-gray-400">{item.status === "ended" ? "—" : "Ongoing"}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {typeof item.pointCount !== "number" ? (
                                <span className="text-gray-400">—</span>
                              ) : item.pointCount === 0 ? (
                                <span className="font-semibold text-amber-600">No GPS points</span>
                              ) : (
                                <span className="font-semibold text-gray-700">{item.pointCount.toLocaleString()}</span>
                              )}
                              <p className="text-[11px] text-gray-400 mt-0.5">Archived {fmtDateTime(item.lastArchivedAt)}</p>
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {dur ? <>{dur.text}{dur.open && <span className="text-xs text-gray-400 ml-1">so far</span>}</> : "—"}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={status} /></td>
                            <td className="pl-4 pr-8 py-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  onClick={() => handleFlush(item)}
                                  disabled={!!flushingId || reviewLoading}
                                  title="Save this trip's latest GPS points to its archive now, instead of waiting for midnight"
                                  className="px-3 py-1 rounded-lg text-xs font-semibold text-teal-700 border border-teal-300 hover:bg-teal-50 transition-colors disabled:opacity-50"
                                >
                                  {flushingId === item.bookingSessionID ? "Saving…" : "Flush"}
                                </button>
                                <button
                                  onClick={() => handleReview(item)}
                                  disabled={reviewLoading || !!flushingId}
                                  className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
                                >
                                  {reviewLoading ? "…" : "Review"}
                                </button>
                              </div>
                              {flushNote?.id === item.bookingSessionID && (
                                <p className={`text-[11px] font-medium mt-1 ${flushNote.ok ? "text-teal-600" : "text-red-500"}`}>{flushNote.msg}</p>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}