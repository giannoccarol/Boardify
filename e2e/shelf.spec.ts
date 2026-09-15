import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, sampleFrames, watchConsole } from "./helpers/perf";

// Budget misurati su dev-server locale, headless. Se un test sfora,
// prima guarda il numero (regressione vera?) poi il budget, mai viceversa.
const BUDGET = {
  renderWarmMs: 3000,
  searchMs: 1500,
  scrollP95Ms: 120,
};

test.describe("shelf", () => {
  test("render demo entro budget (server caldo)", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    await expect(cards(page).first()).toBeVisible();
    // Secondo giro a server caldo: misura la feature, non Vite.
    const ms = await measureUntil(
      () => gotoView(page, "shelf", true),
      () => expect(cards(page).first()).toBeVisible(),
    );
    expectBudget(ms, BUDGET.renderWarmMs, "shelf render");
    expect(errors).toEqual([]);
  });

  test("search filtra entro budget", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    const search = page.locator(".shelf-search input");
    await expect(search).toBeVisible();
    const before = await cards(page).count();
    expect(before).toBeGreaterThan(0);
    const ms = await measureUntil(
      () => search.fill("zzzz-no-match-qr"),
      () => expect(cards(page)).toHaveCount(0),
    );
    expectBudget(ms, BUDGET.searchMs, "shelf search");
    expect(errors).toEqual([]);
  });

  test("scroll senza jank catastrofico", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf");
    await expect(cards(page).first()).toBeVisible();
    const { p95, n } = await sampleFrames(page, 1500, () =>
      page.mouse.wheel(0, 2400),
    );
    expect(n).toBeGreaterThan(10);
    expectBudget(p95, BUDGET.scrollP95Ms, `shelf scroll p95 (n=${n})`);
    expect(errors).toEqual([]);
  });
});
