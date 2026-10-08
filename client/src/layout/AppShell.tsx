import { useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
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
import { Drawer, Menu, Modal, Popover } from '../components/overlay';
import { Button } from '../components/ui';
import { initials } from '../lib/format';
import { EvaLogo } from './EvaLogo';

export const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/contacts', label: 'Contacts', icon: Contact },
  { to: '/opportunity', label: 'Opportunities', icon: Lightbulb },
  { to: '/quotes', label: 'Quotes', icon: FileText },
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

const TOUR = [
  { title: 'Create an opportunity', body: 'Go to Opportunity → Create opportunity. Fill the 5 mandatory basic fields and 3 official fields, then choose "Save and create quote".' },
  { title: 'Design the windows', body: 'In the Design tab choose a library design or "Create design". Use the configurator to set sizes, dividers, typologies, profile system, colour and glass, then Save.' },
  { title: 'Review pricing', body: 'The Pricing tab shows the project price structure. Override item rates, add design add-on costs or freeze a manual SQFT rate from the side menu.' },
  { title: 'Share the quotation', body: 'In the Report tab view or download the Quotation and BOQ reports, or use Quick quote to create a smart quote link for your customer.' },
];

export function TopbarActions() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const [apps, setApps] = useState(false);
  const appsRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="topbar-actions">
      <IconButton tip="Help" tipPos="bottom" onClick={() => setHelp(true)}>
        <CircleHelp size={17} />
      </IconButton>
      <IconButton tip="Product tour" tipPos="bottom" onClick={() => setTour(0)}>
        <PlayCircle size={17} />
      </IconButton>
      <IconButton ref={appsRef} tip="Apps" tipPos="bottom" onClick={() => setApps((a) => !a)}>
        <Grid3x3 size={17} />
      </IconButton>
      <Popover open={apps} onClose={() => setApps(false)} anchor={appsRef} placement="bottom-end">
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 92px)', gap: 6 }}>
          {[...NAV, { to: '/settings?page=raw-material-pricing', label: 'Rate Master', icon: Boxes }, { to: '/settings', label: 'Settings', icon: Settings }].map((n) => (
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
          <button ref={ref} className="avatar-btn" onClick={onClick} aria-label="Account menu">
            <span className="avatar">{initials(user?.name)}</span>
            <ChevronDown size={14} />
          </button>
        )}
        items={[
          { heading: user?.email || '' },
          { label: 'My profile', icon: <UserIcon size={15} />, onClick: () => navigate('/profile') },
          { label: 'Settings', icon: <Settings size={15} />, onClick: () => navigate('/settings') },
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
      <Drawer open={help} onClose={() => setHelp(false)} title="Help & support">
        <div className="col gap-16">
          {TOUR.map((t, i) => (
            <div key={i}>
              <h3 className="mb-8">
                {i + 1}. {t.title}
              </h3>
              <p className="muted">{t.body}</p>
            </div>
          ))}
          <div>
            <h3 className="mb-8">Configurator shortcuts</h3>
            <table className="table table-compact">
              <tbody>
                <tr><td>Undo / Redo</td><td className="nowrap">Ctrl + Z / Ctrl + Y</td></tr>
                <tr><td>Save design</td><td>Ctrl + S</td></tr>
                <tr><td>Deselect panel</td><td>Esc</td></tr>
                <tr><td>Zoom</td><td>Mouse wheel</td></tr>
                <tr><td>Pan</td><td>Drag the background</td></tr>
              </tbody>
            </table>
          </div>
          <div className="alert alert-info">For support contact TITANS WINDOWS – {''}
            <a href="mailto:titanswindows1@gmail.com">titanswindows1@gmail.com</a>
          </div>
        </div>
      </Drawer>
      <Modal
        open={tour !== null}
        onClose={() => setTour(null)}
        title={tour !== null ? `Product tour · ${tour + 1} of ${TOUR.length}` : ''}
        size="sm"
        footer={
          <>
            <Button disabled={!tour} onClick={() => setTour((t) => Math.max(0, (t ?? 0) - 1))}>
              Back
            </Button>
            {tour !== null && tour < TOUR.length - 1 ? (
              <Button variant="primary" onClick={() => setTour((t) => (t ?? 0) + 1)}>
                Next
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setTour(null)}>
                Finish
              </Button>
            )}
          </>
        }
      >
        {tour !== null && (
          <div className="col">
            <h3>{TOUR[tour].title}</h3>
            <p className="muted">{TOUR[tour].body}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="shell">
      <MaintenanceBanner />
      <div className="shell-main">
        <nav className="sidebar" aria-label="Main navigation">
          <div className="sidebar-logo">
            <EvaLogo size={28} />
          </div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} data-tip={n.label} data-tip-pos="right" aria-label={n.label}>
              <n.icon size={19} />
            </NavLink>
          ))}
          <div className="sidebar-spacer" />
          <NavLink to="/settings" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} data-tip="Settings" data-tip-pos="right" aria-label="Settings">
            <Settings size={19} />
          </NavLink>
        </nav>
        <div className="shell-content">
          <header className="topbar">
            <TopbarActions />
          </header>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
