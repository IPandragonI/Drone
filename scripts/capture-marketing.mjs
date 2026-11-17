// Captures the landing-page images from the running production build (real renders of the simulator).
// Usage: node scripts/capture-marketing.mjs [http://localhost:3100]   (needs `next start -p 3100`; starts the relay itself for the phone shot)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, unlinkSync } from "node:fs";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:3100";
mkdirSync("public/img", { recursive: true });
mkdirSync("tmp-marketing", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ args: GL });

/** Save a PNG buffer as an optimised JPEG. */
async function save(buf, name, width) {
  await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(`public/img/${name}.jpg`);
  console.log("saved", name);
}

// ---- cinematic frames (hall interior)
{
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto(`${base}/cinematic?sky=cloudy`);
  await page.waitForFunction(() => window.__cine?.ready, null, { timeout: 120000 });
  await sleep(6000);
  for (const [name, t, w] of [["hall-fpv", 5, 1600], ["hall-chase", 14, 1200], ["hall-mezz", 22, 1920]]) {
    await page.evaluate((t) => window.__cine.render(t, 1 / 24), t);
    await page.evaluate((t) => window.__cine.render(t + 0.04, 1 / 24), t);
    await sleep(600);
    await save(await page.screenshot({ type: "png", timeout: 180000 }), name, w);
  }
  await page.close();
}

// ---- yard under the sky (canvas only, no HUD)
{
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await page.goto(`${base}/fly?env=quarry-yard&sky=clear&q=high&debug=1`);
  await page.waitForSelector('[data-k="alt"]', { timeout: 90000 });
  await page.evaluate(() => window.__session.sim.debugTeleport(-4, 9, 34));
  await sleep(6000);
  await save(await page.locator("canvas").first().screenshot({ type: "png", timeout: 180000 }), "yard", 1920);
  await page.close();
}

// ---- mission scene with a target ring (full page: HUD included, it is part of the product)
{
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto(`${base}/fly?mission=hall-slalom&q=high&debug=1`);
  await page.waitForSelector('[data-testid="mission-briefing"]', { timeout: 90000 });
  await page.evaluate(() => {
    window.__session.sim.debugTeleport(0.3, 2.3, 8.2);
    window.__session.keyboard.throttle = 0.13;
  });
  await page.keyboard.down("ArrowUp");
  await sleep(250);
  await page.keyboard.up("ArrowUp");
  await page.evaluate(() => (window.__session.keyboard.throttle = 0.12));
  await sleep(2500);
  await save(await page.screenshot({ type: "png", timeout: 180000 }), "mission-gates", 1600);
  await page.close();
}

// ---- drone renders from the showcase viewers
{
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await page.goto(`${base}/drones`);
  for (const [id, name] of [["fpv-freestyle", "drone-fpv"], ["inspection", "drone-inspection"], ["cinewhoop", "drone-cinewhoop"]]) {
    const v = page.locator(`[data-testid="viewer-${id}"]`);
    await v.waitFor({ timeout: 90000 });
    await v.scrollIntoViewIfNeeded();
    await sleep(5000);
    await save(await v.screenshot({ type: "png", timeout: 180000 }), name, 1400);
  }
  await page.close();
}

// ---- phone controller, linked to a real session
{
  const relay = spawn(process.execPath, ["server/start.mjs"], { env: { ...process.env, RELAY_PORT: "3101" }, stdio: ["ignore", "pipe", "ignore"] });
  await new Promise((res) => relay.stdout.on("data", (d) => String(d).includes("listening") && res()));
  const desk = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await desk.goto(`${base}/fly?q=low&debug=1`);
  await desk.waitForSelector('[data-k="alt"]', { timeout: 90000 });
  await desk.getByTestId("phone-toggle").click();
  await desk.waitForSelector('[data-testid="phone-url"]');
  const url = await desk.getByTestId("phone-url").innerText();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const phone = await ctx.newPage();
  await phone.goto(url);
  await phone.waitForFunction(() => document.querySelector('[data-testid="pad-status"]')?.textContent === "Linked", null, { timeout: 30000 });
  const cdp = await ctx.newCDPSession(phone);
  // hold both thumbs on the sticks for a lifelike shot
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y: 250, id: 1 }, { x: 680, y: 240, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 150, y: 215, id: 1 }, { x: 705, y: 215, id: 2 }] });
  await sleep(1500);
  await save(await phone.screenshot({ type: "png", timeout: 180000 }), "pad", 1688);
  await ctx.close();
  await desk.close();
  relay.kill();
}

// ---- result card (from the verified e2e run)
try {
  await sharp("docs/screenshots/mission-result.png").resize({ width: 900 }).jpeg({ quality: 82, mozjpeg: true }).toFile("public/img/mission-result.jpg");
  console.log("saved mission-result");
} catch (e) {
  console.log("mission-result missing:", e.message);
}
await browser.close();
try {
  unlinkSync("tmp-marketing");
} catch {}
