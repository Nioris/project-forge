/**
 * @file workspace-discipline.mjs
 * @description PreToolUse:Write/Edit/MultiEdit hook — enforces Forge workspace rule.
 *
 *   Forge architecture (CLAUDE.md):
 *     GameIntegration/  -- raw user-dropped sources (READ-ONLY)
 *     WorkProgress/{P}/ -- ALL active work happens here (writeable)
 *     Release/{P}/{plat}/ -- final builds (READ-ONLY, only release-* skills write here)
 *
 *   This hook blocks Write/Edit/MultiEdit operations on paths inside
 *   GameIntegration/ or Release/ (with subpath check). Allows everything else.
 *
 *   Bypass: set FORGE_ALLOW_PROTECTED_WRITE=1 (e.g. when release skill genuinely needs to write Release/).
 *
 * @input  JSON via stdin (contains tool_input with file path)
 * @output exit 0 = allow, exit 2 = block with stderr message
 */

import { readFileSync } from 'fs';
import path from 'path';

function run() {
  try {
    // Bypass switch — for release-* skills, manual overrides
    if (process.env.FORGE_ALLOW_PROTECTED_WRITE === '1') process.exit(0);

    let raw = '';
    try { raw = readFileSync(0, 'utf-8'); } catch {}
    if (!raw) process.exit(0);

    let data;
    try { data = JSON.parse(raw); } catch { process.exit(0); }

    // Extract file path from tool_input — varies by tool
    const filePath = data.tool_input?.file_path
                  || data.tool_input?.path
                  || data.tool_input?.filePath
                  || '';
    if (!filePath) process.exit(0);

    // Normalize: forward slashes, lowercase for matching, but keep original for messages
    const normalized = filePath.replace(/\\/g, '/');
    const lower = normalized.toLowerCase();

    // Match GameIntegration/* or Release/* anywhere in the path
    // We check segments to avoid false positives like "MyGameIntegration"
    const segments = lower.split('/').filter(Boolean);

    const isGameIntegration = segments.includes('gameintegration');
    const isRelease = segments.includes('release');

    if (!isGameIntegration && !isRelease) {
      process.exit(0);  // path is fine
    }

    // Special case: Release/ at PROJECT root level is sometimes a single user-named folder.
    // Only block if Release/ has a subpath (i.e. Release/{Project}/...).
    // GameIntegration/ — always read-only regardless of depth.
    if (isRelease && !isGameIntegration) {
      const releaseIdx = segments.indexOf('release');
      // segments after 'release' is empty or has only 1 thing → might be top-level placeholder
      const afterRelease = segments.length - releaseIdx - 1;
      if (afterRelease === 0) process.exit(0);  // just touching Release/ itself, allow
    }

    // Build helpful error message
    const which = isGameIntegration ? 'GameIntegration/' : 'Release/';
    const correctTarget = isGameIntegration
      ? 'WorkProgress/{ProjectName}/ (copy from GameIntegration/ first)'
      : 'WorkProgress/{ProjectName}/ — release skills will produce final builds in Release/{Project}/{platform}/ when /release-* runs';

    process.stderr.write(`\n`);
    process.stderr.write(`╔════════════════════════════════════════════════════════════╗\n`);
    process.stderr.write(`║  WORKSPACE DISCIPLINE VIOLATION                            ║\n`);
    process.stderr.write(`╚════════════════════════════════════════════════════════════╝\n`);
    process.stderr.write(`\n`);
    process.stderr.write(`Blocked write to ${which}\n`);
    process.stderr.write(`  Path: ${filePath}\n`);
    process.stderr.write(`\n`);
    process.stderr.write(`Forge rule (CLAUDE.md): ALL active work happens in WorkProgress/{Project}/.\n`);
    process.stderr.write(`  GameIntegration/ — read-only source materials (user drops files here)\n`);
    process.stderr.write(`  WorkProgress/    — your active workspace (copy + edit here)\n`);
    process.stderr.write(`  Release/         — only /release-* skills write here at end of pipeline\n`);
    process.stderr.write(`\n`);
    process.stderr.write(`What to do:\n`);
    process.stderr.write(`  1. If first time touching this project: copy GameIntegration/{X}/ to WorkProgress/{X}/\n`);
    process.stderr.write(`     bash:   cp -r GameIntegration/{X} WorkProgress/{X}\n`);
    process.stderr.write(`     pwsh:   Copy-Item -Recurse GameIntegration\\{X} WorkProgress\\{X}\n`);
    process.stderr.write(`  2. Then edit ${correctTarget}\n`);
    process.stderr.write(`\n`);
    process.stderr.write(`Bypass (only if you ABSOLUTELY know what you're doing):\n`);
    process.stderr.write(`  set FORGE_ALLOW_PROTECTED_WRITE=1\n`);
    process.stderr.write(`\n`);

    process.exit(2);
  } catch (e) {
    // Hook errors must not block work
    process.stderr.write(`workspace-discipline hook error (allowing): ${e.message}\n`);
    process.exit(0);
  }
}

run();
