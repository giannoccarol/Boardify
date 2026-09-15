import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 1422);

export default defineConfig({
  testDir: "./e2e",
  // Misure stabili: un worker, niente parallelo che sporca i tempi.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  // Il percorso reduced-motion di ui-motion gira con gli stessi spec.
  projects: [
    { name: "default" },
    { name: "reduced", use: { reducedMotion: "reduce" } },
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
