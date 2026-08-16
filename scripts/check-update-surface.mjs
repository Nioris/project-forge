#!/usr/bin/env node
/** Static integrity gate for the external Windows fleet updater and canonical upgrade/sync wiring. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=process.cwd(); const errors=[]; const ok=[];
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const updater=read('extras/update-forge.bat');
const upgradeBat=read('upgrade.bat');
const upgradePs=read('upgrade.ps1').replace(/^\uFEFF/,'');
const upgradeSh=read('upgrade.sh');

const requireText=(text,re,msg)=>{ if(!re.test(text)) errors.push(msg); };
requireText(updater,/\[version\]\$Matches\.v/i,'updater does not parse semantic versions');
requireText(updater,/Sort-Object V -Descending/i,'updater does not select highest semantic version');
requireText(updater,/DOWNGRADE requested/i,'updater lacks downgrade guard');
requireText(updater,/tar\.exe -xf/i,'updater does not prefer Windows tar.exe for reliable in-place extraction');
requireText(upgradePs,/Get-Content\s+-LiteralPath\s+\$ManifestPath\s+-Encoding\s+UTF8/i,'upgrade.ps1 does not read MANIFEST.txt as explicit UTF-8');
for (const gate of ['backup','upgrade.bat','sync.bat','check-dashboard-meta.mjs','check-codex-compat.mjs','check-drift.mjs','check-sync-status.mjs'])
  requireText(updater,new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),`updater missing gate/step: ${gate}`);
requireText(updater,/if errorlevel 1|if not "!RC!"=="0"/i,'updater does not abort on child failures');
requireText(upgradeBat,/sync\.bat\s+/i,'upgrade.bat does not point at canonical root sync');
if (/scripts\\sync\.bat\s+-Strict/i.test(upgradeBat)) errors.push('upgrade.bat still recommends legacy strict sync path');
for (const [name,text] of [['extras/update-forge.bat',updater],['upgrade.bat',upgradeBat]]) {
  if (/(?<!\r)\n/.test(text)) errors.push(`${name} must use CRLF line endings for cmd.exe`);
}
if (process.platform === 'win32') {
  const probe = spawnSync('cmd.exe', ['/d', '/c', 'upgrade.bat', '/selftest'], { cwd: ROOT, encoding: 'utf8' });
  if (probe.status !== 0 || !probe.stdout.includes('FORGE_UPGRADE_BAT_OK')) {
    errors.push('upgrade.bat cmd.exe self-test failed');
  }
}
for (const [name,text] of [['upgrade.ps1',upgradePs],['upgrade.sh',upgradeSh]]) {
  requireText(text,/sync-dashboard-meta\.mjs/i,`${name} does not refresh dashboard metadata`);
  requireText(text,/sync-codex-adapter\.mjs/i,`${name} does not refresh Codex adapter`);
  for (const oldPhase of ['phase-3-visual','phase-4-tech','phase-5-listing','phase-6-test','phase-7-release','phase-8-live'])
    requireText(text,new RegExp(oldPhase,'i'),`${name} does not clean obsolete skill directory ${oldPhase}`);
  requireText(text,/obsolete-skill-dirs/i,`${name} does not preserve unexpected contents before obsolete-directory cleanup`);
}
requireText(updater,/PF_DISC/i,'updater does not use robust temp-file package discovery');
const cxBat=read('scripts/cx.bat');
const cxSh=read('scripts/cx');
for (const [name,text] of [['scripts/cx.bat',cxBat],['scripts/cx',cxSh]]) {
  requireText(text,/codex/i,`${name} does not launch Codex`);
  requireText(text,/-a never/i,`${name} does not disable approval prompts`);
  requireText(text,/-s danger-full-access/i,`${name} does not request full sandbox access`);
}
if (!errors.length) ok.push('external updater uses semver selection + aborting fleet gates; upgrade paths clean obsolete phase directories and rebuild Codex/dashboard surfaces; full-access Codex launcher is present');
console.log('\nUpdate/upgrade surface audit\n'+'─'.repeat(36));
for(const x of ok) console.log('  ✓ '+x); for(const x of errors) console.log('  ✗ '+x);
console.log(errors.length?`\nFAILED: ${errors.length} issue(s)`:'\nPASS: update surface is coherent');
process.exit(errors.length?1:0);
