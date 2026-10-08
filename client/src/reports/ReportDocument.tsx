import { useMemo, type ReactNode } from 'react';
import type { ReportData } from '../lib/types';
import type { ReportKey } from './registry';
import { PagedDocument } from './parts';
import { buildQuotationPages, type QuotationSource } from './templates/quotation';
import { buildElevationPages } from './templates/elevation';
import { buildWindowSchedulePages } from './templates/windowSchedule';
import { buildCostSummaryPages } from './templates/costSummary';
import { buildTypologyPages } from './templates/typology';
import { buildProfileBoqPages } from './templates/profileBoq';
import { buildAccessoriesBoqPages } from './templates/accessoriesBoq';
import { buildGlassBoqPages } from './templates/glassBoq';
import { buildCuttingSchedulePages } from './templates/cuttingSchedule';
import { buildDesignAssemblyPages } from './templates/designAssembly';
import { buildDeliveryChallanPages } from './templates/deliveryChallan';
import { buildInstallationChecklistPages } from './templates/installationChecklist';

const BUILDERS: Record<ReportKey, (data: ReportData) => ReactNode[][]> = {
  elevation: buildElevationPages,
  'window-schedule': buildWindowSchedulePages,
  quotation: buildQuotationPages,
  'project-cost-summary': buildCostSummaryPages,
  'typology-cost-breakup': buildTypologyPages,
  'profile-boq': buildProfileBoqPages,
  'accessories-boq': buildAccessoriesBoqPages,
  'glass-boq': buildGlassBoqPages,
  'cutting-schedule': buildCuttingSchedulePages,
  'design-assembly': buildDesignAssemblyPages,
  'delivery-challan': buildDeliveryChallanPages,
  'installation-checklist': buildInstallationChecklistPages,
};

/** Paginated page bodies for a report (each entry is one A4 page). */
export function buildReportPages(key: ReportKey, data: ReportData): ReactNode[][] {
  return BUILDERS[key](data);
}

/** A complete report as a stack of `.a4-page` sections. Context-free, so it can be mounted off-screen. */
export function ReportDocument({ reportKey, data }: { reportKey: ReportKey; data: ReportData }) {
  const pages = useMemo(() => buildReportPages(reportKey, data), [reportKey, data]);
  return <PagedDocument pages={pages} company={data.company} variant={reportKey === 'quotation' ? 'quote' : 'internal'} />;
}

/** The customer quotation from a partial source (public smart-quote). */
export function QuotationDocument({ src }: { src: QuotationSource }) {
  const pages = useMemo(() => buildQuotationPages(src), [src]);
  return <PagedDocument pages={pages} company={src.company} variant="quote" />;
}

export type { QuotationSource };
