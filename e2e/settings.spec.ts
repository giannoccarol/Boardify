import { expect, test } from "@playwright/test";
import { expectBudget, gotoView, measureUntil, watchConsole } from "./helpers/perf";

const BUDGET = {
  renderWarmMs: 3000,
  panelMs: 800,
  toggleMs: 800,
  recorderMs: 1200,
  aiTestMs: 1200,
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

  test("OpenCode Go: il test usa l'endpoint del modello", async ({ page }) => {
    const errors = watchConsole(page);
    await page.addInitScript(() => {
      localStorage.setItem("boardify-settings", JSON.stringify({
        locale: "en",
        aiProvider: "opencode-go",
        aiModel: "kimi-k2.7-code",
        aiEffort: "off",
        aiKeys: { "opencode-go": "test-key" },
        aiBaseUrl: "",
      }));
    });
    const calls: { endpoint: string; model: string; session: string; body: Record<string, unknown> }[] = [];
    await page.route("https://opencode.ai/zen/go/v1/**", async (route) => {
      const req = route.request();
      const endpoint = new URL(req.url()).pathname.split("/zen/go/v1/")[1];
      if (req.method() === "GET") {
        await route.fulfill({ json: { data: [{ id: "kimi-k2.7-code" }, { id: "gpt-5.6-luna" }, { id: "minimax-m2.7" }] } });
        return;
      }
      const body = req.postDataJSON() as Record<string, unknown>;
      calls.push({ endpoint, model: String(body.model), session: req.headers()["x-opencode-session"] ?? "", body });
      const json = endpoint === "responses"
        ? { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] }
        : endpoint === "messages"
          ? { content: [{ type: "text", text: "ok" }] }
          : { choices: [{ message: { content: "ok" } }] };
      await route.fulfill({ json });
    });
    await gotoView(page, "settings", true);
    await page.locator(".settings-nav-item:has(.nav-icon-ai)").click();
    await expect(page.getByRole("combobox", { name: "Provider" })).toHaveValue("opencode-go");
    const model = page.locator('input[aria-label="Model"]');
    const button = page.getByRole("button", { name: "Test", exact: true });
    const status = page.locator(".settings-feedback");
    for (const [index, id] of ["kimi-k2.7-code", "gpt-5.6-luna", "opencode-go/minimax-m2.7"].entries()) {
      await model.fill(id);
      const ms = await measureUntil(() => button.click(), async () => {
        await expect.poll(() => calls.length).toBe(index + 1);
        await expect(status).toHaveText("Connected.");
      });
      expectBudget(ms, BUDGET.aiTestMs, `OpenCode Go test ${id}`);
    }
    expect(calls.map((c) => [c.endpoint, c.model])).toEqual([
      ["chat/completions", "kimi-k2.7-code"],
      ["responses", "gpt-5.6-luna"],
      ["messages", "minimax-m2.7"],
    ]);
    expect(calls.every((c) => !!c.session && c.session === calls[0].session)).toBe(true);
    expect(calls.every((c) => c.body.temperature === undefined && c.body.reasoning_effort === undefined)).toBe(true);
    expect(errors).toEqual([]);
  });
});
