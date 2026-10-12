import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Function to calculate CRC32 for PNG chunks
function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPng(width, height, getPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // deflate
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw scanlines
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate the UniFlow logo: a rounded shield/squircle with graduation cap motif
function renderIcon(width, height, isMaskable = false) {
  return createPng(width, height, (x, y, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const radius = isMaskable ? w * 0.5 : w * 0.45;
    const cornerR = w * 0.22;

    // Check if within rounded rect (squircle)
    let inCard = false;
    if (isMaskable) {
      inCard = true; // Full canvas for maskable
    } else {
      // Rounded rect
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const hw = w * 0.46;
      const hh = h * 0.46;
      if (dx < hw - cornerR && dy < hh) inCard = true;
      else if (dy < hh - cornerR && dx < hw) inCard = true;
      else {
        const cornerDist = Math.hypot(dx - (hw - cornerR), dy - (hh - cornerR));
        if (cornerDist <= cornerR) inCard = true;
      }
    }

    if (!inCard) {
      return [0, 0, 0, 0];
    }

    // Gradient background: from #2563eb (37, 99, 235) to #1d4ed8 (29, 78, 216)
    const t = (x + y) / (w + h);
    let bgR = Math.round(37 * (1 - t) + 29 * t);
    let bgG = Math.round(99 * (1 - t) + 78 * t);
    let bgB = Math.round(235 * (1 - t) + 216 * t);

    // Graduation Cap geometry in normalized coordinates [-1, 1]
    const scale = isMaskable ? 0.65 : 0.72;
    const nx = (x - cx) / (w * scale * 0.5);
    const ny = (y - cy) / (h * scale * 0.5);

    let isCap = false;
    let isCapAccent = false;

    // Diamond cap top: |nx| / 1.0 + |ny + 0.15| / 0.45 <= 1
    const capCenterY = -0.12;
    const diamondDist = Math.abs(nx) / 0.95 + Math.abs(ny - capCenterY) / 0.42;
    if (diamondDist <= 1.0) {
      isCap = true;
    }

    // Lower skull cap / headband: curve underneath diamond
    // nx in [-0.55, 0.55], ny between 0.05 and 0.45, rounded bottom
    if (Math.abs(nx) <= 0.55 && ny >= 0.02 && ny <= 0.42) {
      const bottomCurve = 0.28 + (nx * nx) * 0.45;
      if (ny <= bottomCurve) {
        isCap = true;
      }
    }

    // Tassel button at center
    if (Math.hypot(nx, ny - capCenterY) < 0.1) {
      isCap = true;
    }

    // Tassel hanging to right side
    if (nx >= 0.75 && nx <= 0.92 && ny >= -0.05 && ny <= 0.45) {
      isCapAccent = true;
    }
    // Tassel line from center to right
    if (nx >= 0.0 && nx <= 0.85 && Math.abs(ny - (capCenterY + 0.12 * nx)) < 0.035) {
      isCapAccent = true;
    }

    if (isCap) {
      return [255, 255, 255, 255]; // White graduation cap
    }
    if (isCapAccent) {
      return [245, 158, 11, 255]; // Golden amber tassel
    }

    // Subtle inner glow
    const centerDist = Math.hypot(x - cx, y - cy) / (w * 0.5);
    if (centerDist < 0.6) {
      bgR = Math.min(255, bgR + Math.round((1 - centerDist) * 15));
      bgG = Math.min(255, bgG + Math.round((1 - centerDist) * 20));
      bgB = Math.min(255, bgB + Math.round((1 - centerDist) * 15));
    }

    return [bgR, bgG, bgB, 255];
  });
}

const outDir = path.resolve('/Volumes/My Space/UniFlow/public/icons');
fs.mkdirSync(outDir, { recursive: true });

console.log('Generating 192x192 icon...');
const icon192 = renderIcon(192, 192, false);
fs.writeFileSync(path.join(outDir, 'icon-192x192.png'), icon192);

console.log('Generating 512x512 icon...');
const icon512 = renderIcon(512, 512, false);
fs.writeFileSync(path.join(outDir, 'icon-512x512.png'), icon512);

console.log('Generating 512x512 maskable icon...');
const icon512Maskable = renderIcon(512, 512, true);
fs.writeFileSync(path.join(outDir, 'icon-512x512-maskable.png'), icon512Maskable);

console.log('Generating 180x180 Apple Touch icon...');
const appleIcon = renderIcon(180, 180, false);
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), appleIcon);

// Also generate SVG version
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#bg)"/>
  <!-- Graduation Cap -->
  <polygon points="256,120 440,210 256,300 72,210" fill="#ffffff"/>
  <path d="M140,245 L140,320 C140,365 372,365 372,320 L372,245 C340,270 295,285 256,285 C217,285 172,270 140,245 Z" fill="#ffffff"/>
  <!-- Tassel -->
  <circle cx="256" cy="210" r="14" fill="#f59e0b"/>
  <path d="M256,210 Q380,215 425,275 L425,340" stroke="#f59e0b" stroke-width="12" fill="none" stroke-linecap="round"/>
  <polygon points="418,340 432,340 435,370 415,370" fill="#f59e0b"/>
</svg>`;

fs.writeFileSync(path.join(outDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.resolve('/Volumes/My Space/UniFlow/public/favicon.svg'), svgContent);

console.log('All icons generated successfully!');
