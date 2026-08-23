#!/usr/bin/env node
/** Codex PreToolUse guard for native Edit, Write and apply_patch Task write scopes. */
import { authorizeTaskWrite } from '../../.claude/skills/status/references/task-scope-guard.mjs';
import { appendForgeDiagnostic } from '../../.claude/hooks/lib/forge-diagnostics.mjs';
import { readHookInput, touchedPaths, writePreToolDeny } from './lib.mjs';

const data = readHookInput();
const projectRoot = data?.cwd || process.cwd();
try {
  const result = authorizeTaskWrite({
    projectRoot,
    paths: touchedPaths(data),
  });
  if (!result.allowed) {
    appendForgeDiagnostic(projectRoot, {
      severity: 'warn', code: 'CODEX_TASK_SCOPE_DENIED', kind: 'policy_guard', source: 'hook', host: 'codex',
      component: 'codex-task-scope', operation: String(data?.tool_name || 'native-write'),
      message: 'Codex native file write was denied by the active durable Task scope.',
      expected: `Write only inside Task ${result.task?.id || process.env.FORGE_TASK_ID || 'unknown'} declared scope.`,
      actual: result.reason, evidence: result.paths,
    });
    writePreToolDeny(result.reason);
    process.exit(0);
  }
} catch (error) {
  appendForgeDiagnostic(projectRoot, {
    severity: 'error', code: 'CODEX_TASK_SCOPE_HOOK_FAILURE', kind: 'hook_failure', source: 'hook', host: 'codex',
    component: 'codex-task-scope', operation: String(data?.tool_name || 'native-write'),
    message: 'Codex Task scope guard could not validate the inherited authority.',
    expected: 'A live durable Task id with unchanged contract provenance.', actual: error?.message || String(error),
  });
  writePreToolDeny(`Forge Task scope: ${error.message}`);
  process.exit(0);
}
