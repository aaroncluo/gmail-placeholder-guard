// Generates icons/icon{16,32,48,128}.png with no dependencies.
// Design: amber rounded square with white "[ ]" brackets.
// Also exported (encodePNG, render, composite) for tools/make-store-assets.js.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZES = [16, 32, 48, 128];
const BG = [249, 171, 0]; // Gmail-ish amber (#f9ab00)
const FG = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encodes an RGBA buffer (width*height*4) as a PNG. */
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// Coverage-based anti-aliasing: sample each pixel 4x4.
function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const stroke = Math.max(1, size * 0.11);
  const top = size * 0.26, bottom = size * 0.74;
  const leftX = size * 0.25, rightX = size * 0.75;
  const arm = size * 0.14;

  const inRounded = (x, y) => {
    const rx = Math.max(radius - x, 0, x - (size - radius));
    const ry = Math.max(radius - y, 0, y - (size - radius));
    return rx * rx + ry * ry <= radius * radius;
  };
  const inBracket = (x, y) => {
    if (y < top || y > bottom) return false;
    // left bracket "["
    if (x >= leftX && x <= leftX + stroke) return true;
    if (x >= leftX && x <= leftX + arm && (y <= top + stroke || y >= bottom - stroke)) return true;
    // right bracket "]"
    if (x <= rightX && x >= rightX - stroke) return true;
    if (x <= rightX && x >= rightX - arm && (y <= top + stroke || y >= bottom - stroke)) return true;
    return false;
  };

  const S = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const fx = x + (sx + 0.5) / S, fy = y + (sy + 0.5) / S;
          if (inRounded(fx, fy)) {
            bg++;
            if (inBracket(fx, fy)) fg++;
          }
        }
      }
      const a = bg / (S * S);
      const f = bg ? fg / bg : 0;
      const i = (y * size + x) * 4;
      px[i] = Math.round(BG[0] * (1 - f) + FG[0] * f);
      px[i + 1] = Math.round(BG[1] * (1 - f) + FG[1] * f);
      px[i + 2] = Math.round(BG[2] * (1 - f) + FG[2] * f);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

/** Places a size×size RGBA sprite centred on a transparent width×height canvas. */
function composite(width, height, sprite, size) {
  const out = Buffer.alloc(width * height * 4);
  const ox = Math.floor((width - size) / 2), oy = Math.floor((height - size) / 2);
  for (let y = 0; y < size; y++) sprite.copy(out, ((oy + y) * width + ox) * 4, y * size * 4, (y + 1) * size * 4);
  return out;
}

module.exports = { encodePNG, render, composite };

if (require.main === module) {
  const outDir = path.join(__dirname, "..", "icons");
  fs.mkdirSync(outDir, { recursive: true });
  for (const size of SIZES) {
    const file = path.join(outDir, `icon${size}.png`);
    fs.writeFileSync(file, encodePNG(size, size, render(size)));
    console.log("wrote", path.relative(process.cwd(), file));
  }
}
