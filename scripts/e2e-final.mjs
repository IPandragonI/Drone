// Real-browser verification of Phases 4-6: menus, settings persistence, audio engine, minimap, missions (scoring,
// results, history, stats), weather and replay. Usage: node scripts/e2e-final.mjs [http://localhost:3100]
// Requires `next start -p 3100`. Uses ?debug=1 to reach the session (teleport drone through waypoints).
import { chromium } from "playwright";
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|GPU stall/.test(m.text())) errors.push(m.text());
});
const waitFor = async (fn, arg, ms = 20000) => {
  try {
    await page.waitForFunction(fn, arg, { timeout: ms });
    return true;
  } catch {
    return false;
  }
};
const text = (sel) => page.locator(sel).first().innerText();

try {
  // ---------- home menu
  await page.goto(`${base}/launch`);
  await page.waitForSelector('[data-testid="start-free"]');
  check("home: no weather chips for the indoor environment", (await page.locator('[data-testid^="weather-"]').count()) === 0);
  await page.getByTestId("env-quarry-yard").click();
  check("home: weather chips appear for the outdoor environment", (await page.locator('[data-testid^="weather-"]').count()) === 3);
  await page.getByTestId("weather-gusty").click();
  const href = await page.getByTestId("start-free").getAttribute("href");
  check("home: start link carries environment + weather", /env=quarry-yard/.test(href) && /weather=gusty/.test(href), href);

  // ---------- settings: persistence across reload
  await page.goto(`${base}/settings`);
  await page.getByTestId("tab-audio").click();
  await page.getByTestId("audio-muted").check();
  await page.getByTestId("audio-master").fill("0.3");
  await page.waitForSelector('[data-testid="gs-saved"]:has-text("Saved")');
  await page.getByTestId("tab-graphics").click();
  await page.getByTestId("quality-high").click();
  await page.getByTestId("tab-accessibility").click();
  await page.getByTestId("a11y-flash").check();
  await page.getByTestId("a11y-contrast").check();
  await page.getByTestId("a11y-hudscale").fill("1.4");
  await page.waitForSelector('[data-testid="gs-saved"]:has-text("Saved")');
  await page.reload();
  await page.getByTestId("tab-audio").click();
  check("settings: audio mute + volume persisted", (await page.getByTestId("audio-muted").isChecked()) && (await page.getByTestId("audio-master").inputValue()) === "0.3");
  await page.getByTestId("tab-accessibility").click();
  check("settings: accessibility persisted", (await page.getByTestId("a11y-flash").isChecked()) && (await page.getByTestId("a11y-contrast").isChecked()) && (await page.getByTestId("a11y-hudscale").inputValue()) === "1.4");
  await page.screenshot({ path: "docs/screenshots/settings.png" });

  // restore friendly settings for the flight checks (sound on, normal HUD, low graphics for speed)
  await page.getByTestId("a11y-contrast").uncheck();
  await page.getByTestId("a11y-hudscale").fill("1");
  await page.getByTestId("tab-audio").click();
  await page.getByTestId("audio-muted").uncheck();
  await page.getByTestId("audio-master").fill("0.5");
  await page.waitForSelector('[data-testid="gs-saved"]:has-text("Saved")');
  await page.getByTestId("tab-graphics").click();
  await page.getByTestId("quality-low").click();
  await page.waitForSelector('[data-testid="gs-saved"]:has-text("Saved")');

  // ---------- free flight: minimap, audio, replay
  await page.goto(`${base}/fly?drone=fpv-freestyle&mode=angle&debug=1`);
  await page.waitForSelector('[data-k="alt"]', { timeout: 60000 });
  await page.waitForTimeout(600);
  const colors = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="minimap"]');
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 16) set.add(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`);
    return set.size;
  });
  check("minimap renders structures (many distinct colours drawn)", colors > 6, `${colors} colours`);

  check("sound hint asks for a key before audio starts", /sound off/i.test(await text('[data-testid="sound-hint"]')));
  await page.keyboard.press("h"); // a key press is the user gesture that starts audio (H only toggles the HUD, no flight effect)
  await page.keyboard.press("h");
  const audioRunning = await waitFor(() => window.__audio?.debug().state === "running", null, 8000);
  check("audio context running after the first key press", audioRunning);
  await page.waitForTimeout(300);
  const a1 = await page.evaluate(() => window.__audio.debug());
  await page.evaluate(() => (window.__session.keyboard.throttle = 0.45));
  await page.waitForTimeout(400);
  const a2 = await page.evaluate(() => window.__audio.debug()); // sampled right away: a ceiling hit would silence the motors
  await page.evaluate(() => (window.__session.keyboard.throttle = 0.13));
  check("motor sound follows throttle (louder and higher than idle)", a2.level > a1.level + 0.1 && a2.freqs[0] > a1.freqs[0] + 20, JSON.stringify({ idle: +a1.level.toFixed(2), now: +a2.level.toFixed(2), fIdle: Math.round(a1.freqs[0]), f: Math.round(a2.freqs[0]) }));
  const masterOk = await waitFor(() => Math.abs(window.__audio.debug().master - 0.5) < 0.05, null, 40000);
  check("master gain follows settings (0.5)", masterOk, `master ${(await page.evaluate(() => window.__audio.debug().master)).toFixed(2)}`);
  check("sound hint disappears once running", (await text('[data-testid="sound-hint"]')) === "");

  await waitFor(() => window.__session.recorder.duration > 1.2, null, 30000); // need >1 s of recorded flight (slow-motion under software GL)
  await page.keyboard.press("v");
  check("replay mode opens (V) after flying", await waitFor(() => /replay/i.test(document.body.innerText), null, 5000));
  await page.screenshot({ path: "docs/screenshots/replay.png" });
  await page.keyboard.press("v");
  check("replay exits (V)", await waitFor(() => !/v to exit/i.test(document.body.innerText) && !!document.querySelector('[data-k="alt"]'), null, 5000));

  // ---------- missions
  await page.goto(`${base}/missions`);
  await page.waitForSelector('[data-testid="mission-hall-slalom"]');
  const cards = await page.locator('[data-testid^="best-"]').count();
  check("missions list shows the 9 built-in missions, none flown yet", cards === 9 && /not flown/i.test(await text('[data-testid="best-hall-slalom"]')), `${cards} cards`);

  await page.goto(`${base}/fly?mission=hall-slalom&debug=1`);
  await page.waitForSelector('[data-testid="mission-briefing"]', { timeout: 60000 });
  check("mission briefing shown before launch", /hall slalom/i.test(await text('[data-testid="mission-briefing"]')));
  await page.screenshot({ path: "docs/screenshots/mission-briefing.png" });
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowUp");
  check("mission clock starts at launch", await waitFor(() => window.__session?.mission?.status === "running", null, 10000));
  await page.evaluate(() => (window.__session.keyboard.throttle = 0.13)); // ~hover: screenshots take seconds, do not climb into the ceiling
  const wps = await page.evaluate(() => window.__session.mission.def.waypoints.map((w) => w.position));
  for (let i = 0; i < wps.length; i++) {
    await page.evaluate((p) => window.__session.sim.debugTeleport(...p), wps[i]);
    await waitFor((n) => window.__session.mission.reachedCount >= n || window.__session.mission.status !== "running", i + 1, 10000);
    if (i === 2) await page.screenshot({ path: "docs/screenshots/mission-flight.png" });
  }
  const done = await waitFor(() => !!document.querySelector('[data-testid="mission-result"]'), null, 10000);
  check("result card after the last waypoint", done);
  const resTxt = done ? await text('[data-testid="mission-result"]') : "";
  check("result is 'Mission complete' with a score", /mission complete/i.test(resTxt) && /\d+ \/ 1300/.test(resTxt), resTxt.replace(/\n+/g, " | ").slice(0, 170));
  await page.screenshot({ path: "docs/screenshots/mission-result.png" });
  await sleep(500); // let IndexedDB writes settle

  await page.goto(`${base}/missions`);
  await page.waitForSelector('[data-testid="best-hall-slalom"]');
  await waitFor(() => !/not flown/i.test(document.querySelector('[data-testid="best-hall-slalom"]').innerText), null, 5000);
  const bestTxt = await text('[data-testid="best-hall-slalom"]');
  check("best score/medal saved to the missions list", /\/1300/.test(bestTxt), bestTxt.replace(/\n/g, " "));

  await page.goto(`${base}/stats`);
  await page.waitForSelector('[data-testid="stat-flights"]');
  const flights = Number(await text('[data-testid="stat-flights"]'));
  check("stats: flights counted, mission completed, one history row", (await text('[data-testid="stat-completed"]')) === "1" && flights >= 2 && (await page.locator('[data-testid="history"] tbody tr').count()) === 1, `flights ${flights}`);
  await page.screenshot({ path: "docs/screenshots/stats.png" });

  // ---------- outdoor yard with gusty wind
  await page.goto(`${base}/fly?env=quarry-yard&weather=gusty&drone=inspection&mode=angle&q=low&debug=1`);
  await page.waitForSelector('[data-k="alt"]', { timeout: 60000 });
  check("yard loads with the wind label", /wind: gusty/i.test(await page.locator("body").innerText()));
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(1500);
  await page.keyboard.up("ArrowUp");
  const wind = await page.evaluate(() => window.__session.sim.wind.length());
  check("wind is active in the sim (non-zero, bounded)", wind > 0.3 && wind < 12, `|wind| ${wind.toFixed(2)} m/s`);
  await page.screenshot({ path: "docs/screenshots/yard.png" });

  // indoor environment ignores weather
  await page.goto(`${base}/fly?env=industrial-complex&weather=gusty&debug=1`);
  await page.waitForSelector('[data-k="alt"]', { timeout: 60000 });
  await page.waitForTimeout(800);
  check("indoor environment stays calm even if weather is requested", (await page.evaluate(() => window.__session.sim.wind.length())) === 0);

  // yard mission
  await page.goto(`${base}/fly?mission=yard-circuit&debug=1`);
  await page.waitForSelector('[data-testid="mission-briefing"]', { timeout: 60000 });
  check("yard mission uses its own wind (breeze)", /wind: breeze/i.test(await page.locator("body").innerText()));
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
