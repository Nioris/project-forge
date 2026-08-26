#!/usr/bin/env node
/** Deterministic Godot CLI test double. Never used unless the regression harness opts in. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const fixtureMode = String(process.env.FORGE_GODOT_FIXTURE_MODE || 'pass');
const certificateNoise = fixtureMode.startsWith('certificate-');
const behaviorMode = certificateNoise
  ? (fixtureMode.slice('certificate-'.length) === 'noise' ? 'pass' : fixtureMode.slice('certificate-'.length))
  : fixtureMode;

if (certificateNoise) console.error('ERROR: Failed to read the root certificate store.');

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function verifyIsolatedUserEnvironment() {
  if (process.env.FORGE_GODOT_REQUIRE_ISOLATED_USER_ENV !== '1' || args.includes('--version')) return;
  const runtimeRoot = path.dirname(path.resolve(process.cwd()));
  const required = ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME'];
  for (const key of required) {
    const directory = String(process.env[key] || '').trim();
    if (!directory || !inside(runtimeRoot, directory)) {
      console.error(`ERROR: ${key} escaped isolated Godot runtime: ${directory || '<missing>'}`);
      process.exit(41);
    }
    const probe = path.join(directory, `.forge-godot-env-probe-${process.pid}`);
    try {
      fs.writeFileSync(probe, key);
      fs.unlinkSync(probe);
    } catch (error) {
      console.error(`ERROR: ${key} is not writable: ${error.message}`);
      process.exit(42);
    }
  }
}

verifyIsolatedUserEnvironment();

if (process.env.FORGE_GODOT_EXPECT_CLASS_CACHE && !args.includes('--version')) {
  const cache = path.join(process.cwd(), '.godot', 'global_script_class_cache.cfg');
  const expected = String(process.env.FORGE_GODOT_EXPECT_CLASS_CACHE);
  let text = '';
  try { text = fs.readFileSync(cache, 'utf8'); } catch {}
  if (!text.includes(`"class": &"${expected}"`)) {
    console.error(`ERROR: isolated GDScript class cache is missing ${expected}`);
    process.exit(43);
  }
}

if (behaviorMode === 'user-store-fail' && !args.includes('--version')) {
  console.error("ERROR: Could not open 'user://' directory: 'user://'.");
  process.exit(2);
}

if (behaviorMode === 'parse-fail' && !args.includes('--version')) {
  console.error('SCRIPT ERROR: Parse Error: fixture parse failure');
  process.exit(1);
}

if (behaviorMode === 'parse-display-fail' && !args.includes('--version')) {
  console.error('SCRIPT ERROR: Parse Error: fixture parse failure');
  console.error('ERROR: failed to create display window');
  process.exit(1);
}

let crcTable = null;
function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let value = n;
      for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[n] = value >>> 0;
    }
  }
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(payload.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([length, name, payload, crc]);
}

function writePng(file, width, height, state) {
  const seed = Number.isInteger(state)
    ? ((state % 254) + 254) % 254 + 1
    : [...String(state)].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) % 254, 17) + 1;
  const row = Buffer.alloc(1 + width * 4); row[0] = 0;
  for (let x = 0; x < width; x++) {
    row[1 + x * 4] = (seed + x) % 255;
    row[2 + x * 4] = (seed * 3 + x) % 255;
    row[3 + x * 4] = (seed * 7) % 255;
    row[4 + x * 4] = 255;
  }
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) row.copy(raw, y * row.length);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function riffChunk(id, payload) {
  const size = Buffer.alloc(4); size.writeUInt32LE(payload.length);
  return Buffer.concat([Buffer.from(id, 'ascii'), size, payload, payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

function riffList(type, chunks) {
  return riffChunk('LIST', Buffer.concat([Buffer.from(type, 'ascii'), ...chunks]));
}

const VALID_JPEG = Buffer.from('/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjExLjEwMAD/2wBDAAgGBgcGBwgICAgICAkJCQoKCgkJCQkKCgoKCgoMDAwKCgoKCgoKDAwMDA0ODQ0NDA0ODg8PDxISEREVFRUZGR//xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABgcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAAQABADASIAAhEAAxEA/9oADAMBAAIRAxEAPwCLAE1/f//Z', 'base64');

function indexedJpeg(index, frozen = false) {
  const payload = Buffer.alloc(4);
  payload.writeUInt32BE(frozen ? 0 : index);
  return Buffer.concat([
    VALID_JPEG.subarray(0, 2),
    Buffer.from([0xff, 0xfe, 0x00, 0x06]),
    payload,
    VALID_JPEG.subarray(2),
  ]);
}

function writeAvi(file, width, height, fps, frames, { malformed = false, frozen = false, badIndex = false } = {}) {
  const maxFrameBytes = malformed ? 10 : indexedJpeg(0, frozen).length;
  const avih = Buffer.alloc(56);
  avih.writeUInt32LE(Math.round(1_000_000 / fps), 0);
  avih.writeUInt32LE(maxFrameBytes * fps, 4);
  avih.writeUInt32LE(0x10, 12);
  avih.writeUInt32LE(frames, 16);
  avih.writeUInt32LE(1, 24);
  avih.writeUInt32LE(maxFrameBytes, 28);
  avih.writeUInt32LE(width, 32);
  avih.writeUInt32LE(height, 36);

  const strh = Buffer.alloc(56);
  strh.write('vids', 0, 'ascii');
  strh.write('MJPG', 4, 'ascii');
  strh.writeUInt32LE(1, 20);
  strh.writeUInt32LE(fps, 24);
  strh.writeUInt32LE(frames, 32);
  strh.writeUInt32LE(maxFrameBytes, 36);
  strh.writeUInt32LE(0xffffffff, 40);
  strh.writeInt16LE(width, 52);
  strh.writeInt16LE(height, 54);

  const strf = Buffer.alloc(40);
  strf.writeUInt32LE(40, 0);
  strf.writeInt32LE(width, 4);
  strf.writeInt32LE(height, 8);
  strf.writeUInt16LE(1, 12);
  strf.writeUInt16LE(24, 14);
  strf.write('MJPG', 16, 'ascii');
  strf.writeUInt32LE(width * height * 3, 20);

  const frameChunks = [];
  const indexRecords = [];
  let moviOffset = 4;
  for (let index = 0; index < frames; index++) {
    const payload = malformed ? Buffer.from('not-a-jpeg') : indexedJpeg(index, frozen);
    const frameChunk = riffChunk('00dc', payload);
    frameChunks.push(frameChunk);
    const record = Buffer.alloc(16);
    record.write('00dc', 0, 'ascii');
    record.writeUInt32LE(0x10, 4);
    record.writeUInt32LE(moviOffset + (badIndex && index === 0 ? 2 : 0), 8);
    record.writeUInt32LE(payload.length, 12);
    indexRecords.push(record);
    moviOffset += frameChunk.length;
  }
  const streamList = malformed ? [] : [riffList('strl', [riffChunk('strh', strh), riffChunk('strf', strf)])];
  const body = Buffer.concat([
    Buffer.from('AVI ', 'ascii'),
    riffList('hdrl', [riffChunk('avih', avih), ...streamList]),
    riffList('movi', frameChunks),
    riffChunk('idx1', Buffer.concat(indexRecords)),
  ]);
  const size = Buffer.alloc(4); size.writeUInt32LE(body.length);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from('RIFF', 'ascii'), size, body]));
}

function option(name, fallback = '') {
  const item = args.find(value => value.startsWith(`--${name}=`));
  return item ? item.slice(name.length + 3) : fallback;
}

if (behaviorMode === 'display-fail' && !args.includes('--version')) {
  console.error('ERROR: failed to create display window');
  process.exit(2);
}

if (behaviorMode === 'exit-fail' && !args.includes('--version')) process.exit(2);

if (behaviorMode === 'hang' && !args.includes('--version')) {
  setInterval(() => {}, 1000);
}

if (args.includes('--version')) {
  console.log('4.7.test.fixture');
} else if (args.includes('--import')) {
  console.log('Fixture import completed');
} else if (args.includes('--build-solutions')) {
  console.log('Fixture C# build completed');
} else if (option('forge-visual-mode') === 'capture') {
  const resolution = String(args[args.indexOf('--resolution') + 1] || '412x915').split('x').map(Number);
  const state = option('forge-visual-state');
  const output = option('forge-visual-output');
  writePng(output, resolution[0], resolution[1], behaviorMode === 'identical-state-pixels' ? 'same-pixels' : state);
  console.log('FORGE_VISUAL_PROTOCOL:forge-godot-visual-v1');
  console.log(`FORGE_VISUAL_STATE:${behaviorMode === 'state-mismatch' ? 'wrong-state' : state}`);
  console.log(`FORGE_VISUAL_CAPTURED:${output}`);
} else if (option('forge-visual-mode') === 'proof') {
  const resolution = String(args[args.indexOf('--resolution') + 1] || '1920x1080').split('x').map(Number);
  const video = String(args[args.indexOf('--write-movie') + 1] || 'proof-video.avi');
  const fps = Number(option('forge-proof-fps', '30'));
  const frames = Number(option('forge-proof-total-frames', '450'));
  const states = option('forge-proof-states').split(',').filter(Boolean);
  const samplesDir = option('forge-proof-samples-dir');
  const encodedFrames = behaviorMode === 'short-video' ? frames - 2 : frames;
  writeAvi(video, resolution[0], resolution[1], fps, encodedFrames, {
    malformed: behaviorMode === 'malformed-avi',
    frozen: behaviorMode === 'frozen-video' || behaviorMode === 'frozen-avi',
    badIndex: behaviorMode === 'bad-avi-index',
  });
  console.log('FORGE_VISUAL_PROTOCOL:forge-godot-visual-v1');
  console.log(`FORGE_VISUAL_PROOF_READY:${frames}:${fps}`);
  const segment = Math.ceil(frames / states.length);
  states.forEach((state, index) => console.log(`FORGE_VISUAL_PROOF_STATE:${state}:${index * segment}`));
  const sampleCount = Math.floor(frames / fps);
  for (let second = 0; second < sampleCount; second++) {
    const frame = second * fps;
    const sample = path.join(samplesDir, `sample-${String(frame).padStart(6, '0')}.png`);
    const seed = behaviorMode === 'frozen-video' ? 1 : second + 1;
    writePng(sample, resolution[0], resolution[1], seed);
    console.log(`FORGE_VISUAL_PROOF_SAMPLE:${frame}:${sample}`);
  }
  console.log(`FORGE_VISUAL_PROOF_COMPLETE:${frames}`);
} else {
  if (behaviorMode !== 'missing-marker') console.log('FORGE_SMOKE_READY');
}
