import { spawnSync } from 'node:child_process';

function versionParts(value) {
  const match = String(value || '').match(/\b(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match ? match.slice(1, 4).map(Number) : null;
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function inspectRuntimeVersion(executable, { shell = false } = {}) {
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    shell,
    timeout: 15000,
  });
  if (result.error || result.status !== 0) {
    return { ok: false, version: null, output: String(result.stderr || result.stdout || result.error?.message || '').trim() };
  }
  const output = String(result.stdout || result.stderr || '').trim();
  const parsed = versionParts(output);
  return { ok: Boolean(parsed), version: parsed ? parsed.join('.') : null, output };
}

export function runtimeMeetsMinimum(actual, minimum) {
  const compared = compareVersions(actual, minimum);
  return compared != null && compared >= 0;
}
