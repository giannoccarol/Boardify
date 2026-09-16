import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

const BUDGET = {
  switchMs: 1500,
  createMs: 1500,
};

test.describe("spaces", () => {
  test("tab-bar shelf: creo space e filtro", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    const tabs = page.locator(".space-tabs");
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /Lavoro/ })).toBeVisible();

    await tabs.locator("button.space-new").click();
    const input = tabs.locator("input.space-input");
    await input.fill("Spesa");
    const msCreate = await measureUntil(
      () => input.press("Enter"),
      () => expect(tabs.getByRole("tab", { name: /Spesa/ })).toBeVisible(),
    );
    expectBudget(msCreate, BUDGET.createMs, "space create");

    const before = await cards(page).count();
    expect(before).toBeGreaterThan(0);
    const msSwitch = await measureUntil(
      () => tabs.getByRole("tab", { name: /Lavoro/ }).click(),
      () => page.waitForTimeout(400),
    );
    expectBudget(msSwitch, BUDGET.switchMs, "space switch");
    expect(await cards(page).count()).toBeLessThanOrEqual(before);
    expect(errors).toEqual([]);
  });

  test("tab-bar library visibile", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "library", true);
    await expect(page.locator(".space-tabs").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
