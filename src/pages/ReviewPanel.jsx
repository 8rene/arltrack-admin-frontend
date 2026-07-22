import { useState, useCallback } from "react";
import TracebackPanel from "./TracebackPanel";

// Fields recognized on an uploaded row — covers both this app's own archive
// shape ({ lat, lng, at }) and the geo-test/GPS-test reference's flat
// Sheets-export shape (carId, lat, lng, speed, savedAt, ...).
const NUMERIC_FIELDS = ["lat", "lng", "speed"];

function coerceRow(raw) {
  const rec = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    rec[k] = NUMERIC_FIELDS.includes(k) ? parseFloat(v) : v;
  });
  // This app's records use `at`; the geo-test/GPS-test export uses `savedAt`.
  if (rec.at === undefined && rec.savedAt !== undefined) rec.at = rec.savedAt;
  return rec;
}

// Groups a flat array of rows into { cars, records }. Handles a multi-car
// export (rows carry carId, like a geo-test/GPS-test file) and a single-car
// archive file (plain array of { lat, lng, at }, named after the upload).
function groupRows(rows, fallbackName) {
  const hasCarId = rows.some(r => r.carId !== undefined && r.carId !== "");
  const byCar = {};

  if (hasCarId) {
    rows.forEach(r => {
      if (!r.carId || Number.isNaN(r.lat) || Number.isNaN(r.lng) || !r.at) return;
      (byCar[r.carId] = byCar[r.carId] || []).push({ lat: r.lat, lng: r.lng, at: r.at });
    });
  } else {
    const clean = rows.filter(r => !Number.isNaN(r.lat) && !Number.isNaN(r.lng) && r.at);
    if (clean.length) byCar[fallbackName] = clean.map(r => ({ lat: r.lat, lng: r.lng, at: r.at }));
  }

  const cars = Object.keys(byCar).map(id => ({
    id,
    name: /^car\d+$/i.test(id) ? `Car ${id.replace(/\D/g, "")}` : id,
  }));
  return { cars, records: byCar };
}

/**
 * Car Tracking's Review tab. Upload a JSON traceback/GPS export — either
 * one downloaded from this app's own Traceback/History Download button
 * (round-trips exactly), or a raw geo-test/GPS-test style export — and
 * review it in the same scrubber/player used everywhere else.
 */
export default function ReviewPanel({ cars, token }) {
  const [reviewData, setReviewData] = useState(null);
  const [error, setError]           = useState(null);
  const [dragOver, setDragOver]     = useState(false);
  const [busy, setBusy]             = useState(false);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const baseName = file.name.replace(/\.json$/i, "");

      // Round-trip shape from this app's own Download button.
      if (parsed && !Array.isArray(parsed) && parsed.records && parsed.cars) {
        if (!parsed.cars.length) throw new Error("This file has no cars in it.");
        setReviewData({ label: parsed.label || baseName, cars: parsed.cars, records: parsed.records, zonesAlerts: parsed.zonesAlerts });
        return;
      }

      const rawRows = Array.isArray(parsed) ? parsed : (parsed.rows || parsed.records || []);
      if (!Array.isArray(rawRows) || !rawRows.length) throw new Error("No rows found in that file.");

      const grouped = groupRows(rawRows.map(coerceRow), baseName);
      if (!grouped.cars.length) {
        throw new Error("Couldn't find usable records — a row needs at least lat, lng, and a timestamp.");
      }
      setReviewData({ label: baseName, ...grouped });
    } catch (e) {
      setError(e.message?.startsWith("Unexpected") ? "That file isn't valid JSON." : e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  if (reviewData) {
    return (
      <TracebackPanel
        cars={cars}
        token={token}
        reviewData={reviewData}
        onExitReview={() => { setReviewData(null); setError(null); }}
      />
    );
  }

  return (
    <div className="flex flex-1 min-h-0 items-center justify-center">
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
        className={`w-full max-w-md text-center rounded-2xl border-2 border-dashed p-10 transition-all ${
          dragOver ? "border-teal-400 bg-teal-50" : "border-gray-200 bg-white"
        }`}
      >
        <div className="text-4xl mb-2">📁</div>
        <p className="font-bold text-arl-dark text-sm mb-1">Upload a GPS file to review</p>
        <p className="text-xs text-gray-400 mb-5">
          Drop a JSON traceback export here, or browse — a file downloaded from the
          Traceback or History tab's Download button, or a raw geo-test/GPS-test export.
        </p>
        <label className="inline-block px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold cursor-pointer hover:bg-teal-700 active:scale-95 transition-all">
          {busy ? "Reading…" : "Browse file"}
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </label>
        {error && <p className="text-xs text-red-500 mt-4">{error}</p>}
      </div>
    </div>
  );
}