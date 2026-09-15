import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

// Ogni faccia della preview (per kind) deve aprirsi in fretta e senza errori.
const BUDGET = { previewOpenMs: 1500 };

test.describe("preview kinds", () => {
  test("prime 5 card: preview con tipo", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf");
    const n = Math.min(5, await cards(page).count());
    expect(n).toBeGreaterThan(0);
    const kinds = new Set<string>();
    for (let i = 0; i < n; i++) {
      const card = cards(page).nth(i);
      await card.scrollIntoViewIfNeeded();
      const ms = await measureUntil(
        () => card.click(),
        () => expect(page.locator(".clip-preview .preview-type")).toBeVisible(),
      );
      expectBudget(ms, BUDGET.previewOpenMs, `preview open #${i}`);
      const label = await page.locator(".clip-preview .preview-type").innerText();
      expect(label.trim().length).toBeGreaterThan(0);
      kinds.add(label.trim());
      await page.keyboard.press("Escape");
      await expect(page.locator(".clip-preview")).toHaveCount(0);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  });
});
