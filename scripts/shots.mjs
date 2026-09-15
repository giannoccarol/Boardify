#!/usr/bin/env node
/**
 * Screenshot abituali per il README.
 *
 *   npm run shots
 *
 * Alza Vite su 127.0.0.1:1421 (SHOT_PORT per cambiarla), apre le viste demo
 * (`?view=` + `?shot=`) e scrive PNG in docs/shots/.
 * Serve Chromium/Chrome. ImageMagick (magick) ritaglia toast e preview.
 */
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "shots");
const PORT = Number(process.env.SHOT_PORT || 1421);

const CHROMES = [
  "/usr/bin/chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/brave",
];

function chromeBin() {
  for (const p of CHROMES) if (existsSync(p)) return p;
  throw new Error("Installa Chromium o Chrome per npm run shots");
}

async function ping(origin) {
  try {
    const r = await fetch(`${origin}/`, { signal: AbortSignal.timeout(800) });
    return r.ok || r.status === 304;
  } catch {
    return false;
  }
}

async function origin() {
  const o = `http://127.0.0.1:${PORT}`;
  if (await ping(o)) return o;
  return null;
}

function startVite() {
  const child = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, BROWSER: "none" },
  });
  return child;
}

async function waitOrigin(started) {
  for (let i = 0; i < 50; i++) {
    const o = await origin();
    if (o) return o;
    if (started?.exitCode != null) throw new Error("vite è uscito prima di essere pronto");
    await sleep(200);
  }
  throw new Error("vite non risponde su :" + PORT);
}

async function capture(chrome, url, dest, w, h, budget = 9000) {
  const args = [
    "--headless=new",
    "--hide-scrollbars",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--force-device-scale-factor=2",
    `--window-size=${w},${h}`,
    `--screenshot=${dest}`,
    `--virtual-time-budget=${budget}`,
    "--timeout=25000",
    url,
  ];
  await exec(chrome, args, { timeout: 30000 });
}

async function magick(args) {
  const bin = existsSync("/usr/bin/magick") ? "magick" : existsSync("/usr/bin/convert") ? "convert" : null;
  if (!bin) return false;
  await exec(bin, args);
  return true;
}

async function polish(src, dest) {
  const ok = await magick([src, "-strip", "-quality", "88", "-resize", "1600x>", dest]);
  if (!ok) await exec("cp", [src, dest]);
}

const JOBS = [
  { name: "shelf", path: "/?view=shelf&shot=1", w: 1440, h: 860 },
  { name: "preview", path: "/?view=shelf&shot=preview", w: 1440, h: 1100, budget: 14000 },
  { name: "library", path: "/?view=library&shot=1", w: 1280, h: 820 },
  { name: "capture", path: "/?view=capture&shot=1", w: 1000, h: 280 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const chrome = chromeBin();
  const vite = startVite();
  const stop = () => {
    try {
      vite.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  };
  process.on("exit", stop);
  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });

  console.log("→ vite :" + PORT);
  const base = await waitOrigin(vite);

  const rawDir = join(OUT, ".raw");
  await mkdir(rawDir, { recursive: true });

  try {
    for (const job of JOBS) {
      const raw = join(rawDir, `${job.name}.png`);
      const dest = join(OUT, `${job.name}.png`);
      process.stdout.write(`  ${job.name}… `);
      await capture(chrome, `${base}${job.path}`, raw, job.w, job.h, job.budget);
      if (job.name === "capture") {
        await magick([
          raw,
          "-gravity",
          "North",
          "-crop",
          "1840x320+0+28",
          "+repage",
          "-strip",
          "-resize",
          "920x",
          dest,
        ]);
      } else if (job.name === "preview") {
        await magick([raw, "-gravity", "North", "-crop", "2880x1960+0+0", "+repage", "-strip", "-resize", "1600x", dest]);
      } else {
        await polish(raw, dest);
      }
      console.log("ok");
    }
  } finally {
    await rm(rawDir, { recursive: true, force: true });
    stop();
  }
  console.log("shots in docs/shots/");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
