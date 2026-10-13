// Which car parts still need attention?
//
// The before/after-trip inspection records are HISTORY and are never edited,
// so "is this part still damaged?" is DERIVED here, not stored:
//
//   a part is flagged when the car's latest inspection lists it as
//   Damaged / Stolen / Missing  AND  no Completed maintenance job has since
//   covered it.
//
// A Completed job "covers" a part when its partsAddressed lists the part and
// either it is linked to the same booking as the inspection, or its
// maintenanceDate is on/after the day the inspection was recorded (day
// granularity — the date picker has no time, so a same-day fix still counts).
// A job that leaves the part's "After" condition as "Damaged" has NOT fixed it,
// so the part stays flagged.
// A newer inspection that finds the part damaged again therefore flags it
// again, and reopening/deleting the job un-resolves it.
//
// Used by Maintenance.jsx and Dashboard.jsx so the two can never disagree.
// The backend (maintenance.service.js, getUnresolvedDamage) applies the same rule.

export const FLAGGED_STATUSES = ["Damaged", "Stolen", "Missing"];

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

const startOfDay = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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

export const isResolvedByJob = (carID, carPartID, record, jobs) => {
  const recordedDay = startOfDay(toMs(record.recordedAt));
  return jobs.some((j) => {
    if (j.status !== "Completed" || j.carID !== carID) return false;
    if (!(j.partsAddressed || []).some((p) => p.carPartID === carPartID && p.conditionAfter !== "Damaged")) return false;
    if (j.bookingID && record.bookingID && j.bookingID === record.bookingID) return true;
    const jobMs = toMs(j.maintenanceDate);
    return jobMs > 0 && startOfDay(jobMs) >= recordedDay;
  });
};

// beforeRecords may be [] (the Dashboard only looks at after-trip records).
// Returns the still-flagged parts: [{ carID, carPartID, status, source, bookingID, carPartName }]
// plus `latestStatus`, a Map "carID_carPartID" -> inspection status for every
// part the latest inspection lists (resolved or not), for showing conditions.
export const buildFlaggedParts = ({ afterRecords = [], beforeRecords = [], jobs = [] }) => {
  const latestAfter  = pickLatestByCar(afterRecords);
  const latestBefore = pickLatestByCar(beforeRecords);
  const carIDs = new Set([...Object.keys(latestAfter), ...Object.keys(latestBefore)]);

  const flagged = [];
  const latestStatus = new Map();
  carIDs.forEach((carID) => {
    const record = latestAfter[carID] || latestBefore[carID];
    const source = latestAfter[carID] ? "after_trip" : "before_trip";
    (record.damageParts || []).forEach((p) => {
      latestStatus.set(`${carID}_${p.carPartID}`, p.status);
      if (!FLAGGED_STATUSES.includes(p.status)) return;
      if (isResolvedByJob(carID, p.carPartID, record, jobs)) return;
      flagged.push({
        id: `${carID}_${p.carPartID}`,
        carID,
        carPartID: p.carPartID,
        carPartName: p.carPartName || null,
        status: p.status,
        source,
        bookingID: record.bookingID,
      });
    });
  });
  return { flagged, latestStatus };
};