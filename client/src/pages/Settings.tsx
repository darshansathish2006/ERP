import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { PageLoading } from '../components/ui';
import { useConfirm, useToast } from '../components/feedback';
import { SettingsNavContext, SubPage, useSettingsNav, type SettingsNav } from './settings/common';
import { CARD_BY_KEY, LOOKUP_PAGES, isSectionKey, type SectionKey } from './settings/registry';
import { SettingsHome } from './settings/SettingsHome';
import { LookupListPage } from './settings/LookupListPage';
import { RolesPage } from './settings/RolesPage';
import { UsersPage } from './settings/UsersPage';
import { TeamsPage } from './settings/TeamsPage';
import { CitiesPage } from './settings/CitiesPage';
import { PriceLevelPage } from './settings/PriceLevelPage';
import { PriceStructurePage } from './settings/PriceStructurePage';
import { BankAccountsPage } from './settings/BankAccountsPage';
import { UserBusinessUnitPage } from './settings/UserBusinessUnitPage';
import { CompanyProfilePage } from './settings/CompanyProfilePage';
import { QuotationTermsPage } from './settings/QuotationTermsPage';
import { NotificationsPage } from './settings/NotificationsPage';
import { ALL_RATE_TABS, RateMasterView, type RateTabKey } from './masters/RateMasterView';

// Excel import pages pull in SheetJS – load them only when opened.
const PriceImportPage = lazy(() => import('./settings/PriceImportPage'));
const OpportunityImportPage = lazy(() => import('./settings/OpportunityImportPage'));

/** Links from the previous settings layout (`?section=company`) open the matching page. */
const LEGACY_SECTIONS: Record<string, string> = {
  company: 'company-profile',
  terms: 'quotation-terms',
  pricing: 'price-structure',
  notifications: 'notifications',
};

function RawMaterialPage({ tabs }: { tabs: RateTabKey[] }) {
  const nav = useSettingsNav();
  return (
    <SubPage fill>
      <RateMasterView tabs={tabs} onDirtyChange={nav.setDirty} />
    </SubPage>
  );
}

function renderPage(key: string): ReactNode {
  const lookup = LOOKUP_PAGES[key];
  if (lookup) return <LookupListPage {...lookup} />;
  switch (key) {
    case 'roles':
      return <RolesPage />;
    case 'users':
      return <UsersPage />;
    case 'teams':
      return <TeamsPage />;
    case 'cities':
      return <CitiesPage />;
    case 'profile-price':
      return <PriceLevelPage category="profile" />;
    case 'reinforcement-price':
      return <PriceLevelPage category="reinforcement" />;
    case 'hardware-price':
      return <PriceLevelPage category="hardware" />;
    case 'glazing-price':
      return <PriceLevelPage category="glass" />;
    case 'raw-material-price-list':
    case 'import-raw-material-prices':
      return <PriceImportPage />;
    case 'glazing-price-list':
      return <PriceImportPage category="glass" lockCategory />;
    case 'price-structure':
      return <PriceStructurePage />;
    case 'bank-accounts':
      return <BankAccountsPage />;
    case 'user-business-unit':
      return <UserBusinessUnitPage />;
    case 'import-opportunities':
      return <OpportunityImportPage />;
    case 'rm-items':
      return <RawMaterialPage tabs={['profile', 'aluminium', 'reinforcement', 'hardware']} />;
    case 'rm-glass':
      return <RawMaterialPage tabs={['glass']} />;
    case 'rm-colours':
      return <RawMaterialPage tabs={['colors']} />;
    case 'rm-systems':
      return <RawMaterialPage tabs={['systems']} />;
    case 'rm-library':
      return <RawMaterialPage tabs={['library']} />;
    case 'raw-material-settings':
      return <RawMaterialPage tabs={ALL_RATE_TABS} />;
    case 'company-profile':
      return <CompanyProfilePage />;
    case 'quotation-terms':
      return <QuotationTermsPage />;
    case 'notifications':
      return <NotificationsPage />;
    default:
      return null;
  }
}

function readFavourites(r: unknown): string[] {
  const list = Array.isArray(r) ? r : r && typeof r === 'object' && Array.isArray((r as { pages?: unknown }).pages) ? (r as { pages: unknown[] }).pages : [];
  return list.map(String);
}

export default function SettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const sectionParam = params.get('section');
  const pageKey = params.get('page') ?? LEGACY_SECTIONS[sectionParam ?? ''] ?? null;
  const card = pageKey ? CARD_BY_KEY[pageKey] : undefined;

  // ---- favourites
  const [favs, setFavs] = useState<string[] | null>(null);
  const favsRef = useRef<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<unknown>('/api/settings/favourites')
      .then((r) => {
        if (!alive) return;
        const list = readFavourites(r);
        favsRef.current = list;
        setFavs(list);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        favsRef.current = [];
        setFavs([]);
        toast.error(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [toast]);

  const toggleFav = useCallback(
    (key: string) => {
      const before = favsRef.current ?? [];
      const next = before.includes(key) ? before.filter((k) => k !== key) : [...before, key];
      favsRef.current = next;
      setFavs(next);
      api.put<unknown>('/api/settings/favourites', { pages: next }).catch((e: unknown) => {
        favsRef.current = before;
        setFavs(before);
        toast.error(errorMessage(e));
      });
    },
    [toast],
  );

  // ---- unsaved-change guard
  const dirtyRef = useRef(false);
  const [dirty, setDirtyState] = useState(false);
  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
    setDirtyState(d);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const guard = useCallback(async () => {
    if (!dirtyRef.current) return true;
    const ok = await confirm({
      title: 'Discard unsaved changes?',
      message: 'You have changes on this page that have not been saved. Leave and discard them?',
      confirmText: 'Discard changes',
      danger: true,
    });
    if (ok) setDirty(false);
    return ok;
  }, [confirm, setDirty]);

  const open = useCallback(
    (key: string) => {
      void (async () => {
        if (!(await guard())) return;
        setParams({ page: key });
      })();
    },
    [guard, setParams],
  );

  const homeSection = card?.section;
  const goHome = useCallback(() => {
    void (async () => {
      if (!(await guard())) return;
      setParams(homeSection ? { section: homeSection } : {});
    })();
  }, [guard, setParams, homeSection]);

  const favSet = useMemo(() => new Set(favs ?? []), [favs]);
  const nav = useMemo<SettingsNav>(
    () => ({ page: card, goHome, open, setDirty, isFav: (k) => favSet.has(k), toggleFav }),
    [card, goHome, open, setDirty, favSet, toggleFav],
  );

  if (card) {
    return (
      <SettingsNavContext.Provider value={nav}>
        <div className="page-flush adm-sp-page">
          <Suspense fallback={<PageLoading />}>
            <Fragment key={card.key}>{renderPage(card.key)}</Fragment>
          </Suspense>
        </div>
      </SettingsNavContext.Provider>
    );
  }

  const hasFavs = favs === null || favs.some((k) => !!CARD_BY_KEY[k] && !CARD_BY_KEY[k].hidden);
  const section: SectionKey = isSectionKey(sectionParam) ? sectionParam : hasFavs ? 'favourites' : 'roles';
  return (
    <SettingsNavContext.Provider value={nav}>
      <SettingsHome section={section} onSection={(s) => setParams({ section: s }, { replace: true })} favourites={favs} onOpen={open} onToggleFav={toggleFav} />
    </SettingsNavContext.Provider>
  );
}
