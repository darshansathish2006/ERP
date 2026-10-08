import type { ReactNode } from 'react';
import type { ReportData, ReportDesign } from '../../lib/types';
import { chunk } from '../engine';
import { DesignFigure, f3, sizeText } from '../parts';
import { addDesignRemarks, addEvaHead, addProjectsBlock, internalBuilder } from './common';

const TITLE = 'Elevation Diagram Report';
const ROW_H = 392; // cell 380 + 12 gap – see .rp-elev-cell
const FIG_H = 238;

function ElevationCell({ d }: { d: ReportDesign }) {
  return (
    <div className="rp-elev-cell">
      <div className="rp-elev-ref">
        <b>{d.ref}</b>
        {d.name ? <span> · {d.name}</span> : null}
      </div>
      <DesignFigure design={d} height={FIG_H} showDims showLabels={false} />
      <div className="rp-elev-cap">View From Inside</div>
      <div className="rp-elev-info">
        <div>
          <b>Qty:</b> {d.qty}&nbsp;&nbsp; <b>Location:</b> {d.location || '—'}
        </div>
        <div>
          {sizeText(d)}&nbsp;&nbsp; <b>Area:</b> {f3(d.areaSqft)} SqFt
        </div>
        {(d.glassLabels?.length ? d.glassLabels : [d.glassName || '—']).slice(0, 3).map((g, i) => (
          <div key={i} className="rp-elev-glass">
            <b>Glass:</b> {g}
          </div>
        ))}
      </div>
    </div>
  );
}

export function buildElevationPages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addEvaHead(b, data, TITLE, { dateStyle: 'us' });
  addProjectsBlock(b, data);
  addDesignRemarks(b, data);

  if (!data.designs.length) {
    b.add(<div className="rp-nodata">No designs have been added to this quote yet.</div>, 120);
    return b.done();
  }

  chunk(data.designs, 3).forEach((row) => {
    b.add(
      <div className="rp-elev-row">
        {row.map((d) => (
          <ElevationCell key={d.id} d={d} />
        ))}
      </div>,
      ROW_H,
    );
  });
  return b.done();
}
