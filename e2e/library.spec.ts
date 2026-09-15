import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

const BUDGET = { renderWarmMs: 3000 };

test.describe("library", () => {
  test("render + pill entro budget, zero errori", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "library", true);
    await expect(cards(page).first()).toBeVisible();
    const ms = await measureUntil(
      () => gotoView(page, "library", true),
      () => expect(cards(page).first()).toBeVisible(),
    );
    expectBudget(ms, BUDGET.renderWarmMs, "library render");
    // Smoke sulle pill: almeno History esiste e il click non rompe nulla.
    const history = page.getByRole("button", { name: /history/i });
    await expect(history.first()).toBeVisible();
    await history.first().click();
    await expect(cards(page).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
