#!/usr/bin/env node
/** Run one command with a real process-tree timeout and bounded captured output. */
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const separator = argv.indexOf('--');
const timeoutIndex = argv.indexOf('--timeout');
const maxIndex = argv.indexOf('--max-bytes');
const timeoutMs = timeoutIndex >= 0 ? Number(argv[timeoutIndex + 1]) : 30_000;
const maxBytes = maxIndex >= 0 ? Number(argv[maxIndex + 1]) : 4 * 1024 * 1024;
const command = separator >= 0 ? argv[separator + 1] : null;
const commandArgs = separator >= 0 ? argv.slice(separator + 2) : [];

if (!command || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000
  || !Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 32 * 1024 * 1024) {
  console.error('Usage: run-bounded-command.mjs --timeout MS --max-bytes N -- COMMAND [ARGS...]');
  process.exit(2);
}

const started = Date.now();
let stdout = '';
let stderr = '';
let timedOut = false;
let overflow = false;
let spawnError = null;
let settled = false;

const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  env: process.env,
  windowsHide: true,
  shell: false,
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

function append(current, chunk) {
  const next = current + chunk.toString('utf8');
  if (Buffer.byteLength(next, 'utf8') <= maxBytes) return next;
  overflow = true;
  return next.slice(-maxBytes);
}

child.stdout?.on('data', chunk => { stdout = append(stdout, chunk); });
child.stderr?.on('data', chunk => { stderr = append(stderr, chunk); });
child.on('error', error => { spawnError = error; });

async function killTree() {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    await new Promise(resolve => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', resolve);
      killer.on('close', resolve);
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {
      try { child.kill('SIGKILL'); } catch {}
    }
  }
}

const timer = setTimeout(async () => {
  if (settled) return;
  timedOut = true;
  await killTree();
}, timeoutMs);

const close = await new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
settled = true;
clearTimeout(timer);

console.log(JSON.stringify({
  status: Number.isInteger(close.code) ? close.code : null,
  signal: close.signal || null,
  timedOut,
  overflow,
  error: spawnError ? { code: spawnError.code || null, message: spawnError.message } : null,
  stdout,
  stderr,
  durationMs: Date.now() - started,
}));
