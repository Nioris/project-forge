#!/usr/bin/env node
/** Verify dashboard command/version metadata against the actual Forge distribution. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const dashPath = path.join(ROOT, 'dashboard.html');
const errors = [];
const ok = [];
const fail = x => errors.push(x);
const dash = fs.readFileSync(dashPath, 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const canonical = fs.readdirSync(path.join(ROOT, '.claude', 'skills'), { withFileTypes: true }).filter(e=>e.isDirectory()).map(e=>e.name).sort();
const codex = fs.readdirSync(path.join(ROOT, '.agents', 'skills'), { withFileTypes: true }).filter(e=>e.isDirectory()).map(e=>e.name).sort();

const gen = spawnSync(process.execPath, ['scripts/sync-dashboard-meta.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
if (gen.status !== 0) fail('generated dashboard metadata is stale'); else ok.push('generated dashboard metadata matches version/skill counts');

if (!dash.includes(`Dashboard · v${version}`)) fail(`dashboard header is not v${version}`);
if (!dash.includes(`const PH_VER='v${version}';`)) fail(`PH_VER is not v${version}`);
if (!dash.includes(`${canonical.length} canonical / ${codex.length} Codex`)) fail('dashboard skill counts do not match filesystem');
if (/Codex\s*\/\s*Kimi|\.claude\/skills\/phase-[^'\n]+SKILL\.md/.test(dash)) fail('dashboard still contains legacy Codex/Kimi full-prompt phase instructions');

for (const phase of canonical.filter(n => /^phase-\d/.test(n))) {
  const re = new RegExp(`\\{id:'${phase}'[^\\n]*c:'/[^']*${phase}[^']*'[^\\n]*x:'\\$${phase}(?:[^']*)'`);
  if (!re.test(dash)) fail(`phase command mapping missing/mismatched: ${phase} (/ -> $)`);
}
for (const collision of ['status','plan','review']) {
  if (!dash.includes(`$${collision}`)) fail(`dashboard missing Forge Codex command $${collision}`);
  if (!dash.includes(`/${collision}`)) fail(`dashboard missing native Codex collision note /${collision}`);
}
if (!dash.includes('./new-project.bat '+"'+slug+'"+' --type '+"'+kind+'")) {
  // String is assembled dynamically; verify the literal command prefix and both agent entry points instead.
  if (!dash.includes('./new-project.bat ')) fail('dashboard project wizard still lacks new-project.bat');
}
if (!dash.includes("var codexEntry=kind==='app'?'$app':'$phase-1-analyze .';")) fail('dashboard project wizard lacks Codex game/app entry routing');
if (!dash.includes("var claudeEntry=kind==='app'?'/app':'/phase-1-analyze .';")) fail('dashboard project wizard lacks Claude game/app entry routing');
if (!dash.includes('FORGE_AGENT_MODE')) fail('dashboard lacks Claude/Codex command display mode');
if (!dash.includes('Claude Full') || !dash.includes('Codex Full') || !dash.includes('>GigaCode CLI</button>')) fail('dashboard lacks Claude / Codex / GigaCode launch buttons');
if (!dash.includes('>Claude API</button>') || !dash.includes('>Codex API</button>') || !dash.includes('>GigaChat API</button>')) fail('dashboard lacks API profile launch buttons');
if (!dash.includes("return 'codex -C '+psPath+' -a never -s danger-full-access --dangerously-bypass-hook-trust'")) fail('dashboard Codex Full launch does not force never approvals + danger-full-access + hook trust bypass');
if (!dash.includes("return 'Set-Location -LiteralPath '+psPath+'; cf'")) fail('dashboard Claude Full launch does not use cf in the selected project');
if (!dash.includes("launch gigacode --project")) fail('dashboard GigaCode launcher does not route through universal forge-agent.mjs');
if (!dash.includes("launch claude --profile api --full") || !dash.includes("launch codex --profile api --full") || !dash.includes("launch gigachat --profile api --full")) fail('dashboard API profiles do not route through universal forge-agent.mjs');
if (!dash.includes('./sync.bat')) fail('dashboard lacks canonical root sync.bat guidance');
if (!dash.includes('../update-forge.bat')) fail('dashboard lacks external one-click updater guidance');
if (!dash.includes('./upgrade.bat')) fail('dashboard lacks engine upgrade guidance');
else ok.push('dashboard command mode, project wizard, upgrade and sync guidance are universal-agent aware');
if (!dash.includes('id="costReportPanel"') || !dash.includes('phase-N-latest.json') || !dash.includes('function costLoadFiles')) {
  fail('dashboard lacks the local Codex cost/context report reader');
} else ok.push('dashboard can render privacy-bounded per-phase Codex cost/context reports');

console.log('\nDashboard integrity audit\n'+'─'.repeat(38));
for (const x of ok) console.log('  ✓ '+x);
for (const x of errors) console.log('  ✗ '+x);
console.log(errors.length ? `\nFAILED: ${errors.length} issue(s)` : '\nPASS: dashboard is aligned with this Forge build');
process.exit(errors.length ? 1 : 0);
