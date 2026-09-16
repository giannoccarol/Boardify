import { expect, test } from "@playwright/test";
import { cards, gotoView } from "./helpers/perf";

test("tmp screenshots menus", async ({ page }) => {
  await gotoView(page, "shelf");
  // Il menu AI esiste solo con AI abilitata (come in ai-menu.spec.ts).
  await page.evaluate(() => {
    const raw = localStorage.getItem("boardify-settings");
    const s = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      "boardify-settings",
      JSON.stringify({ ...s, aiEnabled: true, aiProvider: "ollama", aiModel: "llama3.3" }),
    );
  });
  await page.reload();
  const n = await cards(page).count();
  expect(n).toBeGreaterThan(0);
  let found = false;
  for (let i = 0; i < n; i++) {
    const card = cards(page).nth(i);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(page.locator(".clip-preview")).toBeVisible();
    if ((await page.locator(".clip-preview .copy-split-toggle").count()) > 0) {
      found = true;
      break;
    }
    await page.keyboard.press("Escape");
  }
  expect(found).toBe(true);
  await page.locator(".clip-preview .copy-split-toggle").click();
  await expect(page.locator(".clip-preview .copy-menu")).toBeVisible();
  await page.locator(".clip-preview .copy-menu-item").first().hover();
  await page.locator(".clip-preview").screenshot({ path: "/tmp/copy-menu.png" });
  await page.locator(".clip-preview .copy-split-toggle").click();
  await expect(page.locator(".clip-preview .copy-menu")).toHaveCount(0);
  console.log("preview count:", await page.locator(".clip-preview").count());
  console.log("ai wrap count:", await page.locator(".clip-preview .ai-menu-wrap").count());
  await page.locator(".clip-preview").screenshot({ path: "/tmp/before-ai.png" });
  await page.locator(".clip-preview .preview-tools .ai-menu-wrap button").first().click();
  await page.waitForTimeout(500);
  console.log("ai-menu count:", await page.locator(".clip-preview .ai-menu").count());
  console.log("ai-menu box:", JSON.stringify(await page.locator(".clip-preview .ai-menu").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: r.x, y: r.y, w: r.width, h: r.height, opacity: cs.opacity, visibility: cs.visibility, display: cs.display, transform: cs.transform };
  })));
  console.log("wrap html:", await page.locator(".clip-preview .ai-menu-wrap").evaluate((el) => el.outerHTML.slice(0, 600)));
  await expect(page.locator(".clip-preview .ai-menu")).toBeVisible();
  await page.locator(".clip-preview .ai-menu-item").first().hover();
  await page.locator(".clip-preview").screenshot({ path: "/tmp/ai-menu.png" });
});
