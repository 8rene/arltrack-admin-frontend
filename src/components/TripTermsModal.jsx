import React, { useEffect, useState } from "react";

const API_URL = process.env.REACT_APP_API_URL;

const fmtWhen = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d)
    ? d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
};

// ── Tiny safe Markdown renderer (same subset the Terms page uses) ───────
// React elements only, never dangerouslySetInnerHTML.
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
const inline = (text, k) =>
  text.split(INLINE).map((part, i) => {
    if (!part) return null;
    let m;
    if ((m = part.match(/^\*\*([^*]+)\*\*$/))) return <strong key={`${k}-${i}`}>{m[1]}</strong>;
    if ((m = part.match(/^\*([^*]+)\*$/))) return <em key={`${k}-${i}`}>{m[1]}</em>;
    return <React.Fragment key={`${k}-${i}`}>{part}</React.Fragment>;
  });

const parseBlocks = (source) => {
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: "p", text: para.join(" ") }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  for (const raw of String(source || "").replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); blocks.push({ type: "hr" }); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); flushList(); blocks.push({ type: "h", level: m[1].length, text: m[2] }); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(m[1]); continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(m[1]); continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return blocks;
};

const HEADING = { 1: "text-base font-bold mt-3 mb-1.5", 2: "text-sm font-bold mt-3 mb-1", 3: "text-sm font-semibold mt-2 mb-1" };

function Markdown({ source }) {
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-gray-700">
      {parseBlocks(source).map((b, i) => {
        const k = `b${i}`;
        if (b.type === "h") return <p key={k} className={`${HEADING[b.level]} text-arl-dark`}>{inline(b.text, k)}</p>;
        if (b.type === "hr") return <hr key={k} className="my-2 opacity-30" />;
        if (b.type === "ul") return <ul key={k} className="list-disc pl-5 space-y-1">{b.items.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}</ul>;
        if (b.type === "ol") return <ol key={k} className="list-decimal pl-5 space-y-1">{b.items.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}</ol>;
        return <p key={k}>{inline(b.text, k)}</p>;
      })}
    </div>
  );
}

/**
 * The accepted-terms text for ONE of the driver's own trips
 * (GET /api/driver-dispatch/my-trips/:id/terms). Shows the version on the booking, not the current Terms.
 * Used inside the History "View" modal and by TripTermsModal below. Fetches when it mounts.
 */
export function TripTermsContent({ tripID, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tripID) return undefined;
    let cancelled = false;
    setData(null); setError(null); setLoading(true);
    fetch(`${API_URL}/api/driver-dispatch/my-trips/${tripID}/terms`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Couldn't load the terms.");
        if (!cancelled) setData(json.data);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tripID, token]);

  const accepted = fmtWhen(data?.acceptedAt);
  return (
    <div>
      {data?.available && (
        <p className="text-xs text-gray-500 mb-3">
          {data.version != null ? `Version ${Number(data.version).toFixed(2)}` : "Version not recorded"}
          {accepted ? ` · accepted ${accepted}` : ""}
        </p>
      )}
      {loading && <p className="text-xs text-gray-400 text-center py-6">Loading terms…</p>}
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      {data && !data.available && (
        <p className="text-sm text-gray-500 text-center py-6">No accepted terms were recorded for this booking.</p>
      )}
      {data?.available && <Markdown source={data.content} />}
    </div>
  );
}

/**
 * Read-only modal for a driver: the exact Terms & Conditions version the customer
 * accepted for ONE of the driver's own trips. Still used by the Trips (active) tab.
 */
export default function TripTermsModal({ open, onClose, trip, token }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start gap-3 p-5 pb-3 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="font-bold text-arl-dark">Terms the customer accepted</h3>
            {trip && <p className="text-xs text-gray-400 truncate">{trip.customerName} — {trip.vehicleName}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <TripTermsContent tripID={trip?.id} token={token} />
        </div>

        <div className="p-4 pt-3 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Close</button>
        </div>
      </div>
    </div>
  );
}