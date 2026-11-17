// Resizes extracted ambientCG (CC0) texture sets into public/textures. Usage: node scripts/prepare-textures.mjs <srcDir>
import sharp from "sharp";
import { mkdirSync, readdirSync, statSync } from "node:fs";
const src = process.argv[2];
const sizes = { wood: 512 };
for (const name of readdirSync(src)) {
  mkdirSync(`public/textures/${name}`, { recursive: true });
  let total = 0;
  for (const f of readdirSync(`${src}/${name}`)) {
    const out = `public/textures/${name}/${f}`;
    await sharp(`${src}/${name}/${f}`).resize(sizes[name] ?? 1024).jpeg({ quality: 80, mozjpeg: true }).toFile(out);
    total += statSync(out).size;
  }
  console.log(name, Math.round(total / 1024), "KB");
}
