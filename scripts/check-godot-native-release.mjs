#!/usr/bin/env node
/** @description Read-only Godot Phase 8 verifier for trusted immutable Windows release bundles. */
if (!process.argv.includes('--no-report')) process.argv.push('--no-report');
await import('./godot-release-verify.mjs');
