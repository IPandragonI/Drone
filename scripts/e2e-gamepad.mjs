// Real-browser verification of Phase 2 (gamepad, calibration, persistence, failsafe) with a simulated pad.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`); };

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  window.__pad = { connected: true, axes: [0, 0, 0, 0], down: [] };
  navigator.getGamepads = () => {
    const p = window.__pad;
    if (!p.connected) return [null, null, null, null];
    return [{ id: "Simulated Xbox Pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", axes: p.axes.slice(), buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: p.down.includes(i), value: p.down.includes(i) ? 1 : 0 })) }, null, null, null];
  };
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const setPad = (axes, down = []) => page.evaluate(([a, d]) => { window.__pad.axes = a; window.__pad.down = d; }, [axes, down]);
const text = (sel) => page.locator(sel).first().innerText();

// ---------- Settings page
await page.goto(`${base}/settings`);
await page.waitForSelector('[data-testid="pad-name"]');
await page.waitForTimeout(300);
check("settings detects pad", (await text('[data-testid="pad-name"]')).includes("Simulated Xbox Pad"));
await setPad([0, 0, 1, -1]); // Mode 2: right stick right + up => roll +1, pitch +1
await page.waitForTimeout(250);
check("Mode 2 live: roll=+1 pitch=+1", (await text('[data-testid="live-roll"]')) === "1.00" && (await text('[data-testid="live-pitch"]')) === "1.00");
await page.getByRole("button", { name: "Mode 1" }).click();
await setPad([0, -1, 0, 1]); // Mode 1: left up = pitch +1, right down = throttle -1
await page.waitForTimeout(250);
check("Mode 1 live: pitch=+1 throttle=-1", (await text('[data-testid="live-pitch"]')) === "1.00" && (await text('[data-testid="live-throttle"]')) === "-1.00");

// calibration: centre offset 0.1 on all axes, full range -0.8..0.9
await page.getByRole("button", { name: "Mode 2" }).click();
await setPad([0.1, 0.1, 0.1, 0.1]);
await page.getByRole("button", { name: "Calibrate" }).click();
await page.waitForTimeout(1800);
for (const v of [-0.8, 0.9]) { await setPad([v, v, v, v]); await page.waitForTimeout(150); }
await setPad([0.1, 0.1, 0.1, 0.1]);
await page.getByRole("button", { name: "Finish" }).click();
check("calibration accepted", (await text('[data-testid="cal-msg"]')).includes("captured"), await text('[data-testid="cal-msg"]'));
await page.waitForTimeout(200);
check("centre offset removed after calibration (live roll == 0)", (await text('[data-testid="live-roll"]')) === "0.00");
await setPad([0.1, 0.1, 0.9, 0.1]);
await page.waitForTimeout(200);
check("calibrated full deflection == 1.00", (await text('[data-testid="live-roll"]')) === "1.00");
await page.getByText("Invert").first().click(); // roll invert
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForSelector('[data-testid="saved"]:has-text("Saved")');
await page.reload();
await page.waitForSelector('[data-testid="pad-name"]');
await page.waitForTimeout(400);
await setPad([0.1, 0.1, 0.9, 0.1]);
await page.waitForTimeout(250);
check("settings persisted in IndexedDB across reload (calibrated + inverted roll == -1.00)", (await text('[data-testid="live-roll"]')) === "-1.00", await text('[data-testid="live-roll"]'));
// restore plain defaults for the flight test
await page.getByRole("button", { name: "Defaults" }).click();
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForSelector('[data-testid="saved"]:has-text("Saved")');

// ---------- Flight with gamepad
await setPad([0, 0, 0, 0]);
await page.goto(`${base}/fly?drone=inspection&mode=angle&q=low`);
await page.waitForSelector("canvas", { timeout: 60000 });
await page.waitForTimeout(1500);
const hud = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-k]")].map((e) => [e.dataset.k, e.textContent])));
await setPad([0, -1, 0, 0]); // left stick up: throttle up (integrate)
await page.waitForTimeout(2500);
await setPad([0, 0, 0, 0]);
await page.waitForTimeout(800);
const h1 = await hud();
check("gamepad takeoff: altitude rises", parseFloat(h1.alt) > 0.5, JSON.stringify({ alt: h1.alt, vs: h1.vs }));
await setPad([0, 0, 0, -1]); // right stick up: pitch forward
await page.waitForTimeout(1500);
const h2 = await hud();
check("gamepad pitch moves drone forward (speed > 0)", parseFloat(h2.speed) > 0, JSON.stringify({ speed: h2.speed }));
await setPad([0, 0, 0, 0]);
await page.waitForTimeout(500);
// disconnect failsafe
const before = parseFloat((await hud()).alt);
await page.evaluate(() => { window.__pad.connected = false; });
// poll: the drone keeps its upward momentum for a moment and the sim runs in slow motion under software rendering
let h3 = await hud();
for (let i = 0; i < 40 && !(parseFloat(h3.vs) < -0.5); i++) { await page.waitForTimeout(150); h3 = await hud(); }
check("disconnect failsafe: throttle cut, vertical speed turns negative", parseFloat(h3.vs) < -0.5 || parseFloat(h3.alt) < before - 0.3, JSON.stringify({ before, alt: h3.alt, vs: h3.vs }));
// reconnect + reset via Y button (index 3)
await page.evaluate(() => { window.__pad.connected = true; });
await page.waitForTimeout(800); // let the pad register before pressing (first read after reconnect is an edge baseline)
await setPad([0, 0, 0, 0], [3]);
await page.waitForTimeout(500);
await setPad([0, 0, 0, 0], []);
let h4 = await hud();
for (let i = 0; i < 30 && h4.time !== "00:00"; i++) { await page.waitForTimeout(150); h4 = await hud(); }
check("gamepad Y resets to spawn (alt ~0, time 00:00, health 100%)", parseFloat(h4.alt) < 0.3 && h4.time === "00:00" && h4.hp === "100%", JSON.stringify(h4));
check("no page errors", errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
