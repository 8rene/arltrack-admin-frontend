// Builds the Excel file of whichever Reports tab is open and downloads it. ExcelJS is loaded on demand, so it is not in the main bundle.
//
// It takes the same spec as the PDF builder (reportTabPdf.js), but a spreadsheet is for working with the numbers, so:
//   - the graphs, legends and notes are left out (the tables hold the same figures),
//   - "Summary" is the first sheet: the title, period, currency, the filters that were on, the key figures, and a list of every
//     other sheet (click a name to jump to it),
//   - every table on screen becomes its own sheet (named after the heading above it, or its own `name`),
//   - the windows behind each "View" button, and the booking / payment / penalty records the totals are made from, come as extra
//     sheets (`spec.sheets`, same shape as a table: { name, desc?, head, body, foot?, align? }),
//   - amounts and counts are real numbers (they can be summed, sorted and put in a pivot table), dates are real dates, totals are
//     SUM formulas, every header row is frozen and has filter arrows.
//
// Amounts typed with money() are PHP and are converted with spec.convert (the page's selected currency); older tables that
// already hold formatted text ("₱1,200.50") are read back into numbers as they are. Dates are written in Philippine time.

import { CURRENCY_SYMBOLS, isCell, isNumericCell, parseLooseCell } from "./reportCells";

const TEAL = "FF0F766E";
const NAVY = "FF111827";
const GRAY = "FF6B7280";
const RULE = "FFE5E7EB";
const ZEBRA = "FFF9FAFB";
const FOOT = "FFECFDF5";
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;     // Excel has no time zones, so dates are shifted to read as Philippine time

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function buildTabWorkbook({ title, subtitle = "", filters = [], sections = [], sheets = [], currency = "PHP", convert }) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ARL Track";
  wb.created = new Date();

  const sym = CURRENCY_SYMBOLS[currency] || "₱";
  const MONEY_FMT = `"${sym}"#,##0.00;[Red]-"${sym}"#,##0.00`;
  const toDisplay = (php) => round2(typeof convert === "function" ? convert(php) : Number(php) || 0);
  const generated = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

  /**
   * One cell -> { value, numFmt, num, text } where `num` says it is a number (right-aligned, summed) and `text` is the shown text
   * (used for the column width). `looseNumbers` = a plain string in this column may be read back as a number.
   */
  const toExcel = (cell, looseNumbers) => {
    if (cell === null || cell === undefined || cell === "") return { value: null, text: "" };
    if (isCell(cell)) {
      if (cell.t === "money") { const v = toDisplay(cell.n); return { value: v, numFmt: MONEY_FMT, num: true, text: v.toFixed(2) + "  " }; }
      if (cell.t === "int") return { value: cell.n, numFmt: "#,##0", num: true, text: String(cell.n) };
      if (cell.t === "date" || cell.t === "datetime") {
        const ms = cell.d ? Date.parse(cell.d) : NaN;
        if (Number.isNaN(ms)) return cell.d ? { value: String(cell.d), text: String(cell.d) } : { value: null, text: "" };
        const withTime = cell.t === "datetime";
        return { value: new Date(ms + PH_OFFSET_MS), numFmt: withTime ? "mmm d, yyyy h:mm AM/PM" : "mmm d, yyyy", text: withTime ? "Mmm 00, 0000 00:00 AM" : "Mmm 00, 0000", date: true };
      }
      return { value: String(cell.v ?? ""), text: String(cell.v ?? "") };
    }
    if (typeof cell === "number") return { value: cell, numFmt: Number.isInteger(cell) ? "#,##0" : "#,##0.00", num: true, text: String(cell) };
    if (looseNumbers) {
      const p = parseLooseCell(cell);
      if (p.kind === "empty") return { value: null, text: "" };
      if (p.kind === "money") return { value: p.v, numFmt: MONEY_FMT, num: true, text: p.v.toFixed(2) + "  " };
      if (p.kind === "int") return { value: p.v, numFmt: "#,##0", num: true, text: String(p.v) };
      return { value: p.v, text: String(p.v) };
    }
    const s = String(cell);
    return { value: s === "-" || s === "—" ? null : s, text: s };
  };

  // sheet names: at most 31 characters, none of  [ ] : * ? / \  and no two the same (Excel ignores case)
  const used = new Set(["summary"]);
  const sheetName = (label) => {
    const base = String(label || "Sheet").replace(/[[\]:*?/\\]/g, "").replace(/'/g, "").trim().slice(0, 28).trim() || "Sheet";
    let name = base, i = 2;
    while (used.has(name.toLowerCase())) name = `${base} ${i++}`;
    used.add(name.toLowerCase());
    return name;
  };

  const thin = { style: "thin", color: { argb: RULE } };

  /** Writes one table as a worksheet: styled header, typed cells, SUM foot, frozen header, filters, widths. */
  const addTableSheet = (name, { head, body, foot, align }) => {
    const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: TEAL } } });
    const cols = head.length;
    const loose = head.map((_, i) => !!align && align[i] === "right");           // only right-aligned columns of an older table may be read as numbers
    const widths = head.map((h) => String(h).length + 4);

    const headerRow = ws.addRow(head);
    headerRow.height = 22;
    const colIsNumeric = head.map((_, i) => loose[i] || body.some((r) => isNumericCell(r[i]) || typeof r[i] === "number"));
    headerRow.eachCell((c, n) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
      c.alignment = { vertical: "middle", horizontal: colIsNumeric[n - 1] ? "right" : "left", wrapText: true };
      c.border = { bottom: thin };
    });

    body.forEach((r, ri) => {
      const row = ws.addRow(new Array(cols).fill(null));
      r.forEach((cell, ci) => {
        const x = toExcel(cell, loose[ci]);
        const c = row.getCell(ci + 1);
        c.value = x.value;
        if (x.numFmt) c.numFmt = x.numFmt;
        c.alignment = { vertical: "middle", horizontal: x.num ? "right" : x.date ? "left" : "left" };
        widths[ci] = Math.max(widths[ci], Math.min(46, (x.text || "").length + 3));
      });
      row.eachCell({ includeEmpty: true }, (c) => {
        c.border = { bottom: thin };
        c.font = { size: 10.5, color: { argb: NAVY } };
        if (ri % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      });
    });

    if (foot) {
      const footRow = ws.addRow(new Array(cols).fill(null));
      const first = 2, last = 1 + body.length;
      foot.forEach((cell, ci) => {
        const x = toExcel(cell, loose[ci]);
        const c = footRow.getCell(ci + 1);
        const letter = ws.getColumn(ci + 1).letter;
        if (x.num && body.length > 0) c.value = { formula: `SUM(${letter}${first}:${letter}${last})`, result: x.value };   // a live total
        else c.value = x.value;
        if (x.numFmt) c.numFmt = x.numFmt;
        c.alignment = { vertical: "middle", horizontal: x.num ? "right" : "left" };
        widths[ci] = Math.max(widths[ci], Math.min(46, (x.text || "").length + 3));
      });
      footRow.eachCell({ includeEmpty: true }, (c) => {
        c.font = { bold: true, size: 10.5, color: { argb: NAVY } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOOT } };
        c.border = { top: { style: "medium", color: { argb: TEAL } } };
      });
    }

    widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.max(9, w); });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (body.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + body.length, column: cols } };
    return ws;
  };

  // ── collect the sheets: every table on screen (named after its heading), then the extra sheets ──
  const planned = [];
  let heading = "Table";
  sections.forEach((s) => {
    if (s.type === "title") { heading = s.text; return; }
    if (s.type !== "table" || s.body.length === 0) return;
    planned.push({ name: s.name || heading, desc: s.desc || `The "${heading}" table as shown on the page`, table: s });
  });
  sheets.forEach((s) => {
    if (!s.body || s.body.length === 0) return;
    planned.push({ name: s.name, desc: s.desc || "", table: s });
  });

  // ── Summary (first sheet) ──
  const sum = wb.addWorksheet("Summary", { properties: { tabColor: { argb: NAVY } }, views: [{ showGridLines: false }] });
  sum.getColumn(1).width = 34;
  sum.getColumn(2).width = 26;
  sum.getColumn(3).width = 70;
  sum.getColumn(4).width = 10;
  const put = (r, c, v, style = {}) => { const cell = sum.getCell(r, c); cell.value = v; Object.assign(cell, style); return cell; };

  let r = 1;
  put(r, 1, title, { font: { bold: true, size: 20, color: { argb: NAVY } } }); sum.getRow(r).height = 30; r += 1;
  put(r, 1, subtitle, { font: { size: 12, color: { argb: GRAY } } }); r += 2;

  const info = [["Currency", currency === "PHP" ? "PHP (Philippine peso)" : `${currency}, converted from PHP at the live rate used on the page`], ...filters.filter(([, v]) => v), ["Generated", generated]];
  info.forEach(([k, v]) => {
    put(r, 1, k, { font: { bold: true, size: 10.5, color: { argb: GRAY } } });
    put(r, 2, v, { font: { size: 10.5, color: { argb: NAVY } } });
    r += 1;
  });
  r += 1;

  const stats = sections.filter((s) => s.type === "stats").flatMap((s) => s.items);
  if (stats.length) {
    ["Key figure", "Value"].forEach((h, i) => put(r, 1 + i, h, {
      font: { bold: true, color: { argb: "FFFFFFFF" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } },
      alignment: { horizontal: i === 1 ? "right" : "left" },
    }));
    r += 1;
    stats.forEach((it, i) => {
      let x;
      if (it.t === "money" && typeof it.n === "number") x = toExcel({ n: it.n, t: "money" });
      else if (it.t === "int" && typeof it.n === "number") x = toExcel({ n: it.n, t: "int" });
      else x = toExcel(it.value, true);
      const a = put(r, 1, it.label, { font: { size: 10.5, color: { argb: NAVY } } });
      const b = put(r, 2, x.value, { alignment: { horizontal: "right" }, font: { bold: true, size: 10.5, color: { argb: it.color ? `FF${String(it.color).replace("#", "").toUpperCase()}` : NAVY } } });
      if (x.numFmt) b.numFmt = x.numFmt;
      [a, b].forEach((c) => { c.border = { bottom: thin }; if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } }; });
      r += 1;
    });
    r += 1;
  }

  if (planned.length) {
    ["Sheet in this file", "Rows", "What it holds"].forEach((h, i) => put(r, 1 + i, h, {
      font: { bold: true, color: { argb: "FFFFFFFF" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } },
      alignment: { horizontal: i === 1 ? "right" : "left" },
    }));
    r += 1;
    planned.forEach((p) => { p.summaryRow = r; r += 1; });   // filled in below, once every sheet has its final name
  }

  // ── write the data sheets ──
  planned.forEach((p, i) => {
    p.name = sheetName(p.name);
    addTableSheet(p.name, p.table);
    const link = put(p.summaryRow, 1, { text: p.name, hyperlink: `#'${p.name}'!A1` }, { font: { size: 10.5, color: { argb: "FF0F766E" }, underline: true } });
    const rows = put(p.summaryRow, 2, p.table.body.length, { alignment: { horizontal: "right" }, numFmt: "#,##0", font: { size: 10.5, color: { argb: NAVY } } });
    const desc = put(p.summaryRow, 3, p.desc, { font: { size: 10.5, color: { argb: GRAY } }, alignment: { wrapText: true, vertical: "top" } });
    [link, rows, desc].forEach((c) => { c.border = { bottom: thin }; if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } }; });
  });

  return wb;
}

export async function downloadTabXlsx(spec) {
  const wb = await buildTabWorkbook(spec);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${spec.fileName || "report"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}