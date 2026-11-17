// Usage: node scripts/shot.mjs "<path>" out.png [waitMs] [js-to-eval]
import { chromium } from "playwright";
const [url, out, wait = "4000", js] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
await p.goto(`http://localhost:3100${url}`);
await p.waitForSelector('[data-k="alt"]', { timeout: 90000 }).catch(() => {});
if (js) await p.evaluate(js);
await p.waitForTimeout(Number(wait));
await p.screenshot({ path: out });
await b.close();
