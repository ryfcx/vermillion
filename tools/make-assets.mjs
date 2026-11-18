#!/usr/bin/env node
// Dependency-free original pixel art renderer for the favicon and social preview.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { SPRITES } from '../src/sprites.js';

const colors = {
  void: '#07060d', abyss: '#0f0b24', indigo: '#1d1650', violet: '#5b2bd6',
  orchid: '#b44dff', azure: '#3d7bff', cyan: '#5ee0ff', pink: '#ff4fa3',
  blush: '#ff9ad5', ink: '#e9e6ff', muted: '#8d86b8', gold: '#ffd35e'
};
const rgba = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)).concat(255);

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(width, height, pixels) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

function paintRect(pixels, width, height, x, y, w, h, color) {
  const [r, g, b, a] = rgba(color);
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) {
      const offset = (py * width + px) * 4;
      pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b; pixels[offset + 3] = a;
    }
  }
}

function paintSprite(pixels, width, height, name, x, y, scale) {
  const def = SPRITES[name];
  for (let sy = 0; sy < def.h; sy += 1) for (let sx = 0; sx < def.w; sx += 1) {
    const color = def.palette[def.frames[0][sy][sx]];
    if (color) paintRect(pixels, width, height, x + sx * scale, y + sy * scale, scale, scale, color);
  }
}

function favicon() {
  const width = 32, height = 32;
  const pixels = Buffer.alloc(width * height * 4);
  paintRect(pixels, width, height, 0, 0, width, height, colors.void);
  paintRect(pixels, width, height, 2, 2, 28, 28, colors.indigo);
  paintRect(pixels, width, height, 4, 4, 24, 24, colors.violet);
  paintSprite(pixels, width, height, 'mascot', 8, 8, 1);
  return png(width, height, pixels);
}

function socialImage() {
  const width = 1200, height = 630;
  const pixels = Buffer.alloc(width * height * 4);
  paintRect(pixels, width, height, 0, 0, width, height, colors.void);
  // Chunky indigo horizon with original pixel stars and an abyss trench.
  for (let y = 0; y < 390; y += 24) for (let x = (y / 24 % 2) * 12; x < width; x += 48) {
    if ((x * 7 + y * 11) % 5 === 0) paintRect(pixels, width, height, x, y, 12, 12, colors.abyss);
  }
  for (const [x, y, color] of [[70,82,colors.cyan],[202,146,colors.orchid],[355,74,colors.pink],[910,112,colors.cyan],[1080,220,colors.blush],[820,62,colors.orchid]]) {
    paintRect(pixels, width, height, x, y, 8, 8, color);
  }
  paintRect(pixels, width, height, 0, 390, width, 240, colors.abyss);
  for (let i = 0; i < 12; i += 1) {
    const x = i * 106;
    paintRect(pixels, width, height, x + 14, 382 + (i % 3) * 14, 78, 8, i % 2 ? colors.violet : colors.indigo);
    paintRect(pixels, width, height, x + 40, 410 + (i % 4) * 20, 10, 10, i % 3 ? colors.cyan : colors.pink);
  }
  paintSprite(pixels, width, height, 'logo', 92, 104, 8);
  paintSprite(pixels, width, height, 'mascot', 870, 110, 13);
  paintRect(pixels, width, height, 98, 224, 610, 10, colors.pink);
  paintRect(pixels, width, height, 98, 246, 450, 6, colors.cyan);
  // Pixel ledge and depth lights underline the original wordmark.
  paintRect(pixels, width, height, 90, 344, 690, 12, colors.violet);
  paintRect(pixels, width, height, 90, 356, 690, 5, colors.orchid);
  return png(width, height, pixels);
}

await mkdir(new URL('../assets/', import.meta.url), { recursive: true });
await writeFile(new URL('../assets/favicon.png', import.meta.url), favicon());
await writeFile(new URL('../assets/og.png', import.meta.url), socialImage());
console.log('Generated assets/favicon.png (32×32) and assets/og.png (1200×630).');
