// Usage: node scripts/shot2.mjs "<path>" out.png [width] [height] [scrollY] [waitMs]
import { chromium } from "playwright";
const [url, out, w = "1280", h = "800", sy = "0", wait = "3500"] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await (await b.newContext({ viewport: { width: Number(w), height: Number(h) } })).newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
await p.goto(`http://localhost:3100${url}`);
if (Number.isNaN(Number(sy))) { await p.waitForSelector(sy, { timeout: 60000 }); await p.locator(sy).scrollIntoViewIfNeeded(); } else await p.evaluate((y) => window.scrollTo(0, y), Number(sy));
await p.waitForTimeout(Number(wait));
await p.screenshot({ path: out });
await b.close();
