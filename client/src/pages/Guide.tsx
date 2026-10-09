import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Check, CircleHelp, Keyboard, Lightbulb, PlayCircle, RotateCcw, Search, SearchX, TriangleAlert, X } from 'lucide-react';
import { Button } from '../components/ui';
import { useConfirm, useToast } from '../components/feedback';
import { useTour } from '../tour/TourProvider';
import { FAQ, GUIDE, SHORTCUTS, type FaqItem, type GuideSection, type GuideTopic } from '../tour/guideContent';
import '../styles/guide.css';

const plain = (s: string) => s.replace(/\*\*/g, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text with search matches marked. */
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRe(q)})`, 'ig'));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="guide-mark">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** `**bold**` text with search highlighting. */
function Rich({ text, q }: { text: string; q: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <b key={i}>
            <Hl text={p} q={q} />
          </b>
        ) : (
          <Hl key={i} text={p} q={q} />
        ),
      )}
    </>
  );
}

function topicText(t: GuideTopic): string {
  return plain([t.title, t.what, ...(t.steps ?? []), ...(t.tips ?? []), ...(t.mistakes ?? [])].join(' ')).toLowerCase();
}
function sectionText(s: GuideSection): string {
  return plain(`${s.title} ${s.where} ${s.intro}`).toLowerCase();
}
function faqText(f: FaqItem): string {
  return plain(`${f.q} ${f.a.join(' ')}`).toLowerCase();
}

/** FAQ answer: paragraphs, "• " bullet lists and "1. " numbered steps. */
function Answer({ lines, q }: { lines: string[]; q: string }) {
  const blocks: { kind: 'p' | 'ul' | 'ol'; items: string[] }[] = [];
  for (const line of lines) {
    const kind = line.startsWith('• ') ? 'ul' : /^\d+\.\s/.test(line) ? 'ol' : 'p';
    const text = kind === 'ul' ? line.slice(2) : kind === 'ol' ? line.replace(/^\d+\.\s/, '') : line;
    const last = blocks[blocks.length - 1];
    if (kind !== 'p' && last?.kind === kind) last.items.push(text);
    else blocks.push({ kind, items: [text] });
  }
  return (
    <div className="guide-answer">
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>
            <Rich text={b.items[0]} q={q} />
          </p>
        ) : b.kind === 'ul' ? (
          <ul key={i}>
            {b.items.map((t, j) => (
              <li key={j}>
                <Rich text={t} q={q} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((t, j) => (
              <li key={j}>
                <Rich text={t} q={q} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}

function Callout({ kind, title, items, q }: { kind: 'tip' | 'mistake'; title: string; items: string[]; q: string }) {
  return (
    <div className={`guide-callout guide-callout-${kind}`}>
      <span className="guide-callout-icon">{kind === 'tip' ? <Lightbulb size={16} /> : <TriangleAlert size={16} />}</span>
      <div>
        <div className="guide-callout-title">{title}</div>
        <ul>
          {items.map((t, i) => (
            <li key={i}>
              <Rich text={t} q={q} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function GuidePage() {
  const tour = useTour();
  const confirm = useConfirm();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<string>(GUIDE[0].id);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const q = search.trim();
  const ql = q.toLowerCase();

  const done = useMemo(() => new Set(tour.done), [tour.done]);
  const available = useMemo(() => new Set(tour.chapters.map((c) => c.id)), [tour.chapters]);
  const doneCount = tour.chapters.filter((c) => done.has(c.id)).length;

  const sections = useMemo(
    () =>
      GUIDE.map((s) => {
        if (!ql) return { section: s, topics: s.topics };
        const all = sectionText(s).includes(ql);
        return { section: s, topics: s.topics.filter((t) => all || topicText(t).includes(ql)) };
      }).filter((x) => x.topics.length > 0),
    [ql],
  );
  const faqs = useMemo(() => FAQ.filter((f) => !ql || faqText(f).includes(ql)), [ql]);
  const shortcuts = useMemo(() => SHORTCUTS.filter((s) => !ql || `${s.keys} ${s.what}`.toLowerCase().includes(ql)), [ql]);
  const nothing = !sections.length && !faqs.length && !shortcuts.length;

  const goTo = (id: string) => {
    const el = document.getElementById(`guide-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
  };

  // Highlight the table-of-contents entry of the section in view.
  const onScroll = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top + 90;
    let current = '';
    for (const el of box.querySelectorAll<HTMLElement>('[data-guide-section]')) {
      if (el.getBoundingClientRect().top <= top) current = el.dataset.guideSection || current;
    }
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) {
      const all = box.querySelectorAll<HTMLElement>('[data-guide-section]');
      current = all[all.length - 1]?.dataset.guideSection || current;
    }
    if (current) setActive(current);
  }, []);
  useEffect(() => {
    onScroll();
  }, [onScroll, ql]);

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset tour progress',
      message: 'Clear the ✓ marks of every chapter? Next time you log in you will be offered the welcome tour again.',
      confirmText: 'Reset',
    });
    if (!ok) return;
    try {
      await tour.resetProgress();
      toast.success('Tour progress cleared');
    } catch {
      toast.error('Could not reset the tour progress. Please try again.');
    }
  };

  const tocItem = (id: string, label: ReactNode, mark: ReactNode, dim = false) => (
    <button key={id} type="button" className={`guide-toc-item ${active === id ? 'active' : ''} ${dim ? 'dim' : ''}`} onClick={() => goTo(id)}>
      <span className="guide-toc-mark">{mark}</span>
      <span className="guide-toc-label">{label}</span>
    </button>
  );

  return (
    <div className="page-flush guide-page">
      <div className="guide-top">
        <div className="guide-hero">
          <div className="guide-hero-icon" aria-hidden="true">
            <BookOpen size={26} />
          </div>
          <div className="guide-hero-text">
            <h1 className="page-title">Guide</h1>
            <p>Everything you need to use Titans ERP: step-by-step help for every page, short guided tours and answers to common questions.</p>
          </div>
          <div className="guide-hero-actions">
            <Button variant="primary" icon={<PlayCircle size={16} />} onClick={tour.startFull} disabled={tour.running} data-tour="guide-start">
              Start full tour
            </Button>
            <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => void reset()} data-tour="guide-reset">
              Reset tour progress
            </Button>
          </div>
        </div>
        <div className="guide-bar">
          <div className="guide-search" data-tour="guide-search">
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the guide – e.g. GST, revision, logo, password"
              aria-label="Search the guide"
            />
            {search && (
              <button type="button" className="guide-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="guide-progress" title={`${doneCount} of ${tour.chapters.length} chapter tours finished`}>
            <span>
              <b>{doneCount}</b> of {tour.chapters.length} tours done
            </span>
            <span className="guide-progress-bar" aria-hidden="true">
              <span style={{ width: `${tour.chapters.length ? (doneCount / tour.chapters.length) * 100 : 0}%` }} />
            </span>
          </div>
        </div>
      </div>

      <div className="guide-body">
        <nav className="guide-toc" aria-label="Guide chapters" data-tour="guide-toc">
          <div className="guide-toc-title">Chapters</div>
          {GUIDE.map((s, i) => {
            const shown = sections.some((x) => x.section.id === s.id);
            return tocItem(
              s.id,
              s.title,
              done.has(s.id) ? (
                <span className="guide-check" title="Tour finished">
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : (
                <span className="guide-num">{i + 1}</span>
              ),
              !!ql && !shown,
            );
          })}
          <div className="guide-toc-sep" />
          {tocItem('faq', 'Questions & answers', <CircleHelp size={15} />, !!ql && !faqs.length)}
          {tocItem('shortcuts', 'Keyboard shortcuts', <Keyboard size={15} />, !!ql && !shortcuts.length)}
        </nav>

        <div className="guide-scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="guide-content">
            {ql && (
              <div className="guide-results">
                {nothing ? 'No matches' : `Showing results for “${q}”`}
                <button type="button" className="guide-linkbtn" onClick={() => setSearch('')}>
                  Clear search
                </button>
              </div>
            )}
            {nothing && (
              <div className="guide-empty">
                <SearchX size={36} strokeWidth={1.4} />
                <div className="guide-empty-title">Nothing in the guide matches “{q}”</div>
                <div className="muted">Try a shorter word, for example “price”, “colour” or “report”.</div>
              </div>
            )}

            {sections.map(({ section: s, topics }) => {
              const can = available.has(s.id);
              return (
                <section key={s.id} id={`guide-${s.id}`} data-guide-section={s.id} className="guide-section">
                  <header className="guide-section-head">
                    <div className="grow">
                      <div className="guide-where">{s.where}</div>
                      <h2>
                        <Hl text={s.title} q={q} />
                        {done.has(s.id) && (
                          <span className="guide-done-badge">
                            <Check size={12} strokeWidth={3} /> Tour done
                          </span>
                        )}
                      </h2>
                    </div>
                    {can ? (
                      <Button size="sm" variant="outline-primary" icon={<PlayCircle size={14} />} onClick={() => tour.startChapter(s.id)} disabled={tour.running} data-tour="guide-chapter-tour">
                        {done.has(s.id) ? 'Show me again' : 'Show me'}
                      </Button>
                    ) : (
                      <span className="guide-admin-only">Tour for administrators</span>
                    )}
                  </header>
                  <p className="guide-intro">
                    <Rich text={s.intro} q={q} />
                  </p>
                  {topics.map((t) => (
                    <article key={t.id} className="guide-topic">
                      <h3>
                        <Hl text={t.title} q={q} />
                      </h3>
                      <p className="guide-what">
                        <span className="guide-label">What it is for</span>
                        <Rich text={t.what} q={q} />
                      </p>
                      {t.steps && (
                        <ol className="guide-steps">
                          {t.steps.map((st, i) => (
                            <li key={i}>
                              <Rich text={st} q={q} />
                            </li>
                          ))}
                        </ol>
                      )}
                      {t.tips && <Callout kind="tip" title="Tips" items={t.tips} q={q} />}
                      {t.mistakes && <Callout kind="mistake" title="Common mistakes" items={t.mistakes} q={q} />}
                    </article>
                  ))}
                </section>
              );
            })}

            {(!ql || faqs.length > 0) && (
              <section id="guide-faq" data-guide-section="faq" className="guide-section" data-tour="guide-faq">
                <header className="guide-section-head">
                  <div className="grow">
                    <div className="guide-where">Common questions</div>
                    <h2>Questions & answers</h2>
                  </div>
                </header>
                <div className="guide-faq">
                  {faqs.map((f) => (
                    <details key={`${f.id}-${ql ? 'q' : ''}`} className="guide-faq-item" open={!!ql}>
                      <summary>
                        <Hl text={f.q} q={q} />
                      </summary>
                      <Answer lines={f.a} q={q} />
                    </details>
                  ))}
                </div>
              </section>
            )}

            {(!ql || shortcuts.length > 0) && (
              <section id="guide-shortcuts" data-guide-section="shortcuts" className="guide-section">
                <header className="guide-section-head">
                  <div className="grow">
                    <div className="guide-where">Save time</div>
                    <h2>Keyboard shortcuts</h2>
                  </div>
                </header>
                <table className="table table-compact guide-keys">
                  <tbody>
                    {shortcuts.map((s) => (
                      <tr key={s.keys}>
                        <td className="nowrap">
                          <kbd>
                            <Hl text={s.keys} q={q} />
                          </kbd>
                        </td>
                        <td>
                          <Hl text={s.what} q={q} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <div className="guide-support">
              Still stuck? Contact TITANS WINDOWS at <a href="mailto:titanswindows1@gmail.com">titanswindows1@gmail.com</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
