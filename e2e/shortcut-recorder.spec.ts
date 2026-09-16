import { expect, test } from "@playwright/test";
import { expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

// Il recorder deve catturare 3+ tasti anche quando il flag metaKey di Super
// non arriva (WebKitGTK): i modificatori si tracciano dai keydown/keyup.
const BUDGET = { recordMs: 1500 };

async function openRecorder(page: Parameters<typeof gotoView>[0]) {
  await gotoView(page, "settings", true);
  await page.locator(".settings-nav-item").filter({ hasText: /Scorciatoie|Shortcuts/ }).first().click();
  const rec = page.locator(".shortcut-recorder button").first();
  await expect(rec).toBeVisible();
  return rec;
}

test.describe("shortcut recorder", () => {
  test("cattura 3 tasti via tastiera reale", async ({ page }) => {
    const errors = watchConsole(page);
    const rec = await openRecorder(page);
    const ms = await measureUntil(
      async () => {
        await rec.click();
        await page.keyboard.down("Control");
        await page.keyboard.down("Meta");
        await page.keyboard.press("a");
        await page.keyboard.up("Meta");
        await page.keyboard.up("Control");
      },
      () => expect(rec).toHaveAttribute("aria-label", /Ctrl\+Super\+A/),
    );
    expectBudget(ms, BUDGET.recordMs, "record 3-key combo");
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem("boardify-settings")))
      .toContain("Ctrl+Super+A");
    expect(errors).toEqual([]);
  });

  test("cattura Super anche con metaKey rotto (keydown sintetici)", async ({ page }) => {
    const errors = watchConsole(page);
    const rec = await openRecorder(page);
    await rec.click();
    await rec.evaluate((el) => {
      const opts = (o: object) => ({ bubbles: true, cancelable: true, ...o });
      el.dispatchEvent(new KeyboardEvent("keydown", opts({ key: "Control", code: "ControlLeft", ctrlKey: true })));
      // WebKitGTK: il keydown Meta arriva ma metaKey resta false.
      el.dispatchEvent(new KeyboardEvent("keydown", opts({ key: "Meta", code: "MetaLeft", ctrlKey: true, metaKey: false })));
      el.dispatchEvent(new KeyboardEvent("keydown", opts({ key: "a", code: "KeyA", ctrlKey: true, metaKey: false })));
    });
    await expect(rec).toHaveAttribute("aria-label", /Ctrl\+Super\+A/);
    expect(errors).toEqual([]);
  });
});
