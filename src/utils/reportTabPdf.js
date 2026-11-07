// Builds the PDF of whichever Reports tab is open and downloads it. jsPDF is loaded on demand, so it is not in the main bundle.
//
// Each tab describes its own page as a list of sections (what is on screen: cards, graphs, tables) and this file draws them:
//   { type: "stats",   items: [{ label, value, accent?, color? }] }           number cards (they go on the first page; `accent` = the card's colour)
//   { type: "title",   text, level? }                                           a section heading (level 2 = smaller)
//   { type: "legend",  items: [{ label, color, hatched? }] }                    the colour key above a graph
//   { type: "bars",    rows: [{ name, valueText, parts: [{ value, color, hatched? }], sub?: [{ value, color }] }] }
//                                                                                one stacked bar per row (+ an optional thin bar under it)
//   { type: "grouped", rows: [{ name, bars: [{ value, color, text }] }] }       side-by-side bars per row (revenue vs expenses)
//   { type: "table",   head: [...], body: [[...]], foot?: [...], align?: ["left" | "right", ...] }
//                      cells are text, numbers or the typed cells from reportCells.js (money(), count(), when() ...)
//   { type: "note",    text }   { type: "empty", text }
// The spec also takes  { title, subtitle, filters?: [[label, value], ...], currency, fmt, fileName }.
// Excel-only extras (`sheets`, table `name`) are ignored here.
//
// The file is laid out as: page 1 = title, period, filters and the coloured key-figure cards; then every graph, one per page
// (a graph with many rows is squeezed to fit its page); then the tables, each heading's tables starting on a new page. Unlike the
// screen, the PDF has no paging: every row that has data is in it. Rows with nothing in them (every amount and count is zero) are
// left out of the tables and graphs, with a line saying how many; zeros inside a row print as "-". Excel keeps every row. The graphs are drawn with plain shapes (no chart library),
// so the file stays small and the text stays selectable.
//
// jsPDF's built-in fonts only cover Latin-1, so a symbol like the peso sign would print as garbage. Currency symbols are swapped
// for the currency code ("PHP 1,200") and other characters it cannot draw are dropped or replaced by a plain look-alike.

import { cellText, isNumericCell } from "./reportCells";

const NAVY = [17, 24, 39];
const GRAY = [107, 114, 128];
const LIGHT = [156, 163, 175];
const RULE = [229, 231, 235];
const TEAL = [15, 118, 110];

const rgb = (hex) => { const n = parseInt(String(hex).replace("#", ""), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const tint = (c, t) => c.map((v) => Math.round(v + (255 - v) * t));
const sum = (parts) => (parts || []).reduce((s, p) => s + Math.max(0, p.value || 0), 0);

/** One bar per row from a list of series: `series` = [{ key, color, hatched? }], `sub` = the thin bar's series. */
export const barRows = (rows, series, { text, sub } = {}) => rows.map((r) => ({
  name: r.name,
  valueText: text ? text(r) : String(r.total ?? ""),
  parts: series.map((s) => ({ value: r[s.key] || 0, color: s.color, hatched: s.hatched })),
  sub: sub ? sub.map((s) => ({ value: r[s.key] || 0, color: s.color })) : undefined,
}));

/** Builds the PDF and returns the jsPDF document (nothing is saved). */
export async function buildTabPdf({ title, subtitle = "", filters = [], sections = [], currency = "PHP", fmt }) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  // The plugin's export shape differs between bundlers, so look for the function in each place it can be.
  const autoTable = [autoTableMod.default, autoTableMod.autoTable, autoTableMod.default?.default, autoTableMod.default?.autoTable].find((f) => typeof f === "function");
  if (!autoTable) throw new Error("PDF table plugin failed to load.");

  const spec = { currency, fmt, zeroDash: true };       // the PDF shows "-" instead of a zero amount
  const clean = (v) => String(v ?? "")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00B7/g, "-")
    .replace(/[\u20A0-\u20CF]/g, `${currency} `)      // currency symbols (peso, euro, won ...)
    .replace(/[\u0100-\uFFFF]/g, "");                // anything else the built-in font cannot draw
  const text = (cell) => clean(cellText(cell, spec));

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const BOTTOM = H - 44;
  let y = M;
  const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
  const stamp = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

  // a coloured rectangle; a "hatched" one gets white stripes on a lighter fill (the same look as the striped bars on screen)
  const block = (x, top, w, h, color, hatched) => {
    if (w <= 0) return;
    const c = rgb(color);
    doc.setFillColor(...(hatched ? tint(c, 0.25) : c)).rect(x, top, w, h, "F");
    if (hatched) {
      doc.setDrawColor(255, 255, 255).setLineWidth(0.9);
      for (let sx = x + 2; sx < x + w - 0.5; sx += 3.5) doc.line(sx, top, sx, top + h);
    }
  };

  // ── drawing helpers ──
  // a table row with number cells that are all zero has no activity; a bar / graph row is empty when all its values are zero
  const tableRowEmpty = (r) => { const nums = r.filter(isNumericCell); return nums.length > 0 && nums.every((c) => !c.n); };
  const barRowEmpty = (r) => sum(r.parts) === 0 && sum(r.sub) === 0 && (r.parts || []).every((p) => !p.value);
  const groupedRowEmpty = (r) => r.bars.every((b) => !b.value);
  const hiddenNote = (n) => `${n} row${n === 1 ? "" : "s"} with no activity ${n === 1 ? "is" : "are"} not listed.`;
  let reserve = 0;   // room kept free at the bottom of a graph page for the note that goes under the graph
  const drawTitle = (label, level = 1) => {
    ensure(level === 1 ? 110 : 90);
    if (level === 1) y += 6;
    doc.setFont("helvetica", "bold").setFontSize(level === 1 ? 15 : 12).setTextColor(...NAVY).text(clean(label), M, y + 11);
    if (level === 1) doc.setDrawColor(...TEAL).setLineWidth(1.4).line(M, y + 17, M + 34, y + 17);
    y += level === 1 ? 30 : 22;
  };

  // colour key: items flow left to right, a line at a time, each line centred
  const drawLegend = (items) => {
    doc.setFont("helvetica", "normal").setFontSize(9);
    const sw = 10, pad = 5, gap = 18;
    const widths = items.map((it) => sw + pad + doc.getTextWidth(clean(it.label)));
    const lines = [[]];
    let used = 0;
    items.forEach((it, i) => {
      const w = widths[i] + (lines[lines.length - 1].length ? gap : 0);
      if (used + w > W - 2 * M && lines[lines.length - 1].length) { lines.push([]); used = 0; }
      lines[lines.length - 1].push(i);
      used += widths[i] + (lines[lines.length - 1].length > 1 ? gap : 0);
    });
    ensure(lines.length * 18 + 8);
    lines.forEach((idxs) => {
      const total = idxs.reduce((s, i) => s + widths[i], 0) + gap * (idxs.length - 1);
      let x = (W - total) / 2;
      idxs.forEach((i) => {
        block(x, y, sw, sw, items[i].color, items[i].hatched);
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GRAY).text(clean(items[i].label), x + sw + pad, y + 8.5);
        x += widths[i] + gap;
      });
      y += 18;
    });
    y += 6;
  };

  // one stacked bar per row, on a light track so the full length is visible; the number sits at the right.
  // With many rows the bars are squeezed (down to 60%) so the graph stays on one page.
  const drawBars = (rows) => {
    const labelW = 170, valueW = 110;
    const trackX = M + labelW + 10, trackW = W - M - valueW - 10 - trackX;
    const max = Math.max(1, ...rows.map((r) => Math.max(sum(r.parts), sum(r.sub))));
    const base = rows.some((r) => r.sub) ? 30 : 23;
    const k = Math.min(1, Math.max(0.6, (BOTTOM - reserve - y - 10) / (rows.length * base)));
    const fs = Math.max(7.5, 9 * k);
    rows.forEach((r) => {
      const rowH = base * k;
      ensure(rowH);
      doc.setFont("helvetica", "normal").setFontSize(fs).setTextColor(...NAVY);
      doc.text(doc.splitTextToSize(clean(r.name), labelW)[0] || "", M, y + 11 * k);
      doc.setFillColor(...tint(RULE, 0.4)).rect(trackX, y + 1, trackW, 13 * k, "F");
      let x = trackX;
      r.parts.forEach((p) => {
        if (!(p.value > 0)) return;
        const w = Math.max(1.5, (p.value / max) * trackW);
        block(x, y + 1, w, 13 * k, p.color, p.hatched);
        x += w;
      });
      doc.setFont("helvetica", "bold").setFontSize(fs).setTextColor(...NAVY).text(clean(r.valueText), W - M, y + 11 * k, { align: "right" });
      if (r.sub) {
        let sx = trackX;
        r.sub.forEach((p) => {
          if (!(p.value > 0)) return;
          const w = Math.max(1.5, (p.value / max) * trackW);
          block(sx, y + 18 * k, w, 6 * k, p.color);
          sx += w;
        });
      }
      y += rowH;
    });
    y += 12;
  };

  // two (or more) bars side by side per row, each with its own amount at the end; squeezed to fit one page when there are many rows
  const drawGrouped = (rows) => {
    const labelW = 120, valueW = 90;
    const trackX = M + labelW + 10, trackW = W - M - valueW - 10 - trackX;
    const max = Math.max(1, ...rows.flatMap((r) => r.bars.map((b) => b.value || 0)));
    const base = rows[0].bars.length * 12 + 8;
    const k = Math.min(1, Math.max(0.4, (BOTTOM - reserve - y - 10) / (rows.length * base)));
    const labelFs = Math.max(6.5, 8.5 * k), valueFs = Math.max(5.5, 7.5 * k);
    rows.forEach((r) => {
      const rowH = base * k;
      ensure(rowH);
      doc.setFont("helvetica", "normal").setFontSize(labelFs).setTextColor(...NAVY);
      doc.text(doc.splitTextToSize(clean(r.name), labelW)[0] || "", M, y + rowH / 2 + labelFs * 0.3);
      r.bars.forEach((b, i) => {
        const by = y + 2 * k + i * 12 * k;
        const w = b.value > 0 ? Math.max(1.5, (b.value / max) * trackW) : 0;
        block(trackX, by, w, 9 * k, b.color);
        doc.setFont("helvetica", "normal").setFontSize(valueFs).setTextColor(...GRAY).text(clean(b.text), trackX + w + 5, by + 9 * k * 0.85);
      });
      y += rowH;
    });
    y += 12;
  };

  const drawTable = (s) => {
    const align = s.align || [];
    const cols = s.head.length;
    const shown = s.body.filter((r) => !tableRowEmpty(r));
    const hidden = s.body.length - shown.length;
    if (shown.length === 0) { drawText("No activity in this period.", { italic: true }); return; }
    const bodyText = shown.map((r) => r.map(text));
    const footText = s.foot ? s.foot.map(text) : undefined;
    // a column is numeric when the table says so, or when its cells are typed number cells
    const numeric = s.head.map((_, i) => align[i] === "right" || shown.some((r) => isNumericCell(r[i])));
    const columnStyles = {};
    numeric.forEach((n, i) => { if (n) columnStyles[i] = { halign: "right" }; });
    ensure(Math.min(130, 44 + shown.length * 18));   // never leave just a row or two of a table at the bottom of a page
    autoTable(doc, {
      startY: y,
      head: [s.head.map(clean)],
      body: bodyText,
      foot: footText ? [footText] : undefined,
      showFoot: "lastPage",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      margin: { left: M, right: M, bottom: 48 },
      theme: "grid",
      styles: { fontSize: cols > 10 ? 7 : cols > 7 ? 7.5 : 8.5, cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 }, textColor: NAVY, overflow: "linebreak", lineColor: RULE, lineWidth: 0.4, valign: "middle" },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", lineColor: TEAL },
      footStyles: { fillColor: [236, 253, 245], textColor: NAVY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles,
      // alignment applies to the header and footer cells too, so a heading sits over its numbers
      didParseCell: (d) => {
        if ((d.section === "head" || d.section === "foot") && numeric[d.column.index]) d.cell.styles.halign = "right";
      },
    });
    y = doc.lastAutoTable.finalY + (hidden ? 6 : 22);
    if (hidden) { drawText(hiddenNote(hidden), { italic: true }); y += 6; }
  };

  const drawText = (label, { italic = false } = {}) => {
    doc.setFont("helvetica", italic ? "italic" : "normal").setFontSize(9.5).setTextColor(...GRAY);
    const lines = doc.splitTextToSize(clean(label), W - 2 * M);
    ensure(lines.length * 13 + 8);
    doc.text(lines, M, y + 10);
    y += lines.length * 13 + 12;
  };

  const stats = sections.filter((s) => s.type === "stats").flatMap((s) => s.items);
  const body = sections.filter((s) => s.type !== "stats");

  // ── page 1: title, what the report covers, the key figures as coloured cards ──
  doc.setFillColor(...TEAL).rect(0, 0, W, 8, "F");
  y = 62;
  doc.setFont("helvetica", "bold").setFontSize(28).setTextColor(...NAVY).text(clean(title), M, y);
  y += 24;
  doc.setFont("helvetica", "normal").setFontSize(13).setTextColor(...GRAY).text(clean(subtitle), M, y);
  y += 16;
  doc.setDrawColor(...RULE).setLineWidth(0.8).line(M, y, W - M, y);
  y += 18;
  [["Currency", currency], ...filters.filter(([, v]) => v), ["Generated", stamp]].forEach(([k, v]) => {
    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...GRAY).text(clean(k).toUpperCase(), M, y);
    doc.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(...NAVY).text(clean(v), M + 90, y);
    y += 16;
  });
  y += 14;

  if (stats.length) {
    const perRow = Math.min(4, stats.length), gap = 12, cw = (W - 2 * M - gap * (perRow - 1)) / perRow, ch = 64;
    const lines = Array.from({ length: Math.ceil(stats.length / perRow) }, (_, i) => stats.slice(i * perRow, (i + 1) * perRow));
    lines.forEach((line) => {
      ensure(ch + 12);
      line.forEach((it, k) => {
        const x = M + k * (cw + gap);
        const accent = it.accent ? rgb(it.accent) : TEAL;
        doc.setFillColor(...accent).roundedRect(x, y, cw, ch, 7, 7, "F");                       // the card's colour shows as a band down its left edge
        doc.setFillColor(...tint(accent, 0.9)).roundedRect(x + 6, y, cw - 6, ch, 6, 6, "F");
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GRAY).text(clean(it.label), x + 18, y + 22);
        const value = clean(it.value);
        let fs = 17;
        doc.setFont("helvetica", "bold").setFontSize(fs);
        while (doc.getTextWidth(value) > cw - 30 && fs > 7) { fs -= 0.5; doc.setFontSize(fs); }
        doc.setTextColor(...(it.color ? rgb(it.color) : NAVY)).text(value, x + 18, y + 47);
      });
      y += ch + 12;
    });
  }

  // ── group the body by heading: its graph part and its table part ──
  const groups = [];
  let cur = null;
  body.forEach((s) => {
    if (s.type === "title") { cur = { head: s, chart: [], rest: [] }; groups.push(cur); return; }
    if (!cur) { cur = { head: null, chart: [], rest: [] }; groups.push(cur); }
    if (s.type === "legend" || s.type === "bars" || s.type === "grouped") cur.chart.push(s);
    else if (s.type === "note" && cur.chart.length && !cur.rest.length) cur.chart.push(s);   // a note about the graph stays with the graph
    else cur.rest.push(s);
  });
  const drawItems = (items) => items.forEach((s) => {
    if (s.type === "legend") drawLegend(s.items);
    else if (s.type === "bars" || s.type === "grouped") {
      const keep = s.rows.filter((r) => !(s.type === "bars" ? barRowEmpty(r) : groupedRowEmpty(r)));
      const hidden = s.rows.length - keep.length;
      if (keep.length === 0) drawText("No activity in this period.", { italic: true });
      else {
        (s.type === "bars" ? drawBars : drawGrouped)(keep);
        if (hidden) { y -= 6; drawText(hiddenNote(hidden), { italic: true }); }
      }
    }
    else if (s.type === "table") drawTable(s);
    else if (s.type === "note") drawText(s.text);
    else if (s.type === "empty") drawText(s.text, { italic: true });
  });

  // page 2, 3 ...: one graph per page
  groups.filter((g) => g.chart.length).forEach((g) => {
    doc.addPage(); y = M;
    if (g.head) drawTitle(g.head.text, g.head.level);
    reserve = g.chart.filter((c) => c.type === "note").length * 36
      + g.chart.filter((c) => (c.type === "bars" || c.type === "grouped") && c.rows.some((r) => (c.type === "bars" ? barRowEmpty(r) : groupedRowEmpty(r)))).length * 30;
    drawItems(g.chart);
    reserve = 0;
  });
  // then the tables: each main heading starts on a new page, its sub-headings follow on the same one
  groups.filter((g) => g.rest.length).forEach((g) => {
    if (!g.head || (g.head.level || 1) === 1) { doc.addPage(); y = M; }
    if (g.head) drawTitle(g.head.text, g.head.level);
    drawItems(g.rest);
  });

  // footer on every page
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE).setLineWidth(0.6).line(M, H - 32, W - M, H - 32);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...LIGHT);
    doc.text(clean(`${title} - ${subtitle}`), M, H - 19);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 19, { align: "right" });
  }
  return doc;
}

export async function downloadTabPdf(spec) {
  const doc = await buildTabPdf(spec);
  doc.save(`${spec.fileName || "report"}.pdf`);
  return doc;
}