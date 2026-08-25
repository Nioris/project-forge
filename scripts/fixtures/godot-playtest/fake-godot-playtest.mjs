#!/usr/bin/env node
/** Hostile fixture only. Production code never treats this process as native evidence. */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const mode = process.env.FORGE_GODOT_PLAYTEST_FIXTURE_MODE || 'pass';
const option = name => {
  const value = args.find(item => item.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : '';
};

if (args.includes('--version')) {
  console.log('4.7.playtest.fixture');
  process.exit(0);
}
if (mode === 'timeout') {
  setTimeout(() => process.exit(0), 120_000);
} else if (mode === 'environment') {
  console.error('ERROR: failed to create display window');
  process.exit(2);
} else {
  const runMode = option('forge-playtest-mode');
  const output = option('forge-playtest-report');
  const contract = option('forge-playtest-contract');
  if (mode === 'runtime-error') {
    console.error('SCRIPT ERROR: forged runtime error');
    process.exit(2);
  }
  if (!output) {
    console.error('FORGE_PLAYTEST_ERROR: output missing');
    process.exit(2);
  }
  if (mode === 'stale-source' && contract) {
    fs.appendFileSync(path.join(path.dirname(contract), 'project.godot'), '\n# hostile fixture mutation\n');
  }
  const value = {
    protocol: 'forge-godot-playtest-v1',
    mode: runMode,
    testHarness: mode === 'harness-report-rejected',
    renderer: {
      headless: mode === 'headless-renderer',
      displayServer: mode === 'dummy-renderer' ? 'Dummy' : 'Windows',
      viewport: { width: mode === 'empty-viewport' ? 0 : 480, height: mode === 'empty-viewport' ? 0 : 270 },
      window: { width: mode === 'empty-window' ? 0 : 480, height: mode === 'empty-window' ? 0 : 270 },
    },
  };
  if (runMode === 'tech') {
    Object.assign(value, {
      actions: mode !== 'missing-action',
      methods: true,
      userDataWritten: true,
    });
  } else if (runMode === 'save') {
    Object.assign(value, {
      initial: { hp: 1 },
      steps: mode === 'missing-action' ? [
        { action: 'move_left', state: { hp: 2 } },
      ] : [
        { action: 'move_left', state: { hp: 2 } },
        { action: 'move_right', state: { hp: mode === 'state-mismatch' ? 999 : 3 } },
      ],
      progress: { hp: mode === 'no-progress' ? 2 : 3 },
      saved: mode !== 'save-failure',
    });
  } else if (runMode === 'reload') {
    Object.assign(value, {
      loaded: mode !== 'reload-failure',
      state: { hp: mode === 'reload-failure' ? 1 : 3 },
    });
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(value));
  console.log('FORGE_PLAYTEST_PROTOCOL:forge-godot-playtest-v1');
}
