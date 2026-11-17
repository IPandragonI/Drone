// Real-browser verification of Phase 3: desktop simulator + emulated phone (separate Chromium contexts, real touch events
// via CDP, real WebSocket relay). Usage: node scripts/e2e-phone.mjs [http://localhost:3100]
// Requires `next start -p 3100`. The relay is started by this script on port 3101 and stopped afterwards.
// NOT a physical phone: touch events are synthesised by Chromium, the network path is this machine's own interface.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const base = process.argv[2] ?? "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const relay = spawn(process.execPath, ["server/start.mjs"], { env: { ...process.env, RELAY_PORT: "3101" }, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((resolve, reject) => {
  relay.stdout.on("data", (d) => String(d).includes("listening") && resolve());
  relay.on("exit", (c) => reject(new Error(`relay exited ${c}`)));
  setTimeout(() => reject(new Error("relay did not start")), 8000);
});

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors = [];
try {
  // ---------- desktop simulator
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await desk.newPage();
  dp.on("pageerror", (e) => errors.push(`desktop: ${e.message}`));
  await dp.goto(`${base}/fly?drone=fpv-freestyle&mode=angle&q=low`);
  await dp.waitForSelector('[data-k="alt"]', { timeout: 60000 });
  const hud = async (k) => parseFloat(await dp.locator(`[data-k="${k}"]`).innerText());
  /** Poll a HUD value until the predicate holds (the sim runs in slow motion under software rendering). */
  const waitHud = async (k, pred, ms = 30000) => {
    const end = Date.now() + ms;
    let v = await hud(k);
    while (!pred(v) && Date.now() < end) {
      await sleep(150);
      v = await hud(k);
    }
    return v;
  };

  await dp.getByTestId("phone-toggle").click();
  await dp.waitForSelector('[data-testid="phone-qr"]', { timeout: 10000 });
  check("desktop shows QR + waiting state", (await dp.getByTestId("phone-state").innerText()).toLowerCase().includes("waiting"));
  const padUrl = await dp.getByTestId("phone-url").innerText();
  check("pad URL carries session, token and relay", /\/pad\?s=[A-Z0-9]{6}&t=[0-9a-f]{32}&r=.+(:|%3A)3101/.test(padUrl), padUrl);

  // ---------- emulated phone, landscape, touch
  const openPhone = async () => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`phone: ${e.message}`));
    // Record sockets so the test can drop the connection from inside the page.
    await page.addInitScript(() => {
      window.__sockets = [];
      window.__pcs = [];
      const NativePC = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePC {
        constructor(...a) {
          super(...a);
          window.__pcs.push(this);
        }
      };
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(...a) {
          super(...a);
          window.__sockets.push(this);
        }
      };
    });
    await page.goto(padUrl);
    const cdp = await ctx.newCDPSession(page);
    return { ctx, page, cdp };
  };
  const touch = (cdp, type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const drag = async (cdp, id, from, to, steps = 8) => {
    await touch(cdp, "touchStart", [{ x: from[0], y: from[1], id }]);
    for (let i = 1; i <= steps; i++) await touch(cdp, "touchMove", [{ x: from[0] + ((to[0] - from[0]) * i) / steps, y: from[1] + ((to[1] - from[1]) * i) / steps, id }]);
    await touch(cdp, "touchEnd", []);
  };

  const holdReset = async (p) => {
    const btn = await p.page.getByTestId("btn-reset").boundingBox();
    await touch(p.cdp, "touchStart", [{ x: btn.x + btn.width / 2, y: btn.y + btn.height / 2, id: 6 }]);
    await sleep(800);
    await touch(p.cdp, "touchEnd", []);
    await waitHud("alt", (v) => v < 0.5, 40000); // the (slow) host applies the reset on its next frames
  };

  let ph = await openPhone();
  await ph.page.waitForFunction(() => document.querySelector('[data-testid="pad-status"]')?.textContent === "Linked", null, { timeout: 15000 });
  check("phone reaches Linked", true);
  await dp.waitForFunction(() => document.querySelector('[data-testid="phone-state"]')?.textContent === "Phone connected", null, { timeout: 20000 });
  check("desktop shows Phone connected", true);
  await dp.waitForFunction(() => /webrtc/i.test(document.querySelector('[data-testid="phone-transport"]')?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
  const tr = await dp.getByTestId("phone-transport").innerText();
  check("link upgrades to a WebRTC data channel (frames arrive over WebRTC)", /webrtc/i.test(tr), tr);
  await sleep(1500);
  const rtt = await ph.page.locator('[data-testid="pad-status"] + span').innerText();
  check("phone shows relay RTT and telemetry", /\d+ ms/i.test(rtt) && /hp \d+%/i.test(rtt), rtt);

  // throttle up on the left stick (touch, latches), then both thumbs at once
  const alt0 = await hud("alt");
  await drag(ph.cdp, 1, [180, 250], [180, 218]); // up ~32 px -> throttle ~0.2
  const alt1 = await waitHud("alt", (v) => v > alt0 + 0.3);
  const vs1 = await waitHud("vs", (v) => v > 0.3, 3000);
  check("touch throttle makes the drone climb", alt1 > alt0 + 0.3, `alt ${alt0} -> ${alt1}`);
  check("throttle stays latched after the finger lifts (climb rate positive)", vs1 > 0.3, `vs ${vs1}`);

  // multitouch: left thumb yaw while right thumb pitches forward
  await touch(ph.cdp, "touchStart", [
    { x: 180, y: 250, id: 1 },
    { x: 660, y: 250, id: 2 },
  ]);
  for (let i = 1; i <= 6; i++) {
    await touch(ph.cdp, "touchMove", [
      { x: 180 + i * 8, y: 250, id: 1 },
      { x: 660, y: 250 - i * 8, id: 2 },
    ]);
  }
  const h0 = await hud("hdg");
  const spd = await waitHud("speed", (v) => v > 0.3);
  const hdgNow = await hud("hdg");
  check("two simultaneous touches control different axes (yaw turns, pitch moves forward)", Math.abs(hdgNow - h0) > 3 && spd > 0.3, `hdg ${h0}->${hdgNow} speed ${spd}`);
  await touch(ph.cdp, "touchEnd", []);

  // ---------- failsafe: pad silent but socket open (frozen page) => stale timeout cuts throttle
  await holdReset(ph);
  await drag(ph.cdp, 1, [180, 250], [180, 222]);
  const vsBefore = await waitHud("vs", (v) => v > 0.3);
  check("clean climb before the freeze", vsBefore > 0.3, `vs ${vsBefore}`);
  await ph.cdp.send("Page.setWebLifecycleState", { state: "frozen" });
  const vsAfter = await waitHud("vs", (v) => v < 0);
  check("silent phone (frozen page) triggers stale failsafe: climb turns into a fall", vsAfter < 0 && vsAfter < vsBefore - 1, `vs ${vsBefore} -> ${vsAfter}`);
  await ph.cdp.send("Page.setWebLifecycleState", { state: "active" });

  // ---------- hard disconnect and reconnect with the same QR
  await ph.ctx.close();
  await dp.waitForFunction(() => document.querySelector('[data-testid="phone-state"]')?.textContent === "Waiting for phone", null, { timeout: 20000 });
  check("host notices phone disconnect", true);
  ph = await openPhone();
  await ph.page.waitForFunction(() => document.querySelector('[data-testid="pad-status"]')?.textContent === "Linked", null, { timeout: 15000 });
  await dp.waitForFunction(() => document.querySelector('[data-testid="phone-state"]')?.textContent === "Phone connected", null, { timeout: 20000 });
  check("same QR works again after reconnect", true);

  // reset via hold-button, then fly again
  await holdReset(ph);
  const altReset = await hud("alt");
  check("hold-Reset button resets the drone to the spawn", altReset < 0.5, `alt ${altReset}`);
  await drag(ph.cdp, 1, [180, 250], [180, 218]);
  const altAfter = await waitHud("alt", (v) => v > altReset + 0.4);
  check("controls work again after reconnect", altAfter > altReset + 0.4, `alt ${altAfter}`);

  // ---------- connection drop / auto reconnect of the pad socket (socket closed from the server side)
  await ph.page.evaluate(() => window.__sockets.at(-1).close());
  await ph.page.waitForFunction(() => /reconnecting|connecting/i.test(document.querySelector('[data-testid="pad-status"]')?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
  let back = false;
  try {
    await ph.page.waitForFunction(() => document.querySelector('[data-testid="pad-status"]')?.textContent === "Linked", null, { timeout: 10000 });
    await dp.waitForFunction(() => document.querySelector('[data-testid="phone-state"]')?.textContent === "Phone connected", null, { timeout: 20000 });
    back = true;
  } catch {}
  check("pad auto-reconnects after its socket drops, host sees it again", back);
  await drag(ph.cdp, 1, [180, 250], [180, 218]);
  await waitHud("vs", (v) => v > 0.3);
  check("controls still work after the automatic reconnect", (await hud("vs")) > 0.3 || (await hud("alt")) > 1, `vs ${await hud("vs")} alt ${await hud("alt")}`);

  // ---------- WebRTC fallback: kill the peer connection, control must continue over the WebSocket
  await dp.waitForFunction(() => /webrtc/i.test(document.querySelector('[data-testid="phone-transport"]')?.textContent ?? ""), null, { timeout: 40000 }).catch(() => {});
  check("WebRTC re-established after the pad reconnected", /webrtc/i.test(await dp.getByTestId("phone-transport").innerText()));
  await ph.page.evaluate(() => window.__pcs.at(-1).close());
  await dp.waitForFunction(() => /websocket/i.test(document.querySelector('[data-testid="phone-transport"]')?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  check("host falls back to the WebSocket when the data channel dies", /websocket/i.test(await dp.getByTestId("phone-transport").innerText()), await dp.getByTestId("phone-transport").innerText());
  await holdReset(ph);
  await drag(ph.cdp, 1, [180, 250], [180, 222]);
  await waitHud("vs", (v) => v > 0.3);
  check("controls keep working over the WebSocket fallback", (await hud("vs")) > 0.3 || (await hud("alt")) > 0.8, `vs ${await hud("vs")} alt ${await hud("alt")}`);

  // ---------- invalid / expired link
  const bad = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const bp = await bad.newPage();
  await bp.goto(padUrl.replace(/t=[0-9a-f]{32}/, "t=" + "0".repeat(32)));
  await bp.waitForFunction(() => /link expired/i.test(document.body.innerText), null, { timeout: 10000 });
  check("wrong token shows 'Link expired' and does not retry", true);
  await bp.goto(`${base}/pad`);
  check("missing parameters show 'Invalid link'", /invalid link/i.test(await bp.locator("body").innerText()));
  await bad.close();
} catch (e) {
  console.log("ERROR", e);
  results.push(false);
} finally {
  await browser.close();
  relay.kill();
}
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
