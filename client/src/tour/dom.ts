/** Small DOM helpers used by tour steps to find, open and close things on the page. */

/** CSS selector for a `data-tour="name"` element. */
export const tourSel = (name: string) => `[data-tour="${name}"]`;

export const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** True when the element takes up space on screen (not display:none / detached). */
export function isVisible(el: Element | null): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

/** First visible element matching the selector. */
export function find(selector: string): HTMLElement | null {
  let nodes: NodeListOf<Element>;
  try {
    nodes = document.querySelectorAll(selector);
  } catch {
    return null;
  }
  for (const n of nodes) if (isVisible(n)) return n as HTMLElement;
  return null;
}

/** First visible element for any of the selectors, tried in order of preference. */
export function findAny(selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    const el = find(s);
    if (el) return el;
  }
  return null;
}

/** Waits until one of the selectors matches a visible element, or gives up after `timeout` ms. */
export function waitForAny(selectors: string[], timeout: number, isCancelled: () => boolean = () => false): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (isCancelled()) return resolve(null);
      const el = findAny(selectors);
      if (el) return resolve(el);
      if (performance.now() - start >= timeout) return resolve(null);
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

export const waitFor = (selector: string, timeout = 4000) => waitForAny([selector], timeout);

/** Clicks the first visible match. Returns false when there is nothing to click. */
export function click(selector: string): boolean {
  const el = find(selector);
  if (!el) return false;
  el.click();
  return true;
}

/** Waits for the element, then clicks it. */
export async function clickWhenReady(selector: string, timeout = 4000): Promise<boolean> {
  const el = await waitFor(selector, timeout);
  if (!el) return false;
  el.click();
  return true;
}

/** Opens something with a toggle button unless it is already open, then waits for it. */
export async function ensureOpen(trigger: string, panel: string, timeout = 4000): Promise<HTMLElement | null> {
  const open = find(panel);
  if (open) return open;
  if (!(await clickWhenReady(trigger, timeout))) return null;
  return waitFor(panel, timeout);
}

/** Closes something opened with a toggle button (clicks the toggle only while it is open). */
export async function ensureClosed(trigger: string, panel: string) {
  if (find(panel)) click(trigger);
  await sleep(30);
}

/** Closes open dropdown menus and popovers the same way an outside click does. */
export async function closeMenus() {
  if (!document.querySelector('.menu, .popover')) return;
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(40);
}

/** Clicks the close (×) button of open side drawers, newest first. */
export async function closeDrawers() {
  for (let i = 0; i < 3; i++) {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.drawer .drawer-header button[aria-label="Close"]');
    const last = buttons[buttons.length - 1];
    if (!last) break;
    last.click();
    await sleep(40);
  }
}

/** Opens a dropdown menu from its trigger and waits for the menu. */
export async function openMenu(trigger: string, timeout = 4000): Promise<HTMLElement | null> {
  await closeMenus();
  if (!(await clickWhenReady(trigger, timeout))) return null;
  return waitFor('.menu', timeout);
}
