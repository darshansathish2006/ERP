import { useCallback, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { IconButton } from '../components/ui';

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export interface ZoomState {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

/** Zoom level stepping through ZOOM_STEPS. */
export function useZoom(initial = 1): ZoomState {
  const [zoom, setZoom] = useState(initial);
  const zoomIn = useCallback(() => setZoom((z) => ZOOM_STEPS.find((s) => s > z + 0.001) ?? z), []);
  const zoomOut = useCallback(() => setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? z), []);
  const reset = useCallback(() => setZoom(1), []);
  return { zoom, zoomIn, zoomOut, reset };
}

export function ZoomControls({ zoom, zoomIn, zoomOut, reset }: ZoomState) {
  return (
    <div className="rv-zoom">
      <IconButton tip="Zoom out" tipPos="bottom" onClick={zoomOut} disabled={zoom <= ZOOM_STEPS[0]}>
        <Minus size={15} />
      </IconButton>
      <button type="button" className="rv-zoom-value" onClick={reset} title="Reset to 100%">
        {Math.round(zoom * 100)}%
      </button>
      <IconButton tip="Zoom in" tipPos="bottom" onClick={zoomIn} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}>
        <Plus size={15} />
      </IconButton>
    </div>
  );
}

/** Grey scrolling canvas stacking the A4 pages; zoom uses CSS `zoom` and is reset for print. */
export function ReportCanvas({ zoom, children }: { zoom: number; children: ReactNode }) {
  return (
    <div className="rv-canvas">
      <div className="rv-pages" style={{ zoom }}>
        {children}
      </div>
    </div>
  );
}
