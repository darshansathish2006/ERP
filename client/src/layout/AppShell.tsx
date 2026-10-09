import { useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Boxes,
  ChevronDown,
  CircleHelp,
  Contact,
  FileText,
  Grid3x3,
  LayoutGrid,
  Lightbulb,
  LogOut,
  PlayCircle,
  Settings,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MastersContext';
import { IconButton } from '../components/ui';
import { Menu, Popover } from '../components/overlay';
import { initials } from '../lib/format';
import { useTour } from '../tour/TourProvider';
import { EvaLogo } from './EvaLogo';

export const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, tour: 'nav-dashboard' },
  { to: '/contacts', label: 'Contacts', icon: Contact, tour: 'nav-contacts' },
  { to: '/opportunity', label: 'Opportunities', icon: Lightbulb, tour: 'nav-opportunity' },
  { to: '/quotes', label: 'Quotes', icon: FileText, tour: 'nav-quotes' },
  { to: '/guide', label: 'Guide', icon: BookOpen, tour: 'nav-guide' },
];

const BANNER_KEY = 'titans.bannerDismissed';

export function MaintenanceBanner() {
  const { masters } = useMasters();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_KEY) === masters.banner.message;
    } catch {
      return false;
    }
  });
  if (!masters.banner.enabled || !masters.banner.message || dismissed) return null;
  return (
    <div className="banner" role="status">
      <span>{masters.banner.message}</span>
      <button
        className="banner-close"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(BANNER_KEY, masters.banner.message);
          } catch {
            /* ignore */
          }
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function TopbarActions() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const tour = useTour();
  const [apps, setApps] = useState(false);
  const appsRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="topbar-actions">
      <IconButton tip="Help & guide" tipPos="bottom" onClick={() => navigate('/guide')} data-tour="topbar-help">
        <CircleHelp size={17} />
      </IconButton>
      <IconButton tip="Tour of this page" tipPos="bottom" onClick={() => tour.startForPage()} disabled={tour.running} data-tour="topbar-tour">
        <PlayCircle size={17} />
      </IconButton>
      <IconButton ref={appsRef} tip="Apps" tipPos="bottom" onClick={() => setApps((a) => !a)} data-tour="topbar-apps">
        <Grid3x3 size={17} />
      </IconButton>
      <Popover open={apps} onClose={() => setApps(false)} anchor={appsRef} placement="bottom-end">
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 92px)', gap: 6 }}>
          {[...NAV, { to: '/masters', label: 'Rate Master', icon: Boxes }, { to: '/settings', label: 'Settings', icon: Settings }].map((n) => (
            <button
              key={n.to}
              className="btn btn-ghost"
              style={{ height: 70, flexDirection: 'column', gap: 6, fontSize: 11.5 }}
              onClick={() => {
                setApps(false);
                navigate(n.to);
              }}
            >
              <n.icon size={20} color="var(--primary)" />
              {n.label}
            </button>
          ))}
        </div>
      </Popover>
      <Menu
        placement="bottom-end"
        trigger={({ ref, onClick }) => (
          <button ref={ref} className="avatar-btn" onClick={onClick} aria-label="Account menu" data-tour="topbar-account">
            <span className="avatar">{initials(user?.name)}</span>
            <ChevronDown size={14} />
          </button>
        )}
        items={[
          { heading: user?.email || '' },
          { label: 'My profile', icon: <UserIcon size={15} />, onClick: () => navigate('/profile') },
          { label: 'Settings', icon: <Settings size={15} />, onClick: () => navigate('/settings') },
          { label: 'Guide', icon: <BookOpen size={15} />, onClick: () => navigate('/guide') },
          { separator: true },
          {
            label: 'Logout',
            icon: <LogOut size={15} />,
            danger: true,
            onClick: async () => {
              await logout();
              navigate('/login');
            },
          },
        ]}
      />
    </div>
  );
}

export function AppShell() {
  const { epoch } = useTour();
  return (
    <div className="shell">
      <MaintenanceBanner />
      <div className="shell-main">
        <nav className="sidebar" aria-label="Main navigation" data-tour="nav-sidebar">
          <div className="sidebar-logo">
            <EvaLogo size={28} />
          </div>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
              data-tip={n.label}
              data-tip-pos="right"
              aria-label={n.label}
              data-tour={n.tour}
            >
              <n.icon size={19} />
            </NavLink>
          ))}
          <div className="sidebar-spacer" />
          <NavLink to="/settings" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} data-tip="Settings" data-tip-pos="right" aria-label="Settings" data-tour="nav-settings">
            <Settings size={19} />
          </NavLink>
        </nav>
        <div className="shell-content">
          <header className="topbar">
            <TopbarActions />
          </header>
          {/* Re-mounted after the tour's sample project is removed, so lists reload without it. */}
          <Outlet key={epoch} />
        </div>
      </div>
    </div>
  );
}
