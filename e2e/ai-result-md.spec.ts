import { expect, test } from "@playwright/test";
import { cards, expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

// I modelli rispondono in Markdown (systemPrompt lo chiede): il pannello deve
// renderizzarlo, non mostrare il sorgente. Provider stubbato via page.route.
const BUDGET = { resultRenderMs: 3000 };

const MD = [
  "Riassunto evento",
  "",
  "- **Evento:** Family Day di domenica",
  "- **Dove:** GREEN PARK, Bari — vedi [locandina](https://bit.ly/cabfamilyday2026)",
  "- **Costo:** `QH45` a testa",
  "- **Nota:** <img src=x onerror=alert(1)> resta testo",
  "",
  "1. Accoglienza alle 9:00",
  "2. Giochi alle 10:00",
  "",
  "- [ ] Prenota il paddle",
  "- [x] Compra i biglietti",
].join("\n");

test.describe("ai result markdown", () => {
  test("il risultato MD è renderizzato, non mostrato grezzo", async ({ page }) => {
    const errors = watchConsole(page);
    await gotoView(page, "shelf");
    await page.evaluate(() => {
      const raw = localStorage.getItem("boardify-settings");
      const s = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        "boardify-settings",
        JSON.stringify({ ...s, aiEnabled: true, aiProvider: "ollama", aiModel: "llama3.3" }),
      );
    });
    await page.reload();
    await page.route("**/chat/completions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ choices: [{ message: { content: MD } }] }),
      });
    });

    await cards(page).first().scrollIntoViewIfNeeded();
    await cards(page).first().click();
    await expect(page.locator(".clip-preview")).toBeVisible();
    await page.locator(".clip-preview .ai-menu-wrap > button").click();
    const item = page.locator(".clip-preview .ai-menu-item").nth(1);
    await expect(item).toBeVisible();

    const result = page.locator(".ai-result .ai-text");
    const ms = await measureUntil(
      async () => {
        await item.click();
        // Consenso per i clip sensibili: invia e prosegui.
        try {
          await expect(page.locator(".ai-result .ai-note")).toBeVisible({ timeout: 1500 });
          await page.locator(".ai-result .ai-result-actions button").first().click();
        } catch {
          /* via diretta, nessun consenso */
        }
      },
      () => expect(result.locator("li").first()).toBeVisible(),
    );
    expectBudget(ms, BUDGET.resultRenderMs, "ai result render");

    await expect(result.locator("strong").first()).toContainText("Evento:");
    expect(await result.locator("ul").count()).toBeGreaterThan(0);
    expect(await result.locator("ol").count()).toBeGreaterThan(0);
    expect(await result.locator('a[href="https://bit.ly/cabfamilyday2026"]').count()).toBe(1);
    expect(await result.locator("code").count()).toBeGreaterThan(0);
    const boxes = result.locator('li.ai-md-task input[type="checkbox"]');
    expect(await boxes.count()).toBe(2);
    expect(await boxes.nth(1).isChecked()).toBe(true);
    const raw = await result.innerText();
    expect(raw).not.toContain("**");
    expect(raw).not.toContain("](");
    // HTML del modello resta testo: niente tag reali.
    expect(await result.locator("img").count()).toBe(0);
    expect(raw).toContain("<img");
    expect(errors).toEqual([]);
  });
});
