import { expect, test } from "@playwright/test";
import { expectBudget, measureUntil, sampleFrames, watchConsole } from "./helpers/perf";

type DragSnapshot = {
  defaultPrevented: boolean;
  draggable: boolean;
  types: string[];
  files: { name: string; type: string; size: number }[];
  text: string;
};

async function dispatchDragStart(locator: import("@playwright/test").Locator): Promise<DragSnapshot> {
  return locator.evaluate((element) => {
    const transfer = new DataTransfer();
    const event = new DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    });
    element.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented,
      draggable: (element as HTMLElement).draggable,
      types: [...transfer.types],
      files: [...transfer.files].map((file) => ({ name: file.name, type: file.type, size: file.size })),
      text: transfer.getData("text/plain"),
    };
  });
}

test("drag immagine dalla shelf: file reale nel fallback web e feedback fluido", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/?view=shelf");
  await expect(page.locator(".shelf-window")).toHaveAttribute("data-state", "open");
  const card = page.locator('.clip-card[data-kind="image"]').first();
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-exportable", "true");

  let snapshot!: DragSnapshot;
  const startMs = await measureUntil(
    async () => { snapshot = await dispatchDragStart(card); },
    () => expect(card).toHaveAttribute("data-dragging", "true"),
  );
  expectBudget(startMs, 800, "shelf drag feedback");
  expect(snapshot.draggable).toBe(true);
  expect(snapshot.defaultPrevented).toBe(false);
  expect(snapshot.types).toContain("text/plain");
  expect(snapshot.types).toContain("Files");
  expect(snapshot.files).toHaveLength(1);
  expect(snapshot.files[0]).toMatchObject({ name: "boardify-image.svg", type: "image/svg+xml" });
  expect(snapshot.files[0].size).toBeGreaterThan(100);

  await card.dispatchEvent("dragend");
  await expect(card).toHaveAttribute("data-dragging", "false");

  const frames = await sampleFrames(page, 500, () => card.evaluate((element) => new Promise<void>((resolve) => {
    const transfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    let count = 0;
    const tick = () => {
      count += 1;
      if (count < 12) requestAnimationFrame(tick);
      else {
        element.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
        resolve();
      }
    };
    requestAnimationFrame(tick);
  })));
  expectBudget(frames.p95, 120, "shelf drag p95");
  expect(frames.n).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test("drag testuale e URL file Windows/POSIX restano compatibili", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/?view=shelf&shot=1");
  const textCard = page.locator('.clip-card[data-kind="text"]').first();
  await expect(textCard).toBeVisible();
  const snapshot = await dispatchDragStart(textCard);
  expect(snapshot.draggable).toBe(true);
  expect(snapshot.text.length).toBeGreaterThan(10);

  const urls = await page.evaluate(async () => {
    const { filePathToUrl } = await import("/src/dragOut.ts");
    return {
      linux: filePathToUrl("/home/lorenzo/Foto estate/foto #1.png"),
      windows: filePathToUrl("C:\\Users\\Lorenzo\\Foto estate\\foto #1.png"),
      unc: filePathToUrl("\\\\server\\share\\foto 1.png"),
    };
  });
  expect(urls).toEqual({
    linux: "file:///home/lorenzo/Foto%20estate/foto%20%231.png",
    windows: "file:///C:/Users/Lorenzo/Foto%20estate/foto%20%231.png",
    unc: "file://server/share/foto%201.png",
  });
  expect(errors).toEqual([]);
});

