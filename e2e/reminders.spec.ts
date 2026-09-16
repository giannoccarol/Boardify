import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, sampleFrames, watchConsole } from "./helpers/perf";

// Reminder compatti in alto alla shelf: strip una-riga + dialog scadenza.
const BUDGET = {
  stripRenderMs: 3000,
  dialogOpenMs: 1000,
  presetSaveMs: 1500,
  scrollP95Ms: 120,
};

async function seedReminder(page: import("@playwright/test").Page, minutesAhead = 60) {
  const iso = new Date(Date.now() + minutesAhead * 60_000).toISOString();
  await page.addInitScript((value) => {
    localStorage.setItem("boardify-reminders", JSON.stringify({ "1": value }));
  }, iso);
}

test.describe("reminders", () => {
  test("strip compatta sopra le card entro budget", async ({ page }) => {
    const errors = watchConsole(page);
    await seedReminder(page, 60);
    await gotoView(page, "shelf", true);
    await expect(cards(page).first()).toBeVisible();
    const strip = page.locator(".reminder-strip");
    const ms = await measureUntil(
      () => gotoView(page, "shelf", true),
      () => expect(strip).toBeVisible(),
    );
    expectBudget(ms, BUDGET.stripRenderMs, "reminder strip render");
    await expect(strip.locator(".reminder-row").first()).toBeVisible();
    await expect(strip.locator(".reminder-row-text").first()).not.toBeEmpty();
    await expect(strip.locator(".reminder-row-when").first()).not.toBeEmpty();
    expect(errors).toEqual([]);
  });

  test("campanella apre dialog e preset salva in strip", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf", true);
    const card = cards(page).first();
    await expect(card).toBeVisible();
    await card.hover();
    // 5° bottone = reminder (pin, copy, delete, fav preservati ai vecchi indici).
    const bell = card.locator(".clip-action-button").nth(4);
    await expect(bell).toBeVisible();
    const openMs = await measureUntil(
      () => bell.click(),
      () => expect(page.locator('[role="dialog"][aria-label]')).toBeVisible(),
    );
    expectBudget(openMs, BUDGET.dialogOpenMs, "reminder dialog open");
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toContainText(/Remind|Ricorda/i);
    const saveMs = await measureUntil(
      () => dialog.getByRole("button", { name: /10 min/i }).click(),
      () => expect(page.locator(".reminder-strip")).toBeVisible(),
    );
    expectBudget(saveMs, BUDGET.presetSaveMs, "reminder preset save");
    await expect(page.locator(".reminder-row").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("snooze e dismiss dalla strip", async ({ page }) => {
    const errors = watchConsole(page);
    await seedReminder(page, 30);
    await gotoView(page, "shelf", true);
    const row = page.locator(".reminder-row").first();
    await expect(row).toBeVisible();
    // Dismiss (X) rimuove la riga.
    await row.locator(".reminder-tool-x").click();
    await expect(page.locator(".reminder-strip")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("strip non spacca lo scroll", async ({ page }) => {
    const errors = watchConsole(page);
    await seedReminder(page, 90);
    await gotoView(page, "shelf");
    await expect(cards(page).first()).toBeVisible();
    await expect(page.locator(".reminder-strip")).toBeVisible();
    const { p95, n } = await sampleFrames(page, 1200, () => page.mouse.wheel(0, 1800));
    expect(n).toBeGreaterThan(10);
    expectBudget(p95, BUDGET.scrollP95Ms, `reminder scroll p95 (n=${n})`);
    expect(errors).toEqual([]);
  });
});
