// Dev helper: screenshot one URL. Usage: tsx scripts/peek.ts <path> <out.png> [width] [height]
import { chromium } from "playwright";

const [, , path = "/", out = "peek.png", w = "1920", h = "1080"] = process.argv;
const base = process.env.BASE ?? "http://localhost:4173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
page.on("console", (m) => m.type() === "error" && console.error("CONSOLE:", m.text()));
await page.goto(base + path, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(process.env.WAIT ?? 1200));
await page.screenshot({ path: out, fullPage: process.env.FULL === "1" });
await browser.close();
