// Turn the original illustration into a compact interactive point portrait.
// The source image remains untouched; only numeric particle data is produced.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve(process.argv[2] || "public/artwork/tasheer-source.webp");
const destination = resolve(process.argv[3] || "lib/tasheer-cloud.json");
const count = 20000;
let seed = 0x54415348;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const { data, info } = await sharp(source).resize({ width: 960, withoutEnlargement: true }).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const candidates = [];
let total = 0, minX = width, maxX = 0, minY = height, maxY = 0;
for (let y = 1; y < height - 1; y++) {
  for (let x = 1; x < width - 1; x++) {
    const level = data[y * width + x];
    if (level < 24) continue;
    const edge = Math.max(Math.abs(level - data[y * width + x - 1]), Math.abs(level - data[y * width + x + 1]), Math.abs(level - data[(y - 1) * width + x]), Math.abs(level - data[(y + 1) * width + x]));
    // Additional edge weight preserves small heads, cloth folds and thin rifles.
    total += (level / 255) ** .72 * (1 + Math.min(edge / 64, 2));
    candidates.push({ x, y, level, cumulative: total });
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
}
if (candidates.length < 1500) throw new Error("Illustration has insufficient visible subject detail.");
const scale = Math.min(3.4 / (maxX - minX), 2.1 / (maxY - minY));
const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
const points = [];
let cursor = 0;
for (let index = 0; index < count; index++) {
  const target = (index + random()) / count * total;
  while (cursor < candidates.length - 1 && candidates[cursor].cumulative < target) cursor++;
  const pixel = candidates[cursor];
  points.push([
    Math.round((pixel.x + random() - .5 - centerX) * scale * 10000),
    Math.round((centerY - pixel.y - random() + .5) * scale * 10000),
    pixel.level,
  ]);
}
// Every prefix remains a representative portrait, including the mobile budget.
for (let index = points.length - 1; index > 0; index--) {
  const other = Math.floor(random() * (index + 1));
  [points[index], points[other]] = [points[other], points[index]];
}
await writeFile(destination, JSON.stringify({ version: 2, image: { width, height, left: minX, top: minY, right: maxX, bottom: maxY, scale }, description: "One detailed Tasheer performer; coordinates are world units multiplied by 10000; third channel is grayscale luminance.", points }) + "\n");
console.log(`Sampled ${count} points from ${width}×${height}; subject bounds ${maxX-minX}×${maxY-minY}.`);
