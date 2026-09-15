import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

// Il menu AI ha lo stesso look del "Copia come": largo, righe con icona,
// hover con testo scuro leggibile; cambia clip → si chiude.
const BUDGET = { menuOpenMs: 1000 };

async function enableAi(page: Parameters<typeof gotoView>[0]) {
  await page.evaluate(() => {
    const raw = localStorage.getItem("boardify-settings");
    const s = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      "boardify-settings",
      JSON.stringify({ ...s, aiEnabled: true, aiProvider: "ollama", aiModel: "llama3.3" }),
    );
  });
  await page.reload();
}

test.describe("ai menu", () => {
  test("stesso look del copia-come, hover leggibile, chiude al cambio clip", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf");
    await enableAi(page);
    const n = await cards(page).count();
    expect(n).toBeGreaterThan(1);

    await cards(page).first().scrollIntoViewIfNeeded();
    await cards(page).first().click();
    await expect(page.locator(".clip-preview")).toBeVisible();

    const menu = page.locator(".clip-preview .ai-menu");
    const ms = await measureUntil(
      () => page.locator(".clip-preview .ai-menu-wrap > button").click(),
      () => expect(menu).toBeVisible(),
    );
    expectBudget(ms, BUDGET.menuOpenMs, "ai menu open");

    // Largo come il copia-come, stesso radius contenitore.
    const box = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, radius: getComputedStyle(el).borderRadius };
    });
    expect(box.w).toBeGreaterThanOrEqual(260);
    expect(box.radius).toBe("16px");

    const items = menu.locator(".ai-menu-item");
    expect(await items.count()).toBeGreaterThan(0);
    const first = items.first();
    expect((await first.locator(".ai-menu-label").innerText()).trim().length).toBeGreaterThan(0);

    // Hover: stesso radius riga del copia-come e testo scuro su fondo chiaro.
    await first.hover();
    await expect
      .poll(
        async () =>
          first.evaluate((el) => {
            const label = el.querySelector(".ai-menu-label")!;
            return `${getComputedStyle(el).borderTopLeftRadius} ${getComputedStyle(label).color}`;
          }),
        { timeout: 3000 },
      )
      .toBe("10px rgb(21, 21, 21)");

    // Cambio clip senza mousedown (click sintetico): il reset chiude il menu.
    await cards(page).nth(1).evaluate((el) => (el as HTMLElement).click());
    await expect(menu).toHaveCount(0);
    await expect(page.locator(".clip-preview")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
