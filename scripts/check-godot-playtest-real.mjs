#!/usr/bin/env node
/** Optional real-engine forward-test for Q3-007. Requires FORGE_GODOT_BIN. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const godot = String(process.env.FORGE_GODOT_BIN || '').trim();
if (!godot || !fs.existsSync(godot)) {
  console.error('[ENV] FORGE_GODOT_BIN must point to a real Godot 4 editor');
  process.exit(2);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-q3-007-real-'));
const canonicalTemp = path.resolve(os.tmpdir());
if (!path.resolve(temp).startsWith(canonicalTemp + path.sep)) {
  console.error('[X] Refusing an unexpected forward-test directory');
  process.exit(2);
}

function write(relative, content) {
  const file = path.join(temp, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function json(relative, value) {
  write(relative, JSON.stringify(value, null, 2) + '\n');
}

function run(script) {
  const child = spawnSync(process.execPath, [path.join(root, 'scripts', script), temp, '--json'], {
    cwd: root,
    env: { ...process.env, FORGE_GODOT_BIN: godot, FORGE_ALLOW_TEST_HARNESS: '', FORGE_GODOT_TEST_SHIM: '' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 150_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  let value = null;
  try { value = JSON.parse(child.stdout || ''); } catch {}
  return { child, value };
}

try {
  json('forge.engine.json', { schemaVersion: 1, kind: 'forge.engine-profile', engine: 'godot' });
  json('forge.godot.json', {
    schemaVersion: 1,
    kind: 'forge.godot-project',
    projectPath: '.',
    scripting: 'gdscript',
    entryScene: 'res://Main.tscn',
    smoke: { successMarker: 'FORGE_REAL_READY', quitAfterFrames: 10 },
    sceneContract: {
      minimumNodeCount: 3,
      requiredNodes: ['Main', 'Main/Background', 'Main/Status'],
      requiredNodeTypes: { Main: 'Node2D', 'Main/Background': 'ColorRect', 'Main/Status': 'Label' },
      requiredScripts: ['res://Main.gd'],
      requiredScriptAttachments: { Main: 'res://Main.gd' },
    },
  });
  json('forge.godot.playtest.json', {
    schemaVersion: 1,
    kind: 'forge.godot-playtest',
    adapter: {
      autoloadName: 'ForgePlaytestQA',
      protocol: 'forge-godot-playtest-v1',
      script: 'res://ForgePlaytestQA.gd',
      targetNode: '.',
    },
    timeoutSeconds: 30,
    scenario: {
      initialExpect: { hp: 1 },
      steps: [
        { action: 'move_left', expect: { hp: 2 } },
        { action: 'move_right', expect: { hp: 3 } },
      ],
      progress: { hp: 3 },
      saveReload: { hp: 3 },
    },
  });
  fs.copyFileSync(path.join(root, 'templates', 'godot', 'ForgePlaytestQA.gd'), path.join(temp, 'ForgePlaytestQA.gd'));
  write('project.godot', [
    'config_version=5',
    '',
    '[application]',
    'config/name="Forge Q3-007 Real"',
    'run/main_scene="res://Main.tscn"',
    '',
    '[autoload]',
    'ForgePlaytestQA="*res://ForgePlaytestQA.gd"',
    '',
    '[display]',
    'window/size/viewport_width=480',
    'window/size/viewport_height=270',
    'window/size/window_width_override=480',
    'window/size/window_height_override=270',
    '',
    '[input]',
    'move_left={',
    '"deadzone": 0.5,',
    '"events": []',
    '}',
    'move_right={',
    '"deadzone": 0.5,',
    '"events": []',
    '}',
    '',
    '[rendering]',
    'renderer/rendering_method="gl_compatibility"',
    'renderer/rendering_method.mobile="gl_compatibility"',
    '',
  ].join('\n'));
  write('Main.tscn', [
    '[gd_scene load_steps=2 format=3]',
    '',
    '[ext_resource type="Script" path="res://Main.gd" id="1_main"]',
    '',
    '[node name="Main" type="Node2D"]',
    'script = ExtResource("1_main")',
    '',
    '[node name="Background" type="ColorRect" parent="."]',
    'offset_right = 480.0',
    'offset_bottom = 270.0',
    'color = Color(0.05, 0.08, 0.14, 1)',
    '',
    '[node name="Status" type="Label" parent="."]',
    'offset_left = 96.0',
    'offset_top = 112.0',
    'offset_right = 384.0',
    'offset_bottom = 158.0',
    'theme_override_font_sizes/font_size = 24',
    'text = "Project Forge native QA"',
    'horizontal_alignment = 1',
    '',
  ].join('\n'));
  write('Main.gd', [
    'extends Node2D',
    '',
    'var hp: int = 1',
    '',
    'func _ready() -> void:',
    '\tprint("FORGE_REAL_READY")',
    '',
    'func _process(_delta: float) -> void:',
    '\tif Input.is_action_just_pressed("move_left"):',
    '\t\thp += 1',
    '\tif Input.is_action_just_pressed("move_right"):',
    '\t\thp += 1',
    '',
    'func forge_playtest_state() -> Dictionary:',
    '\treturn {"hp": hp}',
    '',
    'func forge_playtest_reset() -> void:',
    '\thp = 1',
    '',
    'func forge_playtest_save() -> bool:',
    '\tvar file := FileAccess.open("user://forge-real-save.json", FileAccess.WRITE)',
    '\tif file == null:',
    '\t\treturn false',
    '\tfile.store_string(JSON.stringify(forge_playtest_state()))',
    '\tfile.close()',
    '\treturn true',
    '',
    'func forge_playtest_load() -> bool:',
    '\tif not FileAccess.file_exists("user://forge-real-save.json"):',
    '\t\treturn false',
    '\tvar parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("user://forge-real-save.json"))',
    '\tif not parsed is Dictionary or not parsed.has("hp"):',
    '\t\treturn false',
    '\thp = int(parsed.hp)',
    '\treturn true',
    '',
  ].join('\n'));

  const sourceBefore = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(temp, 'Main.gd')))
    .update(fs.readFileSync(path.join(temp, 'project.godot')))
    .digest('hex');
  const tech = run('godot-tech-check.mjs');
  const playtest = run('godot-playtest.mjs');
  const sourceAfter = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(temp, 'Main.gd')))
    .update(fs.readFileSync(path.join(temp, 'project.godot')))
    .digest('hex');
  const usableRenderer = proof => proof?.headless === false
    && typeof proof?.displayServer === 'string' && proof.displayServer.trim().length > 0
    && proof?.viewport?.width > 0 && proof?.viewport?.height > 0
    && proof?.window?.width > 0 && proof?.window?.height > 0;
  const checks = [
    ['tech exits zero', tech.child.status === 0],
    ['tech is real native PASS', tech.value?.status === 'passed' && tech.value?.testHarness === false && tech.value?.renderer === 'real-window'],
    ['tech records a usable real renderer', usableRenderer(tech.value?.proof?.renderer)],
    ['playtest exits zero', playtest.child.status === 0],
    ['playtest is two-process native PASS', playtest.value?.status === 'passed' && playtest.value?.testHarness === false && playtest.value?.runtimeProcesses === 2],
    ['both playtest processes record a usable real renderer', usableRenderer(playtest.value?.scenario?.renderer?.save) && usableRenderer(playtest.value?.scenario?.renderer?.reload)],
    ['playtest persisted exact state', playtest.value?.scenario?.reloadMatchesSave === true && playtest.value?.scenario?.reload?.hp === 3],
    ['source stayed unchanged', sourceBefore === sourceAfter],
  ];
  let failed = 0;
  for (const [name, ok] of checks) {
    console.log('[' + (ok ? 'OK' : 'FAIL') + '] ' + name);
    if (!ok) failed += 1;
  }
  if (failed) {
    console.error(tech.child.stderr || tech.child.stdout || '');
    console.error(playtest.child.stderr || playtest.child.stdout || '');
    process.exitCode = 1;
  } else {
    console.log(checks.length + '/' + checks.length + ' real Godot Q3-007 forward checks passed (' + (playtest.value.engine?.version || tech.value.engine?.version) + ')');
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
