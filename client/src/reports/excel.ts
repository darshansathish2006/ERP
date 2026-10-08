import * as XLSX from 'xlsx';
import type { BomLine, ReportData } from '../lib/types';
import { round2 } from '../lib/format';
import { reportFileName, getReportDef, type ReportKey } from './registry';
import { addressLines, customerName, orderedGroups, sumBy } from './templates/common';
import { technicals } from './templates/typology';
import { barColour, profileBars } from './templates/profileBoq';
import { INSTALLATION_GROUP, accRows, hardwareLines, installationLines, reinforcementLines } from './templates/accessoriesBoq';
import { glassPaneRows, glassSummaryLines } from './templates/glassBoq';
import { barCutsText, cutGroups } from './templates/cuttingSchedule';
import { hardwareColour, hasMesh } from './templates/quotation';
import { designAdjustment, headRows, quoteAdjustment } from './templates/costSummary';
import { glassText } from './templates/windowSchedule';
import { challanNo, dcDescription, looseMaterials } from './templates/deliveryChallan';
import { CHECK_STEPS, prerequisiteItems } from './templates/installationChecklist';
import { ceilQty, istDate, istDateTime, plainText, unitShort } from './parts';
import { printCompany } from './companyDefaults';

type Cell = string | number | null;
type Rows = Cell[][];

const r2 = (v: number) => round2(Number(v) || 0);
const r3 = (v: number) => Math.round((Number(v) || 0) * 1000) / 1000;
const r4 = (v: number) => Math.round((Number(v) || 0) * 10000) / 10000;
const r1 = (v: number) => Math.round((Number(v) || 0) * 10) / 10;

function headerRows(data: ReportData, title: string): Rows {
  return [
    [title],
    [data.company.name],
    ['Project', data.quote.projectName || ''],
    ['Project Code', data.quote.quoteNo || ''],
    ['Date', istDateTime(data.generatedAt)],
    [],
  ];
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: Rows, widths: number[]): void {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  const used = new Set(wb.SheetNames);
  let safe = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
  let n = 2;
  while (used.has(safe)) safe = `${name.slice(0, 27)} (${n++})`;
  XLSX.utils.book_append_sheet(wb, ws, safe);
}

// ---------------------------------------------------------------- per report

function costSummary(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const s = data.summary;
  const rows: Rows = [...headerRows(data, title), ['Price Structure', data.quote.priceStructureName || ''], []];
  rows.push(['Price Element Name', 'Calculation Type', 'Formula', 'Rate', 'Value']);
  for (const h of headRows(s.heads, quoteAdjustment(data))) rows.push([h.name, h.calcType, h.formula, r4(h.rate), r2(h.value)]);
  rows.push([]);
  rows.push(['Total Qty', s.qty]);
  rows.push(['Total Area', `${r3(s.areaSqft)} Sqft.`, `${r3(s.areaSqm)} Sqmt.`]);
  rows.push(['Price per Sqft', `INR ${r2(s.sqftRateWithTax)}`]);
  rows.push(['Price per Sqmt', `INR ${r2(s.sqmRateWithTax)}`]);
  addSheet(wb, 'Cost Summary', rows, [34, 26, 70, 12, 14]);
}

function typology(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const techRows: Rows = [...headerRows(data, title)];
  const labels = data.designs.length ? technicals(data.designs[0]).map(([k]) => k) : ['Design Ref'];
  techRows.push([...labels, 'Unit Basic', 'Unit Grand Total']);
  for (const d of data.designs) techRows.push([...technicals(d).map(([, v]) => v), r2(d.price?.basic ?? d.unitBasic), r2(d.price?.grand ?? d.unitPrice)]);
  addSheet(wb, 'Technicals', techRows, [12, 18, 24, 9, 18, 14, 34, 18, 34, 7, 24, 26, 24, 13, 15]);

  const bom: Rows = [...headerRows(data, title)];
  bom.push(['Design Ref', 'Group', 'Item name', 'Code', 'Qty (per unit)', 'Unit', 'Rate', 'Amount']);
  for (const d of data.designs) {
    for (const g of orderedGroups(d.bom?.lines ?? [], (l) => l.grp)) {
      for (const l of g.items) bom.push([d.ref, g.grp, l.name, l.code, r3(l.qty), l.unit, r2(l.rate), r2(l.amount)]);
      bom.push([d.ref, g.grp, `${g.grp} Total`, null, null, null, null, r2(sumBy(g.items, (l) => l.amount))]);
    }
    bom.push([d.ref, null, 'Total Material Cost (per unit)', null, null, null, null, r2(sumBy(d.bom?.lines ?? [], (l) => l.amount))]);
    bom.push([]);
  }
  addSheet(wb, 'BOM', bom, [12, 22, 42, 18, 14, 8, 10, 12]);

  const cost: Rows = [...headerRows(data, title)];
  cost.push(['Design Ref', 'Price Element Name', 'Calculation Type', 'Formula', 'Rate', 'Value (per unit)']);
  for (const d of data.designs) {
    const manual = d.calcType === 'manual' && d.price?.manualBasic != null;
    for (const h of headRows(d.price?.heads ?? [], manual ? designAdjustment(d) : null)) cost.push([d.ref, h.name, h.calcType, h.formula, r4(h.rate), r2(h.value)]);
    cost.push([]);
  }
  addSheet(wb, 'Cost Summary', cost, [12, 32, 26, 70, 12, 16]);
}

function profileBoq(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const bars = profileBars(data);
  const rows: Rows = [...headerRows(data, title)];
  rows.push(['Sl No.', 'Profile Name', 'Code', 'Color', 'Length (Mtr.)', 'Pcs', 'Billing Qty', 'Unit', 'Used Qty (Mtr.)', 'Wastage (Mtr.)', 'Wastage %']);
  bars.forEach((b, i) => rows.push([i + 1, b.name, b.code, barColour(b), r2(b.barLength), b.pcs, r3(b.billingQty), 'Mtr', r3(b.usedQty), r3(b.wastage), b.wastagePct]));
  rows.push([null, 'Total :', null, null, null, sumBy(bars, (b) => b.pcs), r3(sumBy(bars, (b) => b.billingQty)), 'Mtr', r3(sumBy(bars, (b) => b.usedQty)), r3(sumBy(bars, (b) => b.wastage)), null]);
  addSheet(wb, 'Profile BOQ', rows, [7, 40, 16, 18, 12, 7, 12, 7, 14, 14, 10]);
}

function accSection(rows: Rows, section: string, lines: BomLine[]) {
  rows.push([section]);
  rows.push(['Group', 'Sl No.', 'Accessories Name', 'Code', 'Color', 'Qty', 'Unit', 'Package Qty', 'Package Unit']);
  const items = accRows(lines);
  for (const r of items) rows.push([r.grp, r.sl, r.line.name, r.line.code, r.color, r.qty, r.unit, r.pkgQty, r.pkgUnit]);
  if (!items.length) rows.push([null, null, 'No items']);
  rows.push([]);
}

function accessoriesBoq(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const rows: Rows = [...headerRows(data, title)];
  const remarks = data.designs.filter((d) => String(d.note || '').trim());
  if (remarks.length) {
    rows.push(['Design Remarks']);
    rows.push(['Design Ref', 'Remark Date', 'Remarks']);
    for (const d of remarks) rows.push([d.ref, istDate(d.updatedAt || d.createdAt), d.note]);
    rows.push([]);
  }
  accSection(
    rows,
    'Fabrication Hardware',
    hardwareLines(data).filter((l) => l.grp !== INSTALLATION_GROUP),
  );
  accSection(rows, 'Installation Hardware', installationLines(data));
  const ri = reinforcementLines(data);
  if (ri.length) accSection(rows, 'Reinforcement', ri);
  addSheet(wb, 'Accessories BOQ', rows, [22, 7, 40, 18, 10, 9, 8, 12, 12]);
}

function glassBoq(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const { glass, mesh } = glassPaneRows(data);
  const panes: Rows = [...headerRows(data, title)];
  panes.push(['Type', 'Design Ref', 'Pane', 'Glass', 'Width (mm)', 'Height (mm)', 'Qty', 'Area/pc (Sqm)', 'Total Area (Sqm)']);
  for (const p of glass) panes.push(['Glass', p.ref, p.label, p.glass, r1(p.w), r1(p.h), p.qty, r3(p.area), r3(p.area * p.qty)]);
  for (const p of mesh) panes.push(['Mesh', p.ref, p.label, p.glass, r1(p.w), r1(p.h), p.qty, r3(p.area), r3(p.area * p.qty)]);
  const all = [...glass, ...mesh];
  panes.push([null, null, null, 'Total', null, null, sumBy(all, (p) => p.qty), null, r3(sumBy(all, (p) => p.area * p.qty))]);
  addSheet(wb, 'Glass Panes', panes, [8, 12, 8, 32, 12, 12, 7, 14, 16]);

  const lines = glassSummaryLines(data);
  const sum: Rows = [...headerRows(data, title)];
  sum.push(['Glass', 'Code', 'Total Area (Sqm)', 'Rate', 'Amount']);
  for (const l of lines) sum.push([l.name, l.code, r3(l.qty), r2(l.rate), r2(l.amount)]);
  sum.push(['Total', null, r3(sumBy(lines, (l) => l.qty)), null, r2(sumBy(lines, (l) => l.amount))]);
  addSheet(wb, 'Glass Summary', sum, [34, 14, 16, 10, 14]);
}

function cuttingSchedule(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const groups = cutGroups(data);
  const cuts: Rows = [...headerRows(data, title)];
  cuts.push(['Profile Code', 'Profile Name', 'Colour', 'Design Ref', 'Member', 'Cut length (mm)', 'Angle', 'Qty']);
  for (const g of groups) for (const r of g.rows) cuts.push([g.code, g.name, g.color, r.ref, r.member, r1(r.length), r.angle, r.qty]);
  addSheet(wb, 'Cutting List', cuts, [16, 38, 18, 11, 26, 15, 12, 7]);

  const bars: Rows = [...headerRows(data, title)];
  bars.push(['Profile Code', 'Profile Name', 'Bar Length (m)', 'Bar #', 'Cuts in bar (mm)', 'Used (mm)', 'Offcut (mm)']);
  for (const g of groups) {
    if (!g.bar) continue;
    g.bar.bars.forEach((b, i) => bars.push([g.code, g.name, r2(g.bar?.barLength ?? 0), i + 1, barCutsText(b.cuts), r1(b.used), r1(b.offcut)]));
  }
  addSheet(wb, 'Bar Optimisation', bars, [16, 38, 14, 7, 60, 12, 12]);
}

function elevation(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const rows: Rows = [...headerRows(data, title)];
  rows.push(['Design Ref', 'Name', 'Location', 'Qty', 'Width (mm)', 'Height (mm)', 'Area (SqFt)', 'Glass', 'Remarks']);
  for (const d of data.designs) rows.push([d.ref, d.name, d.location, d.qty, d.data?.width ?? null, d.data?.height ?? null, r3(d.areaSqft), (d.glassLabels ?? []).join('; '), d.note || '']);
  addSheet(wb, 'Elevation', rows, [12, 20, 20, 7, 12, 12, 12, 40, 40]);
}

function windowSchedule(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const rows: Rows = [...headerRows(data, title)];
  rows.push(['Sl No', 'Design Ref', 'Name', 'Location', 'Floor', 'W (mm)', 'H (mm)', 'Qty', 'Area/pc (Sqft)', 'Total Area (Sqft)', 'System', 'Colour', 'Glass']);
  data.designs.forEach((d, i) =>
    rows.push([
      i + 1,
      d.ref,
      d.name,
      d.location,
      d.floor,
      d.data?.width ?? null,
      d.data?.height ?? null,
      d.qty,
      r2(d.areaSqft),
      r2((Number(d.areaSqft) || 0) * d.qty),
      d.systemName,
      d.colorName,
      glassText(d).replace(/\n/g, '; '),
    ]),
  );
  rows.push([null, 'Total', null, null, null, null, null, sumBy(data.designs, (d) => d.qty), null, r2(sumBy(data.designs, (d) => (Number(d.areaSqft) || 0) * d.qty))]);
  addSheet(wb, 'Window Schedule', rows, [7, 11, 18, 18, 10, 9, 9, 6, 13, 15, 36, 16, 36]);
}

function deliveryChallan(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const rows: Rows = [
    [title],
    [data.company.name],
    ['Challan No', challanNo(data)],
    ['Date', istDate(data.generatedAt)],
    ['Customer', customerName(data)],
    ['Site address', addressLines(data.quote).join(', ')],
    ['Project', data.quote.projectName || ''],
    ['Vehicle No', ''],
    ['Driver', ''],
    [],
    ['Windows'],
    ['Sl No', 'Design Ref', 'Description', 'Qty', 'Remarks'],
  ];
  data.designs.forEach((d, i) => rows.push([i + 1, d.ref, dcDescription(d), d.qty, '']));
  rows.push([null, null, 'Total Qty', sumBy(data.designs, (d) => d.qty)]);
  rows.push([]);
  rows.push(['Loose materials']);
  rows.push(['Sl No', 'Item', 'Code', 'Qty', 'Unit', 'Remarks']);
  looseMaterials(data).forEach((l, i) => rows.push([i + 1, l.name, l.code, ceilQty(l.qty), unitShort(l.unit), '']));
  rows.push([]);
  rows.push(['Prepared by', null, 'Checked by', null, 'Received by (customer)']);
  addSheet(wb, 'Delivery Challan', rows, [14, 14, 40, 18, 22, 20]);
}

function installationChecklist(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const rows: Rows = [...headerRows(data, title)];
  rows.push(['Customer', customerName(data)]);
  rows.push(['Site', addressLines(data.quote).join(', ')]);
  rows.push([]);
  rows.push(['Design Ref', 'Qty', 'Location', 'Size (mm)', ...CHECK_STEPS]);
  for (const d of data.designs) rows.push([d.ref, d.qty, d.location, `${d.data?.width ?? ''} x ${d.data?.height ?? ''}`, ...CHECK_STEPS.map(() => '')]);
  rows.push([]);
  rows.push(['Pre-installation checklist']);
  for (const it of prerequisiteItems(printCompany(data.company).prerequisites)) rows.push([it.sub ? `   ${it.marker}` : it.marker, plainText(it.text), '', 'Done']);
  rows.push([]);
  rows.push(['Installation supervisor', null, 'Checked by', null, 'Customer / authorised signatory']);
  addSheet(wb, 'Installation Checklist', rows, [14, 60, 18, 14, 16, 16, 16, 18, 12]);
}

function quotation(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const rows: Rows = [...headerRows(data, title)];
  rows.push(['Code', 'Name', 'Location', 'Width (mm)', 'Height (mm)', 'Profile System', 'Profile Color', 'Handle color', 'Mesh', 'Glass', 'Sq.Ft per window', 'Value per Sq.Ft', 'Unit price', 'Qty', 'Value']);
  for (const d of data.designs) {
    rows.push([
      d.ref,
      d.name,
      d.location,
      d.data?.width ?? null,
      d.data?.height ?? null,
      d.systemName,
      d.colorName,
      hardwareColour(d),
      hasMesh(d) ? 'Yes' : 'No',
      (d.glassLabels ?? []).join('; '),
      r2(d.areaSqft),
      r2(d.areaSqft ? d.unitBasic / d.areaSqft : 0),
      r2(d.unitBasic),
      d.qty,
      r2(d.unitBasic * d.qty),
    ]);
  }
  rows.push([]);
  rows.push(['No. of Components', data.summary.qty]);
  rows.push(['Total Area (Sq.Ft)', r2(data.summary.areaSqft)]);
  for (const h of data.summary.heads) if (h.visibility === 'summary') rows.push([h.name, r2(h.value)]);
  rows.push(['Average Price per Sq.Ft. without GST', r2(data.summary.sqftRate)]);
  rows.push(['Average Price per Sq.Ft.', r2(data.summary.sqftRateWithTax)]);
  addSheet(wb, 'Quotation', rows, [30, 18, 18, 11, 11, 34, 16, 12, 7, 36, 14, 14, 14, 7, 14]);
}

function designAssembly(wb: XLSX.WorkBook, data: ReportData, title: string) {
  const cuts: Rows = [...headerRows(data, title)];
  cuts.push(['Design Ref', 'Member', 'Profile', 'Code', 'Length (mm)', 'Angle', 'Qty/unit', 'Total']);
  for (const d of data.designs) for (const c of d.bom?.cuts ?? []) cuts.push([d.ref, c.member, c.name, c.code, r1(c.length), c.angle, c.qty, c.qty * d.qty]);
  addSheet(wb, 'Cut List', cuts, [12, 26, 38, 16, 12, 12, 9, 8]);
  const hw: Rows = [...headerRows(data, title)];
  hw.push(['Design Ref', 'Code', 'Item', 'Qty/unit', 'Total Qty', 'Unit']);
  for (const d of data.designs)
    for (const l of (d.bom?.lines ?? []).filter((x) => x.category === 'hardware')) hw.push([d.ref, l.code, l.name, r3(l.qty), r3(l.qty * d.qty), l.unit]);
  addSheet(wb, 'Hardware', hw, [12, 16, 40, 10, 10, 8]);
}

const WRITERS: Record<ReportKey, (wb: XLSX.WorkBook, data: ReportData, title: string) => void> = {
  elevation,
  'window-schedule': windowSchedule,
  quotation,
  'project-cost-summary': costSummary,
  'typology-cost-breakup': typology,
  'profile-boq': profileBoq,
  'accessories-boq': accessoriesBoq,
  'glass-boq': glassBoq,
  'cutting-schedule': cuttingSchedule,
  'design-assembly': designAssembly,
  'delivery-challan': deliveryChallan,
  'installation-checklist': installationChecklist,
};

/** Build an Excel workbook for a report and download it, e.g. `Profile_BOQ_TIT-QT-00003593.xlsx`. */
export function downloadReportExcel(reportKey: ReportKey, data: ReportData, filename?: string): void {
  const wb = XLSX.utils.book_new();
  const title = getReportDef(reportKey)?.title ?? 'Report';
  WRITERS[reportKey](wb, data, title);
  XLSX.writeFile(wb, filename || reportFileName(reportKey, data.quote.quoteNo, 'xlsx'), { compression: true });
}
