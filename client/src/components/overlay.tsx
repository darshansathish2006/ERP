import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div
      className="backdrop"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${size !== 'md' ? `modal-${size}` : ''}`} role="dialog" aria-modal="true">
        {title != null && (
          <div className="modal-header">
            <div className="modal-title">{title}</div>
            <button className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'normal',
  backdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'normal' | 'wide' | 'xwide';
  backdrop?: boolean;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      {backdrop && <div className="drawer-backdrop" onMouseDown={onClose} />}
      <aside className={`drawer ${width === 'wide' ? 'drawer-wide' : width === 'xwide' ? 'drawer-xwide' : ''}`} role="dialog" aria-modal="true">
        {title != null && (
          <div className="drawer-header">
            <span>{title}</span>
            <button className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-footer">{footer}</div>}
      </aside>
    </>,
    document.body,
  );
}

type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-start' | 'right-end';

/** Positions a fixed element next to an anchor, flipping to stay on screen. */
export function useAnchoredPosition(open: boolean, anchor: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>, placement: Placement = 'bottom-start', matchWidth = false) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden', top: 0, left: 0 });
  const update = useCallback(() => {
    const a = anchor.current;
    const p = panel.current;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    const pw = matchWidth ? Math.max(r.width, p.offsetWidth) : p.offsetWidth;
    const ph = p.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top: number;
    let left: number;
    if (placement.startsWith('right')) {
      left = r.right + 6;
      top = placement === 'right-end' ? r.bottom - ph : r.top;
      if (left + pw > vw - 8) left = r.left - pw - 6;
    } else {
      const wantTop = placement.startsWith('top');
      top = wantTop ? r.top - ph - 4 : r.bottom + 4;
      if (!wantTop && top + ph > vh - 8 && r.top - ph - 4 > 8) top = r.top - ph - 4;
      if (wantTop && top < 8) top = r.bottom + 4;
      left = placement.endsWith('end') ? r.right - pw : r.left;
    }
    left = Math.max(8, Math.min(left, vw - pw - 8));
    top = Math.max(8, Math.min(top, vh - ph - 8));
    setStyle({ top, left, width: matchWidth ? pw : undefined, visibility: 'visible' });
  }, [anchor, panel, placement, matchWidth]);
  useLayoutEffect(() => {
    if (!open) return;
    update();
    const h = () => update();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    const ro = new ResizeObserver(h);
    if (panel.current) ro.observe(panel.current);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
      ro.disconnect();
    };
  }, [open, update, panel]);
  return style;
}

function useOutsideClose(open: boolean, refs: RefObject<HTMLElement | null>[], onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (refs.some((r) => r.current && r.current.contains(t))) return;
      onClose();
    };
    const id = window.setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', h);
    };
  }, [open, refs, onClose]);
}

export interface MenuItem {
  label?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  heading?: string;
}

/** A trigger + dropdown menu. */
export function Menu({ trigger, items, placement = 'bottom-end' }: { trigger: (props: { ref: RefObject<HTMLButtonElement | null>; onClick: (e: React.MouseEvent) => void; open: boolean }) => ReactNode; items: MenuItem[]; placement?: Placement }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const style = useAnchoredPosition(open, anchorRef, panelRef, placement);
  const refs = useRef([anchorRef, panelRef]).current as RefObject<HTMLElement | null>[];
  useOutsideClose(open, refs, close);
  useEscape(open, close);
  return (
    <>
      {trigger({
        ref: anchorRef,
        open,
        onClick: (e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        },
      })}
      {open &&
        createPortal(
          <div className="menu" ref={panelRef} style={style} role="menu" onClick={(e) => e.stopPropagation()}>
            {items.map((it, i) =>
              it.separator ? (
                <div key={i} className="menu-sep" />
              ) : it.heading ? (
                <div key={i} className="menu-label">
                  {it.heading}
                </div>
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  className={`menu-item ${it.danger ? 'danger' : ''}`}
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onClick?.();
                  }}
                >
                  {it.icon}
                  {it.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Popover anchored to an element, controlled by parent. */
export function Popover({
  open,
  onClose,
  anchor,
  children,
  placement = 'bottom-start',
  className = '',
  style: extra,
}: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  placement?: Placement;
  className?: string;
  style?: React.CSSProperties;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const style = useAnchoredPosition(open, anchor, panelRef, placement);
  const refs = useRef([anchor, panelRef]).current as RefObject<HTMLElement | null>[];
  useOutsideClose(open, refs, onClose);
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className={`popover ${className}`} ref={panelRef} style={{ ...style, ...extra }}>
      {children}
    </div>,
    document.body,
  );
}
