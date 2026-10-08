/** Report catalogue. Keys are shared with the server (favourite reports). */
export const REPORT_KEYS = [
  'elevation',
  'window-schedule',
  'quotation',
  'project-cost-summary',
  'typology-cost-breakup',
  'profile-boq',
  'accessories-boq',
  'glass-boq',
  'cutting-schedule',
  'design-assembly',
  'delivery-challan',
  'installation-checklist',
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

export type ReportCategory = 'basic' | 'quotation' | 'purchase' | 'production' | 'dispatch';

export const REPORT_CATEGORIES: { key: ReportCategory; label: string }[] = [
  { key: 'basic', label: 'Project Basic Details' },
  { key: 'quotation', label: 'Quotation & Costing' },
  { key: 'purchase', label: 'Material Purchase Orders' },
  { key: 'production', label: 'Production Reports' },
  { key: 'dispatch', label: 'Dispatch & Installation' },
];

export interface ReportDef {
  key: ReportKey;
  title: string;
  description: string;
  category: ReportCategory;
  /** Has an Excel export. */
  tabular: boolean;
  /** Internal costing report – needs the `reports.costing` permission. */
  costing?: boolean;
  /** File name stem, e.g. `Quotation` -> `Quotation_TIT-QT-00003593.pdf`. */
  filePrefix: string;
}

export const REPORTS: ReportDef[] = [
  { key: 'elevation', title: 'Elevation Report', description: 'Elevation Report', category: 'basic', tabular: false, filePrefix: 'Elevation_Report' },
  {
    key: 'window-schedule',
    title: 'Window Schedule',
    description: 'Lists every window with size, area, location and specification.',
    category: 'basic',
    tabular: true,
    filePrefix: 'Window_Schedule',
  },
  {
    key: 'quotation',
    title: 'Quotation',
    description: 'A formal document providing the estimated cost for goods and services.',
    category: 'quotation',
    tabular: false,
    filePrefix: 'Quotation',
  },
  {
    key: 'project-cost-summary',
    title: 'Project Cost Summary',
    description: 'Summarizes the overall cost breakdown of the entire project.',
    category: 'quotation',
    tabular: true,
    costing: true,
    filePrefix: 'Project_Cost_Summary',
  },
  {
    key: 'typology-cost-breakup',
    title: 'Typology Cost Breakup report',
    description: 'Analyzes all the cost distribution based on different typologies in the project.',
    category: 'quotation',
    tabular: true,
    costing: true,
    filePrefix: 'Typology_Cost_Breakup',
  },
  {
    key: 'profile-boq',
    title: 'Profile BOQ Report',
    description: 'A Bill of Quantities report detailing the profiles required for the project.',
    category: 'purchase',
    tabular: true,
    filePrefix: 'Profile_BOQ',
  },
  {
    key: 'accessories-boq',
    title: 'Accessories BOQ Report',
    description: 'A Bill of Quantities report detailing the accessories and hardware required for the project.',
    category: 'purchase',
    tabular: true,
    filePrefix: 'Accessories_BOQ',
  },
  {
    key: 'glass-boq',
    title: 'Glass BOQ Report',
    description: 'A Bill of Quantities report detailing the different glass required for the project.',
    category: 'purchase',
    tabular: true,
    filePrefix: 'Glass_BOQ',
  },
  {
    key: 'cutting-schedule',
    title: 'Cutting Schedule Report',
    description: 'Details the cutting schedule for the fabrication of profile materials.',
    category: 'production',
    tabular: true,
    filePrefix: 'Cutting_Schedule',
  },
  {
    key: 'design-assembly',
    title: 'Design Assembly Report',
    description: 'Provides a comprehensive assembly report for the design phase.',
    category: 'production',
    tabular: false,
    filePrefix: 'Design_Assembly',
  },
  {
    key: 'delivery-challan',
    title: 'Delivery Challan',
    description: 'Dispatch note listing windows and loose materials sent to site.',
    category: 'dispatch',
    tabular: true,
    filePrefix: 'Delivery_Challan',
  },
  {
    key: 'installation-checklist',
    title: 'Installation Checklist',
    description: 'Site installation checklist and handover sign-off for each window.',
    category: 'dispatch',
    tabular: true,
    filePrefix: 'Installation_Checklist',
  },
];

export function isReportKey(key: string | null | undefined): key is ReportKey {
  return !!key && (REPORT_KEYS as readonly string[]).includes(key);
}

export function getReportDef(key: string | null | undefined): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}

/** Whether a user with the given permissions may open the report. */
export function canViewReport(def: Pick<ReportDef, 'costing'> | undefined, canCosting: boolean): boolean {
  return !!def && (!def.costing || canCosting);
}

/** `Quotation_TIT-QT-00003593.pdf` */
export function reportFileName(key: ReportKey, quoteNo: string | null | undefined, ext: 'pdf' | 'xlsx'): string {
  const def = getReportDef(key);
  const stem = def?.filePrefix ?? 'Report';
  const no = String(quoteNo || 'Quote').replace(/[\\/:*?"<>|\s]+/g, '-');
  return `${stem}_${no}.${ext}`;
}
