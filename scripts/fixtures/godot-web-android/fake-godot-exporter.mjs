#!/usr/bin/env node
/** Test-only exporter for the Web/Android builder. */
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { runAndroidSigner } from '../../platform-release-verify.mjs';
const args = process.argv.slice(2); if (args.includes('--version')) { console.log(process.env.FORGE_GODOT_WEB_ANDROID_TEST_VERSION || '4.7.fixture.web-android'); process.exit(0); }
const target = args.at(-1); const mode = process.env.FORGE_GODOT_MULTI_TEST_MODE || 'pass';
if (mode === 'fail') { console.error('Export failed'); process.exit(1); }
if (mode === 'timeout') for (;;) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
if (args.includes('--install-android-build-template')) {
  fs.mkdirSync(path.join(process.cwd(), 'android', 'build'), { recursive: true });
  console.log('Android build template installed');
  if (!args.includes('--export-debug') && !args.includes('--export-release')) process.exit(0);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
if (target.endsWith('.html')) { fs.writeFileSync(target, '<!doctype html>'); fs.writeFileSync(path.join(path.dirname(target), 'index.js'), 'runtime'); fs.writeFileSync(path.join(path.dirname(target), 'index.wasm'), 'wasm'); }
else {
  const stage = path.join(path.dirname(target), '.forge-fixture-package'); fs.mkdirSync(stage, { recursive: true });
  fs.writeFileSync(path.join(stage, 'AndroidManifest.xml'), '<manifest package="com.forge.fixture"/>');
  const jar = spawnSync('jar', ['cf', target, '-C', stage, '.'], { encoding: 'utf8', windowsHide: true });
  if (jar.error || jar.status !== 0) { console.error('fixture archive failed'); process.exit(1); }
  if (process.env.FORGE_GODOT_ANDROID_RELEASE_TEST_SIGN === '1') {
    const keyStore = process.env.GODOT_ANDROID_KEYSTORE_RELEASE_PATH; const alias = process.env.GODOT_ANDROID_KEYSTORE_RELEASE_USER;
    if (!keyStore || !alias) { console.error('fixture signing configuration missing'); process.exit(1); }
    if (target.endsWith('.aab')) {
      const signed = spawnSync('jarsigner', ['-keystore', keyStore, '-storepass:env', 'GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD', target, alias], { encoding: 'utf8', windowsHide: true });
      if (signed.error || signed.status !== 0) { console.error('fixture AAB signing failed'); process.exit(1); }
    } else {
      const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME; const tool = sdk ? path.join(sdk, 'build-tools', fs.readdirSync(path.join(sdk, 'build-tools')).sort().at(-1), process.platform === 'win32' ? 'apksigner.bat' : 'apksigner') : null;
      const signed = tool ? runAndroidSigner(tool, ['sign', '--min-sdk-version', '24', '--ks', keyStore, '--ks-key-alias', alias, '--ks-pass', 'env:GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD', '--key-pass', 'env:GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD', '--out', `${target}.signed`, target]) : { status: 1 };
      if (signed.error || signed.status !== 0) { console.error('fixture APK signing failed'); process.exit(1); }
      fs.renameSync(`${target}.signed`, target);
    }
  }
}
