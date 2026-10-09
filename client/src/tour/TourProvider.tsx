import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useAuth, type TourUpdate } from '../context/AuthContext';
import { useToast } from '../components/feedback';
import type { ChapterId, RunStep, SampleInfo, TourChapter, TourStepContext } from './types';
import { chapterForLocation, flattenChapters, visibleChapters } from './chapters';
import { closeDrawers, closeMenus, sleep, tourSel, waitForAny } from './dom';
import { TourOverlay, type TourPhase } from './TourOverlay';
import { WelcomeModal } from './WelcomeModal';
import '../styles/tour.css';

/** The white 1220 × 1220 mm SL-SL window of the sample project (₹10,033.82 in the reference video). */
const SAMPLE_DESIGN = {
  ref: 'W1',
  qty: 1,
  name: 'SL-SL',
  location: 'Hall',
  systemId: 'inventa-sliding',
  colorId: 'white',
  glassId: 'g4-pinhead',
  data: { width: 1220, height: 1220, root: { kind: 'leaf', panel: 'sliding', sashes: 2, tracks: 2 } },
};

/** While a tour runs, other tabs must not delete its sample project. */
const HEARTBEAT_KEY = 'titans.tour.heartbeat';
const HEARTBEAT_MS = 10_000;

function heartbeatFresh(): boolean {
  try {
    const t = Number(localStorage.getItem(HEARTBEAT_KEY) || 0);
    return Date.now() - t < HEARTBEAT_MS * 3;
  } catch {
    return false;
  }
}
function setHeartbeat(on: boolean) {
  try {
    if (on) localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
    else localStorage.removeItem(HEARTBEAT_KEY);
  } catch {
    /* storage unavailable */
  }
}

interface RunState {
  mode: 'full' | 'chapter';
  chapterIds: ChapterId[];
  steps: RunStep[];
  /** Where the tour was started – the user is brought back here at the end. */
  returnTo: string;
}

export interface TourApi {
  running: boolean;
  /** Chapters this user can take (filtered by permissions). */
  chapters: TourChapter[];
  /** Completed chapter ids. */
  done: string[];
  startFull: () => void;
  startChapter: (id: ChapterId) => void;
  /** Starts the chapter for the page at this address, or the full tour when no chapter matches. */
  startForPage: () => void;
  resetProgress: () => Promise<void>;
  /** Bumped after the sample project is deleted, so pages can reload their lists. */
  epoch: number;
}

const NOOP: TourApi = {
  running: false,
  chapters: [],
  done: [],
  startFull: () => undefined,
  startChapter: () => undefined,
  startForPage: () => undefined,
  resetProgress: async () => undefined,
  epoch: 0,
};

const TourCtx = createContext<TourApi>(NOOP);

export function useTour(): TourApi {
  return useContext(TourCtx);
}

const currentUrl = () => window.location.pathname + window.location.search;

/** Same page and the same query parameters (order ignored). */
function sameUrl(target: string): boolean {
  const t = new URL(target, window.location.origin);
  if (t.pathname !== window.location.pathname) return false;
  const a = [...t.searchParams.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&');
  const b = [...new URLSearchParams(window.location.search).entries()].map(([k, v]) => `${k}=${v}`).sort().join('&');
  return a === b;
}

function selectorsOf(step: RunStep): string[] {
  const names = step.target == null ? [] : Array.isArray(step.target) ? step.target : [step.target];
  return [...names.map(tourSel), ...(step.selector ? [step.selector] : [])];
}

/** Scrolls the element into view when it is not fully visible. */
function reveal(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw) return;
  el.scrollIntoView({ block: r.height > vh * 0.8 ? 'start' : 'center', inline: 'nearest' });
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { user, saveTour } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [run, setRun] = useState<RunState | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<TourPhase>('preparing');
  const [selectors, setSelectors] = useState<string[] | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const runRef = useRef<RunState | null>(null);
  const indexRef = useRef(0);
  const seq = useRef(0);
  const stepRef = useRef<RunStep | null>(null);
  const memo = useRef<Record<string, unknown>>({});
  const sampleRef = useRef<SampleInfo | null>(null);
  const cleanupRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const userRef = useRef(user);
  userRef.current = user;

  const chapters = useMemo(() => (user ? visibleChapters(user) : []), [user]);
  const done = useMemo(() => user?.tour?.done ?? [], [user]);

  /** Saves progress one request at a time, so answers cannot arrive out of order. */
  const persist = useCallback(
    (update: TourUpdate) => {
      saveChain.current = saveChain.current.then(() => saveTour(update)).catch(() => undefined);
      return saveChain.current;
    },
    [saveTour],
  );

  const ctxFor = useCallback((): TourStepContext | null => {
    const u = userRef.current;
    if (!u) return null;
    return { user: u, sample: sampleRef.current, memo: memo.current };
  }, []);

  // ---------------------------------------------------------- sample project
  const deleteSample = useCallback(async () => {
    try {
      const r = await api.del<{ deleted: number }>('/api/auth/me/tour/sample');
      return r.deleted;
    } catch {
      return 0;
    }
  }, []);

  // Remove a sample left behind by a tour that was interrupted (browser closed, logged out…).
  const userId = user?.id;
  useEffect(() => {
    if (!userId || runRef.current || heartbeatFresh()) return;
    const p = deleteSample().then((n) => {
      if (n > 0) setEpoch((e) => e + 1);
    });
    cleanupRef.current = p;
  }, [userId, deleteSample]);

  const prepareSample = useCallback(async (): Promise<SampleInfo> => {
    await cleanupRef.current.catch(() => undefined);
    const s = await api.post<SampleInfo>('/api/auth/me/tour/sample');
    let designId = s.designId;
    if (!designId) {
      const r = await api.post<{ design: { id: number } }>(`/api/quotes/${s.quoteId}/designs`, SAMPLE_DESIGN);
      designId = r.design.id;
    }
    const info = { opportunityId: s.opportunityId, quoteId: s.quoteId, designId, projectName: s.projectName };
    sampleRef.current = info;
    return info;
  }, []);

  // Heartbeat while running.
  const running = !!run;
  useEffect(() => {
    if (!running) return;
    setHeartbeat(true);
    const t = window.setInterval(() => setHeartbeat(true), HEARTBEAT_MS);
    return () => {
      window.clearInterval(t);
      setHeartbeat(false);
    };
  }, [running]);

  // ---------------------------------------------------------- moving between steps
  const goTo = useCallback(
    async (next: number) => {
      const rs = runRef.current;
      if (!rs) return;
      const step = rs.steps[next];
      if (!step) return;
      const token = ++seq.current;
      const prev = stepRef.current;
      const prevCtx = ctxFor();
      setPhase('loading');
      if (prev?.after && prevCtx) {
        try {
          await prev.after(prevCtx);
        } catch {
          /* tidying up is best effort */
        }
      }
      if (token !== seq.current) return;
      stepRef.current = step;
      memo.current = {};
      indexRef.current = next;
      setIndex(next);
      const ctx = ctxFor();
      if (!ctx) return;
      if (!step.keep?.includes('menu')) await closeMenus();
      if (!step.keep?.includes('drawer')) await closeDrawers();
      const url = typeof step.route === 'function' ? step.route(ctx) : step.route;
      if (url && !sameUrl(url)) {
        navigate(url);
        await sleep(60);
      }
      if (token !== seq.current) return;
      if (step.before) {
        try {
          await step.before(ctx);
        } catch {
          /* the step still shows, centred if its target is missing */
        }
      }
      if (token !== seq.current) return;
      const sels = selectorsOf(step);
      const el = sels.length ? await waitForAny(sels, step.timeout ?? 7000, () => token !== seq.current) : null;
      if (token !== seq.current) return;
      if (el) reveal(el);
      setSelectors(el ? sels : null);
      setPhase('ready');
    },
    [ctxFor, navigate],
  );

  const begin = useCallback(
    async (mode: RunState['mode'], ids: ChapterId[]) => {
      const u = userRef.current;
      if (!u || runRef.current) return;
      const chosen = visibleChapters(u).filter((c) => ids.includes(c.id));
      let steps = flattenChapters(chosen);
      if (!steps.length) return;
      const rs: RunState = { mode, chapterIds: chosen.map((c) => c.id), steps, returnTo: currentUrl() };
      runRef.current = rs;
      stepRef.current = null;
      sampleRef.current = null;
      setRun(rs);
      setIndex(0);
      indexRef.current = 0;
      setSelectors(null);
      setPhase('preparing');
      const token = ++seq.current;
      if (steps.some((s) => s.sample)) {
        try {
          await prepareSample();
        } catch (e) {
          steps = steps.filter((s) => !s.sample);
          toast.warning(`The sample project could not be prepared (${errorMessage(e)}), so the quote steps are skipped.`, 6000);
          if (!steps.length) {
            runRef.current = null;
            setRun(null);
            return;
          }
          const fixed = { ...rs, steps, chapterIds: rs.chapterIds.filter((id) => steps.some((s) => s.chapterId === id)) };
          runRef.current = fixed;
          setRun(fixed);
        }
      }
      if (token !== seq.current || !runRef.current) return;
      void goTo(0);
    },
    [goTo, prepareSample, toast],
  );

  const stop = useCallback(
    async (reason: 'finished' | 'skipped' | 'closed') => {
      const rs = runRef.current;
      if (!rs) return;
      ++seq.current;
      const step = stepRef.current;
      const ctx = ctxFor();
      if (step?.after && ctx) {
        try {
          await step.after(ctx);
        } catch {
          /* ignore */
        }
      }
      await closeMenus();
      await closeDrawers();
      stepRef.current = null;
      runRef.current = null;
      setRun(null);
      setSelectors(null);
      // Progress
      if (rs.mode === 'full') {
        if (reason === 'finished') void persist({ finished: true, done: rs.chapterIds });
        else void persist({ skipped: true });
      } else if (reason === 'finished') {
        void persist({ done: rs.chapterIds });
      }
      // Back to where the tour started, then remove the sample project.
      if (!sameUrl(rs.returnTo)) navigate(rs.returnTo);
      if (sampleRef.current) {
        sampleRef.current = null;
        await deleteSample();
        setEpoch((e) => e + 1);
      }
      if (reason === 'finished' && rs.mode === 'full') toast.success('Tour finished! The Guide tab has everything if you need it again.', 5000);
      else if (rs.mode === 'full') toast.info('Tour closed. You can start it again any time from the Guide tab.', 5000);
    },
    [ctxFor, deleteSample, navigate, persist, toast],
  );

  const next = useCallback(() => {
    const rs = runRef.current;
    if (!rs) return;
    const i = indexRef.current;
    const step = rs.steps[i];
    if (step?.chapterEnd && rs.mode === 'full' && i < rs.steps.length - 1) void persist({ done: [step.chapterId] });
    if (i >= rs.steps.length - 1) void stop('finished');
    else void goTo(i + 1);
  }, [goTo, persist, stop]);

  const back = useCallback(() => {
    const i = indexRef.current;
    if (i > 0) void goTo(i - 1);
  }, [goTo]);

  const nextChapter = useCallback(() => {
    const rs = runRef.current;
    if (!rs) return;
    const cur = rs.steps[indexRef.current];
    const j = rs.steps.findIndex((s, k) => k > indexRef.current && s.chapterId !== cur?.chapterId);
    if (j > 0) void goTo(j);
  }, [goTo]);

  // Leaving the signed-in area (logout) ends the tour.
  useEffect(() => {
    if (!user && runRef.current) {
      ++seq.current;
      runRef.current = null;
      setRun(null);
    }
  }, [user]);

  // ---------------------------------------------------------- public API
  const startFull = useCallback(() => {
    setWelcomeDismissed(true);
    void begin(
      'full',
      chapters.map((c) => c.id),
    );
  }, [begin, chapters]);

  const startChapter = useCallback((id: ChapterId) => void begin('chapter', [id]), [begin]);

  const startForPage = useCallback(() => {
    const id = chapterForLocation(window.location.pathname, window.location.search);
    if (id && chapters.some((c) => c.id === id)) startChapter(id);
    else startFull();
  }, [chapters, startChapter, startFull]);

  const resetProgress = useCallback(async () => {
    setWelcomeDismissed(true);
    await persist({ reset: true });
  }, [persist]);

  const api_ = useMemo<TourApi>(
    () => ({ running, chapters, done, startFull, startChapter, startForPage, resetProgress, epoch }),
    [running, chapters, done, startFull, startChapter, startForPage, resetProgress, epoch],
  );

  // ---------------------------------------------------------- welcome modal for new users
  const tourState = user?.tour;
  const isNew = !!tourState && !tourState.finishedAt && !tourState.skippedAt;
  const showWelcome = isNew && !welcomeDismissed && !run && !location.pathname.startsWith('/report/');

  const skipWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    void persist({ skipped: true });
    toast.info('No problem! You can start the tour any time from the Guide tab.', 5000);
  }, [persist, toast]);

  const current = run?.steps[index] ?? null;
  const hasNextChapter = !!run && run.mode === 'full' && !!current && run.steps.some((s, k) => k > index && s.chapterId !== current.chapterId);

  return (
    <TourCtx.Provider value={api_}>
      {children}
      {showWelcome && <WelcomeModal name={user?.name || ''} onStart={startFull} onSkip={skipWelcome} />}
      {run && (
        <TourOverlay
          step={phase === 'preparing' ? null : current}
          index={index}
          total={run.steps.length}
          phase={phase}
          selectors={phase === 'ready' ? selectors : null}
          onNext={next}
          onBack={back}
          onSkip={() => void stop('skipped')}
          onClose={() => void stop('closed')}
          onNextChapter={hasNextChapter ? nextChapter : undefined}
        />
      )}
    </TourCtx.Provider>
  );
}
