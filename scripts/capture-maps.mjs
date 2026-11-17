// Captures the three new-map images for the landing page (clean, level shots; canvas only). Usage: node scripts/capture-maps.mjs
import { chromium } from "playwright";
import sharp from "sharp";
const base = process.argv[2] ?? "http://localhost:3100";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const [env, name, pos, sky, yaw] of [
  ["pine-valley", "map-forest", [3, 6, 22], "cloudy", 0],
  ["desert-wind-farm", "map-wind", [10, 10, 30], "clear", 0],
  ["harbor-district", "map-harbor", [-30, 9, 50], "cloudy", 0],
]) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await p.goto(`${base}/fly?env=${env}&q=high&sky=${sky}&debug=1`);
  await p.waitForSelector('[data-k="alt"]', { timeout: 180000 });
  await p.addStyleTag({ content: ".pointer-events-none.absolute, a.absolute, [data-testid=phone-toggle] { display: none !important; }" }); // clean frame: no HUD or labels
  await p.evaluate((pos) => {
    const s = window.__session;
    s.sim.debugTeleport(...pos);
    s.keyboard.throttle = 0.128; // ~hover: keep the camera level while the shot is taken
  }, pos);
  await p.waitForTimeout(9000);
  const buf = await p.locator("canvas").first().screenshot({ type: "png", timeout: 240000 });
  await sharp(buf).resize({ width: 1200 }).jpeg({ quality: 82, mozjpeg: true }).toFile(`public/img/${name}.jpg`);
  console.log("saved", name);
  await p.close();
}
await b.close();
