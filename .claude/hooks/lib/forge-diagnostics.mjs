import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const FORGE_DIAGNOSTIC_SCHEMA_VERSION = 1;
export const FORGE_DIAGNOSTIC_LOG = 'wiki/diagnostics/forge-events.jsonl';
const MAX_LOG_BYTES = 5 * 1024 * 1024;

const ALLOWED_ACTIONS = new Set(['report', 'resolve']);
const ALLOWED_SEVERITIES = new Set(['info', 'warn', 'error', 'critical']);
const ALLOWED_SOURCES = new Set(['ai', 'hook', 'runtime', 'validator', 'manual']);
const ALLOWED_HOSTS = new Set(['codex', 'claude', 'gigachat', 'unknown']);

function bounded(value, max = 1000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
}

export function redactDiagnosticText(value, projectRoot = '') {
  let text = bounded(value, 4000);
  if (projectRoot) {
    const roots = [resolve(projectRoot), resolve(projectRoot).replaceAll('\\', '/')];
    for (const root of roots) {
      text = text.replaceAll(root, '<project>');
    }
  }
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/\b(?:sk|gsk|ghp|github_pat|glpat)-?[A-Za-z0-9_]{12,}\b/gi, '<redacted-token>')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<redacted-jwt>')
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|prompt)\b\s*[:=]\s*([^\s,;]+)/gi, '$1=<redacted>');
}

function cleanEnum(value, allowed, fallback) {
  const normalized = bounded(value, 40).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function cleanCode(value) {
  const normalized = bounded(value || 'FORGE_BEHAVIOR_ANOMALY', 96)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'FORGE_BEHAVIOR_ANOMALY';
}

function readForgeVersion(projectRoot) {
  for (const candidate of [
    join(projectRoot, '.claude-plugin', 'plugin.json'),
    join(projectRoot, '.forge-managed.json'),
  ]) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
      const version = parsed.version || parsed.forgeVersion || parsed.sourceVersion;
      if (version) return bounded(version, 48);
    } catch {}
  }
  try {
    const firstLine = readFileSync(join(projectRoot, 'FORGE.md'), 'utf8').split(/\r?\n/, 1)[0];
    return firstLine.match(/v(\d+\.\d+\.\d+)/i)?.[1] || 'unknown';
  } catch {
    return 'unknown';
  }
}

function safeEvidence(projectRoot, values) {
  const root = resolve(projectRoot);
  const result = [];
  for (const raw of Array.isArray(values) ? values : values ? [values] : []) {
    const value = bounded(raw, 500);
    const absolute = isAbsolute(value) ? resolve(value) : resolve(root, value);
    const rel = relative(root, absolute);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) continue;
    result.push(rel.replaceAll('\\', '/'));
    if (result.length >= 8) break;
  }
  return result;
}

export function forgeDiagnosticFingerprint(event = {}) {
  if (event.fingerprint) {
    const explicit = bounded(event.fingerprint, 80).replace(/[^a-zA-Z0-9_-]/g, '');
    if (explicit) return explicit;
  }
  const stable = [cleanCode(event.code), bounded(event.component, 160), bounded(event.operation, 160)]
    .map((part) => part.trim().toLowerCase())
    .join('|');
  return createHash('sha256').update(stable).digest('hex').slice(0, 20);
}

function rotateIfNeeded(logPath) {
  try {
    if (!existsSync(logPath) || statSync(logPath).size < MAX_LOG_BYTES) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    renameSync(logPath, join(dirname(logPath), `forge-events-${stamp}.jsonl`));
  } catch {}
}

function ensureLocalGitExclude(projectRoot) {
  try {
    const gitDir = join(projectRoot, '.git');
    if (!existsSync(gitDir) || !statSync(gitDir).isDirectory()) return;
    const infoDir = join(gitDir, 'info');
    const exclude = join(infoDir, 'exclude');
    const pattern = 'wiki/diagnostics/forge-events*.jsonl';
    mkdirSync(infoDir, { recursive: true });
    const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
    if (!current.split(/\r?\n/).includes(pattern)) {
      appendFileSync(exclude, `${current && !current.endsWith('\n') ? '\n' : ''}# Project Forge local behavioral diagnostics\n${pattern}\n`, 'utf8');
    }
  } catch {}
}

export function appendForgeDiagnostic(projectRoot, input = {}) {
  try {
    const root = resolve(projectRoot || process.cwd());
    const action = cleanEnum(input.action, ALLOWED_ACTIONS, 'report');
    const fingerprint = forgeDiagnosticFingerprint(input);
    const event = {
      schemaVersion: FORGE_DIAGNOSTIC_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      action,
      severity: cleanEnum(input.severity, ALLOWED_SEVERITIES, action === 'resolve' ? 'info' : 'warn'),
      code: cleanCode(input.code || (action === 'resolve' ? 'FORGE_INCIDENT_RESOLVED' : undefined)),
      kind: bounded(input.kind || 'ai_reported', 80),
      source: cleanEnum(input.source, ALLOWED_SOURCES, 'ai'),
      host: cleanEnum(input.host, ALLOWED_HOSTS, 'unknown'),
      project: bounded(input.project || basename(root), 160),
      forgeVersion: bounded(input.forgeVersion || readForgeVersion(root), 48),
      phase: Number.isInteger(Number(input.phase)) && Number(input.phase) >= 1 && Number(input.phase) <= 9
        ? Number(input.phase)
        : null,
      component: redactDiagnosticText(bounded(input.component || 'forge', 160), root),
      operation: redactDiagnosticText(bounded(input.operation || '', 160), root),
      message: redactDiagnosticText(bounded(input.message || '', 1000), root),
      expected: redactDiagnosticText(bounded(input.expected || '', 500), root),
      actual: redactDiagnosticText(bounded(input.actual || '', 500), root),
      evidence: safeEvidence(root, input.evidence),
      fingerprint,
      resolves: action === 'resolve' ? fingerprint : null,
    };
    const logPath = join(root, ...FORGE_DIAGNOSTIC_LOG.split('/'));
    mkdirSync(dirname(logPath), { recursive: true });
    ensureLocalGitExclude(root);
    rotateIfNeeded(logPath);
    appendFileSync(logPath, `${JSON.stringify(event)}\n`, 'utf8');
    return { ok: true, path: logPath, event };
  } catch (error) {
    return { ok: false, error: bounded(error?.message || error, 500) };
  }
}

export function readForgeDiagnostics(projectRoot) {
  const root = resolve(projectRoot || process.cwd());
  const diagnosticsDir = join(root, 'wiki', 'diagnostics');
  const events = [];
  const parseErrors = [];
  if (!existsSync(diagnosticsDir)) return { events, parseErrors, files: [] };
  const files = readdirSync(diagnosticsDir)
    .filter((name) => /^forge-events(?:-.+)?\.jsonl$/i.test(name))
    .sort()
    .map((name) => join(diagnosticsDir, name));
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event && event.fingerprint && ALLOWED_ACTIONS.has(event.action)) events.push(event);
        else throw new Error('unsupported diagnostic record');
      } catch (error) {
        parseErrors.push({ file: relative(root, file).replaceAll('\\', '/'), line: index + 1, error: bounded(error.message, 300) });
      }
    });
  }
  events.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  return { events, parseErrors, files };
}

export function summarizeForgeDiagnostics(projectRoot) {
  const read = readForgeDiagnostics(projectRoot);
  const state = new Map();
  for (const event of read.events) {
    if (event.action === 'resolve') state.delete(event.fingerprint);
    else state.set(event.fingerprint, event);
  }
  const open = [...state.values()].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return {
    ...read,
    open,
    counts: open.reduce((acc, event) => {
      acc[event.severity] = (acc[event.severity] || 0) + 1;
      return acc;
    }, { info: 0, warn: 0, error: 0, critical: 0 }),
  };
}
