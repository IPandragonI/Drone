// Verification of the P0/P1 batch: flight-area limits, pause menu, help and performance overlays, crash handling,
// key rebinding + layout, per-drone tuning, mission unlocks/difficulty/training, first-run path.
// Usage: node scripts/e2e-p1.mjs [http://localhost:3100]
// Needs a build with NEXT_PUBLIC_ENABLE_DEBUG=1 (teleport hook). Starts from a fresh browser profile.
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ args: GL });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "en-US" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|GPU stall|net::ERR_/.test(m.text())) errors.push(m.text());
});
const text = (sel) => page.locator(sel).first().innerText();
const waitFor = async (fn, arg, ms = 60000) => {
  try {
    await page.waitForFunction(fn, arg, { timeout: ms });
    return true;
  } catch {
    return false;
  }
};
const fly = async (query) => {
  await page.goto(`${base}/fly?${query}&q=low&debug=1`);
  await page.waitForSelector('[data-k="alt"]', { timeout: 120000 });
};

try {
  // ---------- first-run path and launcher defaults
  await page.goto(`${base}/launch`);
  await page.waitForSelector('[data-testid="start-free"]', { timeout: 90000 });
  check("launcher: first-time visitors are pointed at Training", await waitFor(() => !!document.querySelector('[data-testid="first-time"]'), null, 10000));
  const href = await page.getByTestId("start-free").getAttribute("href");
  check("launcher: Angle (self-levelling) is the default mode", /mode=angle/.test(href), href);

  // ---------- missions: locks, difficulty, training
  await page.goto(`${base}/missions`);
  await page.waitForSelector('[data-testid="mission-training-takeoff"]', { timeout: 90000 });
  check("missions: Training 1 is open, Training 2 and the hall missions are locked", (await page.getByTestId("fly-training-takeoff").count()) === 1 && (await page.getByTestId("locked-training-gates").count()) === 1 && (await page.getByTestId("locked-hall-slalom").count()) === 1);
  check("missions: lock message names what to finish", /training 1/i.test(await text('[data-testid="locked-training-gates"]')), await text('[data-testid="locked-training-gates"]'));
  await page.getByTestId("difficulty-hard").click();
  check("missions: the difficulty is carried into the flight link", /difficulty=hard/.test((await page.getByTestId("fly-training-takeoff").getAttribute("href")) ?? ""));
  await page.getByTestId("difficulty-normal").click();

  // Complete Training 1 for real (the drone hovers in the ring for 3 s of simulated time).
  await fly("mission=training-takeoff");
  await page.waitForSelector('[data-testid="mission-briefing"]', { timeout: 60000 });
  await page.evaluate(() => {
    window.__session.sim.debugTeleport(0, 2.5, 9);
    window.__session.keyboard.throttle = 0.2; // ~hover for the cinewhoop
  });
  const done = await waitFor(() => !!document.querySelector('[data-testid="mission-result"]'), null, 240000);
  const resTxt = done ? await text('[data-testid="mission-result"]') : "";
  check("training 1: hovering in the ring completes the mission", done && /mission complete/i.test(resTxt), resTxt.replace(/\n+/g, " | ").slice(0, 110));
  await sleep(800);
  await page.goto(`${base}/missions`);
  await page.waitForSelector('[data-testid="mission-training-gates"]', { timeout: 90000 });
  await waitFor(() => !!document.querySelector('[data-testid="fly-training-gates"]'), null, 20000);
  check("missions: finishing Training 1 unlocks Training 2", (await page.getByTestId("fly-training-gates").count()) === 1);
  check("missions: hall missions stay locked until Training 2 is done", (await page.getByTestId("locked-hall-slalom").count()) === 1);

  // ---------- settings: rebinding, tuning, gameplay
  await page.goto(`${base}/settings`);
  await page.waitForSelector('[data-testid="keybindings"]', { timeout: 90000 });
  check("rebinding: QWERTY defaults detected for an en-US browser (W = pitch forward)", /^W$/i.test((await text('[data-testid="keys-pitchForward"]')).trim()), await text('[data-testid="keys-pitchForward"]'));
  await page.getByTestId("rebind-pitchForward").click();
  await page.keyboard.press("i");
  await page.waitForFunction(() => /^I$/i.test(document.querySelector('[data-testid="keys-pitchForward"]')?.textContent?.trim() ?? ""), null, { timeout: 15000 });
  check("rebinding: pressing a key after Rebind assigns it", true);
  await page.getByTestId("rebind-pitchBack").click();
  await page.keyboard.press("i");
  await page.waitForSelector('[data-testid="binding-conflict"]', { timeout: 10000 }).catch(() => {});
  check("rebinding: a duplicate key is reported as a conflict", (await page.getByTestId("binding-conflict").count()) === 1);
  await page.getByTestId("rebind-pitchBack").click();
  await page.keyboard.press("k");
  await page.getByTestId("rebind-throttleUp").click();
  await page.keyboard.press("F1");
  check("rebinding: reserved interface keys (F1) are refused", /reserved/i.test(await page.locator("section[data-testid=keybindings]").innerText()));
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForSelector('[data-testid="keybindings"]', { timeout: 90000 });
  check("rebinding: bindings persist across reload", /^I$/i.test((await text('[data-testid="keys-pitchForward"]')).trim()) && /^K$/i.test((await text('[data-testid="keys-pitchBack"]')).trim()));

  await page.getByTestId("tab-tuning").click();
  await page.getByTestId("tune-fpv-freestyle").click();
  await page.getByTestId("rate-roll").fill("300");
  await page.getByTestId("rate-expo").fill("0.6");
  await sleep(600);
  await page.reload();
  await page.getByTestId("tab-tuning").click();
  await page.getByTestId("tune-fpv-freestyle").click();
  check("tuning: custom rates persist across reload", (await page.getByTestId("rate-roll").inputValue()) === "300" && (await page.getByTestId("rate-expo").inputValue()) === "0.6");

  await page.getByTestId("tab-gameplay").click();
  await page.getByTestId("autorestart-3").click();
  await page.waitForSelector('[data-testid="gs-saved"]:has-text("Saved")', { timeout: 20000 });

  // ---------- flight: bindings + tuning applied, overlays
  await fly("drone=fpv-freestyle&mode=angle");
  const applied = await page.evaluate(() => ({ roll: window.__session.sim.drone.physics.maxRatesDegS.roll, expo: window.__session.sim.drone.physics.rateExpo, key: window.__session.keyboard.getBindings().pitchForward[0] }));
  check("flight: tuned rates are applied to the simulation", applied.roll === 300 && Math.abs(applied.expo - 0.6) < 1e-6, JSON.stringify(applied));
  check("flight: rebound keys are active", applied.key === "i");
  check("flight: the controls hint shows the real bindings (I/K pitch)", /I\/K pitch/i.test(await text('[data-testid="controls-hint"]')), (await text('[data-testid="controls-hint"]')).replace(/\n/g, " | ").slice(0, 100));

  await page.keyboard.press("F1");
  check("help: F1 opens the controls reference with the rebound keys", await waitFor(() => /Pitch forward \/ back/.test(document.querySelector('[data-testid="help-overlay"]')?.textContent ?? "") && /I \/ K/.test(document.querySelector('[data-testid="help-overlay"]')?.textContent ?? ""), null, 10000));
  await page.keyboard.press("F1");
  check("help: F1 closes it again", await waitFor(() => !document.querySelector('[data-testid="help-overlay"]'), null, 10000));

  await page.keyboard.press("F3");
  check("performance: F3 shows frame time and draw calls", await waitFor(() => /draw\s+\d+/.test(document.querySelector('[data-testid="perf-overlay"]')?.textContent ?? ""), null, 30000));
  await page.keyboard.press("F3");

  // pause menu
  await page.keyboard.press(" ");
  check("pause: Space opens a menu with Resume / Restart / Settings / Exit", await waitFor(() => !!document.querySelector('[data-testid="pause-menu"]') && /resume/i.test(document.body.innerText) && /exit/i.test(document.body.innerText), null, 15000));
  await page.getByTestId("pause-resume").click();
  check("pause: Resume continues the flight", await waitFor(() => !document.querySelector('[data-testid="pause-menu"]') && window.__session.sim.status === "flying", null, 15000));
  await page.keyboard.press("Escape");
  check("pause: Esc also pauses", await waitFor(() => !!document.querySelector('[data-testid="pause-menu"]'), null, 15000));
  await page.keyboard.press("Escape");
  await waitFor(() => !document.querySelector('[data-testid="pause-menu"]'), null, 15000);

  // flight-area limits and crash handling
  await page.evaluate(() => (window.__session.keyboard.throttle = 0.5));
  await waitFor(() => window.__session.launched, null, 30000);
  await page.evaluate(() => window.__session.sim.debugTeleport(0, 6, -50));
  check("bounds: the edge of the flight area triggers a warning", await waitFor(() => !!document.querySelector('[data-testid="bounds-warning"]') || !!document.querySelector('[data-testid="bounds-out"]'), null, 30000));
  await page.evaluate(() => window.__session.sim.debugTeleport(0, 6, -150));
  check("bounds: leaving the area shows a countdown", await waitFor(() => /Return now: \d+s/.test(document.querySelector('[data-testid="bounds-out"]')?.textContent ?? ""), null, 30000));
  // keep it out until the grace period ends; the session ends the flight with a reason
  for (let i = 0; i < 400 && !(await page.evaluate(() => window.__session.sim.crashed)); i++) {
    await page.evaluate(() => window.__session.sim.debugTeleport(0, 6, -150));
    await sleep(250);
  }
  check("bounds: staying out ends the flight with a clear reason", await waitFor(() => /flight area/i.test(document.querySelector('[data-testid="crash-reason"]')?.textContent ?? ""), null, 30000), await text('[data-testid="crash-reason"]').catch(() => "none"));
  check("crash: auto-restart (3 s, from Settings) brings the drone back", await waitFor(() => !window.__session.sim.crashed, null, 60000));
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
