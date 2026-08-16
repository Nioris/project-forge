#!/usr/bin/env node
/**
 * @file check-appmetrica.mjs
 * @description Validates AppMetrica SDK integration в Android wrapper.
 *              Catches frequent integration mistakes:
 *              - dependency missing or wrong version
 *              - API key placeholder (YOUR_API_KEY) не replaced
 *              - manifest meta-data missing
 *              - permissions missing
 *              - activation code missing
 *
 *              Auto-detects wrapper type (TWA, Capacitor, Cordova, Native).
 *
 *              Used as gate в release-ready rustore.
 *
 * Usage:
 *   node scripts/check-appmetrica.mjs <project-dir>
 *   node scripts/check-appmetrica.mjs platforms/rustore/
 *   node scripts/check-appmetrica.mjs --json android/
 *
 * Exit:
 *   0 = AppMetrica properly integrated
 *   1 = violations found
 *   2 = wrapper not detected или invocation error
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const targetDir = args.find(a => !a.startsWith('--')) || '.';

const projectRoot = path.resolve(targetDir);

if (!fs.existsSync(projectRoot)) {
  console.error(`[X] Directory not found: ${projectRoot}`);
  process.exit(2);
}

// Auto-detect wrapper type
function detectWrapper(root) {
  const candidates = [];

  // TWA wrapper (Forge platforms/rustore)
  if (fs.existsSync(path.join(root, 'app', 'build.gradle')) ||
      fs.existsSync(path.join(root, 'app', 'build.gradle.kts'))) {
    candidates.push({ type: 'native_or_twa', path: path.join(root, 'app') });
  }

  // Capacitor
  if (fs.existsSync(path.join(root, 'capacitor.config.ts')) ||
      fs.existsSync(path.join(root, 'capacitor.config.json'))) {
    if (fs.existsSync(path.join(root, 'android', 'app'))) {
      candidates.push({ type: 'capacitor', path: path.join(root, 'android', 'app') });
    }
  }

  // Cordova
  if (fs.existsSync(path.join(root, 'config.xml'))) {
    if (fs.existsSync(path.join(root, 'platforms', 'android', 'app'))) {
      candidates.push({ type: 'cordova', path: path.join(root, 'platforms', 'android', 'app') });
    }
  }

  return candidates;
}

// Search recursively for file
function findFile(dir, filename, maxDepth = 4) {
  if (!fs.existsSync(dir) || maxDepth <= 0) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (['node_modules', '.git', '.gradle', 'build'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name === filename) return full;
      if (e.isDirectory()) {
        const found = findFile(full, filename, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch { /* skip permission errors */ }
  return null;
}

function findFiles(dir, pattern, maxDepth = 5, results = []) {
  if (!fs.existsSync(dir) || maxDepth <= 0) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (['node_modules', '.git', '.gradle', 'build', 'output'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isFile() && pattern.test(e.name)) results.push(full);
      if (e.isDirectory()) findFiles(full, pattern, maxDepth - 1, results);
    }
  } catch { /* skip */ }
  return results;
}

function validateWrapper(wrapper) {
  const violations = [];
  const info = {};

  // Check 1: build.gradle has mobmetricalib dependency
  const buildGradle = findFile(wrapper.path, 'build.gradle') ||
                       findFile(wrapper.path, 'build.gradle.kts');
  if (!buildGradle) {
    violations.push('build.gradle not found в wrapper path');
    return { violations, info, wrapper };
  }
  info.build_gradle = path.relative(projectRoot, buildGradle);

  const gradleContent = fs.readFileSync(buildGradle, 'utf-8');
  if (!/mobmetricalib/.test(gradleContent)) {
    violations.push(`mobmetricalib dependency missing в ${info.build_gradle}. Add: implementation 'com.yandex.android:mobmetricalib:7.4.0'`);
  } else {
    // Try к extract version
    const versionMatch = gradleContent.match(/mobmetricalib[':\d.\-]+:(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      info.appmetrica_version = versionMatch[1];
      // Warn if < 7.0
      if (parseInt(versionMatch[1].split('.')[0], 10) < 7) {
        violations.push(`mobmetricalib version ${versionMatch[1]} outdated, upgrade к 7.4.0+`);
      }
    }
  }

  // Check 2: AndroidManifest.xml has meta-data
  const manifest = findFile(wrapper.path, 'AndroidManifest.xml');
  if (!manifest) {
    violations.push('AndroidManifest.xml not found в wrapper path');
    return { violations, info, wrapper };
  }
  info.manifest = path.relative(projectRoot, manifest);

  const manifestContent = fs.readFileSync(manifest, 'utf-8');
  if (!/com\.yandex\.metrica\.ApiKey/.test(manifestContent)) {
    violations.push(`AndroidManifest.xml missing meta-data: <meta-data android:name="com.yandex.metrica.ApiKey" android:value="..." />`);
  }

  // Check 3: Permissions present
  const hasInternet = /android\.permission\.INTERNET/.test(manifestContent);
  const hasNetworkState = /android\.permission\.ACCESS_NETWORK_STATE/.test(manifestContent);
  if (!hasInternet) {
    violations.push('AndroidManifest.xml missing <uses-permission android:name="android.permission.INTERNET" />');
  }
  if (!hasNetworkState) {
    violations.push('AndroidManifest.xml missing <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />');
  }

  // Check 4: API key not placeholder
  // Look в strings.xml для appmetrica_api_key value, OR в manifest directly
  let apiKeyValue = null;
  let apiKeyLocation = null;

  // Try manifest directly first (less ideal but valid)
  const directMatch = manifestContent.match(/android:name="com\.yandex\.metrica\.ApiKey"\s+android:value="([^"]+)"/);
  if (directMatch) {
    apiKeyValue = directMatch[1];
    apiKeyLocation = info.manifest;
  }

  // If reference к @string/..., look up в strings.xml
  if (apiKeyValue && apiKeyValue.startsWith('@string/')) {
    const stringName = apiKeyValue.replace('@string/', '');
    const stringsFiles = findFiles(wrapper.path, /^strings\.xml$/);
    for (const sf of stringsFiles) {
      const sc = fs.readFileSync(sf, 'utf-8');
      const m = sc.match(new RegExp(`<string\\s+name="${stringName}"[^>]*>([^<]+)</string>`));
      if (m) {
        apiKeyValue = m[1];
        apiKeyLocation = path.relative(projectRoot, sf);
        break;
      }
    }
  }

  if (apiKeyValue) {
    info.api_key_location = apiKeyLocation;
    // Validate format: 32-char UUID with dashes or just hex
    const placeholderPatterns = [
      /^YOUR_API_KEY/i,
      /^xxx+$/i,
      /^placeholder/i,
      /^todo/i,
      /^change[_-]me/i,
      /^\s*$/,
    ];
    const isPlaceholder = placeholderPatterns.some(p => p.test(apiKeyValue.trim()));
    if (isPlaceholder) {
      violations.push(`API key looks like placeholder в ${apiKeyLocation}: "${apiKeyValue}". Replace с real UUID from https://appmetrica.yandex.ru/`);
    } else {
      // Validate UUID-ish format
      const looksLikeUUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(apiKeyValue.trim());
      if (!looksLikeUUID) {
        violations.push(`API key в ${apiKeyLocation} doesn't look like UUID format: "${apiKeyValue.slice(0, 20)}...". Should be 32 hex chars с dashes.`);
      } else {
        info.api_key_status = 'valid_format';
      }
    }
  } else {
    // No API key found anywhere
    if (/com\.yandex\.metrica\.ApiKey/.test(manifestContent)) {
      violations.push('API key meta-data declared в manifest но value not resolvable (check strings.xml)');
    }
  }

  // Check 5: Activation code present in some .kt or .java file
  // Java/Kotlin packages can be deep (com.company.app.feature.module) — use big maxDepth
  const sourceFiles = [
    ...findFiles(wrapper.path, /\.kt$/, 10),
    ...findFiles(wrapper.path, /\.java$/, 10),
  ];
  let activationFound = false;
  let autoTrackingFound = false;
  for (const sf of sourceFiles) {
    const c = fs.readFileSync(sf, 'utf-8');
    if (/AppMetrica\.activate\s*\(/.test(c)) {
      activationFound = true;
      info.activation_file = path.relative(projectRoot, sf);
    }
    if (/enableActivityAutoTracking/.test(c)) {
      autoTrackingFound = true;
    }
  }
  if (!activationFound) {
    violations.push('AppMetrica.activate() call not found в any .kt/.java file. Add к Application.onCreate() or MainActivity.onCreate().');
  }
  if (!autoTrackingFound && activationFound) {
    violations.push('AppMetrica.enableActivityAutoTracking() not called. Add after activate() для automatic session tracking.');
  }

  // Check 6: Crash reporting enabled (warning only)
  let crashReportingFound = false;
  for (const sf of sourceFiles) {
    const c = fs.readFileSync(sf, 'utf-8');
    if (/withCrashReporting\s*\(\s*true\s*\)/.test(c)) {
      crashReportingFound = true;
      break;
    }
  }
  if (!crashReportingFound && activationFound) {
    violations.push('[WARN] withCrashReporting(true) not enabled — recommended для production builds.');
  }

  return { violations, info, wrapper };
}

// Run
const wrappers = detectWrapper(projectRoot);
if (wrappers.length === 0) {
  if (JSON_MODE) {
    console.log(JSON.stringify({
      ok: false,
      error: 'no_wrapper_detected',
      message: `No Android wrapper detected в ${targetDir}. Looked for TWA, Capacitor, Cordova, native Android.`,
    }, null, 2));
  } else {
    console.error(`[X] No Android wrapper detected в ${targetDir}`);
    console.error('    Expected one of:');
    console.error('      - app/build.gradle (TWA или native)');
    console.error('      - capacitor.config.* + android/app/');
    console.error('      - config.xml + platforms/android/app/');
    console.error('    Run /twa-wrap or /build-apk first if no wrapper exists.');
  }
  process.exit(2);
}

const reports = wrappers.map(validateWrapper);
const totalViolations = reports.reduce((sum, r) => sum + r.violations.length, 0);

if (JSON_MODE) {
  console.log(JSON.stringify({
    ok: totalViolations === 0,
    wrappers_found: wrappers.length,
    total_violations: totalViolations,
    reports,
  }, null, 2));
  process.exit(totalViolations === 0 ? 0 : 1);
}

// Human readable
console.log(`AppMetrica integration check — ${wrappers.length} wrapper(s) detected\n`);

for (const r of reports) {
  console.log(`  Wrapper: ${r.wrapper.type} (${path.relative(projectRoot, r.wrapper.path)})`);
  if (r.info.build_gradle) console.log(`    build.gradle:    ${r.info.build_gradle}`);
  if (r.info.appmetrica_version) console.log(`    version:         ${r.info.appmetrica_version}`);
  if (r.info.manifest) console.log(`    manifest:        ${r.info.manifest}`);
  if (r.info.activation_file) console.log(`    activation:      ${r.info.activation_file}`);
  if (r.info.api_key_location) console.log(`    api_key_in:      ${r.info.api_key_location} (${r.info.api_key_status || 'unknown'})`);

  if (r.violations.length === 0) {
    console.log(`    ✓ Integration valid\n`);
  } else {
    console.log(`    ✗ ${r.violations.length} violation(s):`);
    for (const v of r.violations) {
      console.log(`      - ${v}`);
    }
    console.log('');
  }
}

if (totalViolations === 0) {
  console.log(`✓ AppMetrica integration passes all checks.`);
  process.exit(0);
} else {
  console.log(`✗ ${totalViolations} violation(s) total. Fix via /appmetrica-integration.`);
  process.exit(1);
}
