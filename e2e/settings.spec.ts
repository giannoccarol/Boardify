import { expect, test } from "@playwright/test";
import { expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

const BUDGET = {
  renderWarmMs: 3000,
  panelMs: 800,
  toggleMs: 800,
  recorderMs: 1200,
};

test.describe("settings", () => {
  test("render + cambio pannello", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "settings", true);
    await expect(page.locator(".settings-titlebar")).toBeVisible();
    const ms = await measureUntil(
      () => gotoView(page, "settings", true),
      () => expect(page.locator(".settings-titlebar")).toBeVisible(),
    );
    expectBudget(ms, BUDGET.renderWarmMs, "settings render");
    // Selettore per icona, non per indice: i pannelli possono riordinarsi.
    const nav = page.locator(".settings-nav-item:has(.nav-icon-general)");
    const panelMs = await measureUntil(
      () => nav.click(),
      () => expect(nav).toHaveAttribute("aria-current", "page"),
    );
    expectBudget(panelMs, BUDGET.panelMs, "settings panel");
    expect(errors).toEqual([]);
  });

  test("switch applica subito", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "settings", true);
    const sw = page.locator('[role="switch"]').first();
    await expect(sw).toBeVisible();
    const before = await sw.getAttribute("aria-checked");
    const ms = await measureUntil(
      () => sw.click(),
      () => expect(sw).not.toHaveAttribute("aria-checked", before ?? "none"),
    );
    expectBudget(ms, BUDGET.toggleMs, "settings switch");
    expect(errors).toEqual([]);
  });

  test("shortcut recorder: assegna e valida", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "settings", true);
    // Il recorder sta nel pannello keyboard (selettore per icona, non indice).
    const keyboard = page.locator(".settings-nav-item:has(.nav-icon-keyboard)");
    await keyboard.click();
    await expect(keyboard).toHaveAttribute("aria-current", "page");
    const rec = page.locator(".shortcut-recorder button").first();
    await expect(rec).toBeVisible();
    await rec.click();
    await expect(rec).toHaveClass(/is-listening/);
    const ms = await measureUntil(
      () => page.keyboard.press("Control+Shift+K"),
      () => expect(rec).not.toHaveClass(/is-listening/),
    );
    expectBudget(ms, BUDGET.recorderMs, "shortcut assign");
    await expect(rec).toContainText("K");
    // Tasto senza modificatori → errore di validazione, niente crash.
    await rec.click();
    await page.keyboard.press("x");
    await expect(page.locator(".shortcut-recorder [role='alert']").first()).toBeVisible();
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  });

  test("capture renderizza senza errori", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "capture", true);
    await expect(page.locator("div.rounded-full").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
