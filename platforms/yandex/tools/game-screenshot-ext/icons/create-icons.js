// Quick script to create minimal PNG icons
// Run: node create-icons.js

const fs = require('fs');

// Minimal 1x1 gold pixel PNG for each size
// We'll create actual colored PNGs using raw pixel data

function createPNG(size) {
  // Create a simple PNG with a camera icon pattern
  // Using raw PNG construction

  const width = size;
  const height = size;

  // RGBA pixel data
  const pixels = new Uint8Array(width * height * 4);

  const bg = [26, 26, 46, 255];       // #1a1a2e
  const gold = [255, 215, 0, 255];     // #ffd700
  const blue = [68, 136, 255, 255];    // #4488ff
  const dark = [26, 26, 46, 255];      // lens center

  // Fill background
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const off = i * 4;

    // Rounded rect check
    const margin = Math.floor(size * 0.1);
    const rad = Math.floor(size * 0.15);
    let inBounds = true;

    if (x < margin || x >= width - margin || y < margin || y >= height - margin) {
      inBounds = false;
    }

    pixels[off] = inBounds ? bg[0] : 0;
    pixels[off + 1] = inBounds ? bg[1] : 0;
    pixels[off + 2] = inBounds ? bg[2] : 0;
    pixels[off + 3] = inBounds ? bg[3] : 0;
  }

  // Camera body (gold rectangle)
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height * 0.55);
  const bw = Math.floor(width * 0.6);
  const bh = Math.floor(height * 0.4);

  for (let y = cy - Math.floor(bh/2); y < cy + Math.floor(bh/2); y++) {
    for (let x = cx - Math.floor(bw/2); x < cx + Math.floor(bw/2); x++) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const off = (y * width + x) * 4;
        pixels[off] = gold[0]; pixels[off+1] = gold[1]; pixels[off+2] = gold[2]; pixels[off+3] = gold[3];
      }
    }
  }

  // Lens (dark circle with blue center)
  const lensR = Math.floor(size * 0.14);
  const innerR = Math.floor(size * 0.08);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const off = (y * width + x) * 4;

      if (dist < innerR) {
        pixels[off] = blue[0]; pixels[off+1] = blue[1]; pixels[off+2] = blue[2]; pixels[off+3] = blue[3];
      } else if (dist < lensR) {
        pixels[off] = dark[0]; pixels[off+1] = dark[1]; pixels[off+2] = dark[2]; pixels[off+3] = dark[3];
      }
    }
  }

  // Flash (small gold bar on top)
  const fw = Math.floor(size * 0.2);
  const fh = Math.max(Math.floor(size * 0.08), 1);
  const fy = cy - Math.floor(bh/2) - fh - Math.max(Math.floor(size * 0.02), 1);

  for (let y = fy; y < fy + fh; y++) {
    for (let x = cx - Math.floor(fw/2); x < cx + Math.floor(fw/2); x++) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const off = (y * width + x) * 4;
        pixels[off] = gold[0]; pixels[off+1] = gold[1]; pixels[off+2] = gold[2]; pixels[off+3] = gold[3];
      }
    }
  }

  return encodePNG(width, height, pixels);
}

function encodePNG(width, height, pixels) {
  // Simplified PNG encoder
  const { deflateSync } = require('zlib');

  // Build raw image data (filter byte 0 + pixel row)
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const srcOff = (y * width + x) * 4;
      const dstOff = y * (width * 4 + 1) + 1 + x * 4;
      raw[dstOff] = pixels[srcOff];
      raw[dstOff + 1] = pixels[srcOff + 1];
      raw[dstOff + 2] = pixels[srcOff + 2];
      raw[dstOff + 3] = pixels[srcOff + 3];
    }
  }

  const compressed = deflateSync(raw);

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type);
    const combined = Buffer.concat([typeB, data]);
    const crc = crc32(combined);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc >>> 0);
    return Buffer.concat([len, combined, crcB]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', compressed);
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate all sizes
[16, 48, 128].forEach(size => {
  const png = createPNG(size);
  const path = `icon${size}.png`;
  fs.writeFileSync(path, png);
  console.log(`Created ${path} (${png.length} bytes)`);
});
