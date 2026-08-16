/**
 * @file block-dangerous.mjs
 * @description PreToolUse:Bash hook — blocks dangerous commands.
 * @input  JSON via stdin
 * @output exit 0 = allow, exit 2 = block
 */

import { readFileSync } from 'fs';

function run() {
  try {
    let raw = '';
    try { raw = readFileSync(0, 'utf-8'); } catch {}
    if (!raw) process.exit(0);

    const data = JSON.parse(raw);
    const command = String(data.tool_input?.command || '');
    if (!command) process.exit(0);

    const blockPatterns = [
      /rm\s+-rf\s+\//,
      /rm\s+-rf\s+\*/,
      /dd\s+if=/,
      /mkfs\./,
      /:\(\)\{\s*:\|:\s*&\s*\}/,
      />\s*\/dev\/sd/,
      /chmod\s+-R\s+777\s+\//,
    ];

    for (const pattern of blockPatterns) {
      if (pattern.test(command)) {
        process.stderr.write(`BLOCKED: Dangerous command detected: ${command}\n`);
        process.exit(2);
      }
    }

    if (/rm\s+-rf\s+[^.]/.test(command)) {
      process.stderr.write('WARNING: Recursive delete detected. Proceeding with caution.\n');
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

run();
