// Which car parts still need attention?
//
// The before/after-trip inspection records are HISTORY and are never edited,
// so "is this part still damaged?" is DERIVED here, not stored. Two sources,
// and the more recent event wins:
//
//   - the car's latest inspection: a part it lists as Damaged / Stolen / Missing is flagged
//   - Completed maintenance jobs on that car that cover the part and are not older than that
//     inspection (linked to the same booking as the inspection, or dated on or after the day
//     it was recorded — or ANY Completed job when the car has no inspection at all).
//     If several do, the MOST RECENT one decides: its "After" condition "Good" fixes the
//     part; "Damaged" leaves it flagged — or flags it, when the job itself found the part
//     damaged and no inspection had.
//
// A part the inspection flagged as Stolen / Missing keeps that status while a job leaves it
// Damaged; a part only the job found is "Damaged". Every other part is fine.
// A newer inspection that finds the part damaged again flags it again, and
// reopening/deleting the job un-resolves it.
//
// Days are compared in Philippine time (UTC+8), exactly like the backend: an inspection is
// stamped with the real moment while a job's date is just a day.
//
// Used by Maintenance.jsx. The backend (services/carParts/carPartConditions.service.js,
// getUnresolvedDamage) applies the same rule and writes it to carParts.status, which the
// Dashboard reads — keep the three in step.

export const FLAGGED_STATUSES = ["Damaged", "Stolen", "Missing"];

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const phDay = (ms) => Math.floor((ms + PH_OFFSET_MS) / 86400000);

// Firestore client Timestamp, backend-JSON Timestamp, ISO string or Date -> ms.
export const toMs = (val) => {
  if (!val) return 0;
  if (typeof val.toMillis === "function") return val.toMillis();
  if (typeof val.toDate === "function") return val.toDate().getTime();
  if (val.seconds !== undefined) return val.seconds * 1000;
  if (val._seconds !== undefined) return val._seconds * 1000;
  const t = new Date(val).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// docs: [{ carID, recordedAt, ... }] -> latest record per carID
export const pickLatestByCar = (docs) => {
  const byCar = {};
  docs.forEach((rec) => {
    if (!rec?.carID) return;
    const ms = toMs(rec.recordedAt);
    if (!byCar[rec.carID] || ms > toMs(byCar[rec.carID].recordedAt)) byCar[rec.carID] = rec;
  });
  return byCar;
};

// The most recent Completed job on `carID` that covers `carPartID` and is not older than
// `record` (the car's latest inspection, or undefined when it has none).
// Returns { entry, jobMs, updatedMs } or null.
export const latestJobEntry = (carID, carPartID, record, jobs) => {
  let latest = null;
  jobs.forEach((j) => {
    if (j.status !== "Completed" || j.carID !== carID) return;
    const entry = (j.partsAddressed || []).find((p) => p?.carPartID === carPartID);
    if (!entry) return;
    const jobMs = toMs(j.maintenanceDate);
    const sameBooking = record && j.bookingID && record.bookingID && j.bookingID === record.bookingID;
    if (record && !sameBooking && !(jobMs > 0 && phDay(jobMs) >= phDay(toMs(record.recordedAt)))) return;
    const updatedMs = toMs(j.updatedAt);
    if (!latest || jobMs > latest.jobMs || (jobMs === latest.jobMs && updatedMs >= latest.updatedMs)) {
      latest = { entry, jobMs, updatedMs };
    }
  });
  return latest;
};

// beforeRecords may be [] (the Dashboard only looks at after-trip records).
// Returns the still-flagged parts:
//   [{ id, carID, carPartID, carPartName, status, source, bookingID }]
// source: "after_trip" | "before_trip" (the inspection that flagged it) or "maintenance"
// (a job found it damaged and no inspection had). Plus `latestStatus`, a Map
// "carID_carPartID" -> the part's current flagged status, for showing conditions.
export const buildFlaggedParts = ({ afterRecords = [], beforeRecords = [], jobs = [] }) => {
  const latestAfter  = pickLatestByCar(afterRecords);
  const latestBefore = pickLatestByCar(beforeRecords);
  const completedJobs = jobs.filter((j) => j.status === "Completed" && j.carID);

  // Cars with an inspection, plus cars that only have Completed jobs.
  const carIDs = new Set([
    ...Object.keys(latestAfter),
    ...Object.keys(latestBefore),
    ...completedJobs.map((j) => j.carID),
  ]);

  const flagged = [];
  const latestStatus = new Map();
  carIDs.forEach((carID) => {
    const record = latestAfter[carID] || latestBefore[carID] || null; // null: car has no inspection yet
    const source = latestAfter[carID] ? "after_trip" : "before_trip";

    const inspectionStatus = new Map(
      (record?.damageParts || []).filter((p) => FLAGGED_STATUSES.includes(p.status)).map((p) => [p.carPartID, p])
    );

    const partIDs = new Set(inspectionStatus.keys());
    completedJobs.filter((j) => j.carID === carID).forEach((j) => {
      (j.partsAddressed || []).forEach((e) => { if (e?.carPartID) partIDs.add(e.carPartID); });
    });

    partIDs.forEach((carPartID) => {
      const fromInspection = inspectionStatus.get(carPartID) || null;
      const job = latestJobEntry(carID, carPartID, record, jobs);

      let status;
      if (job) status = job.entry.conditionAfter === "Damaged" ? fromInspection?.status || "Damaged" : null;
      else status = fromInspection?.status || null;
      if (!status) return;

      latestStatus.set(`${carID}_${carPartID}`, status);
      flagged.push({
        id: `${carID}_${carPartID}`,
        carID,
        carPartID,
        carPartName: fromInspection?.carPartName || null,
        status,
        source: fromInspection ? source : "maintenance",
        bookingID: fromInspection ? record.bookingID : null,
      });
    });
  });
  return { flagged, latestStatus };
};