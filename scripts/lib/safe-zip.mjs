/** Minimal read-only ZIP reader for release verification. Never extracts archive paths to disk. */
import fs from 'node:fs';
import zlib from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_ENTRIES = 500;
const MAX_CENTRAL_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function readAt(fd, length, position) {
  const buffer = Buffer.alloc(length);
  const count = fs.readSync(fd, buffer, 0, length, position);
  if (count !== length) fail('SAFE_ZIP_TRUNCATED', 'ZIP is truncated');
  return buffer;
}
function normalize(name) { return String(name || '').replaceAll('\\', '/').replace(/^(?:\.\/)+/u, '').replace(/\/+$/u, ''); }
function assertName(raw) {
  const name = normalize(raw);
  if ((!name && !/^(?:\.\/)+$/u.test(raw)) || raw.includes('\0') || raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/u.test(raw)
    || name.split('/').includes('..') || name.split('/').includes('.')) {
    fail('SAFE_ZIP_PATH', `unsafe ZIP entry: ${raw}`);
  }
  return name;
}

export function openSafeZip(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 22) fail('SAFE_ZIP_FORMAT', 'ZIP is too small');
    const tailLength = Math.min(size, 65_557);
    const tail = readAt(fd, tailLength, size - tailLength);
    let eocd = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === EOCD) { eocd = index; break; }
    }
    if (eocd < 0) fail('SAFE_ZIP_FORMAT', 'ZIP end record is missing');
    const disk = tail.readUInt16LE(eocd + 4);
    const centralDisk = tail.readUInt16LE(eocd + 6);
    const diskEntries = tail.readUInt16LE(eocd + 8);
    const totalEntries = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries || totalEntries < 1 || totalEntries > MAX_ENTRIES) {
      fail('SAFE_ZIP_UNSUPPORTED', 'multi-disk, ZIP64, empty, or oversized ZIP is not accepted');
    }
    if (centralSize > MAX_CENTRAL_BYTES || centralOffset + centralSize > size) fail('SAFE_ZIP_FORMAT', 'invalid ZIP central directory');
    const central = readAt(fd, centralSize, centralOffset);
    const entries = [];
    const names = new Set();
    let cursor = 0;
    let totalBytes = 0;
    for (let index = 0; index < totalEntries; index += 1) {
      if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== CENTRAL) fail('SAFE_ZIP_FORMAT', 'invalid ZIP central entry');
      const madeBy = central.readUInt16LE(cursor + 4);
      const flags = central.readUInt16LE(cursor + 8);
      const method = central.readUInt16LE(cursor + 10);
      const compressedSize = central.readUInt32LE(cursor + 20);
      const sizeBytes = central.readUInt32LE(cursor + 24);
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      const diskStart = central.readUInt16LE(cursor + 34);
      const external = central.readUInt32LE(cursor + 38);
      const localOffset = central.readUInt32LE(cursor + 42);
      const end = cursor + 46 + nameLength + extraLength + commentLength;
      if (end > central.length || diskStart !== 0) fail('SAFE_ZIP_FORMAT', 'invalid ZIP entry bounds');
      const rawName = central.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
      const directory = rawName.endsWith('/');
      const name = assertName(rawName);
      const host = madeBy >>> 8;
      const unixMode = external >>> 16;
      const type = unixMode & 0xf000;
      if ((flags & 1) !== 0 || ![0, 8].includes(method)) fail('SAFE_ZIP_UNSUPPORTED', `encrypted or unsupported ZIP entry: ${name}`);
      if (host === 3 && type && type !== 0x8000 && type !== 0x4000) fail('SAFE_ZIP_LINK', `links and special files are forbidden: ${name}`);
      if (!directory && names.has(name)) fail('SAFE_ZIP_DUPLICATE', `duplicate ZIP entry: ${name}`);
      if (!directory) {
        names.add(name);
        totalBytes += sizeBytes;
        if (totalBytes > MAX_TOTAL_BYTES) fail('SAFE_ZIP_SIZE', 'ZIP uncompressed content is too large');
        entries.push({ name, flags, method, compressedSize, size: sizeBytes, localOffset });
      }
      cursor = end;
    }
    if (cursor !== central.length) fail('SAFE_ZIP_FORMAT', 'unexpected bytes in ZIP central directory');
    return { file, size, entries };
  } finally { fs.closeSync(fd); }
}

export function readSafeZipEntry(zip, entry, maxBytes = 1024 * 1024 * 1024) {
  if (!zip?.file || !entry || entry.size > maxBytes || entry.compressedSize > maxBytes) fail('SAFE_ZIP_SIZE', `ZIP entry is too large: ${entry?.name || 'unknown'}`);
  const fd = fs.openSync(zip.file, 'r');
  try {
    const header = readAt(fd, 30, entry.localOffset);
    if (header.readUInt32LE(0) !== LOCAL) fail('SAFE_ZIP_FORMAT', `invalid local ZIP entry: ${entry.name}`);
    const flags = header.readUInt16LE(6);
    const method = header.readUInt16LE(8);
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    if (flags !== entry.flags || method !== entry.method) fail('SAFE_ZIP_FORMAT', `ZIP entry metadata mismatch: ${entry.name}`);
    const localName = readAt(fd, nameLength, entry.localOffset + 30).toString('utf8');
    if (assertName(localName) !== entry.name) fail('SAFE_ZIP_FORMAT', `ZIP local name mismatch: ${entry.name}`);
    const compressed = readAt(fd, entry.compressedSize, entry.localOffset + 30 + nameLength + extraLength);
    let value;
    try {
      value = entry.method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: maxBytes });
    } catch { fail('SAFE_ZIP_DEFLATE', `cannot decode ZIP entry: ${entry.name}`); }
    if (value.length !== entry.size) fail('SAFE_ZIP_SIZE', `ZIP entry size mismatch: ${entry.name}`);
    return value;
  } finally { fs.closeSync(fd); }
}
