#!/usr/bin/env node
/** Public engine entry point for Project Forge local/private-GitHub lifecycle. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProjectGitCli } from '../.claude/skills/status/references/project-git.mjs';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.exitCode = await runProjectGitCli(process.argv.slice(2), path.dirname(engineRoot));
