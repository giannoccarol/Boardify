import { expect, type Locator, type Page } from "@playwright/test";

/** Vai a una vista; `shot` = modalità deterministica (niente animazioni). */
export async function gotoView(page: Page, view: string, shot = false) {
  await page.goto(`/?view=${view}${shot ? "&shot=1" : ""}`);
}

/** Raccoglie errori console/pageerror; da assertare a fine test. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Cronometra un'azione UI fino a che `ready` è soddisfatto.
 * Include debounce store (140 ms) + render React: è il tempo che sente l'utente.
 */
export async function measureUntil(
  action: () => Promise<void>,
  ready: () => Promise<void>,
): Promise<number> {
  const t0 = Date.now();
  await action();
  await ready();
  return Date.now() - t0;
}

/** Conta le card visibili. */
export function cards(page: Page): Locator {
  return page.locator(".clip-card");
}

/**
 * Campiona i frame con rAF per `ms` millisecondi mentre `during` gira
 * (es. scroll). Ritorna avg/p95 dei delta: p95 alto = jank.
 * Headless (SwiftShader) è più lento del headed: i budget in CI sono larghi,
 * il valore vero si legge in locale (vedi skill perf-e2e).
 */
export async function sampleFrames(
  page: Page,
  ms: number,
  during: () => Promise<void>,
): Promise<{ avg: number; p95: number; n: number }> {
  const sampling = page.evaluate((duration) => {
    return new Promise<number[]>((resolve) => {
      const deltas: number[] = [];
      let last = performance.now();
      const end = last + duration;
      const tick = (t: number) => {
        deltas.push(t - last);
        last = t;
        if (t < end) requestAnimationFrame(tick);
        else resolve(deltas);
      };
      requestAnimationFrame(tick);
    });
  }, ms);
  await during();
  const deltas = await sampling;
  const sorted = [...deltas].sort((a, b) => a - b);
  const avg = deltas.reduce((s, d) => s + d, 0) / Math.max(1, deltas.length);
  return { avg, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, n: deltas.length };
}

/** Budget + messaggio d'errore leggibile. */
export function expectBudget(ms: number, budget: number, what: string) {
  expect(ms, `${what}: ${ms}ms oltre budget ${budget}ms`).toBeLessThan(budget);
}

/**
 * Esegue `fn` registrando i longtask (>50ms) del thread UI.
 * Ritorna conteggio, totale e max: il segnale per le ottimizzazioni.
 */
export async function measureLongTasks(
  page: Page,
  fn: () => Promise<void>,
): Promise<{ count: number; total: number; max: number }> {
  await page.evaluate(() => {
    (window as unknown as { __lt: PerformanceEntry[] }).__lt = [];
    const obs = new PerformanceObserver((list) => {
      (window as unknown as { __lt: PerformanceEntry[] }).__lt.push(...list.getEntries());
    });
    obs.observe({ entryTypes: ["longtask"] });
    (window as unknown as { __ltObs: PerformanceObserver }).__ltObs = obs;
  });
  await fn();
  // I longtask arrivano asincroni: breve assestamento.
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    (window as unknown as { __ltObs: PerformanceObserver }).__ltObs.disconnect();
    const entries = (window as unknown as { __lt: PerformanceEntry[] }).__lt;
    const ds = entries.map((e) => e.duration);
    return {
      count: ds.length,
      total: Math.round(ds.reduce((s, d) => s + d, 0)),
      max: Math.round(Math.max(0, ...ds)),
    };
  });
}
