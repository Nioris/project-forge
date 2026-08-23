#!/usr/bin/env node
/** Engine entry point for the host-neutral Project Forge durable workflow runtime. */
import { runWorkflowCli } from '../.claude/skills/status/references/workflow-state.mjs';

try { runWorkflowCli(); }
catch (error) {
  console.error(`[X] ${error.message}`);
  process.exitCode = 1;
}
