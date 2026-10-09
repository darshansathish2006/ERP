import { useMemo, useState } from 'react';
import { PackageOpen, SearchX } from 'lucide-react';
import { Spinner } from '../../components/ui';
import { SearchBox } from '../masters/shared';
import { FavStar } from './common';
import { CARDS, CARD_BY_KEY, SECTIONS, type CardDef, type SectionKey } from './registry';

const VISIBLE_CARDS = CARDS.filter((c) => !c.hidden);
const SECTION_LABEL: Record<SectionKey, string> = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label])) as Record<SectionKey, string>;

function matches(card: CardDef, q: string) {
  return `${card.title} ${card.description} ${card.pageTitle ?? ''} ${SECTION_LABEL[card.section]}`.toLowerCase().includes(q);
}

export function SettingsHome({
  section,
  onSection,
  favourites,
  onOpen,
  onToggleFav,
}: {
  section: SectionKey;
  onSection: (s: SectionKey) => void;
  /** null while loading. */
  favourites: string[] | null;
  onOpen: (key: string) => void;
  onToggleFav: (key: string) => void;
}) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const favSet = useMemo(() => new Set(favourites ?? []), [favourites]);
  const favCards = useMemo(() => (favourites ?? []).map((k) => CARD_BY_KEY[k]).filter((c): c is CardDef => !!c && !c.hidden), [favourites]);

  const hits = useMemo(() => (q ? VISIBLE_CARDS.filter((c) => matches(c, q)) : []), [q]);
  const navSections = useMemo(() => {
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => {
      if (s.label.toLowerCase().includes(q)) return true;
      if (s.key === 'favourites') return favCards.some((c) => matches(c, q));
      return hits.some((c) => c.section === s.key);
    });
  }, [q, hits, favCards]);

  const active = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];
  const sectionCards = active.key === 'favourites' ? favCards : VISIBLE_CARDS.filter((c) => c.section === active.key);

  const grid = (cards: CardDef[]) => (
    <div className="adm-st-cards" data-tour="settings-cards">
      {cards.map((c) => (
        <div
          key={c.key}
          className="adm-st-card"
          data-tour="settings-card"
          role="link"
          tabIndex={0}
          onClick={() => onOpen(c.key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpen(c.key);
            }
          }}
        >
          <div className="adm-st-card-title">{c.title}</div>
          <div className="adm-st-card-desc">{c.description}</div>
          <FavStar active={favSet.has(c.key)} onToggle={() => onToggleFav(c.key)} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="page adm-st-page">
      <div className="page-head" data-tour="settings-head">
        <h1 className="page-title">Settings</h1>
        <SearchBox value={search} onChange={setSearch} placeholder="Search" width={260} />
      </div>
      <div className="adm-st">
        <nav className="adm-st-nav" aria-label="Settings categories" data-tour="settings-nav">
          {navSections.map((s) => {
            const Icon = s.icon;
            const isActive = !q && s.key === active.key;
            return (
              <button
                key={s.key}
                type="button"
                className={`adm-st-nav-item ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  setSearch('');
                  onSection(s.key);
                }}
              >
                <Icon size={16} />
                <span className="ellipsis">{s.label}</span>
                {s.key === 'favourites' && favCards.length > 0 && <span className="adm-st-nav-count">{favCards.length}</span>}
              </button>
            );
          })}
          {navSections.length === 0 && <div className="adm-st-nav-empty">No matching category</div>}
        </nav>
        <div className="adm-st-main">
          {q ? (
            hits.length ? (
              SECTIONS.filter((s) => s.key !== 'favourites' && hits.some((c) => c.section === s.key)).map((s) => (
                <section key={s.key} className="adm-st-section">
                  <div className="adm-st-section-title">{s.label}</div>
                  <div className="adm-st-section-desc">{s.description}</div>
                  {grid(hits.filter((c) => c.section === s.key))}
                </section>
              ))
            ) : (
              <div className="adm-st-empty">
                <SearchX size={34} strokeWidth={1.4} />
                <div className="adm-st-empty-title">No settings page found</div>
                <div className="muted fs-12">Try another word, e.g. “price”, “stage” or “bank”.</div>
              </div>
            )
          ) : (
            <section className="adm-st-section">
              <div className="adm-st-section-title">{active.label}</div>
              <div className="adm-st-section-desc">{active.description}</div>
              {active.key === 'favourites' && favourites === null ? (
                <div className="adm-st-empty">
                  <Spinner />
                </div>
              ) : sectionCards.length ? (
                grid(sectionCards)
              ) : (
                <div className="adm-st-empty">
                  <PackageOpen size={38} strokeWidth={1.3} />
                  <div className="adm-st-empty-title">No favourite page found</div>
                  <div className="muted fs-12">Click the star on any settings card to keep it here.</div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
