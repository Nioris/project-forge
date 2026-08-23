#!/usr/bin/env node
/** Validate AgentContract registry, canonical sources and typed result semantics. */
import path from 'node:path';
import { loadAgentContracts, validateAgentResult } from '../.claude/skills/status/references/agent-contract.mjs';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const ROOT = path.resolve(args.find(arg => !arg.startsWith('-')) || process.cwd());
const failures = [];
function rejectedWithoutThrow(result, contract, label) {
  try {
    if (validateAgentResult(result, contract).length === 0) failures.push(`${label} was accepted`);
  } catch (error) {
    failures.push(`${label} crashed validation: ${error.message}`);
  }
}
let registry;
try { registry = loadAgentContracts(ROOT); }
catch (error) { failures.push(error.message); }

if (registry) {
  for (const kind of ['builder', 'reviewer', 'researcher']) if (!registry.contracts.some(contract => contract.outputKind === kind)) failures.push(`missing ${kind} output contract`);
  const builder = registry.byId.get('builder');
  const validBuilder = {
    schemaVersion: 1, contractId: 'builder', kind: 'builder', status: 'implemented', summary: 'Implemented fixture',
    evidence: ['WorkProgress/demo/index.html'], changedFiles: ['WorkProgress/demo/index.html'],
    acceptanceCovered: ['AC-1'], verificationRequested: ['gacha-integration'],
  };
  if (validateAgentResult(validBuilder, builder).length) failures.push('valid BuilderResult fixture was rejected');
  if (validateAgentResult({ ...validBuilder, changedFiles: [], verificationRequested: ['invented-shell-command'] }, builder).length === 0) failures.push('BuilderResult without a recorded write was accepted');
  rejectedWithoutThrow({ schemaVersion: 1, contractId: 'builder', kind: 'builder', status: 'implemented', summary: 'Incomplete' }, builder,
    'malformed BuilderResult');
  const reviewer = registry.byId.get('code-reviewer');
  const invalidReview = {
    schemaVersion: 1, contractId: 'code-reviewer', kind: 'reviewer', decision: 'approved', summary: 'Looks fine', evidence: ['src/app.js'],
    issues: [{ severity: 'major', file: 'src/app.js', line: 1, rule: 'BUG', problem: 'Broken', suggestedFix: 'Fix it' }],
  };
  if (validateAgentResult(invalidReview, reviewer).length === 0) failures.push('ReviewerResult approved despite a major issue');
  rejectedWithoutThrow({ schemaVersion: 1, contractId: 'code-reviewer', kind: 'reviewer', decision: 'approved', summary: 'Incomplete' }, reviewer,
    'malformed ReviewerResult');
  const researcher = registry.byId.get('sdk-researcher');
  rejectedWithoutThrow({ schemaVersion: 1, contractId: 'sdk-researcher', kind: 'researcher', summary: 'Incomplete' }, researcher,
    'malformed ResearcherResult');
}

const summary = { ok: failures.length === 0, contracts: registry?.contracts.length || 0, kinds: registry ? [...new Set(registry.contracts.map(contract => contract.kind))] : [], failures };
if (JSON_MODE) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`AgentContract audit: ${summary.contracts} declared role(s); kinds ${summary.kinds.join(', ') || 'none'}`);
  for (const contract of registry?.contracts || []) console.log(`  [OK] ${contract.id}: ${contract.kind} / ${contract.taskModes.join(',')} / write=${contract.scope.write.length ? contract.scope.write.join(',') : 'none'}`);
  for (const failure of failures) console.log(`  [X] ${failure}`);
  console.log(failures.length ? `[X] ${failures.length} AgentContract problem(s)` : '[OK] Agent contracts and typed result fixtures pass.');
}
process.exit(failures.length ? 1 : 0);
