/** Small DOM helpers shared by the HUD and the menus. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Public asset URL (respects Vite's base path). */
export function art(path: string): string {
  return `${import.meta.env.BASE_URL}art/${path}`;
}

/**
 * Restart a one-shot CSS animation class (shake, flash, pop). Forces one style recalculation,
 * so only call it from events, never per frame.
 */
export function pulse(node: Element, cls: string, ms = 600): void {
  node.classList.remove(cls);
  void (node as HTMLElement).offsetWidth;
  node.classList.add(cls);
  const timers = (node as HTMLElement & { __pulse?: Record<string, number> }).__pulse ?? {};
  (node as HTMLElement & { __pulse?: Record<string, number> }).__pulse = timers;
  window.clearTimeout(timers[cls]);
  timers[cls] = window.setTimeout(() => node.classList.remove(cls), ms);
}

/** Write text only when it changed (avoids needless style/layout work in per-frame updates). */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Cache-aware CSS custom property setter for per-frame updates. */
export function setVar(node: HTMLElement, name: string, value: string): void {
  const cache = node as HTMLElement & { __vars?: Record<string, string> };
  const vars = (cache.__vars ??= {});
  if (vars[name] === value) return;
  vars[name] = value;
  node.style.setProperty(name, value);
}

/** Cache-aware class toggle (classList.toggle is already cheap, but this keeps call sites uniform). */
export function setClass(node: Element, cls: string, on: boolean): void {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
}

/** Animate a number from 0 to `to` inside `node` (ease-out), formatted with thousands separators. */
export function countUp(node: HTMLElement, to: number, ms: number, delay = 0): void {
  const start = performance.now() + delay;
  const target = Math.round(to);
  const step = (now: number) => {
    if (!node.isConnected && now > start + 50) return;
    const f = Math.max(0, Math.min(1, (now - start) / ms));
    const e = 1 - Math.pow(1 - f, 3);
    node.textContent = Math.round(target * e).toLocaleString('en-US');
    if (f < 1) requestAnimationFrame(step);
  };
  node.textContent = '0';
  requestAnimationFrame(step);
}
