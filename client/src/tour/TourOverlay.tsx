import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import type { RunStep, TourPlacement } from './types';
import { findAny, isVisible } from './dom';

export type TourPhase = 'preparing' | 'loading' | 'ready';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MARGIN = 12;
const GAP = 14;

/** Follows the highlighted element on screen (scrolling, resizing, re-rendering). */
function useTargetBox(selectors: string[] | null, padding: number): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!selectors) {
      setBox(null);
      return;
    }
    let el: HTMLElement | null = null;
    let raf = 0;
    let last = '';
    const loop = () => {
      if (!el || !isVisible(el)) el = findAny(selectors);
      let next: Box | null = null;
      if (el) {
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const left = Math.max(4, Math.round(r.left - padding));
        const top = Math.max(4, Math.round(r.top - padding));
        const right = Math.min(vw - 4, Math.round(r.right + padding));
        const bottom = Math.min(vh - 4, Math.round(r.bottom + padding));
        if (right > left && bottom > top) next = { left, top, width: right - left, height: bottom - top };
      }
      const key = next ? `${next.left},${next.top},${next.width},${next.height}` : '';
      if (key !== last) {
        last = key;
        setBox(next);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [selectors, padding]);
  return box;
}

interface Placed {
  left: number;
  top: number;
  side: 'top' | 'bottom' | 'left' | 'right' | 'center';
  arrow: number;
}

function place(box: Box | null, w: number, h: number, pref: TourPlacement | undefined): Placed {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const center: Placed = { left: Math.max(MARGIN, (vw - w) / 2), top: Math.max(MARGIN, (vh - h) / 2), side: 'center', arrow: 0 };
  if (!box || pref === 'center') return center;
  const clampX = (x: number) => Math.max(MARGIN, Math.min(x, vw - w - MARGIN));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(y, vh - h - MARGIN));
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const options: Record<'top' | 'bottom' | 'left' | 'right', () => Placed | null> = {
    bottom: () => {
      const top = box.top + box.height + GAP;
      if (top + h > vh - MARGIN) return null;
      const left = clampX(cx - w / 2);
      return { left, top, side: 'bottom', arrow: Math.max(18, Math.min(w - 18, cx - left)) };
    },
    top: () => {
      const top = box.top - GAP - h;
      if (top < MARGIN) return null;
      const left = clampX(cx - w / 2);
      return { left, top, side: 'top', arrow: Math.max(18, Math.min(w - 18, cx - left)) };
    },
    right: () => {
      const left = box.left + box.width + GAP;
      if (left + w > vw - MARGIN) return null;
      const top = clampY(cy - h / 2);
      return { left, top, side: 'right', arrow: Math.max(18, Math.min(h - 18, cy - top)) };
    },
    left: () => {
      const left = box.left - GAP - w;
      if (left < MARGIN) return null;
      const top = clampY(cy - h / 2);
      return { left, top, side: 'left', arrow: Math.max(18, Math.min(h - 18, cy - top)) };
    },
  };
  const order: ('top' | 'bottom' | 'left' | 'right')[] = ['bottom', 'top', 'right', 'left'];
  const first = pref && pref !== 'auto' ? [pref, ...order.filter((o) => o !== pref)] : order;
  for (const side of first) {
    const p = options[side]();
    if (p) return p;
  }
  // The target fills the screen: sit in the bottom-right corner on top of it.
  return { left: vw - w - MARGIN - 8, top: vh - h - MARGIN - 8, side: 'center', arrow: 0 };
}

export function TourOverlay({
  step,
  index,
  total,
  phase,
  selectors,
  onNext,
  onBack,
  onSkip,
  onClose,
  onNextChapter,
}: {
  /** Null while the tour is being prepared. */
  step: RunStep | null;
  index: number;
  total: number;
  phase: TourPhase;
  /** Null shows the card in the middle of the screen without a spotlight. */
  selectors: string[] | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onClose: () => void;
  onNextChapter?: () => void;
}) {
  const box = useTargetBox(selectors, step?.padding ?? 6);
  const popRef = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<Placed | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const ready = phase === 'ready';
  const isLast = index >= total - 1;

  useEffect(() => {
    const h = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Position the card next to the target (or keep it where it is while the next step loads).
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    // While loading, or for the frame before the target is measured, keep the card where it is.
    const waitingForBox = ready && !!selectors && !box;
    if ((!ready || waitingForBox) && pos) return;
    setPos(place(ready ? box : null, el.offsetWidth, el.offsetHeight, step?.placement));
  }, [box, ready, selectors, step?.id, step?.chapterId, step?.placement, vp]);

  // Keyboard: ← → and Esc. Captured first so page shortcuts do not also react.
  const handlers = useRef({ onNext, onBack, onClose, ready, index });
  handlers.current = { onNext, onBack, onClose, ready, index };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const s = handlers.current;
      if (k === 'Escape') s.onClose();
      else if (k === 'ArrowRight') s.onNext();
      else if (s.index > 0) s.onBack();
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, []);

  // Keep keyboard focus on the card so typing shortcuts reach the tour, not a field underneath.
  useEffect(() => {
    if (ready) nextRef.current?.focus({ preventScroll: true });
  }, [ready, index]);

  const pct = total ? Math.round(((index + 1) / total) * 100) : 0;
  const spot = ready && box;

  return createPortal(
    <div
      className="tour-layer"
      onMouseDown={(e) => {
        // Clicks inside the tour must not count as "outside clicks" that close the page's menus.
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {spot ? (
        <div className="tour-spot" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={popRef}
        className={`tour-pop side-${pos?.side ?? 'center'} ${pos ? 'placed' : ''}`}
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        data-phase={phase}
        data-step={step ? `${step.chapterId}:${step.id}` : undefined}
        data-spot={spot ? 'yes' : 'no'}
        aria-describedby="tour-body"
      >
        {pos && pos.side !== 'center' && (
          <span className="tour-arrow" style={pos.side === 'top' || pos.side === 'bottom' ? { left: pos.arrow } : { top: pos.arrow }} />
        )}
        <button type="button" className="tour-x" onClick={onClose} aria-label="Close tour" title="Close tour (Esc)">
          <X size={16} />
        </button>
        {step ? (
          <>
            <div className="tour-chapter">
              {step.chapterTitle}
              <span className="tour-chapter-count">
                {step.chapterStep}/{step.chapterSize}
              </span>
            </div>
            <h3 id="tour-title" className="tour-title">
              {step.title}
            </h3>
            <p id="tour-body" className="tour-body" aria-live="polite">
              {step.body}
            </p>
          </>
        ) : (
          <>
            <div className="tour-chapter">Getting ready</div>
            <h3 id="tour-title" className="tour-title">
              Preparing your tour…
            </h3>
            <p id="tour-body" className="tour-body">
              Setting up a sample project to show you around. This takes a second.
            </p>
          </>
        )}
        <div className="tour-progress">
          <div className="tour-bar" aria-hidden="true">
            <span style={{ width: `${step ? pct : 2}%` }} />
          </div>
          <div className="tour-progress-row">
            <span className="tour-count">{step ? `Step ${index + 1} of ${total}` : ' '}</span>
            {onNextChapter && step && (
              <button type="button" className="tour-linkbtn" onClick={onNextChapter}>
                Next chapter ›
              </button>
            )}
          </div>
        </div>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={onSkip}>
            Skip tour
          </button>
          <div className="tour-grow" />
          {!ready && <span className="tour-spinner" aria-label="Loading" />}
          <button type="button" className="tour-btn" onClick={onBack} disabled={!step || index === 0}>
            <ArrowLeft size={14} /> Back
          </button>
          <button type="button" ref={nextRef} className="tour-btn tour-btn-primary" onClick={onNext} disabled={!step}>
            {isLast ? (
              <>
                Finish <Check size={14} />
              </>
            ) : (
              <>
                Next <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
