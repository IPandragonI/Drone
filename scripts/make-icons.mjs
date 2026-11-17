// Builds every logo/icon asset from new_logo.png (the brand mark): trace to vector with potrace, then
//   public/brand/logo-white.svg, logo-amber.svg  (in-app logos)
//   src/app/icon.svg, favicon.ico (16/32/48), apple-icon.png (180), public/icon-192.png, icon-512.png, icon.svg
// Usage: node scripts/make-icons.mjs
import sharp from "sharp";
import potrace from "potrace";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("public/brand", { recursive: true });

// 1. Mask from the alpha channel (mark = black on white), cropped tight with a small margin for clean tracing.
const { data, info } = await sharp("new_logo.png").ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
const bw = Buffer.alloc(info.width * info.height);
for (let i = 0; i < bw.length; i++) bw[i] = data[i] > 127 ? 0 : 255;
const trimmed = await sharp(bw, { raw: { width: info.width, height: info.height, channels: 1 } }).trim({ background: "#ffffff", threshold: 10 }).png().toBuffer();
const tm = await sharp(trimmed).metadata();

// 2. Vector trace.
const svgTraced = await new Promise((res, rej) =>
  potrace.trace(trimmed, { threshold: 128, turdSize: 20, optTolerance: 0.4, turnPolicy: "minority" }, (e, s) => (e ? rej(e) : res(s))),
);
const d = [...svgTraced.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" ");
if (!d) throw new Error("trace produced no path");
const W = tm.width;
const H = tm.height;
console.log(`mark ${W}x${H}, path ${d.length} chars`);

const mark = (fill) => `<path fill="${fill}" fill-rule="evenodd" d="${d}"/>`;
const logo = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Drone Simulator logo">${mark(fill)}</svg>`;
writeFileSync("public/brand/logo-white.svg", logo("#f2f4f5"));
writeFileSync("public/brand/logo-amber.svg", logo("#ffb41f"));

// 3. App icon: charcoal tile with the amber mark centred (mark width = 68% of the tile).
const icon = (rounded, scale = 0.68) => {
  const s = 64;
  const w = s * scale;
  const h = (w * H) / W;
  const k = w / W;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" rx="${rounded ? 14 : 0}" fill="#101214"/><g transform="translate(${(s - w) / 2} ${(s - h) / 2}) scale(${k})">${mark("#ffb41f")}</g></svg>`;
};
writeFileSync("src/app/icon.svg", icon(true));
writeFileSync("public/icon.svg", icon(true));

const png = (size, svg) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
writeFileSync("src/app/apple-icon.png", await png(180, icon(false, 0.64)));
writeFileSync("public/icon-192.png", await png(192, icon(false, 0.6)));
writeFileSync("public/icon-512.png", await png(512, icon(false, 0.6)));

// 4. ICO (PNG-compressed entries). Small sizes use a larger mark so it stays legible.
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map((s) => png(s, icon(true, s <= 32 ? 0.82 : 0.74))));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = imgs.map((img, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i], 0);
  e.writeUInt8(sizes[i], 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...entries, ...imgs]));

// 5. Preview sheet for review.
const sheet = [16, 32, 64, 128, 256];
const bufs = await Promise.all(sheet.map((s) => png(s, icon(true, s <= 32 ? 0.82 : 0.68))));
let x = 10;
const comps = bufs.map((b, i) => {
  const c = { input: b, left: x, top: 10 };
  x += sheet[i] + 20;
  return c;
});
mkdirSync("docs/screenshots", { recursive: true });
await sharp({ create: { width: x, height: 280, channels: 4, background: "#f3f3f3" } }).composite(comps).png().toFile("docs/screenshots/favicon-preview.png");
console.log("icons written");
