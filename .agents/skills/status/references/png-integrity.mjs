/** Strict, dependency-free PNG structural validation for visual evidence. */
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);

let crcTable = null;
function table() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crcTable[n] = value >>> 0;
  }
  return crcTable;
}

export function pngCrc32(data) {
  let value = 0xffffffff;
  const lookup = table();
  for (const byte of data) value = lookup[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function allowedBitDepth(colorType, bitDepth) {
  if (colorType === 0) return [1, 2, 4, 8, 16].includes(bitDepth);
  if (colorType === 3) return [1, 2, 4, 8].includes(bitDepth);
  return [8, 16].includes(bitDepth);
}

/**
 * Rejects header-only/fabricated PNGs, corrupt chunks, broken IDAT streams and unsafe dimensions.
 * Returns dimensions plus basic format facts only after the complete file has been parsed.
 */
export function inspectPng(file, { maxPixels = 120_000_000, maxBytes = 256 * 1024 * 1024 } = {}) {
  try {
    const data = fs.readFileSync(file);
    if (data.length < 57 || data.length > maxBytes || !data.subarray(0, 8).equals(SIGNATURE)) return null;
    let offset = 8;
    let ihdr = null;
    let sawIend = false;
    let sawIdat = false;
    let sawPlte = false;
    let idatClosed = false;
    const compressed = [];
    while (offset + 12 <= data.length) {
      const length = data.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (length > maxBytes || end > data.length) return null;
      const typeBuffer = data.subarray(offset + 4, offset + 8);
      const type = typeBuffer.toString('ascii');
      if (!/^[A-Za-z]{4}$/u.test(type)) return null;
      const payload = data.subarray(offset + 8, offset + 8 + length);
      const expectedCrc = data.readUInt32BE(offset + 8 + length);
      if (pngCrc32(Buffer.concat([typeBuffer, payload])) !== expectedCrc) return null;

      if (!ihdr) {
        if (type !== 'IHDR' || length !== 13) return null;
        const width = payload.readUInt32BE(0);
        const height = payload.readUInt32BE(4);
        const bitDepth = payload[8];
        const colorType = payload[9];
        const compression = payload[10];
        const filter = payload[11];
        const interlace = payload[12];
        if (!width || !height || width * height > maxPixels || !CHANNELS.has(colorType)
          || !allowedBitDepth(colorType, bitDepth) || compression !== 0 || filter !== 0 || ![0, 1].includes(interlace)) return null;
        ihdr = { width, height, bitDepth, colorType, interlace };
      } else if (type === 'IHDR') return null;

      if (type === 'PLTE') {
        if (sawIdat || sawPlte || length < 3 || length > 768 || length % 3 !== 0) return null;
        sawPlte = true;
      }
      if (type === 'IDAT') {
        if (idatClosed) return null;
        sawIdat = true;
        compressed.push(payload);
      } else if (sawIdat && type !== 'IEND') idatClosed = true;
      if (type === 'IEND') {
        if (length !== 0 || !sawIdat) return null;
        sawIend = true;
        offset = end;
        break;
      }
      offset = end;
    }
    if (!ihdr || !sawIend || offset !== data.length || (ihdr.colorType === 3 && !sawPlte)) return null;

    const channels = CHANNELS.get(ihdr.colorType);
    const expectedNonInterlaced = ihdr.height * (1 + Math.ceil((ihdr.width * channels * ihdr.bitDepth) / 8));
    const raw = zlib.inflateSync(Buffer.concat(compressed), {
      maxOutputLength: Math.min(maxBytes, Math.max(expectedNonInterlaced * 2 + 4096, 1024 * 1024)),
    });
    if (!raw.length || (ihdr.interlace === 0 && raw.length !== expectedNonInterlaced)) return null;
    return { ...ihdr, bytes: data.length };
  } catch {
    return null;
  }
}
