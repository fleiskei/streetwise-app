// Generates PNG app icons from public/favicon.svg (run once after changing the logo).
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/favicon.svg", import.meta.url));
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;
await sharp(svg).resize(192, 192).png().toFile(out("icon-192.png"));
await sharp(svg).resize(512, 512).png().toFile(out("icon-512.png"));
// Maskable/Apple icons: full-bleed background, logo inside the safe zone.
const bleed = (size, inner) =>
  sharp({ create: { width: size, height: size, channels: 4, background: "#0b1220" } })
    .composite([
      {
        input: Buffer.from(svg),
        top: Math.round((size - inner) / 2),
        left: Math.round((size - inner) / 2),
        density: 72 * (inner / 512),
      },
    ])
    .png();
await (await bleed(512, 400)).toFile(out("icon-maskable-512.png"));
await sharp(svg)
  .resize(180, 180)
  .flatten({ background: "#0b1220" })
  .png()
  .toFile(out("apple-touch-icon.png"));
console.log("icons written to public/icons");
