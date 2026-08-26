#!/usr/bin/env node
/** Shared bounded native runtime helpers for Godot visual capture. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BOUNDED_RUNNER = path.join(SCRIPT_DIR, 'run-bounded-command.mjs');
const FIXTURE_ROOT = path.join(SCRIPT_DIR, 'fixtures');
const MAX_FILES = 20_000;
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_OUTPUT = 4 * 1024 * 1024;
const COPY_SKIP = new Set(['.git', '.godot', '.mono', 'bin', 'obj', 'build', 'dist', 'release', 'node_modules']);

export function inside(root, candidate) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function isolatedGodotUserEnv(root) {
  const runtimeRoot = path.resolve(root);
  const home = path.join(runtimeRoot, 'godot-user');
  const appData = path.join(home, 'AppData', 'Roaming');
  const localAppData = path.join(home, 'AppData', 'Local');
  const xdgData = path.join(home, '.local', 'share');
  const xdgConfig = path.join(home, '.config');
  const xdgCache = path.join(home, '.cache');
  for (const directory of [home, appData, localAppData, xdgData, xdgConfig, xdgCache]) {
    if (!inside(runtimeRoot, directory)) throw new Error(`Godot user directory escapes isolated runtime: ${directory}`);
    fs.mkdirSync(directory, { recursive: true });
  }
  const env = {
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    USERPROFILE: home,
    HOME: home,
    XDG_DATA_HOME: xdgData,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_CACHE_HOME: xdgCache,
  };
  if (process.platform === 'win32') {
    const driveRoot = path.parse(home).root;
    env.HOMEDRIVE = driveRoot.replace(/[\\/]$/u, '');
    env.HOMEPATH = home.slice(env.HOMEDRIVE.length);
  }
  return env;
}

export function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/');
}

export function slug(value) {
  return String(value || 'state').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').toLowerCase() || 'state';
}

export function createVisualRunId(now = new Date()) {
  return `${now.toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex')}`;
}

export function copyGodotImplementation(source, target) {
  let files = 0;
  let bytes = 0;
  function visit(from, to) {
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error(`Godot project contains an unsupported symlink/junction: ${from}`);
    if (stat.isDirectory()) {
      if (from !== source && COPY_SKIP.has(path.basename(from).toLowerCase())) return;
      const relative = normalizePath(path.relative(source, from));
      if (relative === 'screens/review' || relative.startsWith('screens/review/')) return;
      fs.mkdirSync(to, { recursive: true });
      for (const entry of fs.readdirSync(from).sort((left, right) => left.localeCompare(right))) visit(path.join(from, entry), path.join(to, entry));
      return;
    }
    if (!stat.isFile()) return;
    files++;
    bytes += stat.size;
    if (files > MAX_FILES || bytes > MAX_BYTES) throw new Error(`Godot project exceeds visual copy budget (${MAX_FILES} files / ${MAX_BYTES} bytes)`);
    fs.copyFileSync(from, to);
  }
  visit(path.resolve(source), path.resolve(target));
  return { files, bytes };
}

export function writeIsolatedGdscriptClassCache(implementationRoot) {
  const root = path.resolve(implementationRoot);
  const scripts = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`isolated Godot project contains an unexpected symlink/junction: ${absolute}`);
      if (entry.isDirectory()) {
        if (!COPY_SKIP.has(entry.name.toLowerCase())) visit(absolute);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.gd') continue;
      const text = fs.readFileSync(absolute, 'utf8');
      const className = text.match(/^[ \t]*class_name[ \t]+([A-Za-z_][A-Za-z0-9_]*)\b/mu)?.[1] || null;
      const extendsValue = text.match(/^[ \t]*extends[ \t]+([^#\r\n]+?)[ \t]*(?:#.*)?$/mu)?.[1]?.trim() || '';
      const pathBase = extendsValue.match(/^"([^"]+)"$/u)?.[1]
        || extendsValue.match(/^preload\("([^"]+)"\)$/u)?.[1] || null;
      const namedBase = /^[A-Za-z_][A-Za-z0-9_]*$/u.test(extendsValue) ? extendsValue : null;
      const relative = normalizePath(path.relative(root, absolute));
      scripts.push({
        resource: `res://${relative}`,
        className,
        extendsPath: pathBase,
        extendsName: namedBase,
        icon: text.match(/^[ \t]*@icon\("([^"]+)"\)[ \t]*$/mu)?.[1] || '',
        isTool: /^[ \t]*@tool[ \t]*$/mu.test(text),
        isAbstract: /^[ \t]*@abstract[ \t]*$/mu.test(text),
      });
    }
  }
  visit(root);
  const byResource = new Map(scripts.map(script => [script.resource, script]));
  const declared = scripts.filter(script => script.className).sort((left, right) => left.className.localeCompare(right.className));
  if (new Set(declared.map(script => script.className)).size !== declared.length) {
    throw new Error('GDScript class_name declarations must be unique');
  }
  function nativeBase(script, seen = new Set()) {
    if (script.extendsName) return script.extendsName;
    if (!script.extendsPath || !script.extendsPath.startsWith('res://') || seen.has(script.resource)) return 'RefCounted';
    seen.add(script.resource);
    const parent = byResource.get(script.extendsPath);
    if (!parent) return 'RefCounted';
    return parent.className || nativeBase(parent, seen);
  }
  const rows = declared.map(script => `{
"base": &${JSON.stringify(nativeBase(script))},
"class": &${JSON.stringify(script.className)},
"icon": ${JSON.stringify(script.icon)},
"is_abstract": ${script.isAbstract},
"is_tool": ${script.isTool},
"language": &"GDScript",
"path": ${JSON.stringify(script.resource)}
}`);
  const cacheDirectory = path.join(root, '.godot');
  fs.mkdirSync(cacheDirectory, { recursive: true });
  fs.writeFileSync(path.join(cacheDirectory, 'global_script_class_cache.cfg'), `list=[${rows.join(', ')}]\n`);
  return { classes: declared.length, scripts: scripts.length };
}

export function snapshotGodotVisualInputs(implementationRoot) {
  const root = path.resolve(implementationRoot);
  const rows = [];
  let files = 0;
  let bytes = 0;
  function visit(current) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`Godot project contains an unsupported symlink/junction: ${current}`);
    if (stat.isDirectory()) {
      if (current !== root && COPY_SKIP.has(path.basename(current).toLowerCase())) return;
      const relative = normalizePath(path.relative(root, current));
      if (relative === 'screens/review' || relative.startsWith('screens/review/')) return;
      for (const entry of fs.readdirSync(current).sort((left, right) => left.localeCompare(right))) visit(path.join(current, entry));
      return;
    }
    if (!stat.isFile()) return;
    files++;
    bytes += stat.size;
    if (files > MAX_FILES || bytes > MAX_BYTES) throw new Error(`Godot project exceeds visual snapshot budget (${MAX_FILES} files / ${MAX_BYTES} bytes)`);
    const relative = normalizePath(path.relative(root, current));
    const content = fs.readFileSync(current);
    rows.push({ relative, content });
  }
  visit(root);
  const hash = crypto.createHash('sha256');
  for (const row of rows) {
    const pathBytes = Buffer.from(row.relative, 'utf8');
    const header = Buffer.alloc(8);
    header.writeUInt32BE(pathBytes.length, 0);
    header.writeUInt32BE(row.content.length, 4);
    hash.update(header).update(pathBytes).update(row.content);
  }
  return {
    algorithm: 'sha256-path-content-v1',
    sha256: hash.digest('hex'),
    fileCount: files,
    bytes,
  };
}

export function runBounded(command, args, { cwd, timeoutMs = 30_000, env = {} } = {}) {
  const child = spawnSync(process.execPath, [
    BOUNDED_RUNNER,
    '--timeout', String(timeoutMs),
    '--max-bytes', String(MAX_OUTPUT),
    '--', command, ...args,
  ], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: timeoutMs + 10_000,
    maxBuffer: MAX_OUTPUT * 2,
    windowsHide: true,
  });
  let result = null;
  try { result = JSON.parse(child.stdout || ''); } catch {}
  if (!result) {
    result = {
      status: null,
      signal: child.signal || null,
      timedOut: child.error?.code === 'ETIMEDOUT',
      error: { code: child.error?.code || 'BOUNDED_RUNNER', message: child.error?.message || child.stderr || 'bounded command runner failed' },
      stdout: '',
      stderr: child.stderr || '',
      durationMs: timeoutMs,
    };
  }
  return {
    command,
    args,
    status: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    timedOut: result.timedOut === true,
    error: result.error || null,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    durationMs: Number(result.durationMs) || 0,
  };
}

function detect(command, prefix = []) {
  const run = runBounded(command, [...prefix, '--version'], { timeoutMs: 10_000 });
  const version = `${run.stdout}\n${run.stderr}`.trim().split(/\r?\n/u).find(Boolean) || null;
  return { ok: run.status === 0 && !run.error, command, prefix, version, testHarness: prefix.length > 0, run };
}

export function detectGodotVisualTool() {
  const shim = String(process.env.FORGE_GODOT_TEST_SHIM || '').trim();
  if (shim && process.env.FORGE_ALLOW_TEST_HARNESS === '1') {
    const resolved = path.resolve(shim);
    if (!inside(FIXTURE_ROOT, resolved) || !fs.existsSync(resolved)) {
      return { ok: false, command: process.execPath, prefix: [], version: null, testHarness: true,
        run: { status: null, error: { code: 'GODOT_TEST_SHIM', message: 'Godot test shim must stay inside scripts/fixtures' }, durationMs: 0 } };
    }
    return detect(process.execPath, [resolved]);
  }
  const explicit = String(process.env.FORGE_GODOT_BIN || '').trim();
  const candidates = explicit ? [explicit] : (process.platform === 'win32'
    ? ['godot_console', 'godot', 'godot4', 'godot-mono']
    : ['godot4', 'godot', 'godot-mono']);
  for (const candidate of candidates) {
    const result = detect(candidate);
    if (result.ok || explicit) return result;
  }
  return detect(candidates[0]);
}

export function combinedOutput(run) {
  return `${run.stdout || ''}\n${run.stderr || ''}`.slice(-MAX_OUTPUT);
}

export function godotErrorLines(output) {
  return [...new Set(String(output).split(/\r?\n/u).map(line => line.trim()).filter(line =>
    /^(?:ERROR:|SCRIPT ERROR:|Parse Error:|Parser Error:|E\s+\d+:|FORGE_VISUAL_ERROR:)|\berror\s+CS\d+\b/iu.test(line)))].slice(0, 30);
}

export function godotProjectErrorLines(output) {
  return [...new Set(String(output).split(/\r?\n/u).map(line => line.trim()).filter(line =>
    /(?:^|\s)(?:SCRIPT ERROR:|Parse Error:|Parser Error:)|\berror\s+CS\d+\b/iu.test(line)))].slice(0, 30);
}

export function isVisualEnvironmentFailure(run, output = combinedOutput(run)) {
  if (godotProjectErrorLines(output).length) return false;
  return Boolean(run.timedOut || run.error || /(?:failed to read (?:the )?root certificate store|could not (?:open|create).*user:\/\/|cannot (?:save|write|open).*editor_settings|error saving editor settings|display driver|cannot open display|failed to create (?:display|window|rendering device)|vulkan.*(?:unavailable|failed)|opengl.*(?:unavailable|failed)|no available video device|movie writer.*(?:unavailable|failed)|codec.*(?:unavailable|failed)|d3d12.*failed)/iu.test(output));
}

export function parseMarkerLines(output, prefix) {
  return String(output).split(/\r?\n/u).map(line => line.trim())
    .filter(line => line.startsWith(prefix)).map(line => line.slice(prefix.length));
}

function parseAviChunks(buffer, start, end, state, depth = 0) {
  let offset = start;
  while (offset + 8 <= end && offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > end || dataEnd > buffer.length) {
      state.valid = false;
      return;
    }
    if (depth === 0) state.topLevelChunks.push({ id, offset, dataStart, dataEnd, paddedEnd: dataEnd + (size % 2), size });
    if (id === 'LIST' && size >= 4) {
      const listType = buffer.toString('ascii', dataStart, dataStart + 4);
      if (listType === 'movi') {
        state.moviTypeOffset = dataStart;
        state.moviChunksStart = dataStart + 4;
      }
      if (listType === 'strl') inspectAviStreamList(buffer, dataStart + 4, dataEnd, state);
      parseAviChunks(buffer, dataStart + 4, dataEnd, state, depth + 1);
    } else if (id === 'avih' && size >= 40) {
      state.mainHeader = true;
      state.microsecondsPerFrame = buffer.readUInt32LE(dataStart);
      state.totalFrames = buffer.readUInt32LE(dataStart + 16);
      state.width = buffer.readUInt32LE(dataStart + 32);
      state.height = buffer.readUInt32LE(dataStart + 36);
    } else if (/^[0-9][0-9]d[bc]$/u.test(id) && size > 0) {
      const frame = buffer.subarray(dataStart, dataEnd);
      if (!isJpegFrame(frame)) state.valid = false;
      state.frameHashes.push(crypto.createHash('sha256').update(frame).digest('hex'));
      state.frameChunks.push({ id, offset, size });
    } else if (id === 'idx1') {
      if (size % 16 !== 0) state.valid = false;
      state.indexEntries += Math.floor(size / 16);
      for (let index = dataStart; index + 16 <= dataEnd; index += 16) {
        const chunkId = buffer.toString('ascii', index, index + 4);
        const flags = buffer.readUInt32LE(index + 4);
        const chunkOffset = buffer.readUInt32LE(index + 8);
        const chunkSize = buffer.readUInt32LE(index + 12);
        if (!/^[0-9][0-9](?:d[bc]|wb)$/u.test(chunkId) || chunkSize <= 0) state.valid = false;
        state.indexRecords.push({ chunkId, flags, chunkOffset, chunkSize });
        if (/^[0-9][0-9]d[bc]$/u.test(chunkId)) state.indexVideoEntries++;
      }
    }
    offset = dataEnd + (size % 2);
  }
  if (offset !== end) state.valid = false;
}

function inspectAviStreamList(buffer, start, end, state) {
  let offset = start;
  let streamHeader = null;
  let bitmapHeader = null;
  while (offset + 8 <= end) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > end || dataEnd > buffer.length) {
      state.valid = false;
      return;
    }
    // Godot 4.7 writes a compact 48-byte AVISTREAMHEADER; ffprobe accepts it and all
    // codec/rate fields used here are within the first 48 bytes.
    if (id === 'strh' && size >= 48) streamHeader = { dataStart, size };
    if (id === 'strf' && size >= 40) bitmapHeader = { dataStart, size };
    offset = dataEnd + (size % 2);
  }
  if (offset !== end || !streamHeader) {
    state.valid = false;
    return;
  }
  const type = buffer.toString('ascii', streamHeader.dataStart, streamHeader.dataStart + 4);
  if (type !== 'vids') return;
  const handler = buffer.toString('ascii', streamHeader.dataStart + 4, streamHeader.dataStart + 8);
  if (!bitmapHeader || handler !== 'MJPG') {
    state.valid = false;
    return;
  }
  const headerSize = buffer.readUInt32LE(bitmapHeader.dataStart);
  const width = buffer.readInt32LE(bitmapHeader.dataStart + 4);
  const height = Math.abs(buffer.readInt32LE(bitmapHeader.dataStart + 8));
  const compression = buffer.toString('ascii', bitmapHeader.dataStart + 16, bitmapHeader.dataStart + 20);
  if (headerSize < 40 || width <= 0 || height <= 0 || compression !== 'MJPG') {
    state.valid = false;
    return;
  }
  state.mjpegStreams++;
  state.streamWidth = width;
  state.streamHeight = height;
  state.handler = handler;
  state.compression = compression;
}

export function isJpegFrame(buffer) {
  if (buffer.length < 32 || buffer[0] !== 0xff || buffer[1] !== 0xd8
    || buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) return false;
  let offset = 2;
  let dqt = false;
  let sof = false;
  let sos = false;
  while (offset < buffer.length - 2) {
    if (buffer[offset] !== 0xff) return false;
    while (offset < buffer.length - 2 && buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length - 2) return false;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length - 2) return false;
    if (marker === 0xdb) dqt = true;
    if (marker === 0xc0 || marker === 0xc2) sof = true;
    if (marker === 0xda) {
      sos = true;
      offset += segmentLength;
      break;
    }
    offset += segmentLength;
  }
  if (!dqt || !sof || !sos) return false;
  while (offset < buffer.length - 2) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    return false;
  }
  return offset === buffer.length - 2;
}

function aviIndexMatchesFrames(state) {
  const videoIndex = state.indexRecords.filter(item => /^[0-9][0-9]d[bc]$/u.test(item.chunkId));
  if (!state.moviTypeOffset || videoIndex.length !== state.frameChunks.length || !videoIndex.length) return false;
  const bases = [...new Set([0, state.moviTypeOffset, state.moviChunksStart].filter(Number.isInteger))];
  return bases.some(base => videoIndex.every((entry, index) => {
    const frame = state.frameChunks[index];
    const indexedSizeMatches = entry.chunkSize === frame.size || entry.chunkSize === frame.size + (frame.size % 2);
    return entry.chunkId === frame.id && indexedSizeMatches && entry.chunkOffset + base === frame.offset;
  }));
}

export function inspectMjpegAvi(file) {
  let buffer;
  try { buffer = fs.readFileSync(file); } catch { return null; }
  const declaredEnd = buffer.length >= 8 ? buffer.readUInt32LE(4) + 8 : 0;
  if (buffer.length < 64 || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || declaredEnd < 12 || declaredEnd > buffer.length || buffer.toString('ascii', 8, 12) !== 'AVI ') return null;
  const state = {
    valid: true,
    mainHeader: false,
    microsecondsPerFrame: 0,
    totalFrames: 0,
    width: 0,
    height: 0,
    streamWidth: 0,
    streamHeight: 0,
    mjpegStreams: 0,
    handler: '',
    compression: '',
    frameHashes: [],
    frameChunks: [],
    topLevelChunks: [],
    indexEntries: 0,
    indexVideoEntries: 0,
    indexRecords: [],
    moviTypeOffset: null,
    moviChunksStart: null,
  };
  parseAviChunks(buffer, 12, buffer.length, state);
  const declaredSizeDelta = buffer.length - declaredEnd;
  if (declaredSizeDelta > 0) {
    const finalChunk = state.topLevelChunks.at(-1);
    const boundedGodotIndexQuirk = declaredSizeDelta <= 512 && finalChunk?.id === 'idx1'
      && finalChunk.offset < declaredEnd && declaredEnd < finalChunk.dataEnd
      && finalChunk.paddedEnd === buffer.length && state.indexEntries > 0
      && state.indexVideoEntries === state.frameHashes.length;
    if (!boundedGodotIndexQuirk) state.valid = false;
  }
  if (!state.valid || !state.mainHeader || state.microsecondsPerFrame <= 0 || state.totalFrames <= 0
    || state.width <= 0 || state.height <= 0 || state.mjpegStreams !== 1
    || state.streamWidth !== state.width || state.streamHeight !== state.height
    || state.frameHashes.length <= 0 || !aviIndexMatchesFrames(state)) return null;
  const uniqueFrames = new Set(state.frameHashes).size;
  const actualFrames = state.frameHashes.length;
  return {
    bytes: buffer.length,
    width: state.width,
    height: state.height,
    fps: state.microsecondsPerFrame > 0 ? Math.round(1_000_000 / state.microsecondsPerFrame) : 0,
    headerFrames: state.totalFrames,
    actualFrames,
    uniqueFrames,
    uniqueFrameRatio: actualFrames ? uniqueFrames / actualFrames : 0,
    streamHandler: state.handler,
    compression: state.compression,
    declaredSizeDelta,
    indexEntries: state.indexEntries,
    indexVideoEntries: state.indexVideoEntries,
    indexValidated: true,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function patchConfigSection(text, section, values) {
  const lines = String(text || '').replace(/\r\n?/gu, '\n').split('\n');
  const targetHeader = `[${section}]`;
  const keys = new Set(Object.keys(values));
  let start = lines.findIndex(line => line.trim() === targetHeader);
  if (start < 0) {
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    if (lines.length) lines.push('');
    lines.push(targetHeader);
    for (const [key, value] of Object.entries(values)) lines.push(`${key}=${value}`);
    lines.push('');
    return lines.join('\n');
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^\s*\[[^\]]+\]\s*$/u.test(lines[index])) { end = index; break; }
  }
  const kept = lines.slice(start + 1, end).filter(line => {
    const match = line.match(/^\s*([^;#][^=]*?)\s*=/u);
    return !match || !keys.has(match[1].trim());
  });
  const replacement = [targetHeader, ...kept, ...Object.entries(values).map(([key, value]) => `${key}=${value}`)];
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join('\n');
}

export function configureIsolatedGodotViewport(isolatedProject, dimensions) {
  const width = Number(dimensions?.width);
  const height = Number(dimensions?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > 8192 || height > 8192) {
    throw new Error(`Invalid isolated Godot viewport ${width}x${height}`);
  }
  const overrideFile = path.join(path.resolve(isolatedProject), 'override.cfg');
  const original = fs.existsSync(overrideFile) ? fs.readFileSync(overrideFile, 'utf8') : '';
  const patched = patchConfigSection(original, 'display', {
    'window/size/viewport_width': String(width),
    'window/size/viewport_height': String(height),
    'window/size/window_width_override': String(width),
    'window/size/window_height_override': String(height),
    'window/size/mode': '0',
  });
  fs.writeFileSync(overrideFile, patched.endsWith('\n') ? patched : `${patched}\n`);
  return overrideFile;
}

export function makeIsolatedGodotCopy(implementationRoot) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-godot-visual-'));
  const isolatedProject = path.join(tempRoot, 'project');
  try {
    const copied = copyGodotImplementation(implementationRoot, isolatedProject);
    const classCache = writeIsolatedGdscriptClassCache(isolatedProject);
    return { tempRoot, isolatedProject, copied, classCache };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}
