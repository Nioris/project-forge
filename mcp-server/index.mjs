#!/usr/bin/env node
/**
 * @file mcp-server/index.mjs
 * @description Project Forge MCP Server (v4.9.0+).
 *
 *   Exposes Forge knowledge to Claude Code, Codex, and other MCP-capable agents via Model Context Protocol.
 *
 *   Use case: User has Forge installed at one location, working на game project
 *   in another folder. With MCP, another agent session can query Forge
 *   skills/invariants/verifiers without copy-paste.
 *
 *   Implementation: Raw JSON-RPC over stdio (no SDK dependency).
 *   The MCP protocol is JSON-RPC 2.0 — a single-file Node implementation
 *   is straightforward and avoids npm install для Forge itself.
 *
 *   If users want the official SDK-based version (with HTTP transport, OAuth,
 *   etc), they can rebuild with `@modelcontextprotocol/sdk` — see README.
 *
 *   Capabilities exposed:
 *     - resources/list: lists all skills, decisions, invariants
 *     - resources/read: read content of a specific skill/decision
 *     - tools/list: lists Forge verifiers as callable tools
 *     - tools/call: invokes a verifier (read-only — never modifies state)
 *     - prompts/list: pre-built workflow prompts (advisor, start, etc.)
 *     - prompts/get: retrieves a prompt template
 *
 *   Configuration: FORGE_PATH env var pointing к Forge install.
 *   Default: parent directory of mcp-server/.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ─────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const FORGE_PATH = process.env.FORGE_PATH || resolve(here, '..');

const SERVER_INFO = {
  name: 'forge',
  version: '0.2.0',
};

const SUPPORTED_PROTOCOL = '2024-11-05';

if (!existsSync(join(FORGE_PATH, '.claude', 'skills'))) {
  log_error(`Forge not found at ${FORGE_PATH}. Set FORGE_PATH env var to Forge install location.`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────
// Logging — to stderr только (stdout reserved для JSON-RPC)
// ─────────────────────────────────────────────────────────────────────────

function log_info(msg) { process.stderr.write(`[forge-mcp] ${msg}\n`); }
function log_error(msg) { process.stderr.write(`[forge-mcp ERROR] ${msg}\n`); }

// ─────────────────────────────────────────────────────────────────────────
// Forge knowledge inventory
// ─────────────────────────────────────────────────────────────────────────

function listSkills() {
  const skillsDir = join(FORGE_PATH, '.claude', 'skills');
  const result = [];
  for (const name of readdirSync(skillsDir)) {
    const skillFile = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    // Extract kind + description from frontmatter
    const content = readFileSync(skillFile, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const fm = fmMatch ? fmMatch[1] : '';
    const kindMatch = fm.match(/^kind:\s*(\S+)/m);
    const descMatch = fm.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
    result.push({
      name,
      uri: `forge://skill/${name}`,
      kind: kindMatch ? kindMatch[1] : 'unknown',
      description: descMatch ? descMatch[1] : '',
    });
  }
  return result;
}

function listDecisions() {
  const dir = join(FORGE_PATH, 'wiki', 'decisions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && /^\d/.test(f))
    .map(f => {
      const filepath = join(dir, f);
      const content = readFileSync(filepath, 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      return {
        name: f.replace(/\.md$/, ''),
        uri: `forge://decision/${f.replace(/\.md$/, '')}`,
        title: titleMatch ? titleMatch[1] : f,
      };
    });
}

function listVerifiers() {
  const dir = join(FORGE_PATH, 'scripts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.startsWith('check-') && f.endsWith('.mjs'))
    .map(f => {
      const filepath = join(dir, f);
      const content = readFileSync(filepath, 'utf-8');
      // Extract @description from JSDoc comment
      const descMatch = content.match(/@description\s+(.+?)(?:\n\s*\*\s*\n|\n\s*\*\/)/s);
      const desc = descMatch ? descMatch[1].replace(/\n\s*\*\s*/g, ' ').trim() : f;
      return {
        name: f.replace(/^check-/, '').replace(/\.mjs$/, ''),
        filepath,
        description: desc.slice(0, 200),
      };
    });
}

function getInvariants() {
  const claudeMd = join(FORGE_PATH, 'CLAUDE.md');
  if (!existsSync(claudeMd)) return [];
  const content = readFileSync(claudeMd, 'utf-8');
  // Extract section between "ARCHITECTURAL INVARIANTS" header and next "##"
  const sectionMatch = content.match(/##\s*🧭\s*ARCHITECTURAL INVARIANTS[\s\S]*?(?=\n##\s)/);
  if (!sectionMatch) return [];
  const section = sectionMatch[0];
  // Extract individual invariants (### N. Title)
  const invariants = [];
  const re = /###\s+(\d+)\.\s+([^\n]+)\n\n([\s\S]*?)(?=###\s+\d+\.|\Z)/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    invariants.push({
      number: parseInt(m[1]),
      title: m[2].trim(),
      body: m[3].trim().slice(0, 500),
    });
  }
  return invariants;
}

// ─────────────────────────────────────────────────────────────────────────
// MCP method handlers
// ─────────────────────────────────────────────────────────────────────────

function handleInitialize(params) {
  return {
    protocolVersion: SUPPORTED_PROTOCOL,
    capabilities: {
      resources: { listChanged: false, subscribe: false },
      tools: { listChanged: false },
      prompts: { listChanged: false },
    },
    serverInfo: SERVER_INFO,
  };
}

function handleResourcesList() {
  const resources = [];

  // Skills as resources
  for (const skill of listSkills()) {
    resources.push({
      uri: skill.uri,
      name: `skill: /${skill.name}`,
      description: skill.description.slice(0, 200),
      mimeType: 'text/markdown',
    });
  }

  // Decisions as resources
  for (const decision of listDecisions()) {
    resources.push({
      uri: decision.uri,
      name: `decision: ${decision.title}`,
      mimeType: 'text/markdown',
    });
  }

  // Architectural invariants as one resource (aggregated)
  resources.push({
    uri: 'forge://invariants',
    name: `Forge Architectural Invariants (${getInvariants().length} permanent rules)`,
    description: `${getInvariants().length} timeless principles distilled from Forge lessons`,
    mimeType: 'text/markdown',
  });

  return { resources };
}

function handleResourcesRead(params) {
  const { uri } = params;
  if (typeof uri !== 'string') throw new Error('uri required');

  // forge://skill/{name}
  const skillMatch = uri.match(/^forge:\/\/skill\/([\w-]+)$/);
  if (skillMatch) {
    const skillFile = join(FORGE_PATH, '.claude', 'skills', skillMatch[1], 'SKILL.md');
    if (!existsSync(skillFile)) throw new Error(`Skill not found: ${skillMatch[1]}`);
    return {
      contents: [{
        uri,
        mimeType: 'text/markdown',
        text: readFileSync(skillFile, 'utf-8'),
      }],
    };
  }

  // forge://decision/{name}
  const decisionMatch = uri.match(/^forge:\/\/decision\/([\w-]+)$/);
  if (decisionMatch) {
    const decFile = join(FORGE_PATH, 'wiki', 'decisions', decisionMatch[1] + '.md');
    if (!existsSync(decFile)) throw new Error(`Decision not found: ${decisionMatch[1]}`);
    return {
      contents: [{
        uri,
        mimeType: 'text/markdown',
        text: readFileSync(decFile, 'utf-8'),
      }],
    };
  }

  // forge://invariants
  if (uri === 'forge://invariants') {
    const invs = getInvariants();
    const text = invs.map(i => `### ${i.number}. ${i.title}\n\n${i.body}`).join('\n\n---\n\n');
    return {
      contents: [{
        uri,
        mimeType: 'text/markdown',
        text: `# Architectural Invariants (Project Forge)\n\n${text}`,
      }],
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

function handleToolsList() {
  const tools = [];
  for (const verifier of listVerifiers()) {
    tools.push({
      name: `check_${verifier.name.replace(/-/g, '_')}`,
      description: verifier.description,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Optional path to project to check (default: current Forge install)',
          },
          json: {
            type: 'boolean',
            description: 'Return JSON output instead of human-readable',
          },
        },
      },
    });
  }
  return { tools };
}

function handleToolsCall(params) {
  const { name, arguments: args } = params;
  if (typeof name !== 'string') throw new Error('name required');

  // Match check_X_Y_Z back to check-X-Y-Z.mjs
  if (!name.startsWith('check_')) throw new Error(`Unknown tool: ${name}`);
  const verifierName = name.slice(6).replace(/_/g, '-');
  const filepath = join(FORGE_PATH, 'scripts', `check-${verifierName}.mjs`);
  if (!existsSync(filepath)) throw new Error(`Verifier not found: check-${verifierName}.mjs`);

  // Build args
  const cmdArgs = [filepath];
  if (args && typeof args.path === 'string') cmdArgs.push(args.path);
  if (args && args.json === true) cmdArgs.push('--json');

  // Execute
  const result = spawnSync('node', cmdArgs, {
    encoding: 'utf-8',
    timeout: 30000,
    cwd: FORGE_PATH, // verifiers resolve paths relative to cwd — must run from Forge root
  });

  return {
    content: [{
      type: 'text',
      text: [
        `Exit code: ${result.status}`,
        result.stdout ? `STDOUT:\n${result.stdout}` : '',
        result.stderr ? `STDERR:\n${result.stderr}` : '',
      ].filter(Boolean).join('\n\n'),
    }],
    isError: result.status !== 0,
  };
}

function handlePromptsList() {
  return {
    prompts: [
      {
        name: 'forge_advisor',
        description: 'Forge advisor pattern — context-aware suggestion of which skill to invoke for a given task',
        arguments: [
          { name: 'task', description: 'What the user wants to do', required: true },
        ],
      },
      {
        name: 'forge_start_project',
        description: 'Bootstrap new project with Forge architectural foundation chain',
        arguments: [
          { name: 'description', description: 'Plain-language description of project', required: true },
          { name: 'category', description: 'productivity | tools | health | finance | business | saas | education | social | game', required: false },
        ],
      },
      {
        name: 'forge_apply_invariants',
        description: `Review code/design against Forge ${getInvariants().length} Architectural Invariants`,
        arguments: [
          { name: 'context', description: 'What is being reviewed (file path or description)', required: true },
        ],
      },
      {
        name: 'forge_ai_studio',
        description: 'Phase-aware AI Studio orchestration: agents, prompt packs, Image Studio and Visual QA without creating a 10th phase',
        arguments: [
          { name: 'goal', description: 'Production goal to execute', required: true },
          { name: 'phase', description: 'Current canonical phase number 1..9', required: false },
        ],
      },
    ],
  };
}

function handlePromptsGet(params) {
  const { name, arguments: args } = params;

  if (name === 'forge_advisor') {
    const task = (args && args.task) || '<no task provided>';
    return {
      description: 'Forge advisor for selecting the right skill',
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: (() => { const skills = listSkills(); const architectural = skills.filter(s => s.kind === 'architectural').length; const tactical = skills.filter(s => s.kind === 'tactical').length; return `User wants to: ${task}\n\nUsing Forge knowledge (${skills.length} skills available, ${architectural} architectural + ${tactical} tactical), recommend:\n1. Which architectural skill to invoke FIRST (if any apply)\n2. Which tactical skills to chain после foundation\n3. Which verifiers to run\n\nIf user description does not match existing skills, suggest the find-or-make-skill workflow.`; })(),
        },
      }],
    };
  }

  if (name === 'forge_start_project') {
    const description = (args && args.description) || '<no description>';
    const category = (args && args.category) || 'unknown';
    return {
      description: 'Forge project bootstrap',
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Bootstrap a new project using Forge methodology.\n\nDescription: ${description}\nCategory: ${category}\n\nFollow /start skill workflow:\n1. Workspace setup (3-folder discipline — see Invariant #3)\n2. Research references (Phase 0a)\n3. Tech stack selection\n4. Wiki skeleton\n5. Skills loaded\n6. i18n foundation (mandatory)\n6.6. Architectural Foundation Chain (per category):\n     - app-data-model, app-permissions, app-onboarding-flow, subscription-design\n     - + per-category foundation if applicable (health/finance/business/saas/education/social)\n7. Build first feature\n\nApply all current Forge Architectural Invariants throughout.`,
        },
      }],
    };
  }

  if (name === 'forge_ai_studio') {
    const goal = (args && args.goal) || '<no goal>';
    const phaseRaw = Number((args && args.phase) || 0);
    const phase = Number.isInteger(phaseRaw) && phaseRaw >= 1 && phaseRaw <= 9 ? phaseRaw : null;
    return {
      description: 'Forge AI Studio phase-aware production prompt',
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Execute this goal with Forge AI Studio: ${goal}

Current canonical phase: ${phase || 'detect from project artifacts'} of 9.
Do NOT invent Phase 10 and do NOT bypass phase STOP-points.
Use /studio (Codex: $studio) as the director. Delegate only independent workstreams with disjoint file ownership.
When visuals are required: prompt-compiler -> image-studio -> art-director -> visual-qa.
Prefer native Codex ImageGen interactively; use the direct OpenAI batch helper only when explicitly suitable and configured.
Return changed artifacts, verifier results, and any human decision that still blocks the current phase.`,
        },
      }],
    };
  }

  if (name === 'forge_apply_invariants') {
    const context = (args && args.context) || '<no context>';
    const invs = getInvariants();
    const invList = invs.map(i => `${i.number}. ${i.title}`).join('\n');
    return {
      description: 'Review against Forge invariants',
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Review the following against Forge ${invs.length} Architectural Invariants:\n\n${context}\n\n${invs.length} invariants:\n${invList}\n\nFor each invariant — say PASS / FAIL / N/A with a brief reason. Highlight any FAIL with a concrete fix suggestion.`,
        },
      }],
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
}

// ─────────────────────────────────────────────────────────────────────────
// JSON-RPC dispatcher
// ─────────────────────────────────────────────────────────────────────────

const handlers = {
  'initialize': handleInitialize,
  'initialized': () => ({}),  // notification, no response
  'resources/list': handleResourcesList,
  'resources/read': handleResourcesRead,
  'tools/list': handleToolsList,
  'tools/call': handleToolsCall,
  'prompts/list': handlePromptsList,
  'prompts/get': handlePromptsGet,
};

function handleMessage(message) {
  const { method, params, id } = message;

  if (!handlers[method]) {
    return {
      jsonrpc: '2.0',
      id: id !== undefined ? id : null,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  }

  try {
    const result = handlers[method](params || {});
    // Notification (no id) → no response
    if (id === undefined && method === 'initialized') return null;
    return {
      jsonrpc: '2.0',
      id: id !== undefined ? id : null,
      result,
    };
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id: id !== undefined ? id : null,
      error: {
        code: -32603,
        message: err.message || String(err),
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// stdio transport — JSON-RPC line-delimited
// ─────────────────────────────────────────────────────────────────────────

let buffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';  // last line maybe incomplete
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const message = JSON.parse(trimmed);
      const response = handleMessage(message);
      if (response !== null) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err) {
      log_error(`Failed to parse message: ${err.message}`);
    }
  }
});

process.stdin.on('end', () => {
  log_info('stdin closed, shutting down');
  process.exit(0);
});

log_info(`forge-mcp v${SERVER_INFO.version} running on stdio (FORGE_PATH=${FORGE_PATH})`);
