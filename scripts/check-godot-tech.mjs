#!/usr/bin/env node
/** @description Read-only native Godot Phase 5 technical verifier with real window/runtime proof. */
if (!process.argv.includes('--no-report')) process.argv.push('--no-report');
await import('./godot-tech-check.mjs');
