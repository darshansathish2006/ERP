import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Compass, FlaskConical, PlayCircle } from 'lucide-react';

/** First-login invitation to take the guided tour. */
export function WelcomeModal({ name, onStart, onSkip }: { name: string; onStart: () => void; onSkip: () => void }) {
  const startRef = useRef<HTMLButtonElement | null>(null);
  const first = (name || '').trim().split(/\s+/)[0] || '';
  const greet = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';

  useEffect(() => {
    startRef.current?.focus({ preventScroll: true });
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onSkip();
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onSkip]);

  return createPortal(
    <div className="tour-welcome-backdrop">
      <div className="tour-welcome" role="dialog" aria-modal="true" aria-labelledby="tour-welcome-title">
        <div className="tour-welcome-hero">
          <span className="tour-welcome-wave" aria-hidden="true">
            👋
          </span>
          <h2 id="tour-welcome-title">Welcome to Titans ERP{greet ? `, ${greet}` : ''}</h2>
          <p>Take a guided tour? It takes about 10 minutes and you can stop whenever you like.</p>
        </div>
        <div className="tour-welcome-body">
          <ul className="tour-welcome-list">
            <li>
              <Compass size={17} />
              <span>
                <b>Every page, step by step</b> – from a new enquiry to the window design, pricing and the PDF quotation.
              </span>
            </li>
            <li>
              <FlaskConical size={17} />
              <span>
                <b>A sample project is used to show you around.</b> It is created now and deleted automatically when the tour ends, so your real data is not touched.
              </span>
            </li>
            <li>
              <BookOpen size={17} />
              <span>
                <b>Come back any time.</b> The full guide and short tours of each page are in the <b>Guide</b> tab on the left.
              </span>
            </li>
          </ul>
        </div>
        <div className="tour-welcome-foot">
          <button type="button" className="tour-btn tour-btn-ghost" onClick={onSkip}>
            Skip for now
          </button>
          <button type="button" ref={startRef} className="tour-btn tour-btn-primary tour-btn-lg" onClick={onStart}>
            <PlayCircle size={16} /> Start the tour
          </button>
        </div>
        <div className="tour-welcome-note">Skipping is fine – you can start the tour any time from the Guide tab.</div>
      </div>
    </div>,
    document.body,
  );
}
