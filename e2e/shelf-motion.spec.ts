import { expect, test, type Page } from "@playwright/test";
import { cards, expectBudget, measureUntil, sampleFrames, watchConsole } from "./helpers/perf";

const BUDGET = { openMs: 3000, frameP95Ms: 120, searchMs: 1500 };

async function expectSettled(page: Page) {
  await expect.poll(() => page.locator(".shelf-window").evaluate((el) => {
    const surface = getComputedStyle(el);
    const content = getComputedStyle(el.querySelector(".shelf-reveal")!);
    return new DOMMatrixReadOnly(surface.transform).isIdentity &&
      surface.opacity === "1" && content.opacity === "1" &&
      new DOMMatrixReadOnly(content.transform).isIdentity;
  })).toBe(true);
}

test.describe("shelf bubble entrance", () => {
  test("nasce dal centro in alto e si assesta con 36 card entro budget", async ({ page }, info) => {
    const errors = watchConsole(page);
    // Il pulsante della library monta la shelf nello stesso documento:
    // possiamo campionare anche i primi frame, senza perdere rAF navigando.
    await page.goto("/?view=library&heavy=36");
    await expect.poll(() => cards(page).count()).toBeGreaterThanOrEqual(36);
    // Termina l'ingresso della library prima di misurare quello della shelf.
    await expect(page.locator(".clip-tile").last()).toHaveCSS("opacity", "1");
    const trace = page.evaluate(() => new Promise<Array<{
      x: number; y: number; center: number; originY: number; opacity: number;
    }>>((resolve) => {
      const frames: Array<{ x: number; y: number; center: number; originY: number; opacity: number }> = [];
      let first = 0;
      const deadline = performance.now() + 5000;
      const sample = (time: number) => {
        const panel = document.querySelector<HTMLElement>(".shelf-window");
        if (panel) {
          if (!first) first = time;
          const style = getComputedStyle(panel);
          const matrix = new DOMMatrixReadOnly(style.transform);
          const rect = panel.getBoundingClientRect();
          frames.push({
            x: matrix.a, y: matrix.d,
            center: Math.abs(rect.left + rect.width / 2 - innerWidth / 2),
            originY: Number.parseFloat(style.transformOrigin.split(" ")[1]),
            opacity: Number(style.opacity),
          });
        }
        if ((first && time - first > 1000) || time > deadline) resolve(frames);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    let openMs = 0;
    const frames = await sampleFrames(page, 1600, async () => {
      openMs = await measureUntil(
        () => page.locator(".library-close").click(),
        () => expectSettled(page),
      );
    });
    const shapes = await trace;
    console.log(`shelf bubble: open=${openMs}ms, p95=${frames.p95.toFixed(1)}ms, frames=${frames.n}`);
    expect(shapes.length).toBeGreaterThan(10);
    expect(frames.n).toBeGreaterThan(10);
    expectBudget(openMs, BUDGET.openMs, "bubble open + settle");
    expectBudget(frames.p95, BUDGET.frameP95Ms, "bubble opening frame p95");
    expect(shapes.every((s) => s.center < 1 && s.originY === 0)).toBe(true);
    if (info.project.name === "reduced") {
      expect(shapes.every((s) => s.x === 1 && s.y === 1 && s.opacity === 1)).toBe(true);
      await expect(page.locator(".shelf-gleam")).toHaveCount(0);
    } else {
      expect(shapes.some((s) => s.x < 0.4 && s.y < 0.25)).toBe(true);
      expect(shapes.some((s) => s.x > 0.9 && s.y < 0.55)).toBe(true);
      // La superficie si gonfia DOPO essersi allargata, con overshoot limitato.
      expect(shapes.some((s) => s.y > 1.01)).toBe(true);
      expect(Math.max(...shapes.map((s) => s.x))).toBeLessThan(1.06);
      expect(Math.max(...shapes.map((s) => s.y))).toBeLessThan(1.1);
      await expect(page.locator(".shelf-gleam")).toHaveCSS("opacity", "0");
      await expect(page.locator(".shelf-seed")).toHaveCSS("opacity", "0");
    }
    await expect(cards(page)).toHaveCount(36);
    await expect(page.locator(".shelf-search input")).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("search non riavvia l'apertura e la shelf riapre dalla library", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/?view=shelf&heavy=36");
    await expectSettled(page);
    const searchMs = await measureUntil(
      () => page.locator(".shelf-search input").fill("zzzz-no-match-qr"),
      () => expect(cards(page)).toHaveCount(0),
    );
    expectBudget(searchMs, BUDGET.searchMs, "search after bubble entrance");
    await expectSettled(page);
    // Controllo la riapertura tramite il flusso UI della demo.
    await page.locator(".shelf-search input").fill("");
    await expect(cards(page)).toHaveCount(36);
    await page.locator(".shelf-toolbar button").filter({ has: page.locator("svg.lucide-layout-grid") }).click();
    await expect(page.locator(".library-close")).toBeVisible();
    const reopenMs = await measureUntil(
      () => page.locator(".library-close").click(),
      () => expectSettled(page),
    );
    expectBudget(reopenMs, BUDGET.openMs, "bubble reopen");
    await expect(cards(page)).toHaveCount(36);
    expect(errors).toEqual([]);
  });

  test("shot resta statico e leggibile", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/?view=shelf&shot=1");
    await expectSettled(page);
    await expect(page.locator(".shelf-gleam")).toHaveCount(0);
    await expect(cards(page).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
