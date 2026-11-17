// Captures the landing-page hero video from the /cinematic replay of a real simulated flight.
// Usage: node scripts/capture-hero.mjs [http://localhost:3100] [seconds=26] [fps=24]
// Renders each frame deterministically (window.__cine.render) in headless Chromium (software GL, so slow but exact),
// then encodes MP4 (H.264) + WebM (VP9) + poster with the bundled ffmpeg.
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
// ffmpeg is only needed for this offline step, so it is not a project dependency (its ~80 MB download would slow every install/deploy).
// Install it first with:  npm i --no-save ffmpeg-static
const ffmpeg = (await import("ffmpeg-static").catch(() => ({ default: null }))).default;
if (!ffmpeg) throw new Error("ffmpeg-static is not installed. Run: npm i --no-save ffmpeg-static");

const base = process.argv[2] ?? "http://localhost:3100";
const seconds = Number(process.argv[3] ?? 26);
const fps = Number(process.argv[4] ?? 24);
const W = 1280;
const H = 720;
const dir = process.env.HERO_FRAMES ?? "tmp-hero-frames";
mkdirSync(dir, { recursive: true });
mkdirSync("public/video", { recursive: true });

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(`${base}/cinematic?sky=cloudy`);
await page.waitForFunction(() => window.__cine?.ready, null, { timeout: 120000 });
const duration = await page.evaluate(() => window.__cine.duration);
const speed = duration / seconds; // time-lapse factor so the whole flight fits the clip
console.log(`flight ${duration.toFixed(1)} s -> ${seconds} s clip (x${speed.toFixed(2)}), ${fps} fps`);
await page.waitForTimeout(6000); // textures + sky prefilter
const frames = Math.round(seconds * fps);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate(([t, dt]) => window.__cine.render(t, dt), [(i / fps) * speed, 1 / fps]);
  if (i < 3) await page.waitForTimeout(500); // first frames compile shaders
  await page.screenshot({ path: `${dir}/f_${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 90 });
  if (i % 24 === 0) console.log(`frame ${i}/${frames} (${Math.round((Date.now() - t0) / 1000)} s)`);
}
await browser.close();

const fade = `fade=t=in:st=0:d=0.5,fade=t=out:st=${seconds - 0.5}:d=0.5`;
const run = (args) => {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(fps), "-i", `${dir}/f_%04d.jpg`, ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
};
run(["-vf", fade, "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "public/video/hero.mp4"]);
run(["-vf", fade, "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1", "-an", "public/video/hero.webm"]);
run(["-vf", "select=eq(n\,150)", "-frames:v", "1", "-q:v", "3", "public/video/hero-poster.jpg"]);
if (existsSync(dir) && !process.env.KEEP_FRAMES) rmSync(dir, { recursive: true, force: true });
console.log("done");
