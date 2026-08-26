#!/usr/bin/env node
/** Hostile fixture only. Production code never treats this process as native evidence. */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const mode = process.env.FORGE_GODOT_PLAYTEST_FIXTURE_MODE || 'pass';
const certificateNoise = mode.startsWith('certificate-');
const behaviorMode = certificateNoise
  ? (mode.slice('certificate-'.length) === 'noise' ? 'pass' : mode.slice('certificate-'.length))
  : mode;
if (certificateNoise) console.error('ERROR: Failed to read the root certificate store.');
const option = name => {
  const value = args.find(item => item.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : '';
};

if (args.includes('--version')) {
  console.log('4.7.playtest.fixture');
  process.exit(0);
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

if (process.env.FORGE_GODOT_REQUIRE_ISOLATED_USER_ENV === '1') {
  const runtimeRoot = path.dirname(path.resolve(process.cwd()));
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME']) {
    const directory = String(process.env[key] || '').trim();
    if (!directory || !inside(runtimeRoot, directory)) {
      console.error(`ERROR: ${key} escaped isolated Godot runtime`);
      process.exit(41);
    }
  }
}

if (process.env.FORGE_GODOT_EXPECT_CLASS_CACHE) {
  const cache = path.join(process.cwd(), '.godot', 'global_script_class_cache.cfg');
  let cacheText = '';
  try { cacheText = fs.readFileSync(cache, 'utf8'); } catch {}
  if (!cacheText.includes(`"class": &"${process.env.FORGE_GODOT_EXPECT_CLASS_CACHE}"`)) {
    console.error('ERROR: isolated GDScript class cache is missing');
    process.exit(43);
  }
}
if (behaviorMode === 'timeout') {
  setTimeout(() => process.exit(0), 120_000);
} else if (behaviorMode === 'environment') {
  console.error('ERROR: failed to create display window');
  process.exit(2);
} else {
  const runMode = option('forge-playtest-mode');
  const output = option('forge-playtest-report');
  const contract = option('forge-playtest-contract');
  if (behaviorMode === 'runtime-error') {
    console.error('SCRIPT ERROR: forged runtime error');
    process.exit(2);
  }
  if (!output) {
    console.error('FORGE_PLAYTEST_ERROR: output missing');
    process.exit(2);
  }
  if (behaviorMode === 'stale-source' && contract) {
    fs.appendFileSync(path.join(path.dirname(contract), 'project.godot'), '\n# hostile fixture mutation\n');
  }
  const value = {
    protocol: 'forge-godot-playtest-v1',
    mode: runMode,
    testHarness: behaviorMode === 'harness-report-rejected',
    renderer: {
      headless: behaviorMode === 'headless-renderer',
      displayServer: behaviorMode === 'dummy-renderer' ? 'Dummy' : 'Windows',
      viewport: { width: behaviorMode === 'empty-viewport' ? 0 : 480, height: behaviorMode === 'empty-viewport' ? 0 : 270 },
      window: { width: behaviorMode === 'empty-window' ? 0 : 480, height: behaviorMode === 'empty-window' ? 0 : 270 },
    },
  };
  if (runMode === 'tech') {
    Object.assign(value, {
      actions: behaviorMode !== 'missing-action',
      methods: true,
      userDataWritten: true,
    });
  } else if (runMode === 'save') {
    Object.assign(value, {
      initial: { hp: 1 },
      steps: behaviorMode === 'missing-action' ? [
        { action: 'move_left', state: { hp: 2 } },
      ] : [
        { action: 'move_left', state: { hp: 2 } },
        { action: 'move_right', state: { hp: behaviorMode === 'state-mismatch' ? 999 : 3 } },
      ],
      progress: { hp: behaviorMode === 'no-progress' ? 2 : 3 },
      saved: behaviorMode !== 'save-failure',
    });
  } else if (runMode === 'reload') {
    Object.assign(value, {
      loaded: behaviorMode !== 'reload-failure',
      state: { hp: behaviorMode === 'reload-failure' ? 1 : 3 },
    });
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(value));
  console.log('FORGE_PLAYTEST_PROTOCOL:forge-godot-playtest-v1');
}
