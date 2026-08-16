#!/usr/bin/env node
/**
 * @file test.mjs
 * @description Smoke test for forge-mcp server.
 *              Spawns server, sends JSON-RPC messages, verifies responses.
 */

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, 'index.mjs');
const FORGE_PATH = resolve(here, '..');

let tests = 0, fails = 0;
function ok(label, cond, detail) {
  tests++;
  if (cond) console.log(`  ✓ ${label}`);
  else { console.log(`  ✗ ${label}` + (detail ? `: ${detail}` : '')); fails++; }
}

async function runServerSession(messages) {
  return new Promise((resolveFn, rejectFn) => {
    const proc = spawn('node', [SERVER], {
      env: { ...process.env, FORGE_PATH },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', rejectFn);
    proc.on('exit', code => {
      const lines = stdout.trim().split('\n').filter(Boolean);
      const responses = lines.map(l => {
        try { return JSON.parse(l); } catch { return { _parseError: l }; }
      });
      resolveFn({ exitCode: code, responses, stderr });
    });

    // Send messages
    for (const m of messages) {
      proc.stdin.write(JSON.stringify(m) + '\n');
    }
    // Give server time to respond, then close stdin
    setTimeout(() => proc.stdin.end(), 500);
  });
}

console.log('=== forge-mcp test ===\n');

// Test 1: initialize
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  ]);
  const r = responses[0];
  ok('initialize returns serverInfo', r && r.result && r.result.serverInfo && r.result.serverInfo.name === 'forge');
  ok('initialize returns protocolVersion', r && r.result && r.result.protocolVersion);
  ok('initialize returns capabilities', r && r.result && r.result.capabilities);
}

// Test 2: resources/list
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'resources/list', params: {} },
  ]);
  const r = responses.find(x => x.id === 2);
  ok('resources/list responds', r && r.result && Array.isArray(r.result.resources));
  if (r && r.result) {
    const skillCount = r.result.resources.filter(x => x.uri.startsWith('forge://skill/')).length;
    const decisionCount = r.result.resources.filter(x => x.uri.startsWith('forge://decision/')).length;
    ok(`resources/list has ≥95 skills (got ${skillCount})`, skillCount >= 95);
    ok(`resources/list has ≥12 decisions (got ${decisionCount})`, decisionCount >= 12);
    ok('resources/list has invariants', r.result.resources.some(x => x.uri === 'forge://invariants'));
  }
}

// Test 3: resources/read — skill
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'forge://skill/i18n-foundation' } },
  ]);
  const r = responses.find(x => x.id === 2);
  ok('resources/read returns skill content', r && r.result && r.result.contents && r.result.contents[0].text.includes('i18n-foundation'));
}

// Test 4: resources/read — decision
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'forge://decision/011-wiki-audit-mtime-tolerance' } },
  ]);
  const r = responses.find(x => x.id === 2);
  ok('resources/read returns decision content', r && r.result && r.result.contents && r.result.contents[0].text.includes('mtime tolerance'));
}

// Test 5: resources/read — invariants
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'forge://invariants' } },
  ]);
  const r = responses.find(x => x.id === 2);
  ok('resources/read invariants', r && r.result && r.result.contents && r.result.contents[0].text.includes('Architectural Invariants'));
}

// Test 6: tools/list
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);
  const r = responses.find(x => x.id === 2);
  ok('tools/list responds', r && r.result && Array.isArray(r.result.tools));
  if (r && r.result) {
    ok(`tools/list has >= 18 verifiers (got ${r.result.tools.length})`, r.result.tools.length >= 18);
    ok('tools/list has check_cross_refs', r.result.tools.some(t => t.name === 'check_cross_refs'));
  }
}

// Test 7: tools/call — invoke real verifier
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
      name: 'check_cross_refs',
      arguments: {},
    }},
  ]);
  const r = responses.find(x => x.id === 2);
  ok('tools/call returns content', r && r.result && r.result.content && r.result.content[0].text);
  if (r && r.result) {
    ok('tools/call output mentions advisor', r.result.content[0].text.includes('advisor'));
  }
}

// Test 8: prompts/list
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'prompts/list', params: {} },
  ]);
  const r = responses.find(x => x.id === 2);
  ok('prompts/list returns >= 4 prompts', r && r.result && r.result.prompts && r.result.prompts.length >= 4);
  if (r && r.result) ok('prompts/list has forge_ai_studio', r.result.prompts.some(p => p.name === 'forge_ai_studio'));
}

// Test 9: prompts/get — forge_advisor
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'prompts/get', params: {
      name: 'forge_advisor',
      arguments: { task: 'localize my game to 13 languages' },
    }},
  ]);
  const r = responses.find(x => x.id === 2);
  ok('prompts/get returns messages', r && r.result && r.result.messages && r.result.messages[0]);
  if (r && r.result) {
    ok('prompts/get includes user task', r.result.messages[0].content.text.includes('localize my game'));
  }
}

// Test 10: prompts/get — forge_ai_studio
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'prompts/get', params: {
      name: 'forge_ai_studio',
      arguments: { goal: 'build and visually verify a boss encounter', phase: '4' },
    }},
  ]);
  const r = responses.find(x => x.id === 2);
  ok('forge_ai_studio prompt returns messages', r && r.result && r.result.messages && r.result.messages[0]);
  if (r && r.result) {
    ok('forge_ai_studio preserves 9-phase discipline', r.result.messages[0].content.text.includes('Do NOT invent Phase 10'));
    ok('forge_ai_studio includes goal', r.result.messages[0].content.text.includes('boss encounter'));
  }
}

// Test 11: error handling
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'forge://skill/nonexistent-skill' } },
  ]);
  const r = responses.find(x => x.id === 2);
  ok('error returned for missing skill', r && r.error && r.error.message.includes('not found'));
}

// Test 12: unknown method
{
  const { responses } = await runServerSession([
    { jsonrpc: '2.0', id: 1, method: 'unknown/method', params: {} },
  ]);
  const r = responses.find(x => x.id === 1);
  ok('error -32601 for unknown method', r && r.error && r.error.code === -32601);
}

console.log(`\n${fails === 0 ? '✓' : '✗'} ${tests - fails}/${tests} tests passed`);
process.exit(fails === 0 ? 0 : 1);
