#!/usr/bin/env node
/** Public CLI for the Forge local security vault. It never prints a secret. */
import { forgeDataRoot, getPublisherProfile, initializeProjectSecurity, publicStatus, setPublisherProfile, validateProjectSecurity } from './lib/forge-security-vault.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'status';
const projectAt = args.indexOf('--project');
const project = projectAt >= 0 ? args[projectAt + 1] : process.cwd();
function safeRun(action) {
  try { return action(); }
  catch (error) { console.error(`[X] ${error?.code || 'FORGE_SECURITY_FAILED'}`); process.exitCode = 1; return null; }
}
if (command === 'profile' && args[1] === 'set-publisher') {
  const value = args[2]; const result = safeRun(() => setPublisherProfile(value));
  if (result) console.log(`[OK] Publisher namespace configured: ${result.publisherNamespace}`);
} else if (command === 'profile' && args[1] === 'status') {
  const result = safeRun(() => getPublisherProfile()); if (result) console.log(JSON.stringify(result));
} else if (command === 'init') {
  const result = safeRun(() => initializeProjectSecurity({ projectRoot: project })); if (result) console.log(JSON.stringify(result));
} else if (command === 'status') {
  const result = safeRun(() => publicStatus({ projectRoot: project })); if (result) console.log(JSON.stringify(result));
} else if (command === 'validate') {
  const result = safeRun(() => validateProjectSecurity({ projectRoot: project })); if (result) console.log(JSON.stringify(result));
} else {
  console.error('Usage: forge-security.mjs profile set-publisher <com.publisher> | profile status | init [--project <dir>] | status [--project <dir>] | validate [--project <dir>]');
  process.exitCode = 2;
}
// Keep the imported resolver reachable to static audits without exposing its path in normal output.
void forgeDataRoot;
