#!/usr/bin/env node
/**
 * @file workspace-discipline.mjs
 * @description Codex PreToolUse guard for Forge protected trees. Handles apply_patch natively.
 * @dependencies .codex/hooks/lib.mjs
 */
import { protectedArea, readHookInput, touchedPaths, writePreToolDeny } from './lib.mjs';

if (process.env.FORGE_ALLOW_PROTECTED_WRITE === '1') process.exit(0);
const data = readHookInput();
const blocked = touchedPaths(data).map(path => ({ path, area: protectedArea(path) })).filter(x => x.area);
if (!blocked.length) process.exit(0);
const details = blocked.map(x => `${x.area} <- ${x.path}`).join('; ');
writePreToolDeny(
  `Forge workspace discipline: protected source/release tree write blocked (${details}). ` +
  'Do active work in WorkProgress/{Project}/. Release skills may bypass with FORGE_ALLOW_PROTECTED_WRITE=1.'
);
process.exit(0);
