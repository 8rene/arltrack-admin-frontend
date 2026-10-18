// Builds the Reports PDF and downloads it. jsPDF is loaded on demand so it isn't in the main bundle.
//
// jsPDF's built-in fonts only cover Latin-1, so a symbol like the peso sign (₱) would print as garbage.
// Any character outside Latin-1 in a money string is swapped for the currency code instead ("PHP 1,200").

const NAVY = [17, 24, 39];
const GRAY = [107, 114, 128];
const GREEN = [22, 163, 74];
const AMBER = [202, 138, 4];
const RED = [239, 68, 68];
const BLUE = [37, 99, 235];

export async function downloadReportPdf(report, { fmt, fmtDate, fmtDateTime, currency = "PHP", totalsKey = "day", fileName }) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  // The plugin's export shape differs between bundlers, so look for the function in each place it can be.
  const autoTable = [autoTableMod.default, autoTableMod.autoTable, autoTableMod.default?.default, autoTableMod.default?.autoTable].find((f) => typeof f === "function");
  if (!autoTable) throw new Error("PDF table plugin failed to load.");

  const money = (n) => String(fmt(n)).replace(/[^\x00-\xFF]/g, `${currency} `);
  const dash = (v) => (v === undefined || v === null || v === "" ? "—" : String(v)).replace(/—/g, "-");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;

  // ── header ──
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...NAVY).text("Report", M, y + 6);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...GRAY);
  doc.text(String(report.label).replace(/[·–]/g, "-"), M, y + 24);
  doc.text(`Generated ${fmtDateTime(report.generatedAt)}`, M, y + 38);
  y += 60;

  const heading = (text) => {
    if (y > H - 110) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...NAVY).text(text, M, y);
    y += 8;
  };
  const table = (head, body, opts = {}) => {
    autoTable(doc, {
      startY: y,
      head: head ? [head] : undefined,
      body,
      margin: { left: M, right: M },
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 4, textColor: NAVY },
      headStyles: { fillColor: [243, 244, 246], textColor: GRAY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      // column alignment applies to the header cells too, so a heading sits over its numbers
      didParseCell: (d) => {
        const align = (opts.columnStyles || {})[d.column.index]?.halign;
        if (d.section === "head" && align) d.cell.styles.halign = align;
      },
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 20;
  };
  const right = (i) => ({ [i]: { halign: "right" } });
  const kv = (rows) => table(null, rows, { columnStyles: { 0: { cellWidth: 200, textColor: GRAY }, 1: { fontStyle: "bold", halign: "right" } } });

  // ── charts (drawn with plain shapes; no chart library) ──
  const ensure = (h) => { if (y + h > H - 50) { doc.addPage(); y = M; } };
  const chartTitle = (text) => { doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...GRAY).text(text, M, y); y += 10; };
  const noData = (x, top) => { doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(...GRAY).text("No data yet.", x, top + 10); };

  // A pie wedge as a polygon (jsPDF has no arc fill), then a white circle on top makes it a ring.
  const wedge = (cx, cy, r, a0, a1, color) => {
    const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 45)));
    const pts = [[cx, cy]];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    const deltas = pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]]);
    doc.setFillColor(...color);
    doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], "F", true);
  };

  /** Ring + legend. data = [{ label, value, color }]. Returns the height used. */
  const donut = (data, { format, centerLabel, centerValue }) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) { noData(M, y); return 26; }
    const r = 48, cx = M + r + 4, cy = y + r + 4;
    let a = -Math.PI / 2;
    data.filter((d) => d.value > 0).forEach((d) => {
      const a1 = a + (d.value / total) * 2 * Math.PI;
      wedge(cx, cy, r, a, a1, d.color);
      a = a1;
    });
    doc.setFillColor(255, 255, 255).circle(cx, cy, r * 0.62, "F");

    // The centre label may wrap onto two lines: stack the lines upwards so the amount underneath never collides.
    doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...GRAY);
    const labelLines = doc.splitTextToSize(centerLabel, r * 1.1);
    labelLines.forEach((ln, i) => doc.text(ln, cx, cy - 3 - (labelLines.length - 1 - i) * 7.5, { align: "center" }));
    let fs = 9;
    doc.setFont("helvetica", "bold").setFontSize(fs);
    while (doc.getTextWidth(centerValue) > r * 1.1 && fs > 5) { fs -= 0.5; doc.setFontSize(fs); }
    doc.setTextColor(...NAVY).text(centerValue, cx, cy + 9, { align: "center" });

    const lx = M + 2 * r + 36, lw = W - M - lx;
    data.forEach((d, i) => {
      const ly = y + 18 + i * 20;
      doc.setFillColor(...d.color).circle(lx + 3, ly - 2.5, 3, "F");
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...NAVY).text(d.label, lx + 12, ly);
      doc.setFont("helvetica", "bold").text(format(d.value), lx + lw - 40, ly, { align: "right" });
      doc.setFont("helvetica", "normal").setTextColor(...GRAY).text(`${Math.round((d.value / total) * 100)}%`, lx + lw, ly, { align: "right" });
    });
    return 2 * r + 12;
  };

  /** Horizontal bars scaled to the largest value. Returns the height used. */
  const barChart = (data, format) => {
    const max = Math.max(0, ...data.map((d) => d.value));
    if (data.length === 0 || max <= 0) { noData(M, y); return 26; }
    const labelW = 110, valueW = 90, trackX = M + labelW + 8, trackW = W - M - valueW - 8 - trackX;
    data.forEach((d, i) => {
      const ry = y + i * 20;
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...NAVY).text(doc.splitTextToSize(String(d.label), labelW)[0] || "", M, ry + 9);
      doc.setFillColor(243, 244, 246).roundedRect(trackX, ry + 2, trackW, 8, 4, 4, "F");
      doc.setFillColor(...d.color).roundedRect(trackX, ry + 2, Math.max(2, (d.value / max) * trackW), 8, 4, 4, "F");
      doc.setFont("helvetica", "bold").setTextColor(...NAVY).text(format(d.value), W - M, ry + 9, { align: "right" });
    });
    return data.length * 20 + 6;
  };

  const t = report.topStats;
  heading("Overview");
  kv([
    ["Total Sales (after maintenance)", money(t.totalSales)],
    ["Gross Sales", money(t.grossSales)],
    ["Maintenance Expense", money(t.maintenanceExpense)],
    ["Refunded", money(t.refundedAmount)],
    ["Number of Rentals", t.numberOfRentals],
    ["Average Sale", money(t.averageSale)],
  ]);

  const r = report.revenueReport;
  heading("Revenue");
  kv([["Total Revenue", money(r.totalRevenue)], ["Paid", money(r.paidAmount)], ["Pending", money(r.pendingAmount)], ["Refunded", money(r.refundedAmount)]]);
  ensure(140); chartTitle("Revenue breakdown");
  y += donut(
    [{ label: "Collected", value: r.paidAmount, color: GREEN }, { label: "Outstanding", value: r.pendingAmount, color: AMBER }, { label: "Refunded", value: r.refundedAmount, color: RED }],
    { format: money, centerLabel: "Revenue (excl. refunds)", centerValue: money(r.totalRevenue) },
  ) + 16;

  heading("Maintenance Expenses");
  if (report.maintenanceExpenses.length === 0) kv([["No completed maintenance in this period.", ""]]);
  else table(["Date", "Vehicle", "Basis", "Services", "Amount"],
    report.maintenanceExpenses.map((m) => [fmtDate(m.date), dash(m.carName), dash(m.basis), dash(m.services), money(m.amount)]),
    { columnStyles: right(4) });

  const rt = report.rentalReport;
  heading("Rentals");
  kv([["Total Rentals", rt.totalRentals], ["Completed", rt.completed], ["Ongoing", rt.ongoing], ["Upcoming", rt.upcoming], ["Cancelled", rt.cancelled]]);
  ensure(140); chartTitle("Rentals by status");
  y += donut(
    [{ label: "Completed", value: rt.completed, color: GREEN }, { label: "Ongoing", value: rt.ongoing, color: BLUE }, { label: "Upcoming", value: rt.upcoming, color: AMBER }, { label: "Cancelled", value: rt.cancelled, color: RED }],
    { format: (n) => String(n), centerLabel: "Rentals", centerValue: String(rt.totalRentals) },
  ) + 16;

  const v = report.vehicleReport;
  heading("Vehicles");
  kv([
    ["Total Vehicles Rented", v.totalVehiclesRented],
    ["Revenue per Vehicle", money(v.revenuePerVehicle)],
    ["Most Rented", v.mostRented ? `${v.mostRented.name} (${v.mostRented.rentals})` : "-"],
    ["Least Rented", v.leastRented ? `${v.leastRented.name} (${v.leastRented.rentals})` : "-"],
  ]);
  const top5 = v.topVehicles.slice(0, 5);
  ensure(30 + top5.length * 20); chartTitle("Rentals per vehicle (top 5)");
  y += barChart(top5.map((x) => ({ label: x.name, value: x.rentals, color: BLUE })), (n) => String(n)) + 10;
  ensure(30 + top5.length * 20); chartTitle("Revenue per vehicle (top 5)");
  y += barChart(top5.map((x) => ({ label: x.name, value: x.revenue, color: GREEN })), money) + 14;
  if (v.topVehicles.length > 0) table(["#", "Vehicle", "Rentals", "Revenue"], v.topVehicles.map((x, i) => [i + 1, dash(x.name), x.rentals, money(x.revenue)]), { columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } } });

  const c = report.customerReport;
  heading("Customers");
  kv([["Total Customers", c.totalCustomers], ["New Customers (in this period)", c.newCustomers]]);
  if (c.topCustomers.length > 0) table(["#", "Customer", "Rentals", "Amount Paid"], c.topCustomers.map((x, i) => [i + 1, dash(x.name), x.rentals, money(x.amountPaid)]), { columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } } });

  heading("Payment Methods");
  if (report.paymentReport.byMethod.length === 0) kv([["No confirmed payments in this period.", ""]]);
  else {
    table(["Method", "Payments", "Amount"], report.paymentReport.byMethod.map((m) => [m.method, m.count, money(m.amount)]), { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } } });
    ensure(30 + report.paymentReport.byMethod.length * 20); chartTitle("Amount by payment method");
    y += barChart(report.paymentReport.byMethod.map((m) => ({ label: m.method, value: m.amount, color: BLUE })), money) + 14;
  }

  const TOTALS_TITLE = { day: "Day", week: "Week", month: "Month", year: "Year" };
  heading(`Totals by ${TOTALS_TITLE[totalsKey] || "Day"}`);
  const buckets = report.periodTotals?.[totalsKey] || [];
  if (buckets.length === 0) kv([["No activity in this period.", ""]]);
  else table(["Period", "Sales", "Pending", "Refunded", "Pay.", "Rentals", "Done", "Canc.", "New", "Cars"],
    buckets.map((b) => [String(b.label).replace(/–/g, "-"), money(b.sales), money(b.pending), money(b.refunded), b.payments, b.rentals, b.completed, b.cancelled, b.newCustomers, b.vehiclesRented]),
    { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } }, styles: { fontSize: 7, cellPadding: 3, textColor: NAVY } });

  heading("Payments");
  if (report.payments.length === 0) kv([["No payment records in this period.", ""]]);
  else table(["Payment ID", "Total", "Paid", "Balance", "Status", "Type", "Gateway", "Date"],
    report.payments.map((p) => [dash(p.paymentID), money(p.amount), money(p.amountPaid), money(p.balance), p.status, dash(p.methodOfPayment), dash(p.paymentMethod), fmtDate(p.createdAt)]),
    { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } }, styles: { fontSize: 7, cellPadding: 3, textColor: NAVY } });

  heading("Bookings");
  if (report.bookings.length === 0) kv([["No booking records in this period.", ""]]);
  else table(["Booking ID", "Status", "Location", "Total", "Days", "Start", "End"],
    report.bookings.map((b) => [dash(b.bookingID), b.status, dash(b.location), money(b.totalFee), `${b.totalDays}d`, fmtDate(b.startDate), fmtDate(b.endDate)]),
    { columnStyles: { 3: { halign: "right" } }, styles: { fontSize: 7, cellPadding: 3, textColor: NAVY } });

  // page numbers
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRAY);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 20, { align: "right" });
  }

  const name = fileName || `report-${report.period}`;
  if (typeof window === "undefined") return doc;   // node (tests)
  doc.save(`${name}.pdf`);
  return doc;
}