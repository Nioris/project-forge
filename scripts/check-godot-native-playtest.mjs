#!/usr/bin/env node
/** @description Read-only two-process Godot Phase 7 playtest for input, progression, save, and reload. */
if (!process.argv.includes('--no-report')) process.argv.push('--no-report');
await import('./godot-playtest.mjs');

