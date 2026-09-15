import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

// Lo split-button Copy apre un menu largo con le opzioni "Copia come".
const BUDGET = { menuOpenMs: 1000 };

test.describe("copy menu", () => {
  test("toggle apre il menu con opzioni etichettate", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf");
    const n = await cards(page).count();
    expect(n).toBeGreaterThan(0);

    // Trova una card con opzioni copy-as (toggle visibile in preview).
    let found = false;
    for (let i = 0; i < n; i++) {
      const card = cards(page).nth(i);
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await expect(page.locator(".clip-preview")).toBeVisible();
      if (await page.locator(".clip-preview .copy-split-toggle").count() > 0) {
        found = true;
        break;
      }
      await page.keyboard.press("Escape");
      await expect(page.locator(".clip-preview")).toHaveCount(0);
    }
    expect(found).toBe(true);

    const ms = await measureUntil(
      () => page.locator(".clip-preview .copy-split-toggle").click(),
      () => expect(page.locator(".clip-preview .copy-menu")).toBeVisible(),
    );
    expectBudget(ms, BUDGET.menuOpenMs, "copy menu open");

    const menu = page.locator(".clip-preview .copy-menu");
    const box = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, radius: getComputedStyle(el).borderRadius };
    });
    expect(box.w).toBeGreaterThanOrEqual(240);
    expect(box.radius).toBe("16px");

    const items = menu.locator(".copy-menu-item");
    expect(await items.count()).toBeGreaterThan(0);
    const firstLabel = await items.first().locator(".copy-menu-label").innerText();
    expect(firstLabel.trim().length).toBeGreaterThan(0);

    // Hover: radius riga 10px e testo scuro su fondo chiaro (niente bianco-su-bianco).
    await items.first().hover();
    await expect
      .poll(
        async () =>
          items.first().evaluate((el) => {
            const label = el.querySelector(".copy-menu-label")!;
            return `${getComputedStyle(el).borderTopLeftRadius} ${getComputedStyle(label).color}`;
          }),
        { timeout: 3000 },
      )
      .toBe("10px rgb(21, 21, 21)");

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
