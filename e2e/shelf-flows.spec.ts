import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

// Flussi core dello shelf: filtri, delete, fav, copy, nota.
const BUDGET = {
  filterMs: 1200,
  deleteMs: 1200,
  favMs: 800,
  copyMs: 1500,
  noteOpenMs: 800,
  noteCreateMs: 1200,
};

test.describe("shelf flows", () => {
  test("pill filtra la lista", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    await expect(cards(page).first()).toBeVisible();
    const before = await cards(page).count();
    const pill = page.locator(".category-pill").nth(1);
    await expect(pill).toBeVisible();
    const ms = await measureUntil(
      () => pill.click(),
      () => expect(pill).toHaveAttribute("aria-pressed", "true"),
    );
    expectBudget(ms, BUDGET.filterMs, "pill filter");
    expect(await cards(page).count()).toBeLessThanOrEqual(before);
    expect(errors).toEqual([]);
  });

  test("filtro preferiti (stella toolbar)", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    const card = cards(page).first();
    await card.hover();
    await card.locator(".clip-action-button").nth(3).click();
    await expect(card.locator(".clip-action-button").nth(3)).toHaveClass(/is-active/);
    // La toolbar ha [aria-pressed] anche sul menu collezioni: fav è il 2°.
    const favBtn = page.locator(".shelf-toolbar button[aria-pressed]").nth(1);
    const total = await cards(page).count();
    const ms = await measureUntil(
      () => favBtn.click(),
      () => expect(favBtn).toHaveAttribute("aria-pressed", "true"),
    );
    expectBudget(ms, BUDGET.filterMs, "fav filter");
    await expect(cards(page)).toHaveCount(1);
    expect(total).toBeGreaterThan(1);
    const off = await measureUntil(
      () => favBtn.click(),
      () => expect(cards(page)).toHaveCount(total),
    );
    expectBudget(off, BUDGET.filterMs, "fav filter off");
    expect(errors).toEqual([]);
  });

  test("delete rimuove la card", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    await expect(cards(page).first()).toBeVisible();
    const before = await cards(page).count();
    const card = cards(page).first();
    await card.hover();
    const ms = await measureUntil(
      () => card.locator(".clip-action-button").nth(2).click(),
      () => expect(cards(page)).toHaveCount(before - 1),
    );
    expectBudget(ms, BUDGET.deleteMs, "delete");
    expect(errors).toEqual([]);
  });

  test("copy mostra conferma", async ({ page, context }) => {
    const errors = watchConsole(page);
    await context.grantPermissions(["clipboard-write"]);
    await gotoView(page, "shelf", true);
    const card = page.locator('.clip-card[data-kind="text"]').first();
    await expect(card).toBeVisible();
    await card.hover();
    const ms = await measureUntil(
      () => card.locator(".clip-action-button").nth(1).click(),
      () => expect(card.locator('[role="status"]')).toBeVisible(),
    );
    expectBudget(ms, BUDGET.copyMs, "copy confirm");
    expect(errors).toEqual([]);
  });

  test("nota: apri, scrivi, crea in cima", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    await expect(cards(page).first()).toBeVisible();
    const before = await cards(page).count();
    const openMs = await measureUntil(
      () => page.keyboard.press("Control+Shift+N"),
      () => expect(page.locator(".shelf-window textarea").first()).toBeVisible(),
    );
    expectBudget(openMs, BUDGET.noteOpenMs, "note open");
    const text = `e2e-note-${Date.now()}`;
    await page.locator(".shelf-window textarea").first().fill(text);
    const createMs = await measureUntil(
      () => page.keyboard.press("Control+Enter"),
      () => expect(cards(page)).toHaveCount(before + 1),
    );
    expectBudget(createMs, BUDGET.noteCreateMs, "note create");
    await expect(cards(page).first()).toContainText(text);
    expect(errors).toEqual([]);
  });
});
