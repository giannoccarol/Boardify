import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

// Apertura/chiusura shelf, navigazione tra clipboard, menu contestuale
// per-card (hover actions) e preview. In browser misuriamo i proxy reali:
// open/close = mount/unmount vista (stessa animazione della window Tauri).
const BUDGET = {
  openMs: 3000,
  closeMs: 3000,
  navMs: 800,
  hoverMenuMs: 800,
  pinMs: 800,
  previewOpenMs: 1500,
  previewCloseMs: 800,
};

test.describe("shelf interactions", () => {
  test("apertura shelf (library → shelf)", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "library", true);
    await expect(page.locator(".library-close")).toBeVisible();
    const ms = await measureUntil(
      () => gotoView(page, "shelf"),
      () => expect(cards(page).first()).toBeVisible(),
    );
    expectBudget(ms, BUDGET.openMs, "shelf open");
    expect(errors).toEqual([]);
  });

  test("chiusura shelf (shelf → library)", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    await expect(cards(page).first()).toBeVisible();
    const ms = await measureUntil(
      () => gotoView(page, "library"),
      () => expect(page.locator(".library-close")).toBeVisible(),
    );
    expectBudget(ms, BUDGET.closeMs, "shelf close");
    expect(errors).toEqual([]);
  });

  test("frecce navigano tra clipboard", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    await expect(cards(page).first()).toBeVisible();
    // La search ha l'autofocus: le frecce la ignorano, serve blur.
    await page.locator(".shelf-search input").evaluate((el) => (el as HTMLElement).blur());
    const ms = await measureUntil(
      () => page.keyboard.press("ArrowRight"),
      () => expect(cards(page).nth(1)).toHaveAttribute("data-selected", "true"),
    );
    expectBudget(ms, BUDGET.navMs, "arrow nav");
    const back = await measureUntil(
      () => page.keyboard.press("ArrowLeft"),
      () => expect(cards(page).first()).toHaveAttribute("data-selected", "true"),
    );
    expectBudget(back, BUDGET.navMs, "arrow nav back");
    expect(errors).toEqual([]);
  });

  test("menu contestuale hover + pin", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    const card = cards(page).first();
    await expect(card).toBeVisible();
    const actions = card.locator(".clip-actions");
    // Apertura menu: hover → opacity 1 (framer, non shot per misurarlo vero).
    const openMs = await measureUntil(
      () => card.hover(),
      () =>
        expect
          .poll(async () => actions.evaluate((el) => getComputedStyle(el).opacity))
          .toBe("1"),
    );
    expectBudget(openMs, BUDGET.hoverMenuMs, "hover menu open");
    // Azione pin: click → stato is-active.
    const pin = card.locator(".clip-action-button").first();
    const pinMs = await measureUntil(
      () => pin.click(),
      () => expect(pin).toHaveClass(/is-active/),
    );
    expectBudget(pinMs, BUDGET.pinMs, "pin action");
    expect(errors).toEqual([]);
  });

  test("preview apre e chiude", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf");
    await expect(cards(page).first()).toBeVisible();
    const preview = page.locator(".clip-preview");
    const openMs = await measureUntil(
      () => cards(page).first().click(),
      () => expect(preview).toBeVisible(),
    );
    expectBudget(openMs, BUDGET.previewOpenMs, "preview open");
    const closeMs = await measureUntil(
      () => page.keyboard.press("Escape"),
      () => expect(preview).toHaveCount(0),
    );
    expectBudget(closeMs, BUDGET.previewCloseMs, "preview close");
    expect(errors).toEqual([]);
  });

  test("copia come: opzioni per tipo nella preview", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf");
    // Filtra lo snippet demo (@code → kind code) per una preview deterministica.
    // Aspetta il filtro (debounce store) prima di cliccare: senza, il click
    // apre la card pre-filtro (link) che ha altri "Copy as".
    await page.locator(".shelf-search input").fill("@code");
    await expect(cards(page)).toHaveCount(1);
    // La search ha l'autofocus: blur prima di usare la tastiera.
    await page.locator(".shelf-search input").evaluate((el) => (el as HTMLElement).blur());
    const preview = page.locator(".clip-preview");
    const openMs = await measureUntil(
      () => page.keyboard.press(" "),
      () => expect(preview).toBeVisible(),
    );
    expectBudget(openMs, BUDGET.previewOpenMs, "copy-as preview open");
    await expect(preview.getByText("Copy as")).toBeVisible();
    // Lo snippet demo è già formattato: "Formatted" appare solo se c'è
    // qualcosa da normalizzare (dedent/trailing space).
    for (const name of ["Original", "MD block", "One line"]) {
      await expect(preview.getByRole("button", { name })).toBeVisible();
    }
    await expect(preview.getByRole("button", { name: "Formatted" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
