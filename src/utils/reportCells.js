// Small helpers shared by the PDF builder (reportTabPdf.js) and the Excel builder (reportTabXlsx.js).
//
// A table cell is either plain text / a plain number, or one of these typed cells:
//   money(1200.5)   an amount in PHP. The PDF prints it with the screen's own formatter ("₱1,200.50" -> "PHP 1,200.50"),
//                   Excel stores it as a real number (converted to the chosen currency) with a currency number format.
//   count(12)       a whole number: a count of bookings, payments ...
//   when(iso)       a date;  whenTime(iso) a date + time. Always shown in Philippine time.
// Pass { dash: true } to money() / count() to show "-" instead of a zero (the PDF only; Excel keeps the 0).
//
// The page / tab hands its own `fmt` and `convert` (from useCurrency) to the builders, so the PDF reads exactly like the screen
// and Excel holds the same amounts, as numbers, in whichever currency is selected.

export const money = (n, { dash = false } = {}) => ({ n: Number(n) || 0, t: "money", dash });
export const count = (n, { dash = false } = {}) => ({ n: Number(n) || 0, t: "int", dash });
export const when = (iso) => ({ d: iso || null, t: "date" });
export const whenTime = (iso) => ({ d: iso || null, t: "datetime" });

export const isCell = (c) => c !== null && typeof c === "object" && !(c instanceof Date) && typeof c.t === "string";

export const CURRENCY_SYMBOLS = { PHP: "₱", USD: "$", EUR: "€" };

const PH = { timeZone: "Asia/Manila" };
const validDate = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };

export const dateText = (iso, withTime = false) => {
  const d = validDate(iso);
  if (!d) return iso ? String(iso) : "-";          // not a real date: show it as it came
  return d.toLocaleString("en-PH", withTime ? { ...PH, dateStyle: "medium", timeStyle: "short" } : { ...PH, dateStyle: "medium" });
};

/** The text of a cell as the PDF prints it. `spec` carries { fmt, currency }. */
export function cellText(c, spec = {}) {
  if (c === null || c === undefined) return "";
  if (!isCell(c)) return String(c);
  if (c.t === "money") {
    if ((c.dash || spec.zeroDash) && !c.n) return "-";
    if (typeof spec.fmt === "function") return spec.fmt(c.n);
    return `${spec.currency || "PHP"} ${c.n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (c.t === "int") return (c.dash || spec.zeroDash) && !c.n ? "-" : c.n.toLocaleString("en-PH");
  if (c.t === "date") return dateText(c.d);
  if (c.t === "datetime") return dateText(c.d, true);
  return String(c.v ?? "");
}

/** Is a column worth right-aligning? True when any of its body cells is a number-like cell. */
export const isNumericCell = (c) => isCell(c) && (c.t === "money" || c.t === "int");

/**
 * A "kind of table cell" for text that came in as a plain string (the older tables): "PHP 1,200.50", "₱1,200.50", "-₱3.00",
 * "(₱3.00)" or "11" become numbers; "-", "—" and "" become empty; anything else stays text.
 * Returns { v, kind } with kind "money" | "int" | "text" | "empty".
 */
export function parseLooseCell(value) {
  if (typeof value === "number") return { v: value, kind: Number.isInteger(value) ? "int" : "money" };
  const s = String(value ?? "").trim();
  if (s === "" || s === "-" || s === "—") return { v: null, kind: "empty" };
  const m = s.match(/^(\(?)(-?)\s*([A-Za-z]{0,3}\s?[₱$€£¥]?)\s*(-?)([\d,]*\.?\d+)\s*(\)?)$/);
  if (!m) return { v: s, kind: "text" };
  const digits = m[5].replace(/,/g, "");
  const n = Number(digits);
  if (Number.isNaN(n)) return { v: s, kind: "text" };
  const negative = m[1] === "(" || m[2] === "-" || m[4] === "-";
  const hasSymbol = m[3].trim() !== "";
  return { v: negative ? -n : n, kind: hasSymbol || m[5].includes(".") ? "money" : "int" };
}