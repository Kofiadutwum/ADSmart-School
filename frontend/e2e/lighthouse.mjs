// Lighthouse check for the public pages (spec §6.6). Chromium is launched by Playwright and
// Lighthouse connects over the debugging port: Lighthouse's own launcher cannot start a
// browser on this Windows setup ("spawn UNKNOWN").
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3100"; // Node cannot resolve *.localhost on Windows; Chromium can
const SCHOOL = "http://adsmart.localhost:3100";
const PAGES = [`${SCHOOL}/`, `${SCHOOL}/admissions`, `${SCHOOL}/?lite=1`, `${BASE}/`];
const REQUIRED = { performance: 0.9, accessibility: 0.9, "best-practices": 0.9 };
const ADVISORY = { seo: 0.9 }; // preview pages are deliberately noindex until launch (Plan 5)
const MAX_BYTES = 512_000;
const PORT = 9333;
const REPORT_DIR = path.resolve(here, "../.lighthouseci");

async function isUp(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

function stopServer(child) {
  if (!child) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else child.kill("SIGTERM");
}

let server;
if (!(await isUp(BASE))) {
  server = spawn(process.execPath, [path.join(here, "serve.mjs")], { stdio: "inherit" });
  for (let second = 0; second < 300 && !(await isUp(BASE)); second += 1) await sleep(1000);
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
let failed = false;
try {
  for (const page of PAGES) {
    const { lhr } = await lighthouse(page, { port: PORT, output: "json", logLevel: "error" });
    const name = page.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    fs.writeFileSync(path.join(REPORT_DIR, `${name}.json`), JSON.stringify(lhr));
    const bytes = lhr.audits["total-byte-weight"].numericValue;
    const line = [`${page.padEnd(40)}`];
    for (const [category, min] of Object.entries({ ...REQUIRED, ...ADVISORY })) {
      const score = lhr.categories[category].score;
      const ok = score >= min;
      if (!ok && category in REQUIRED) failed = true;
      line.push(`${category} ${Math.round(score * 100)}${ok ? "" : category in REQUIRED ? " FAIL" : " (warn)"}`);
    }
    const bytesOk = bytes <= MAX_BYTES;
    if (!bytesOk) failed = true;
    line.push(`weight ${Math.round(bytes / 1024)} KB${bytesOk ? "" : " FAIL"}`);
    console.log(line.join(" | "));
  }
} finally {
  await browser.close();
  stopServer(server);
}
console.log(failed ? "Lighthouse budget NOT met." : "Lighthouse budget met.");
process.exit(failed ? 1 : 0);
