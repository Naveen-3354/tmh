/**
 * Generates the PWA icon set as real PNGs, with no image dependencies.
 *
 * The mark is three concentric arcs — the activity-ring motif the dashboard
 * uses — on the app's dark canvas. Rendered by supersampling 4x and box-
 * filtering down, which gives clean antialiased edges.
 *
 *   node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');
const SUPERSAMPLE = 4;

const CANVAS = [18, 26, 30];
const RINGS = [
  { color: [79, 217, 206], outer: 0.86, inner: 0.72, sweep: 0.84 },
  { color: [63, 221, 138], outer: 0.68, inner: 0.54, sweep: 0.68 },
  { color: [255, 176, 59], outer: 0.5, inner: 0.36, sweep: 0.52 },
];
const TRACK_ALPHA = 0.16;

/** CRC-32, table built once. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(base, layer, alpha) {
  return [
    base[0] + (layer[0] - base[0]) * alpha,
    base[1] + (layer[1] - base[1]) * alpha,
    base[2] + (layer[2] - base[2]) * alpha,
  ];
}

/**
 * @param size    output edge length in px
 * @param padding fraction of the canvas kept clear around the mark; maskable
 *                icons need a wider safe zone than "any" icons.
 */
function renderIcon(size, padding) {
  const hi = size * SUPERSAMPLE;
  const accum = new Float64Array(size * size * 3);
  const centre = hi / 2;
  const markRadius = (hi / 2) * (1 - padding);

  for (let y = 0; y < hi; y += 1) {
    for (let x = 0; x < hi; x += 1) {
      const dx = x + 0.5 - centre;
      const dy = y + 0.5 - centre;
      const radius = Math.hypot(dx, dy) / markRadius;

      // Angle measured clockwise from 12 o'clock, normalised to 0..1.
      const angle = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;

      let colour = CANVAS;
      for (const ring of RINGS) {
        if (radius <= ring.outer && radius >= ring.inner) {
          colour = angle <= ring.sweep ? ring.color : mix(CANVAS, ring.color, TRACK_ALPHA);
          break;
        }
      }

      const outX = Math.floor(x / SUPERSAMPLE);
      const outY = Math.floor(y / SUPERSAMPLE);
      const index = (outY * size + outX) * 3;
      accum[index] += colour[0];
      accum[index + 1] += colour[1];
      accum[index + 2] += colour[2];
    }
  }

  const samples = SUPERSAMPLE * SUPERSAMPLE;
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = Math.round(accum[i * 3] / samples);
    rgba[i * 4 + 1] = Math.round(accum[i * 3 + 1] / samples);
    rgba[i * 4 + 2] = Math.round(accum[i * 3 + 2] / samples);
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, padding: 0.16 },
  { file: 'icon-512.png', size: 512, padding: 0.16 },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.3 },
  { file: 'apple-icon.png', size: 180, padding: 0.16 },
];

for (const { file, size, padding } of targets) {
  writeFileSync(join(OUT_DIR, file), renderIcon(size, padding));
  console.log(`wrote ${file} (${size}x${size})`);
}
