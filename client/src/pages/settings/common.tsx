import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { EllipsisVertical, Info, Star } from 'lucide-react';
import { IconButton } from '../../components/ui';
import { Menu, type MenuItem } from '../../components/overlay';
import { useAuth } from '../../context/AuthContext';
import type { CardDef } from './registry';

export interface SettingsNav {
  /** The settings page currently open (undefined outside Settings, e.g. on /masters). */
  page?: CardDef;
  /** Back to the settings home (asks first when there are unsaved changes). */
  goHome: () => void;
  /** Opens another settings page by card key. */
  open: (key: string) => void;
  /** Reports unsaved changes so navigation can ask before discarding them. */
  setDirty: (dirty: boolean) => void;
  isFav: (key: string) => boolean;
  toggleFav: (key: string) => void;
}

const noop = () => undefined;
const FALLBACK: SettingsNav = { goHome: noop, open: noop, setDirty: noop, isFav: () => false, toggleFav: noop };

export const SettingsNavContext = createContext<SettingsNav | null>(null);

export function useSettingsNav(): SettingsNav {
  return useContext(SettingsNavContext) ?? FALLBACK;
}

/** Registers the page's unsaved-change state with the settings shell. */
export function useDirty(dirty: boolean) {
  const { setDirty } = useSettingsNav();
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
}

/** What the signed-in user may change. Falls back to the role when permissions are not loaded. */
export function usePerms(): { settings: boolean; rates: boolean } {
  const { user } = useAuth();
  const p = user?.permissions;
  const admin = user?.role === 'admin';
  return {
    settings: p ? !!p['settings.manage'] : admin,
    rates: p ? !!p['rates.manage'] : admin,
  };
}

export function FavStar({ active, onToggle, className = '' }: { active: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={`adm-star ${active ? 'on' : ''} ${className}`}
      data-tour="settings-fav"
      aria-pressed={active}
      aria-label={active ? 'Remove from favourite settings' : 'Add to favourite settings'}
      title={active ? 'Remove from favourites' : 'Add to favourites'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Star size={15} />
    </button>
  );
}

/** Settings sub-page frame: breadcrumb, bold title, actions top-right, optional sticky footer. */
export function SubPage({
  title,
  description,
  actions,
  footer,
  fill,
  children,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** The body does not scroll; the child fills the height and scrolls itself. */
  fill?: boolean;
  children: ReactNode;
}) {
  const nav = useSettingsNav();
  const heading = title ?? nav.page?.pageTitle ?? nav.page?.title ?? '';
  const key = nav.page?.key;
  const desc = description === undefined ? nav.page?.description : description;
  return (
    <div className="adm-sp">
      <div className="adm-sp-head">
        <div className="grow">
          <nav className="adm-crumb" aria-label="Breadcrumb">
            <button type="button" onClick={nav.goHome}>
              Settings
            </button>
            <span aria-hidden="true">/</span>
            <span className="ellipsis">{heading}</span>
          </nav>
          <div className="row">
            <h1 className="adm-sp-title">{heading}</h1>
            {key && <FavStar active={nav.isFav(key)} onToggle={() => nav.toggleFav(key)} className="adm-star-inline" />}
          </div>
          {desc && <div className="adm-sub">{desc}</div>}
        </div>
        {actions && <div className="adm-sp-actions">{actions}</div>}
      </div>
      <div className={fill ? 'adm-sp-body adm-sp-fill' : 'adm-sp-body'}>{children}</div>
      {footer && <div className="adm-sp-footer">{footer}</div>}
    </div>
  );
}

export function ReadOnlyNote({ children }: { children?: ReactNode }) {
  return (
    <div className="alert alert-info adm-readonly">
      <Info size={15} style={{ flex: 'none', marginTop: 1 }} />
      <span>{children ?? 'You can view these settings. Ask an administrator for permission to change them.'}</span>
    </div>
  );
}

/** Three-dot row menu. */
export function Kebab({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  return (
    <Menu
      placement="bottom-start"
      items={items}
      trigger={({ ref, onClick, open }) => (
        <IconButton ref={ref} size="sm" onClick={onClick} active={open} aria-label={label} aria-haspopup="menu" aria-expanded={open}>
          <EllipsisVertical size={15} />
        </IconButton>
      )}
    />
  );
}

/** Grey shimmer rows shown while a table loads. */
export function SkeletonRows({ rows = 8, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="adm-skel-row" aria-hidden="true">
          {Array.from({ length: cols }, (_, j) => (
            <td key={j}>
              <span className="skeleton adm-skel" style={{ width: `${45 + ((i * 17 + j * 29) % 50)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function UnsavedNote({ count, noun = 'change' }: { count: number; noun?: string }) {
  if (!count) return <span className="adm-toolbar-note">No unsaved changes</span>;
  return (
    <span className="adm-toolbar-note warn">
      {count} unsaved {noun}
      {count > 1 ? 's' : ''}
    </span>
  );
}
