// Builds the Excel file of whichever Reports tab is open and downloads it. SheetJS is loaded on demand, so it is not in the main bundle.
//
// It takes the same sections as the PDF builder (reportTabPdf.js), but a spreadsheet is for working with the numbers, so:
//   - the graphs, legends and notes are left out (the tables hold the same figures),
//   - every table becomes its own sheet, named after the heading above it (Money in, Unpaid balances, Customers ...),
//   - amounts and counts are written as real numbers (so they can be summed and filtered), not as "PHP 1,200.00" text.
// The first sheet, "Summary", has the stat cards.

/** "PHP 1,200.50" / "₱1,200.50" / "-₱3.00" / "11" -> a number; "-" or "" -> empty; anything that is really text stays text. */
function toCell(value) {
  if (typeof value === "number") return { v: value, z: Number.isInteger(value) ? "#,##0" : "#,##0.00" };
  const s = String(value ?? "").trim();
  if (s === "" || s === "-" || s === "—") return { v: "" };
  const m = s.match(/^(-?)([^\d-]{0,5})(-?)([\d,]*\.?\d+)\s*$/);   // optional sign, a short symbol / currency code, the digits
  if (!m) return { v: s };
  const n = Number(m[4].replace(/,/g, "")) * (m[1] || m[3] ? -1 : 1);
  if (Number.isNaN(n)) return { v: s };
  return { v: n, z: m[4].includes(".") ? "#,##0.00" : "#,##0" };
}

export async function downloadTabXlsx({ title, subtitle = "", sections = [], currency = "PHP", fileName = "report" }) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  /** rows of { v, z? } cells -> a worksheet with sensible column widths */
  const sheetOf = (matrix, { textCols = [] } = {}) => {
    const ws = {};
    const widths = [];
    matrix.forEach((row, r) => row.forEach((cell, c) => {
      const isText = textCols.includes(c) || r === 0;
      const cc = isText || typeof cell === "object" ? cell : toCell(cell);
      const obj = typeof cc === "object" && cc !== null && "v" in cc ? cc : { v: cc };
      if (obj.v === "" || obj.v === undefined) return;
      const out = { v: obj.v, t: typeof obj.v === "number" ? "n" : "s" };
      if (obj.z) out.z = obj.z;
      ws[XLSX.utils.encode_cell({ r, c })] = out;
      widths[c] = Math.max(widths[c] || 8, Math.min(48, String(obj.v).length + 2));
    }));
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, matrix.length - 1), c: Math.max(0, widths.length - 1) } });
    ws["!cols"] = widths.map((wch) => ({ wch }));
    return ws;
  };

  // sheet names: at most 31 characters, none of  [ ] : * ? / \  and no two the same
  const used = new Set(["Summary"]);
  const sheetName = (text) => {
    const base = String(text || "Sheet").replace(/[\[\]:*?/\\]/g, "").slice(0, 28).trim() || "Sheet";
    let name = base, i = 2;
    while (used.has(name)) name = `${base} ${i++}`;
    used.add(name);
    return name;
  };

  // ── Summary: title, period, the stat cards ──
  const summary = [[title], [subtitle], [`Currency: ${currency}`], [`Generated ${new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`], []];
  sections.filter((s) => s.type === "stats").forEach((s) => s.items.forEach((it) => summary.push([it.label, toCell(it.value)])));
  XLSX.utils.book_append_sheet(wb, sheetOf(summary.map((r) => r.map((c, i) => (i === 0 ? { v: c } : c)))), "Summary");

  // ── one sheet per table, named after the heading above it ──
  let heading = "Table";
  sections.forEach((s) => {
    if (s.type === "title") { heading = s.text; return; }
    if (s.type !== "table" || s.body.length === 0) return;
    const textCols = (s.align || []).map((a, i) => (a === "right" ? -1 : i)).filter((i) => i >= 0);   // left-aligned columns are names / IDs: keep as text
    const matrix = [s.head, ...s.body, ...(s.foot ? [s.foot] : [])];
    XLSX.utils.book_append_sheet(wb, sheetOf(matrix, { textCols }), sheetName(heading));
  });

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}