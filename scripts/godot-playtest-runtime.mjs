#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { combinedOutput, detectGodotVisualTool, godotErrorLines, isolatedGodotUserEnv, isVisualEnvironmentFailure, makeIsolatedGodotCopy, runBounded, snapshotGodotVisualInputs } from './godot-visual-runtime.mjs';
export { combinedOutput, detectGodotVisualTool, godotErrorLines, isVisualEnvironmentFailure, makeIsolatedGodotCopy, runBounded, snapshotGodotVisualInputs };
export function runId() { return `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex')}`; }
export function isolatedUserEnv(root) {
  return isolatedGodotUserEnv(root);
}
export function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
export function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
