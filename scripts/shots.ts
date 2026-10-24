// Deck screenshots. Run `npm run build && npm run preview` in another terminal, then `npm run shots`.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.BASE ?? "http://localhost:4173";
const shots: [string, string, number, number][] = [
  ["01-counter-blocked", "/counter?demo=blocked", 1920, 1080],
  ["02-counter-emergency", "/counter?demo=emergency", 1920, 1080],
  ["03-simulate-end", "/simulate?part=all&t=365", 1920, 1080],
  ["04-control-tower", "/?part=ac-compressor", 1920, 1080],
  ["05-trail-broken", "/trail", 1920, 1080],
  ["06-planner-drawer", "/planner?part=oil-filter", 1920, 1080],
  ["07-reorder", "/reorder", 1920, 1080],
  ["08-leakage", "/leakage", 1920, 1080],
  ["09-counter-tablet", "/counter?demo=blocked", 1180, 820],
];
mkdirSync("screenshots", { recursive: true });
const browser = await chromium.launch();
for (const [name, path, width, height] of shots) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`${base}${path}${path.includes("?") ? "&" : "?"}static=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `screenshots/${name}.png` });
  await page.close();
  console.log("saved", name);
}
await browser.close();
