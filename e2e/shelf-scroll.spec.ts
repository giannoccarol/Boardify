import { expect, test } from "@playwright/test";
import { expectBudget, measureUntil, sampleFrames, watchConsole } from "./helpers/perf";

test("scroll orizzontale: rotella e frame con 36 clip", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/?view=shelf&heavy=36");
  await expect(page.locator(".shelf-window")).toHaveAttribute("data-state", "open");
  const rail = page.locator(".shelf-content .overflow-x-auto").first();
  const rect = await rail.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  const before = await rail.evaluate((el) => el.scrollLeft);
  const frames = await sampleFrames(page, 1200, () => page.mouse.wheel(0, 120));
  const distance = await rail.evaluate((el) => el.scrollLeft) - before;
  console.log(`shelf wheel: distance=${distance}px, p95=${frames.p95.toFixed(1)}ms, frames=${frames.n}`);
  expectBudget(frames.p95, 120, "horizontal wheel p95");
  expect(frames.n).toBeGreaterThan(10);
  expect(distance).toBeGreaterThanOrEqual(200);
  expect(distance).toBeLessThanOrEqual(250);
  const reverseMs = await measureUntil(
    () => page.mouse.wheel(0, -120),
    () => expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeLessThan(2),
  );
  expectBudget(reverseMs, 900, "wheel reverse + settle");
  expect(errors).toEqual([]);
});

test("trackpad, rotella a righe e limiti della riga", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/?view=shelf&heavy=36");
  await expect(page.locator(".shelf-window")).toHaveAttribute("data-state", "open");
  const rail = page.locator(".shelf-rail").first();
  const rect = await rail.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.wheel(240, 0);
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(200);
  const control = await rail.evaluate((el) => {
    const event = new WheelEvent("wheel", { deltaY: 120, ctrlKey: true, cancelable: true, bubbles: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(control).toBe(false);
  const before = await rail.evaluate((el) => el.scrollLeft);
  await rail.dispatchEvent("wheel", { deltaY: 3, deltaMode: 1 });
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 150);
  await expect(rail).not.toHaveAttribute("data-scrolling", "true");
  const atEnd = await rail.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    const event = new WheelEvent("wheel", { deltaY: 120, cancelable: true, bubbles: true });
    el.dispatchEvent(event);
    return { blocked: event.defaultPrevented, left: el.scrollLeft, max: el.scrollWidth - el.clientWidth };
  });
  expect(atEnd.blocked).toBe(false);
  expect(atEnd.left).toBe(atEnd.max);
  expect(errors).toEqual([]);
});

test("le frecce seguono la selezione e si fermano alle 36 clip visibili", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/?view=shelf&heavy=60");
  await expect(page.locator(".shelf-window")).toHaveAttribute("data-state", "open");
  await page.locator(".shelf-search input").evaluate((el) => (el as HTMLElement).blur());
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
  const visible = () => page.locator('.clip-card[data-selected="true"]').evaluate((el) => {
    const card = el.getBoundingClientRect();
    const rail = el.closest(".shelf-rail")!.getBoundingClientRect();
    return card.left >= rail.left - 1 && card.right <= rail.right + 1;
  });
  await expect.poll(visible).toBe(true);
  for (let i = 0; i < 35; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".clip-card").nth(35)).toHaveAttribute("data-selected", "true");
  await expect.poll(visible).toBe(true);
  expect(errors).toEqual([]);
});
