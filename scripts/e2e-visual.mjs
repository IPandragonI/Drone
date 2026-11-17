// Verification of the visual upgrade: favicon/manifest, landing page + hero video, drone showcase (3D viewers, selection
// persistence), sky rendering, textured environments, and that every drone is still flyable.
// Usage: node scripts/e2e-visual.mjs [http://localhost:3100]   (needs `next start -p 3100`)
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("docs/screenshots", { recursive: true });

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|GPU stall|net::ERR_/.test(m.text())) errors.push(m.text());
  });
};
/** Mean / standard deviation per channel of a PNG buffer, optionally of its top `region` fraction. */
const stats = async (buf, region, from = 0) => {
  const meta = await sharp(buf).metadata();
  const img = region ? sharp(buf).extract({ left: 0, top: Math.round(meta.height * from), width: meta.width, height: Math.round(meta.height * (region - from)) }) : sharp(buf);
  const s = await img.stats();
  return { mean: s.channels.map((c) => c.mean), std: s.channels.map((c) => c.stdev) };
};

try {
  // ---------- favicon, manifest, metadata
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page);
  const failedReq = [];
  page.on("response", (r) => r.status() >= 400 && failedReq.push(`${r.status()} ${r.url()}`));
  await page.goto(base);
  await page.waitForSelector('[data-testid="hero-title"]', { timeout: 90000 });
  const links = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')].map((l) => `${l.rel}:${l.getAttribute("href")}`));
  check("head declares svg + ico favicon, apple-touch-icon and manifest", links.some((l) => l.includes("icon.svg")) && links.some((l) => l.includes("favicon.ico")) && links.some((l) => l.startsWith("apple-touch-icon")) && links.some((l) => l.startsWith("manifest")), links.join(" "));
  for (const path of ["/icon.svg", "/favicon.ico", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"]) {
    const r = await page.request.get(base + path);
    check(`${path} is served`, r.ok(), `${r.status()} ${r.headers()["content-type"] ?? ""}`);
  }
  const apple = await page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"));
  check("apple-touch-icon is served", apple ? (await page.request.get(base + apple)).ok() : false, String(apple));

  // ---------- landing hero
  const hero = await page.evaluate(() => {
    const v = document.querySelector('[data-testid="hero-video"]');
    return v ? { muted: v.muted, loop: v.loop, auto: v.autoplay, sources: [...v.querySelectorAll("source")].map((s) => s.getAttribute("src")) } : null;
  });
  check("hero video is autoplay + muted + loop with webm and mp4 sources", !!hero && hero.muted && hero.loop && hero.auto && hero.sources.length === 2, JSON.stringify(hero));
  await page
    .waitForFunction(
      () => {
        const v = document.querySelector('[data-testid="hero-video"]');
        return v && v.readyState >= 2 && !v.paused && v.currentTime > 0.1;
      },
      null,
      { timeout: 30000 },
    )
    .catch(() => {});
  const vs = await page.evaluate(() => {
    const v = document.querySelector('[data-testid="hero-video"]');
    return { rs: v.readyState, paused: v.paused, t: v.currentTime, w: v.videoWidth, h: v.videoHeight, d: v.duration };
  });
  check("hero video is actually playing (frames decoded, time advancing)", vs.rs >= 2 && !vs.paused && vs.t > 0.1 && vs.w >= 1280, JSON.stringify(vs));
  const frameA = await stats(await page.screenshot({ timeout: 150000, type: "png" }));
  await sleep(1500);
  const t2 = await page.evaluate(() => document.querySelector('[data-testid="hero-video"]').currentTime);
  check("hero video time keeps advancing", t2 > vs.t, `${vs.t.toFixed(2)} -> ${t2.toFixed(2)}`);
  check("hero is not blank (image variance)", frameA.std[0] > 15, `stdev ${frameA.std[0].toFixed(1)}`);
  const ctas = await page.evaluate(() => ({ launch: document.querySelector('[data-testid="cta-launch"]').getAttribute("href"), drones: document.querySelector('[data-testid="cta-drones"]').getAttribute("href") }));
  check("hero CTAs: launch -> /launch, discover -> /drones", ctas.launch === "/launch" && ctas.drones === "/drones", JSON.stringify(ctas));
  await page.screenshot({ timeout: 150000, path: "docs/screenshots/landing-hero.png" });

  // all lazy images load
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
  });
  await sleep(1500);
  const imgs = await page.evaluate(() => [...document.images].map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0 })));
  const broken = imgs.filter((i) => !i.ok);
  check(`all ${imgs.length} landing images load`, broken.length === 0, broken.map((b) => b.src).join(", "));
  check("no failed requests on the landing page", failedReq.length === 0, failedReq.slice(0, 3).join(" | "));
  await page.evaluate(() => window.scrollTo(0, 0));
  const full = await page.screenshot({ timeout: 150000, path: "docs/screenshots/landing-full.png", fullPage: true });
  check("landing page has substantial height (multi-section)", (await sharp(full).metadata()).height > 4500);

  await page.close(); // stop decoding the hero video before the next contexts start

  // reduced motion: video hidden, poster stays
  const rbrowser = await chromium.launch(); // fresh browser: the GL-heavy one above can starve this page
  const rctx = await rbrowser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  await rp.goto(base);
  await rp.waitForSelector('[data-testid="hero-title"]', { timeout: 90000 });
  check("prefers-reduced-motion hides the video (poster remains)", await rp.evaluate(() => getComputedStyle(document.querySelector('[data-testid="hero-video"]')).display === "none"));
  await rctx.close();
  await rbrowser.close();

  // mobile layout
  const mbrowser = await chromium.launch();
  const mctx = await mbrowser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  await mp.goto(base);
  await mp.waitForSelector('[data-testid="hero-title"]', { timeout: 90000 });
  check("landing has no horizontal scroll on a 390 px phone", await mp.evaluate(() => document.documentElement.scrollWidth <= 391));
  await mp.screenshot({ timeout: 150000, path: "docs/screenshots/landing-mobile.png" });
  await mctx.close();
  await mbrowser.close();

  // ---------- drone showcase
  const dp = await ctx.newPage();
  watch(dp);
  await dp.goto(`${base}/drones`);
  for (const id of ["fpv-freestyle", "inspection", "cinewhoop"]) {
    const v = dp.locator(`[data-testid="viewer-${id}"]`);
    await v.waitFor({ timeout: 180000 });
    await v.scrollIntoViewIfNeeded();
    await sleep(4500);
    const st = await stats(await v.screenshot({ timeout: 150000, type: "png" }));
    check(`viewer ${id} renders a model (not blank)`, st.std[0] > 12, `stdev ${st.std[0].toFixed(1)}`);
  }
  const specTxt = await dp.locator('[data-testid="specs-inspection"]').innerText();
  check("specs list weight, dimensions, thrust and TWR from the sim config", /1600 g/.test(specTxt) && /mm/.test(specTxt) && /N \(/.test(specTxt) && /2\.2 : 1/.test(specTxt), specTxt.replace(/\n/g, " | ").slice(0, 120));
  // interaction: drag rotates (image changes), wheel zooms, reset restores
  const v = dp.locator('[data-testid="viewer-cinewhoop"]');
  await v.scrollIntoViewIfNeeded();
  await sleep(500);
  const box = await v.boundingBox();
  const before = await stats(await v.screenshot({ timeout: 150000, type: "png" }));
  await dp.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await dp.mouse.down();
  await dp.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 30, { steps: 8 });
  await dp.mouse.up();
  await sleep(900);
  const after = await stats(await v.screenshot({ timeout: 150000, type: "png" }));
  check("dragging the viewer rotates the model (image changes)", Math.abs(after.mean[0] - before.mean[0]) > 0.3 || Math.abs(after.std[0] - before.std[0]) > 0.3, `mean ${before.mean[0].toFixed(1)} -> ${after.mean[0].toFixed(1)}`);
  await dp.mouse.wheel(0, -400);
  await sleep(700);
  check("wheel zoom works (image changes)", Math.abs((await stats(await v.screenshot({ timeout: 150000, type: "png" }))).mean[0] - after.mean[0]) > 0.3);
  await dp.getByTestId("viewer-cinewhoop-reset").click();
  await sleep(1200);
  await dp.screenshot({ timeout: 150000, path: "docs/screenshots/drones-page.png" });
  // selection persists and drives the launcher
  await dp.getByTestId("select-inspection").scrollIntoViewIfNeeded();
  await dp.getByTestId("select-inspection").click();
  await dp.waitForSelector('[data-testid="selected-banner"]', { timeout: 30000 }); // shown only after the write completed
  await dp.reload();
  await dp.waitForSelector('[data-testid="selected-banner"]', { timeout: 90000 });
  check("selected drone persists across reload", /inspection/i.test(await dp.getByTestId("selected-banner").innerText()));
  await dp.goto(`${base}/launch`);
  await dp.waitForSelector('[data-testid="start-free"]', { timeout: 90000 });
  await sleep(600);
  const href = await dp.getByTestId("start-free").getAttribute("href");
  check("the launcher defaults to the selected drone", /drone=inspection/.test(href), href);
  await dp.getByTestId("start-free").click();
  await dp.waitForSelector('[data-k="alt"]', { timeout: 90000 });
  check("flight starts with the selected drone", /inspection/i.test(await dp.locator("body").innerText()));
  await dp.close();

  // ---------- environments, sky, every drone flyable
  const fp = await ctx.newPage();
  watch(fp);
  await fp.goto(`${base}/fly?env=quarry-yard&sky=clear&q=high&debug=1`);
  await fp.waitForSelector('[data-k="alt"]', { timeout: 90000 });
  await fp.evaluate(() => window.__session.sim.debugTeleport(-4, 9, 34));
  await sleep(6000);
  const yardShot = await fp.locator("canvas").first().screenshot({ timeout: 150000, type: "png" });
  const top = await stats(yardShot, 0.3);
  check("outdoor sky renders (top of frame is blue-dominant and varied)", top.mean[2] > top.mean[0] + 15 && top.std[2] > 6, `rgb ${top.mean.map((x) => x.toFixed(0))}`);
  await sharp(yardShot).resize({ width: 1280 }).jpeg({ quality: 82 }).toFile("docs/screenshots/yard-sky.jpg");
  await fp.goto(`${base}/fly?env=quarry-yard&sky=dusk&q=medium&debug=1`);
  await fp.waitForSelector('[data-k="alt"]', { timeout: 90000 });
  await fp.evaluate(() => window.__session.sim.debugTeleport(-4, 9, 34));
  await sleep(5000);
  const dusk = await stats(await fp.locator("canvas").first().screenshot({ timeout: 150000, type: "png" }), 0.35);
  check("golden-hour preset is warmer than the clear sky (red up, blue down)", dusk.mean[0] / dusk.mean[2] > top.mean[0] / top.mean[2] + 0.2, `R/B clear ${(top.mean[0] / top.mean[2]).toFixed(2)} dusk ${(dusk.mean[0] / dusk.mean[2]).toFixed(2)}`);
  await fp.goto(`${base}/fly?env=quarry-yard&sky=foggy&q=medium&debug=1`);
  await fp.waitForSelector('[data-k="alt"]', { timeout: 90000 });
  await fp.evaluate(() => window.__session.sim.debugTeleport(-4, 9, 34));
  await sleep(5000);
  const fogAll = await stats(await fp.locator("canvas").first().screenshot({ timeout: 150000, type: "png" }), 0.5);
  const clearAll = await stats(yardShot, 0.5);
  const sat = (st) => Math.abs(st.mean[2] - st.mean[0]); // blue-vs-red separation of the upper half: how "blue" the sky is
  check("fog preset has a washed-out sky (much less blue than clear air)", sat(fogAll) < sat(clearAll) * 0.6, `|B-R| fog ${sat(fogAll).toFixed(0)} vs clear ${sat(clearAll).toFixed(0)}`);

  // textured vs flat materials on the hall
  await fp.goto(`${base}/fly?q=high&debug=1`);
  await fp.waitForSelector('[data-k="alt"]', { timeout: 90000 });
  await sleep(4000);
  const hi = await stats(await fp.locator("canvas").first().screenshot({ timeout: 150000, type: "png" }));
  await fp.goto(`${base}/fly?q=low&debug=1`);
  await fp.waitForSelector('[data-k="alt"]', { timeout: 90000 });
  await sleep(3500);
  const lo = await stats(await fp.locator("canvas").first().screenshot({ timeout: 150000, type: "png" }));
  check("High graphics adds visible texture detail over Low (higher image variance)", hi.std[0] > lo.std[0] * 1.02, `stdev high ${hi.std[0].toFixed(1)} low ${lo.std[0].toFixed(1)}`);

  // the three new maps: load, render real content, spawn is flyable, and their missions brief correctly
  for (const [env, mission, label] of [["pine-valley", "pine-trail", "Pine Trail"], ["desert-wind-farm", "turbine-inspection", "Turbine Inspection"], ["harbor-district", "harbor-run", "Harbor Run"]]) {
    await fp.goto(`${base}/fly?env=${env}&q=low&debug=1`);
    await fp.waitForSelector('[data-k="alt"]', { timeout: 120000 });
    await sleep(2500);
    const shot = await stats(await fp.locator("canvas").first().screenshot({ timeout: 150000, type: "png" }));
    const name = await fp.evaluate(() => window.__session.sim.env.id);
    check(`map ${env}: loads and renders (not blank)`, name === env && shot.std[0] > 12, `stdev ${shot.std[0].toFixed(1)}`);
    await fp.evaluate(() => (window.__session.keyboard.throttle = 0.5));
    const a0 = await fp.evaluate(() => window.__session.sim.getTelemetry().altitude);
    let a1 = a0;
    for (let i = 0; i < 80 && a1 < a0 + 0.25; i++) {
      await sleep(250);
      a1 = await fp.evaluate(() => window.__session.sim.getTelemetry().altitude);
    }
    check(`map ${env}: drone takes off`, a1 > a0 + 0.25, `alt ${a0.toFixed(2)} -> ${a1.toFixed(2)}`);
    await fp.goto(`${base}/fly?mission=${mission}&q=low&debug=1`);
    await fp.waitForSelector('[data-testid="mission-briefing"]', { timeout: 120000 });
    check(`mission ${mission}: briefing shows on its own map`, (await fp.locator('[data-testid="mission-briefing"]').innerText()).toLowerCase().includes(label.toLowerCase()) && (await fp.evaluate(() => window.__session.sim.env.id)) === env);
  }

  for (const id of ["fpv-freestyle", "inspection", "cinewhoop"]) {
    await fp.goto(`${base}/fly?drone=${id}&q=low&debug=1`);
    await fp.waitForSelector('[data-k="alt"]', { timeout: 90000 });
    const got = await fp.evaluate(() => window.__session.sim.drone.id);
    await fp.evaluate(() => (window.__session.keyboard.throttle = 0.7));
    const alt0 = await fp.evaluate(() => window.__session.sim.getTelemetry().altitude);
    let alt1 = alt0;
    for (let i = 0; i < 40 && alt1 < alt0 + 0.3; i++) {
      await sleep(250); // the sim runs in slow motion under software rendering: poll instead of a fixed wait
      alt1 = await fp.evaluate(() => window.__session.sim.getTelemetry().altitude);
    }
    await fp.evaluate(() => (window.__session.keyboard.throttle = 0.1));
    check(`${id}: loads and climbs under throttle (still controllable)`, got === id && alt1 > alt0 + 0.25, `alt ${alt0.toFixed(2)} -> ${alt1.toFixed(2)}`);
    await fp.evaluate(() => (window.__session.cameraMode = "chase"));
    await sleep(1500);
    const chase = await stats(await fp.locator("canvas").first().screenshot({ timeout: 150000, type: "png" }));
    check(`${id}: chase view renders`, chase.std[0] > 10, `stdev ${chase.std[0].toFixed(1)}`);
    if (id === "fpv-freestyle") await fp.screenshot({ timeout: 150000, path: "docs/screenshots/chase-fpv.png" });
  }
  await fp.close();
} catch (e) {
  console.log("ERROR", e);
  results.push(false);
} finally {
  await browser.close();
}
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
