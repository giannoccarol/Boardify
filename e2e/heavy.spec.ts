import { expect, test } from "@playwright/test";
import { cards, expectBudget, measureLongTasks, sampleFrames, watchConsole } from "./helpers/perf";

// Stress con 300 clip sintetiche (?heavy=300), immagini incluse.
// Baseline pre-ottimizzazione (widen): longtask total ~925ms max ~660ms.
// Dopo lazy-actions + content-visibility: total ~460ms max ~375ms.
// Budget ≈ 2× il peggio misurato, headless.
const HEAVY = 300;
const BUDGET = {
  searchMs: 3000,
  widenMs: 3500,
  widenLongTotalMs: 1200,
  widenLongMaxMs: 800,
  scrollP95Ms: 120,
  openMs: 3000,
  navMs: 800,
};
const heavyUrl = (view: string) => `/?view=${view}&heavy=${HEAVY}`;

test.describe("heavy", () => {
  test("library 300: render + longtask", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(heavyUrl("library"));
    const lt = await measureLongTasks(page, () =>
      expect(cards(page).first()).toBeVisible(),
    );
    const n = await cards(page).count();
    expect(n).toBeGreaterThan(100);
    expectBudget(lt.total, BUDGET.widenLongTotalMs, "heavy render longtask total");
    expectBudget(lt.max, BUDGET.widenLongMaxMs, "heavy render longtask max");
    expect(errors).toEqual([]);
  });

  test("library 300: search + scroll", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(heavyUrl("library"));
    await expect(cards(page).first()).toBeVisible();
    const t0 = Date.now();
    await page.locator("input").first().fill("heavy-1");
    await expect.poll(async () => cards(page).count(), { timeout: 15000 }).toBeLessThan(300);
    expectBudget(Date.now() - t0, BUDGET.searchMs, "heavy search");
    const { p95 } = await sampleFrames(page, 2000, () => page.mouse.wheel(0, 6000));
    expectBudget(p95, BUDGET.scrollP95Ms, "heavy scroll p95");
    expect(errors).toEqual([]);
  });

  test("library 300: allarga filtro (entrance massiccio)", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(heavyUrl("library"));
    await expect(cards(page).first()).toBeVisible();
    await page.locator("input").first().fill("heavy-1");
    await expect.poll(async () => cards(page).count(), { timeout: 15000 }).toBeLessThan(300);
    // Riapre tutto: ~250 card entrano insieme. Qui si vede lo jank.
    const t0 = Date.now();
    const lt = await measureLongTasks(page, async () => {
      await page.locator("input").first().fill("");
      await expect.poll(async () => cards(page).count(), { timeout: 15000 }).toBeGreaterThan(200);
    });
    expectBudget(Date.now() - t0, BUDGET.widenMs, "heavy widen");
    expectBudget(lt.total, BUDGET.widenLongTotalMs, "heavy widen longtask total");
    expectBudget(lt.max, BUDGET.widenLongMaxMs, "heavy widen longtask max");
    expect(errors).toEqual([]);
  });

  test("shelf 300: open + frecce", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(heavyUrl("shelf"));
    const t0 = Date.now();
    await expect(cards(page).first()).toBeVisible();
    expectBudget(Date.now() - t0, BUDGET.openMs, "heavy shelf open");
    await page.locator(".shelf-search input").evaluate((el) => (el as HTMLElement).blur());
    const n0 = Date.now();
    await page.keyboard.press("ArrowRight");
    await expect(cards(page).nth(1)).toHaveAttribute("data-selected", "true");
    expectBudget(Date.now() - n0, BUDGET.navMs, "heavy arrow nav");
    expect(errors).toEqual([]);
  });
});
