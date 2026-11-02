// Builds the PDF of whichever Reports tab is open and downloads it. jsPDF is loaded on demand, so it is not in the main bundle.
//
// Each tab describes its own page as a list of sections (what is on screen: cards, graphs, tables) and this file draws them:
//   { type: "stats",   items: [{ label, value, color? }] }                     a row of number cards
//   { type: "title",   text, level? }                                           a section heading (level 2 = smaller)
//   { type: "legend",  items: [{ label, color, hatched? }] }                    the colour key above a graph
//   { type: "bars",    rows: [{ name, valueText, parts: [{ value, color, hatched? }], sub?: [{ value, color }] }] }
//                                                                                one stacked bar per row (+ an optional thin bar under it)
//   { type: "grouped", rows: [{ name, bars: [{ value, color, text }] }] }       side-by-side bars per row (revenue vs expenses)
//   { type: "table",   head: [...], body: [[...]], foot?: [...], align?: ["left" | "right", ...] }
//   { type: "note",    text }   { type: "empty", text }
//
// Unlike the screen, the PDF has no paging: every row of every table is in it. The graphs are drawn with plain shapes (no chart
// library), so the file stays small and the text stays selectable.
//
// jsPDF's built-in fonts only cover Latin-1, so a symbol like the peso sign would print as garbage. Currency symbols are swapped
// for the currency code ("PHP 1,200") and other characters it cannot draw are dropped or replaced by a plain look-alike.

const NAVY = [17, 24, 39];
const GRAY = [107, 114, 128];
const RULE = [229, 231, 235];

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

export async function downloadTabPdf({ title, subtitle = "", sections = [], currency = "PHP", fileName = "report" }) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  // The plugin's export shape differs between bundlers, so look for the function in each place it can be.
  const autoTable = [autoTableMod.default, autoTableMod.autoTable, autoTableMod.default?.default, autoTableMod.default?.autoTable].find((f) => typeof f === "function");
  if (!autoTable) throw new Error("PDF table plugin failed to load.");

  const clean = (v) => String(v ?? "")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u20A0-\u20CF]/g, `${currency} `)      // currency symbols (peso, euro, won ...)
    .replace(/[^\u0000-\u00FF]/g, "");                 // anything else the built-in font cannot draw

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  let y = M;
  const ensure = (h) => { if (y + h > H - 40) { doc.addPage(); y = M; } };

  // ── header ──
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...NAVY).text(clean(title), M, y + 12);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...GRAY);
  doc.text(clean(subtitle), M, y + 28);
  const stamp = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  doc.text(clean(`Generated ${stamp}`), W - M, y + 12, { align: "right" });
  doc.setDrawColor(...RULE).setLineWidth(0.8).line(M, y + 38, W - M, y + 38);
  y += 54;

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

  const drawStats = (items) => {
    const n = items.length, gap = 10, cw = (W - 2 * M - gap * (n - 1)) / n, ch = 46;
    ensure(ch + 16);
    items.forEach((it, i) => {
      const x = M + i * (cw + gap);
      doc.setFillColor(249, 250, 251).setDrawColor(...RULE).setLineWidth(0.6).roundedRect(x, y, cw, ch, 6, 6, "FD");
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRAY).text(clean(it.label), x + 10, y + 16);
      const value = clean(it.value);
      let fs = 13;
      doc.setFont("helvetica", "bold").setFontSize(fs);
      while (doc.getTextWidth(value) > cw - 20 && fs > 7) { fs -= 0.5; doc.setFontSize(fs); }
      doc.setTextColor(...(it.color ? rgb(it.color) : NAVY)).text(value, x + 10, y + 35);
    });
    y += ch + 16;
  };

  const drawTitle = (text, level = 1) => {
    ensure(level === 1 ? 70 : 60);
    if (level === 1) y += 6;
    doc.setFont("helvetica", "bold").setFontSize(level === 1 ? 14 : 11.5).setTextColor(...NAVY).text(clean(text), M, y + 10);
    y += level === 1 ? 24 : 20;
  };

  // colour key: items flow left to right, a line at a time, each line centred
  const drawLegend = (items) => {
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    const sw = 9, pad = 5, gap = 16;
    const widths = items.map((it) => sw + pad + doc.getTextWidth(clean(it.label)));
    const lines = [[]];
    let used = 0;
    items.forEach((it, i) => {
      const w = widths[i] + (lines[lines.length - 1].length ? gap : 0);
      if (used + w > W - 2 * M && lines[lines.length - 1].length) { lines.push([]); used = 0; }
      lines[lines.length - 1].push(i);
      used += widths[i] + (lines[lines.length - 1].length > 1 ? gap : 0);
    });
    ensure(lines.length * 16 + 6);
    lines.forEach((idxs) => {
      const total = idxs.reduce((s, i) => s + widths[i], 0) + gap * (idxs.length - 1);
      let x = (W - total) / 2;
      idxs.forEach((i) => {
        block(x, y, sw, sw, items[i].color, items[i].hatched);
        doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GRAY).text(clean(items[i].label), x + sw + pad, y + 7.5);
        x += widths[i] + gap;
      });
      y += 16;
    });
    y += 4;
  };

  const drawBars = (rows) => {
    const labelW = 150, valueW = 95;
    const trackX = M + labelW + 8, trackW = W - M - valueW - 8 - trackX;
    const max = Math.max(1, ...rows.map((r) => Math.max(sum(r.parts), sum(r.sub))));
    rows.forEach((r) => {
      const rowH = r.sub ? 22 : 17;
      ensure(rowH);
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...NAVY);
      doc.text(doc.splitTextToSize(clean(r.name), labelW)[0] || "", M, y + 9);
      let x = trackX;
      r.parts.forEach((p) => {
        if (!(p.value > 0)) return;
        const w = Math.max(1.5, (p.value / max) * trackW);
        block(x, y + 1, w, 9, p.color, p.hatched);
        x += w;
      });
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...NAVY).text(clean(r.valueText), W - M, y + 9, { align: "right" });
      if (r.sub) {
        let sx = trackX;
        r.sub.forEach((p) => {
          if (!(p.value > 0)) return;
          const w = Math.max(1.5, (p.value / max) * trackW);
          block(sx, y + 13, w, 4, p.color);
          sx += w;
        });
      }
      y += rowH;
    });
    y += 10;
  };

  const drawGrouped = (rows) => {
    const labelW = 110, valueW = 80;
    const trackX = M + labelW + 8, trackW = W - M - valueW - 8 - trackX;
    const max = Math.max(1, ...rows.flatMap((r) => r.bars.map((b) => b.value || 0)));
    rows.forEach((r) => {
      const rowH = r.bars.length * 9 + 9;
      ensure(rowH);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...NAVY);
      doc.text(doc.splitTextToSize(clean(r.name), labelW)[0] || "", M, y + rowH / 2 + 1);
      r.bars.forEach((b, i) => {
        const by = y + 2 + i * 9;
        const w = b.value > 0 ? Math.max(1.5, (b.value / max) * trackW) : 0;
        block(trackX, by, w, 6, b.color);
        doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...GRAY).text(clean(b.text), trackX + w + 4, by + 5.5);
      });
      y += rowH;
    });
    y += 10;
  };

  const drawTable = (s) => {
    const align = s.align || [];
    const columnStyles = {};
    align.forEach((a, i) => { if (a === "right") columnStyles[i] = { halign: "right" }; });
    autoTable(doc, {
      startY: y,
      head: [s.head.map(clean)],
      body: s.body.map((r) => r.map(clean)),
      foot: s.foot ? [s.foot.map(clean)] : undefined,
      margin: { left: M, right: M },
      theme: "striped",
      styles: { fontSize: s.head.length > 9 ? 7 : 8, cellPadding: 4, textColor: NAVY, overflow: "linebreak" },
      headStyles: { fillColor: [243, 244, 246], textColor: GRAY, fontStyle: "bold" },
      footStyles: { fillColor: [243, 244, 246], textColor: NAVY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles,
      // alignment applies to the header and footer cells too, so a heading sits over its numbers
      didParseCell: (d) => {
        if ((d.section === "head" || d.section === "foot") && align[d.column.index] === "right") d.cell.styles.halign = "right";
      },
    });
    y = doc.lastAutoTable.finalY + 20;
  };

  const drawText = (text, { italic = false } = {}) => {
    doc.setFont("helvetica", italic ? "italic" : "normal").setFontSize(9).setTextColor(...GRAY);
    const lines = doc.splitTextToSize(clean(text), W - 2 * M);
    ensure(lines.length * 12 + 8);
    doc.text(lines, M, y + 9);
    y += lines.length * 12 + 10;
  };

  sections.forEach((s) => {
    if (s.type === "stats") drawStats(s.items);
    else if (s.type === "title") drawTitle(s.text, s.level);
    else if (s.type === "legend") drawLegend(s.items);
    else if (s.type === "bars") drawBars(s.rows);
    else if (s.type === "grouped") drawGrouped(s.rows);
    else if (s.type === "table") drawTable(s);
    else if (s.type === "note") drawText(s.text);
    else if (s.type === "empty") drawText(s.text, { italic: true });
  });

  // footer on every page
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRAY);
    doc.text(clean(`${title} - ${subtitle}`), M, H - 20);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 20, { align: "right" });
  }

  doc.save(`${fileName}.pdf`);
  return doc;
}