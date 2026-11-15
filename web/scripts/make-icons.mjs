// Draws the app icons (ticket 18) as PNGs with no image library: a sun rising
// over a horizon above two lines of text, on the app's ink colour.
// Run from web/: node scripts/make-icons.mjs. The output is committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const INK = [0x1c, 0x1b, 0x19];
const SUN = [0xf2, 0xb4, 0x41];
const PAPER = [0xfb, 0xfa, 0xf7];

/** Colour of the point (x, y) in a unit square, or null for the background. `pad` shrinks the art (maskable safe zone). */
function shade(x, y, pad) {
  const u = (x - pad) / (1 - 2 * pad);
  const v = (y - pad) / (1 - 2 * pad);
  const horizon = 0.56;
  // The sun: a half disc sitting on the horizon.
  if (v <= horizon && (u - 0.5) ** 2 + (v - horizon) ** 2 <= 0.22 ** 2) return SUN;
  // The horizon and two lines of text, with rounded ends.
  const bar = (y0, x0, x1, h) => {
    const r = h / 2;
    if (v < y0 - r || v > y0 + r) return false;
    const cx = Math.min(Math.max(u, x0 + r), x1 - r);
    return (u - cx) ** 2 + (v - y0) ** 2 <= r * r;
  };
  if (bar(horizon + 0.035, 0.16, 0.84, 0.05)) return PAPER;
  if (bar(0.72, 0.24, 0.76, 0.045)) return PAPER;
  if (bar(0.81, 0.32, 0.68, 0.045)) return PAPER;
  return null;
}

function draw(size, { pad = 0, rounded = true, badge = false } = {}) {
  const ss = 4; // supersampling for smooth edges
  const px = Buffer.alloc(size * size * 4);
  const corner = rounded ? 0.22 : 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = (x + (sx + 0.5) / ss) / size;
          const fy = (y + (sy + 0.5) / ss) / size;
          // Rounded square (full bleed for maskable icons).
          const dx = Math.max(corner - fx, fx - (1 - corner), 0);
          const dy = Math.max(corner - fy, fy - (1 - corner), 0);
          if (corner && dx * dx + dy * dy > corner * corner) continue;
          const art = shade(fx, fy, pad);
          if (badge && !art) continue;
          const c = badge ? [255, 255, 255] : (art ?? INK);
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      const cover = a / 255;
      px[i] = cover ? Math.round(r / cover) : 0;
      px[i + 1] = cover ? Math.round(g / cover) : 0;
      px[i + 2] = cover ? Math.round(b / cover) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", draw(192));
writeFileSync("public/icons/icon-512.png", draw(512));
// Maskable: full bleed, the art inside the central safe zone.
writeFileSync("public/icons/maskable-512.png", draw(512, { pad: 0.12, rounded: false }));
// Small monochrome badge for Android's status bar: white on transparent.
writeFileSync("public/icons/badge-96.png", draw(96, { pad: 0.02, rounded: false, badge: true }));
// iOS home screen (it rounds the corners itself) and the browser tab.
writeFileSync("src/app/apple-icon.png", draw(180, { rounded: false }));
writeFileSync("src/app/icon.png", draw(64));
console.log("Icons written.");
