/**
 * MyLife Journal — pure-JS PNG icon generator (node:zlib, zero deps).
 *
 * Draws a warm cream rounded square with a gradient amber circle and a
 * minimal abstract "open book" glyph made of rects/circles.
 *
 * Usage: node scripts/gen-icons.mjs
 * Outputs:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/maskable-512.png   (full-bleed, generous padding)
 *   public/icons/apple-touch-icon.png (180px)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- CRC / PNG

const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(pixels, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    pixels.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- drawing

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function makeCanvas(size) {
  const buf = Buffer.alloc(size * size * 4);
  return {
    size,
    buf,
    set(x, y, r, g, b, a = 255) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const i = (y * size + x) * 4;
      // simple "over" blend onto existing pixel
      const da = a / 255;
      const dr = buf[i + 3] / 255;
      const outA = da + dr * (1 - da);
      if (outA === 0) return;
      buf[i] = Math.round((r * da + buf[i] * dr * (1 - da)) / outA);
      buf[i + 1] = Math.round((g * da + buf[i + 1] * dr * (1 - da)) / outA);
      buf[i + 2] = Math.round((b * da + buf[i + 2] * dr * (1 - da)) / outA);
      buf[i + 3] = Math.round(outA * 255);
    },
    fillRect(x0, y0, w, h, hex, alpha = 255) {
      const [r, g, b] = hexRgb(hex);
      for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++)
        for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) this.set(x, y, r, g, b, alpha);
    },
    fillCircle(cx, cy, rad, hex, alpha = 255) {
      const [r, g, b] = hexRgb(hex);
      for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
        for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= rad * rad) this.set(x, y, r, g, b, alpha);
        }
    },
    fillRoundedRect(x0, y0, w, h, rad, hex, alpha = 255) {
      const [r, g, b] = hexRgb(hex);
      for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
        for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) {
          const cx = Math.min(Math.max(x, x0 + rad), x0 + w - rad);
          const cy = Math.min(Math.max(y, y0 + rad), y0 + h - rad);
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= rad * rad + 1) this.set(x, y, r, g, b, alpha);
        }
      }
    },
  };
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// Oops — guard against the typo above: redraw text lines correctly.
function drawIcon(size, fullBleed) {
  const c = makeCanvas(size);
  const u = size / 512;

  if (fullBleed) {
    c.fillRect(0, 0, size, size, '#faf7f0');
  } else {
    c.fillRoundedRect(0, 0, size, size, Math.round(112 * u), '#faf7f0');
  }

  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.31;
  const top = hexRgb('#e8b76a');
  const bottom = hexRgb('#b0722e');
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= R) {
        const t = Math.min(1, Math.max(0, (dx + dy) / (2 * R) + 0.5));
        c.set(x, y, lerp(top[0], bottom[0], t), lerp(top[1], bottom[1], t), lerp(top[2], bottom[2], t));
      }
    }
  }

  const bw = size * 0.26;
  const bh = size * 0.20;
  const by = cy - bh / 2;
  c.fillRoundedRect(Math.round(cx - bw), Math.round(by), Math.round(bw), Math.round(bh), Math.round(10 * u), '#fffdf8');
  c.fillRoundedRect(Math.round(cx), Math.round(by), Math.round(bw), Math.round(bh), Math.round(10 * u), '#fffdf8');
  c.fillRect(Math.round(cx - 2 * u), Math.round(by + 6 * u), Math.round(4 * u), Math.round(bh - 12 * u), '#d9c9a8');
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const lx = side === -1 ? cx - bw + 18 * u : cx + 18 * u;
      const ly = by + (24 + i * 28) * u;
      let lw = bw - 36 * u;
      if ((side === -1 && i === 2) || (side === 1 && i === 0)) lw -= 34 * u;
      c.fillRoundedRect(Math.round(lx), Math.round(ly), Math.round(lw), Math.round(7 * u), Math.round(3.5 * u), '#c9b384');
    }
  }
  // small sun dot above the book
  c.fillCircle(cx + size * 0.17, cy - size * 0.20, size * 0.028, '#fffdf8');
  return c;
}

const specs = [
  { name: 'icon-192.png', size: 192, fullBleed: false },
  { name: 'icon-512.png', size: 512, fullBleed: false },
  { name: 'maskable-512.png', size: 512, fullBleed: true },
  { name: 'apple-touch-icon.png', size: 180, fullBleed: false },
];

for (const s of specs) {
  const c = drawIcon(s.size, s.fullBleed);
  const png = encodePng(c.buf, s.size, s.size);
  writeFileSync(path.join(outDir, s.name), png);
  console.log(`wrote public/icons/${s.name} (${png.length} bytes)`);
}
