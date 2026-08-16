#!/usr/bin/env node
/**
 * @file verify-vk.mjs
 * @description Автоматическая верификация VK Mini App перед отправкой
 *              в модерацию. Работает на любой папке с HTML5-проектом:
 *              сканирует файлы, проверяет правила из vk-sdk-integration skill,
 *              печатает PASS/WARN/FAIL построчно. 0 FAIL = готово.
 *
 *              Использование:
 *                node scripts/verify-vk.mjs path/to/game
 *                node scripts/verify-vk.mjs .              # текущая папка
 *
 *              Exit code: 0 если 0 FAIL, иначе 1 (для CI).
 *
 * @dependencies только Node ≥ 18 std (fs/promises, path)
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { existsSync } from 'node:fs';

// ═══ ПАРАМЕТРЫ ═══

const root = process.argv[2] ? join(process.cwd(), process.argv[2]) : process.cwd();

if (!existsSync(root)) {
  console.error(`[verify-vk] путь не существует: ${root}`);
  process.exit(2);
}

// Результаты проверок
const results = { pass: 0, warn: 0, fail: 0, entries: [] };

// ═══ ХЕЛПЕРЫ ═══

function log(level, msg, file = '') {
  const icons = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌' };
  const path = file ? ` [${relative(root, file)}]` : '';
  results.entries.push({ level, msg, file });
  results[level.toLowerCase()]++;
  console.log(`${icons[level]} ${level.padEnd(4)} ${msg}${path}`);
}

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, files);
    else files.push(p);
  }
  return files;
}

function byExt(files, exts) {
  return files.filter(f => exts.includes(extname(f).toLowerCase()));
}

async function readText(f) {
  try { return await readFile(f, 'utf8'); } catch { return ''; }
}

// ═══ ПРОВЕРКИ ═══

async function checkIndexHtml(files) {
  const indexes = files.filter(f => f.endsWith('index.html'));
  if (indexes.length === 0) {
    log('FAIL', 'index.html не найден');
    return null;
  }
  // Берём корневой, не во вложенной папке
  const rootIndex = indexes.sort((a, b) =>
    a.split('/').length - b.split('/').length
  )[0];
  log('PASS', 'index.html найден', rootIndex);

  const html = await readText(rootIndex);

  // <base href="./">
  if (/<base\s+href\s*=\s*["']\.\//i.test(html)) {
    log('PASS', '<base href="./"> присутствует', rootIndex);
  } else {
    log('WARN', '<base href="./"> отсутствует — абсолютные пути могут сломаться на хостинге ВК', rootIndex);
  }

  // Meta viewport с dvh-пригодным содержимым
  if (/viewport.*?width=device-width/i.test(html)) {
    log('PASS', 'meta viewport корректен', rootIndex);
  } else {
    log('FAIL', 'нет <meta name="viewport" content="width=device-width, ...">', rootIndex);
  }

  // VK Bridge подключён
  const hasBridge = /vk-bridge|@vkontakte\/vk-bridge|vkBridge/.test(html);
  const hasWrapper = /vk-bridge-wrapper/.test(html);
  if (hasBridge || hasWrapper) {
    log('PASS', 'VK Bridge / wrapper подключён', rootIndex);
  } else {
    log('FAIL', 'VK Bridge не подключён — приложение не запустится в клиентах ВК', rootIndex);
  }

  // Абсолютные URL (localhost / file:// / http://)
  const absUrlMatches = html.match(/(?:src|href)=["'](https?:\/\/localhost|file:|http:\/\/127)/gi);
  if (absUrlMatches) {
    log('FAIL', `найдены локальные абсолютные URL (${absUrlMatches.length} шт) — ассеты не загрузятся`, rootIndex);
  } else {
    log('PASS', 'нет localhost / file:// URL', rootIndex);
  }

  return { html, path: rootIndex };
}

async function checkJsFiles(files) {
  const jsFiles = byExt(files, ['.js', '.mjs', '.ts', '.tsx', '.jsx']);
  if (jsFiles.length === 0) {
    log('WARN', 'JS-файлы не найдены');
    return;
  }

  const texts = await Promise.all(jsFiles.map(async f => [f, await readText(f)]));

  // 1. VKWebAppInit присутствует
  const hasInit = texts.some(([_, t]) => /VKWebAppInit|VKApp\.init\(/.test(t));
  if (hasInit) log('PASS', 'VKWebAppInit / VKApp.init() присутствует');
  else log('FAIL', 'VKWebAppInit не вызывается — мобильные клиенты не откроют приложение');

  // 2. bridge.subscribe() перед send()
  const subscribers = texts.filter(([_, t]) =>
    /bridge\.subscribe|VKApp\.setOn(Pause|Resume|ThemeChange|ConfigUpdate)/.test(t)
  );
  if (subscribers.length > 0) {
    log('PASS', `bridge.subscribe установлен (${subscribers.length} файлов)`);
  } else {
    log('WARN', 'bridge.subscribe не найден — рекомендуется слушать VKWebAppViewHide/Restore');
  }

  // 3. Параллельные Storage вызовы (антипаттерн)
  for (const [f, t] of texts) {
    if (/Promise\.all\s*\([^)]*VKWebAppStorageSet/s.test(t)) {
      log('FAIL', 'Promise.all с VKWebAppStorageSet — параллельные записи ломают Bridge (issue #192)', f);
    }
  }
  log('PASS', 'нет параллельных VKWebAppStorageSet');

  // 4. localStorage в основном коде
  const storageUsage = texts.filter(([f, t]) => {
    // Исключаем сам wrapper (в нём localStorage для dev-mode нормальный)
    if (/vk-bridge-wrapper\.js$/.test(f)) return false;
    if (/vk-bridge-wrapper\.ts$/.test(f)) return false;
    return /localStorage\.(set|get|remove|clear)Item/.test(t);
  });
  if (storageUsage.length > 0) {
    const names = storageUsage.map(([f]) => relative(root, f)).join(', ');
    log('WARN', `localStorage напрямую в ${storageUsage.length} файлах (${names}) — используйте VKApp.storageGet/Set для кроссплатформенности`);
  } else {
    log('PASS', 'прямые обращения к localStorage отсутствуют');
  }

  // 5. Rewarded: проверяется result:true
  const hasShowReward = texts.some(([_, t]) => /ad_format:\s*['"]reward['"]|showRewarded\(/.test(t));
  if (hasShowReward) {
    const hasCheck = texts.some(([_, t]) => /VKWebAppCheckNativeAds|checkRewarded/.test(t));
    if (hasCheck) {
      log('PASS', 'rewarded реклама с предпроверкой CheckNativeAds');
    } else {
      log('WARN', 'Rewarded есть, но нет VKWebAppCheckNativeAds — кнопка может показываться когда рекламы нет');
    }

    // Проверка result:true
    const hasResultCheck = texts.some(([_, t]) =>
      /result\s*===\s*true|\.result\s*===?\s*true/.test(t)
    );
    if (hasResultCheck) {
      log('PASS', 'награда выдаётся с проверкой result === true (защита от iOS бага)');
    } else {
      log('WARN', 'не найдена явная проверка result===true — возможна выдача награды без просмотра (iOS airplane mode, issue #214)');
    }
  }

  // 6. VKWebAppShowOrderBox для покупок digital-контента
  const hasOrderBox = texts.some(([_, t]) => /VKWebAppShowOrderBox|VKApp\.purchase\(/.test(t));
  // Ищем РЕАЛЬНЫЕ API-вызовы шлюзов, не упоминания в строках/комментариях
  const hasExtPay = texts.some(([f, t]) => {
    if (/verify-vk\.mjs$/.test(f)) return false;  // сам скрипт
    return /(?:Stripe\.|stripe\.redirectToCheckout|paypal\.(?:Buttons|checkout)|new\s+YooKassa|window\.YooMoneyCheckoutWidget|Robokassa\.init|cp\.CloudPayments\()/.test(t);
  });
  if (hasExtPay && hasOrderBox) {
    log('WARN', 'одновременно и VKWebAppShowOrderBox, и внешний шлюз — убедитесь что внешний не для digital-контента');
  } else if (hasExtPay && !hasOrderBox) {
    log('FAIL', 'внешний платёжный шлюз без VKWebAppShowOrderBox — digital-покупки ОБЯЗАНЫ быть через голоса');
  } else if (hasOrderBox) {
    log('PASS', 'покупки через VKWebAppShowOrderBox');
  }

  // 7. Context menu / swipe-to-refresh блокировка
  const hasContextBlock = texts.some(([_, t]) => /contextmenu.*preventDefault/s.test(t));
  if (hasContextBlock) {
    log('PASS', 'contextmenu заблокирован');
  } else {
    log('WARN', 'contextmenu не блокируется — long-press на мобильных откроет системное меню');
  }
}

async function checkHostingConfig() {
  const config = join(root, 'vk-hosting-config.json');
  if (existsSync(config)) {
    try {
      const json = JSON.parse(await readText(config));
      if (!json.static_path) log('FAIL', 'vk-hosting-config.json: нет static_path', config);
      else if (!existsSync(join(root, json.static_path)))
        log('FAIL', `vk-hosting-config.json: папка static_path="${json.static_path}" не существует`, config);
      else log('PASS', `vk-hosting-config.json валиден, static_path=${json.static_path}`);

      if (!json.app_id) log('WARN', 'vk-hosting-config.json: нет app_id — задайте перед деплоем', config);
      else log('PASS', `app_id=${json.app_id}`);

      if (!json.endpoints || !json.endpoints.web)
        log('WARN', 'vk-hosting-config.json: endpoints не заполнены', config);
    } catch (e) {
      log('FAIL', `vk-hosting-config.json: невалидный JSON (${e.message})`, config);
    }
  } else {
    log('WARN', 'vk-hosting-config.json отсутствует — не получится задеплоить через vk-miniapps-deploy');
  }
}

async function checkPackageJson() {
  const pkg = join(root, 'package.json');
  if (!existsSync(pkg)) return;  // не все проекты имеют package.json
  try {
    const json = JSON.parse(await readText(pkg));
    if (json.homepage === './') log('PASS', 'package.json homepage="./"');
    else log('WARN', `package.json: homepage="${json.homepage || ''}" — должно быть "./" для корректных путей на VK-хостинге`);
  } catch {
    log('WARN', 'package.json невалиден');
  }
}

async function checkAssets(files) {
  const assets = byExt(files, ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
  if (assets.length === 0) {
    log('WARN', 'нет графических ассетов — ок, если игра рисует всё на canvas');
    return;
  }

  // Проверка кириллицы / пробелов в именах
  const bad = assets.filter(a => /[^\x00-\x7F]|\s/.test(a));
  if (bad.length > 0) {
    log('FAIL', `${bad.length} файлов с non-ASCII / пробелами в имени — проксирование VK сломает их`);
    bad.slice(0, 3).forEach(f => console.log(`     └─ ${relative(root, f)}`));
  } else {
    log('PASS', `${assets.length} ассетов — имена ASCII без пробелов`);
  }

  // Общий размер
  const sizes = await Promise.all(assets.map(async a => (await stat(a)).size));
  const totalMB = sizes.reduce((s, n) => s + n, 0) / 1024 / 1024;
  if (totalMB > 50) {
    log('WARN', `суммарный размер ассетов ${totalMB.toFixed(1)} МБ — долгая первая загрузка на мобильных`);
  } else {
    log('PASS', `размер ассетов ${totalMB.toFixed(1)} МБ (< 50 MB)`);
  }
}

// ═══ MAIN ═══

(async () => {
  console.log(`\n══ VK Mini App verification: ${root}\n`);

  const files = await walk(root);

  const htmlInfo = await checkIndexHtml(files);
  console.log();
  await checkJsFiles(files);
  console.log();
  await checkHostingConfig();
  await checkPackageJson();
  console.log();
  await checkAssets(files);

  console.log(`\n══ Итого: ${results.pass} PASS · ${results.warn} WARN · ${results.fail} FAIL\n`);

  if (results.fail > 0) {
    console.log('❌ Есть FAIL — исправьте перед отправкой на модерацию.\n');
    process.exit(1);
  } else if (results.warn > 0) {
    console.log('⚠️  WARN не блокируют, но рекомендуется посмотреть.\n');
    process.exit(0);
  } else {
    console.log('✅ Всё чисто — можно деплоить.\n');
    process.exit(0);
  }
})().catch(e => {
  console.error('Ошибка верификатора:', e);
  process.exit(2);
});
