// Checks that a normal production build (no NEXT_PUBLIC_ENABLE_DEBUG) exposes no debug hooks and handles the missing phone relay.
// Usage: node scripts/e2e-prod.mjs [http://localhost:3100]
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3100";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let ok = true;
const check = (n, v, d = "") => { ok = ok && v; console.log(`${v ? "PASS" : "FAIL"}  ${n} ${d}`); };
await p.goto(`${base}/fly?debug=1&q=low`);
await p.waitForSelector('[data-k="alt"]', { timeout: 120000 });
await p.waitForTimeout(2000);
const hooks = await p.evaluate(() => ({ session: typeof window.__session, audio: typeof window.__audio }));
check("production build ignores ?debug=1 (no window.__session / __audio)", hooks.session === "undefined" && hooks.audio === "undefined", JSON.stringify(hooks));
await p.getByTestId("phone-toggle").click();
const msg = await p.getByTestId("phone-state").innerText();
check("phone panel opens and says the relay is unavailable instead of failing silently", /unavailable|error|starting|creating|waiting/i.test(msg), msg);
await b.close();
process.exit(ok ? 0 : 1);
