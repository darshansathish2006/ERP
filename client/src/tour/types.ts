import type { PermissionKey, User } from '../lib/types';

/** The temporary project created for the quote chapters of the tour. */
export interface SampleInfo {
  opportunityId: number;
  quoteId: number;
  designId: number | null;
  projectName: string;
}

export interface TourStepContext {
  user: User;
  /** Null when the step does not need the sample, or the sample could not be created. */
  sample: SampleInfo | null;
  /** Per-step scratch space, e.g. to remember that `before` opened something `after` must close. */
  memo: Record<string, unknown>;
}

export type TourPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStep {
  /** Unique inside its chapter. */
  id: string;
  title: string;
  /** 1–3 short, friendly sentences. */
  body: string;
  /** data-tour names, tried in order. The step falls back to a centred card when none is found. */
  target?: string | string[];
  /** Raw CSS selector, for things that cannot carry a data-tour attribute (menus, drawers). Tried after `target`. */
  selector?: string;
  /** Page to show before the step. Steps without a route stay on the current page. */
  route?: string | ((ctx: TourStepContext) => string | null);
  placement?: TourPlacement;
  /** Only shown to users with this permission. */
  perm?: PermissionKey;
  /** Needs the sample project (set automatically for chapters that need it). */
  sample?: boolean;
  /** Prepares the page, e.g. opens a drawer. Runs after navigation. */
  before?: (ctx: TourStepContext) => void | Promise<unknown>;
  /** Tidies up when leaving the step (Next, Back or closing the tour). */
  after?: (ctx: TourStepContext) => void | Promise<unknown>;
  /** How long to wait for the target (ms). */
  timeout?: number;
  /** Extra space around the highlighted element (px). */
  padding?: number;
  /**
   * Open menus and side drawers are closed before every step. List what this step keeps open
   * (used when consecutive steps explain the same drawer).
   */
  keep?: ('drawer' | 'menu')[];
}

export type ChapterId =
  | 'welcome'
  | 'dashboard'
  | 'opportunities'
  | 'create-opportunity'
  | 'quote'
  | 'designs'
  | 'pricing'
  | 'reports'
  | 'quotes'
  | 'contacts'
  | 'rate-master'
  | 'settings'
  | 'guide';

export interface TourChapter {
  id: ChapterId;
  title: string;
  /** One line shown in the Guide's table of contents. */
  summary: string;
  /** Only users with this permission see the chapter. */
  perm?: PermissionKey;
  /** Every step of the chapter needs the sample project. */
  sample?: boolean;
  steps: TourStep[];
}

/** A step of a running tour, flattened with its chapter details. */
export interface RunStep extends TourStep {
  chapterId: ChapterId;
  chapterTitle: string;
  /** 1-based position inside its chapter. */
  chapterStep: number;
  chapterSize: number;
  /** Last step of its chapter – passing it marks the chapter done. */
  chapterEnd: boolean;
}
