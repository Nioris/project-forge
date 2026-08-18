#!/usr/bin/env node
/** Read-only fleet audit for Forge behavioral diagnostic logs. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readForgeDiagnostics } from '../.claude/hooks/lib/forge-diagnostics.mjs';

const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { workspace: dirname(ENGINE_ROOT), since: '30d', json: false, includeResolved: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--workspace') out.workspace = resolve(argv[++i]);
    else if (argv[i] === '--since') out.since = argv[++i];
    else if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--all') out.includeResolved = true;
    else if (argv[i] === '--help') out.help = true;
  }
  return out;
}

function sinceTimestamp(value, now = Date.now()) {
  if (!value || value === 'all') return 0;
  const match = String(value).match(/^(\d+)([dhw])$/i);
  if (!match) throw new Error(`Invalid --since ${value}; use 24h, 7d, 4w, or all`);
  const unit = { h: 3600000, d: 86400000, w: 604800000 }[match[2].toLowerCase()];
  return now - Number(match[1]) * unit;
}

function managedProjects(workspace) {
  if (!existsSync(workspace)) return [];
  return readdirSync(workspace, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: join(workspace, entry.name) }))
    .filter((project) => existsSync(join(project.path, '.forge-managed.json')))
    .map((project) => {
      try {
        const manifest = JSON.parse(readFileSync(join(project.path, '.forge-managed.json'), 'utf8'));
        return { ...project, forgeVersion: manifest.forgeVersion || manifest.sourceVersion || manifest.version || 'unknown' };
      } catch {
        return { ...project, forgeVersion: 'unknown' };
      }
    });
}

export function auditForgeDiagnostics(workspace, options = {}) {
  const cutoff = sinceTimestamp(options.since || '30d', options.now || Date.now());
  const projects = managedProjects(resolve(workspace));
  const openState = new Map();
  const observations = [];
  const parseErrors = [];
  let projectsWithLogs = 0;
  let totalEvents = 0;

  for (const project of projects) {
    const read = readForgeDiagnostics(project.path);
    if (read.files.length) projectsWithLogs += 1;
    totalEvents += read.events.length;
    for (const error of read.parseErrors) parseErrors.push({ project: project.name, ...error });
    for (const event of read.events) {
      const key = `${project.name}\0${event.fingerprint}`;
      if (event.action === 'resolve') openState.delete(key);
      else openState.set(key, { ...event, project: project.name });
      if (event.action === 'report' && Date.parse(event.timestamp || 0) >= cutoff) {
        observations.push({ ...event, project: project.name });
      }
    }
  }

  const open = [...openState.values()];
  const included = options.includeResolved
    ? observations
    : observations.filter((event) => openState.has(`${event.project}\0${event.fingerprint}`));
  const groups = new Map();
  for (const event of included) {
    const key = [event.code, event.component, event.operation].join('|');
    const group = groups.get(key) || {
      code: event.code,
      component: event.component,
      operation: event.operation,
      severity: event.severity,
      occurrences: 0,
      projects: new Set(),
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      latestMessage: event.message,
    };
    group.occurrences += 1;
    group.projects.add(event.project);
    if (String(event.timestamp) < String(group.firstSeen)) group.firstSeen = event.timestamp;
    if (String(event.timestamp) >= String(group.lastSeen)) {
      group.lastSeen = event.timestamp;
      group.latestMessage = event.message;
      group.severity = event.severity;
    }
    groups.set(key, group);
  }

  const severityOrder = { critical: 4, error: 3, warn: 2, info: 1 };
  const grouped = [...groups.values()].map((group) => ({ ...group, projects: [...group.projects].sort() }))
    .sort((a, b) => (severityOrder[b.severity] - severityOrder[a.severity]) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
  const openCounts = open.reduce((counts, event) => {
    counts[event.severity] = (counts[event.severity] || 0) + 1;
    return counts;
  }, { critical: 0, error: 0, warn: 0, info: 0 });
  const byProject = projects.map((project) => {
    const projectOpen = open.filter((event) => event.project === project.name);
    return { name: project.name, forgeVersion: project.forgeVersion, open: projectOpen.length };
  }).filter((project) => options.includeResolved || project.open > 0);

  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    workspace: resolve(workspace),
    since: options.since || '30d',
    projectsScanned: projects.length,
    projectsWithLogs,
    totalEvents,
    openIncidents: open.length,
    openCounts,
    groups: grouped,
    projects: byProject,
    parseErrors,
  };
}

function printHuman(result) {
  console.log('Project Forge behavioral diagnostics — fleet audit');
  console.log(`Workspace: ${result.workspace}`);
  console.log(`Projects: ${result.projectsScanned} scanned, ${result.projectsWithLogs} with logs | events=${result.totalEvents}`);
  console.log(`Open: ${result.openIncidents} critical=${result.openCounts.critical} error=${result.openCounts.error} warn=${result.openCounts.warn} info=${result.openCounts.info}`);
  if (!result.groups.length) console.log(`No matching incidents observed in ${result.since}.`);
  for (const group of result.groups) {
    console.log(`- ${group.severity.toUpperCase()} ${group.code} | ${group.component}${group.operation ? `/${group.operation}` : ''} | observations=${group.occurrences} projects=${group.projects.length} | last=${group.lastSeen}`);
    console.log(`  ${group.projects.join(', ')}: ${group.latestMessage}`);
  }
  for (const error of result.parseErrors) console.log(`- PARSE_ERROR ${error.project}/${error.file}:${error.line} ${error.error}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/audit-forge-diagnostics.mjs [--workspace <parent>] [--since 30d|24h|4w|all] [--all] [--json]');
    return;
  }
  const result = auditForgeDiagnostics(args.workspace, args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => { console.error(`[X] ${error.message}`); process.exitCode = 1; });
}
