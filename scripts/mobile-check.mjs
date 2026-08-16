#!/usr/bin/env node
/**
 * mobile-check.mjs — Скриншоты + UI-аудит мобильной версии
 * Автоопределение ориентации. Проверяет правила из mobile-game-ui skill.
 *
 * Использование:
 *   node mobile-check.mjs                          # localhost:3000, авто
 *   node mobile-check.mjs http://localhost:8080     # другой порт
 *   node mobile-check.mjs --landscape               # принудительно landscape
 *   node mobile-check.mjs --portrait                # принудительно portrait
 *   node mobile-check.mjs --no-audit                # только скриншоты, без аудита
 *
 * Установка (один раз):
 *   npm install puppeteer
 */

import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

// --- Парсинг аргументов ---
const args = process.argv.slice(2);
const URL = args.find(a => a.startsWith('http')) || 'http://localhost:3000';
const forceOrientation = args.includes('--landscape') ? 'landscape'
                       : args.includes('--portrait')  ? 'portrait'
                       : null;
const skipAudit = args.includes('--no-audit');
const DIR = 'screenshots';

// --- Пресеты устройств ---
const devicePresets = {
  iphone14: {
    label: 'iPhone 14',
    portrait:  { width: 390, height: 844, deviceScaleFactor: 3 },
    landscape: { width: 844, height: 390, deviceScaleFactor: 3 },
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  pixel7: {
    label: 'Pixel 7',
    portrait:  { width: 412, height: 915, deviceScaleFactor: 2.625 },
    landscape: { width: 915, height: 412, deviceScaleFactor: 2.625 },
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  ipad: {
    label: 'iPad',
    portrait:  { width: 810, height: 1080, deviceScaleFactor: 2 },
    landscape: { width: 1080, height: 810, deviceScaleFactor: 2 },
    ua: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  desktop: {
    label: 'Desktop 1920x1080',
    portrait:  { width: 1920, height: 1080, deviceScaleFactor: 1 },
    landscape: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    ua: null,
    isDesktop: true,
  },
};

// --- Определение ориентации ---
async function detectOrientation(browser, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        return { method: 'canvas', width: canvas.width, height: canvas.height, ratio: canvas.width / canvas.height };
      }
      for (const sel of ['#game', '#app', '#gameContainer', '.game-container', '.game', '#canvas-container', 'main']) {
        const el = document.querySelector(sel);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 100 && r.height > 100) return { method: `container(${sel})`, width: r.width, height: r.height, ratio: r.width / r.height };
        }
      }
      return { method: 'body', width: document.body.scrollWidth, height: document.body.scrollHeight, ratio: document.body.scrollWidth / document.body.scrollHeight };
    });
    await page.close();
    return { orientation: result.ratio >= 1.1 ? 'landscape' : result.ratio <= 0.9 ? 'portrait' : 'landscape', ...result };
  } catch (e) {
    await page.close();
    return { orientation: 'landscape', method: 'fallback', error: e.message };
  }
}

// --- Скриншот ---
async function screenshot(browser, url, deviceName, preset, orientation) {
  const page = await browser.newPage();
  const isDesktop = preset.isDesktop;
  const vp = isDesktop ? preset.landscape : preset[orientation];

  await page.setViewport({ ...vp, isMobile: !isDesktop, hasTouch: !isDesktop, isLandscape: orientation === 'landscape' });
  if (preset.ua) await page.setUserAgent(preset.ua);
  if (!isDesktop) {
    const client = await page.createCDPSession();
    await client.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });
  }

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    const suffix = isDesktop ? '' : `_${orientation}`;
    const filepath = `${DIR}/${deviceName}${suffix}.png`;
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`  ✅ ${preset.label} (${vp.width}x${vp.height}, ${isDesktop ? 'desktop' : orientation}) → ${filepath}`);
    await page.close();
    return filepath;
  } catch (e) {
    console.error(`  ❌ ${preset.label}: ${e.message}`);
    await page.close();
    return null;
  }
}

// =============================================================
// UI АУДИТ — проверка правил из mobile-game-ui skill
// =============================================================
async function runUIAudit(browser, url, orientation) {
  console.log('\n🔍 UI-аудит (правила mobile-game-ui skill):\n');

  const page = await browser.newPage();
  // Эмулируем iPhone (самый жёсткий кейс)
  const vp = devicePresets.iphone14[orientation];
  await page.setViewport({ ...vp, isMobile: true, hasTouch: true, isLandscape: orientation === 'landscape' });
  await page.setUserAgent(devicePresets.iphone14.ua);
  const client = await page.createCDPSession();
  await client.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  const audit = await page.evaluate((orient) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const results = [];

    function pass(rule, detail) { results.push({ status: 'PASS', rule, detail }); }
    function warn(rule, detail) { results.push({ status: 'WARN', rule, detail }); }
    function fail(rule, detail) { results.push({ status: 'FAIL', rule, detail }); }

    // =============================================
    // 1. Подсчёт кнопок / интерактивных элементов
    // =============================================
    const allClickable = document.querySelectorAll(
      'button, [role="button"], [onclick], .btn, .button, .control, .touch-btn, .action-btn, .game-btn, input[type="button"], input[type="submit"], a.btn'
    );
    // Фильтруем только видимые
    const visibleButtons = [...allClickable].filter(el => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });

    if (visibleButtons.length > 5) {
      fail('КНОПКИ: max 5 постоянных на экране', `Найдено ${visibleButtons.length} видимых кнопок. Перенеси лишние в radial wheel или панель.`);
    } else if (visibleButtons.length > 0) {
      pass('КНОПКИ: max 5 постоянных на экране', `${visibleButtons.length} видимых кнопок — ок.`);
    } else {
      warn('КНОПКИ: подсчёт', 'Не найдено HTML-кнопок. Возможно, кнопки рисуются на canvas — проверь визуально по скриншоту.');
    }

    // =============================================
    // 2. Размер кнопок (минимум 48x48)
    // =============================================
    const smallButtons = visibleButtons.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width < 44 || r.height < 44;
    });
    if (smallButtons.length > 0) {
      fail('РАЗМЕР КНОПОК: min 48x48px', `${smallButtons.length} кнопок меньше 44px: ${smallButtons.map(el => {
        const r = el.getBoundingClientRect();
        return `"${(el.textContent || el.className).slice(0, 20)}" (${Math.round(r.width)}x${Math.round(r.height)})`;
      }).join(', ')}`);
    } else if (visibleButtons.length > 0) {
      pass('РАЗМЕР КНОПОК: min 48x48px', 'Все кнопки ≥44px.');
    }

    // =============================================
    // 3. Размер шрифтов (минимум 14px)
    // =============================================
    const allText = document.querySelectorAll('*');
    const smallFonts = [];
    allText.forEach(el => {
      if (el.children.length > 0) return; // только leaf nodes
      if (!el.textContent.trim()) return;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const size = parseFloat(style.fontSize);
      if (size > 0 && size < 13) {
        smallFonts.push({ text: el.textContent.trim().slice(0, 30), size: Math.round(size) });
      }
    });
    if (smallFonts.length > 0) {
      warn('ШРИФТЫ: min 14px', `${smallFonts.length} элементов с мелким шрифтом: ${smallFonts.slice(0, 5).map(f => `"${f.text}" (${f.size}px)`).join(', ')}`);
    } else {
      pass('ШРИФТЫ: min 14px', 'Все текстовые элементы ≥13px.');
    }

    // =============================================
    // 4. Элементы в thumb zone (нижние 25%)
    // =============================================
    const thumbZoneY = H * 0.75;
    const inThumbZone = [];
    // Ищем информационные элементы (не контролы) в thumb zone
    const infoElements = document.querySelectorAll(
      '.minimap, .mini-map, [class*="minimap"], [class*="mini-map"], .score, .hp, .health, .info-panel, .hud-info, .status'
    );
    infoElements.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top > thumbZoneY && r.width > 0 && r.height > 0) {
        inThumbZone.push((el.className || el.id || el.tagName).slice(0, 30));
      }
    });
    if (inThumbZone.length > 0) {
      fail('THUMB ZONE: инфо-элементы внизу', `Информация в thumb zone (нижние 25%): ${inThumbZone.join(', ')}. Перенеси наверх!`);
    } else {
      pass('THUMB ZONE', 'Нет информационных элементов в нижних 25% экрана.');
    }

    // =============================================
    // 5. Minimap позиция
    // =============================================
    const minimap = document.querySelector('.minimap, .mini-map, [class*="minimap"], [class*="mini-map"], #minimap');
    if (minimap) {
      const r = minimap.getBoundingClientRect();
      const isTopRight = r.right > W * 0.7 && r.top < H * 0.3;
      if (isTopRight) {
        pass('MINIMAP: top-right', `Миникарта в правом верхнем углу (${Math.round(r.left)},${Math.round(r.top)}) — ок.`);
      } else {
        fail('MINIMAP: top-right', `Миникарта в позиции (${Math.round(r.left)},${Math.round(r.top)}). Должна быть в top-right! Текущий экран: ${W}x${H}`);
      }
    }

    // =============================================
    // 6. Overflow — элементы за экраном
    // =============================================
    const overflowElements = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (getComputedStyle(el).display === 'none') return;
      if (r.right > W + 5 || r.bottom > H + 5) {
        const tag = el.tagName.toLowerCase();
        if (tag !== 'html' && tag !== 'body' && !el.closest('script') && !el.closest('style')) {
          overflowElements.push(`${tag}.${(el.className || '').toString().split(' ')[0] || 'no-class'} (right:${Math.round(r.right)}, bottom:${Math.round(r.bottom)})`);
        }
      }
    });
    if (overflowElements.length > 3) {
      warn('OVERFLOW: элементы за экраном', `${overflowElements.length} элементов выходят за viewport: ${overflowElements.slice(0, 3).join(', ')}...`);
    } else if (overflowElements.length > 0) {
      warn('OVERFLOW', `${overflowElements.length} элементов слегка выходят за экран: ${overflowElements.join(', ')}`);
    } else {
      pass('OVERFLOW', 'Все элементы внутри viewport.');
    }

    // =============================================
    // 7. Canvas заполнение экрана
    // =============================================
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      const coverage = (r.width * r.height) / (W * H) * 100;
      if (coverage > 80) {
        pass('CANVAS: заполнение', `Canvas покрывает ${coverage.toFixed(0)}% экрана — ок.`);
      } else if (coverage > 50) {
        warn('CANVAS: заполнение', `Canvas покрывает только ${coverage.toFixed(0)}% экрана. Рекомендуется >80% для мобильных игр.`);
      } else {
        fail('CANVAS: заполнение', `Canvas покрывает всего ${coverage.toFixed(0)}% экрана. На мобилке должен быть fullscreen!`);
      }
    }

    // =============================================
    // 8. Viewport meta tag
    // =============================================
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      const content = viewportMeta.content || '';
      const checks = [];
      if (!content.includes('width=device-width')) checks.push('нет width=device-width');
      if (!content.includes('user-scalable=no') && !content.includes('user-scalable=0'))
        checks.push('нет user-scalable=no (pinch-to-zoom сломает игру)');
      if (checks.length > 0) {
        warn('VIEWPORT META', `Проблемы: ${checks.join(', ')}. Текущий: "${content}"`);
      } else {
        pass('VIEWPORT META', 'viewport настроен правильно.');
      }
    } else {
      fail('VIEWPORT META', 'Нет <meta name="viewport">! Мобильный браузер будет масштабировать страницу как десктоп.');
    }

    // =============================================
    // 9. Touch prevention (scroll, bounce, context menu)
    // =============================================
    const bodyStyle = getComputedStyle(document.body);
    const htmlStyle = getComputedStyle(document.documentElement);
    const touchChecks = [];

    if (bodyStyle.touchAction !== 'none' && htmlStyle.touchAction !== 'none') {
      touchChecks.push('touch-action: none не установлен (возможен скролл/зум во время игры)');
    }
    if (bodyStyle.overscrollBehavior !== 'none' && htmlStyle.overscrollBehavior !== 'none') {
      touchChecks.push('overscroll-behavior: none не установлен (возможен pull-to-refresh)');
    }
    if (bodyStyle.userSelect !== 'none' && htmlStyle.userSelect !== 'none') {
      touchChecks.push('user-select: none не установлен (long-press выделит текст)');
    }

    if (touchChecks.length > 0) {
      warn('TOUCH PREVENTION', touchChecks.join('; '));
    } else {
      pass('TOUCH PREVENTION', 'touch-action, overscroll-behavior, user-select настроены.');
    }

    // =============================================
    // 10. Console errors
    // =============================================
    // (проверяется отдельно через page.on('console'))

    return results;
  }, orientation);

  // Собираем console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  // Перезагрузим для ловли ошибок
  try {
    await page.reload({ waitUntil: 'networkidle2', timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) { /* ignore */ }

  await page.close();

  // --- Вывод результатов ---
  let passes = 0, warns = 0, fails = 0;

  audit.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`  ${icon} ${r.rule}`);
    console.log(`     ${r.detail}`);
    if (r.status === 'PASS') passes++;
    else if (r.status === 'WARN') warns++;
    else fails++;
  });

  if (consoleErrors.length > 0) {
    console.log(`  ❌ CONSOLE ERRORS: ${consoleErrors.length} ошибок`);
    consoleErrors.slice(0, 5).forEach(e => console.log(`     ${e}`));
    fails++;
  }

  console.log(`\n  Итог: ✅ ${passes} pass | ⚠️  ${warns} warn | ❌ ${fails} fail`);

  // Сохраняем отчёт
  const report = {
    url: url,
    device: 'iPhone 14',
    orientation,
    timestamp: new Date().toISOString(),
    results: audit,
    consoleErrors: consoleErrors.slice(0, 10),
    summary: { passes, warns, fails },
  };
  const reportPath = `${DIR}/ui-audit.json`;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`  📄 Отчёт: ${reportPath}\n`);

  return report;
}

// --- Main ---
async function run() {
  if (!existsSync(DIR)) await mkdir(DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // Шаг 1: Ориентация
  let orientation;
  if (forceOrientation) {
    orientation = forceOrientation;
    console.log(`\n🎯 Принудительная ориентация: ${orientation}\n`);
  } else {
    console.log(`\n🔍 Определяю ориентацию игры: ${URL}`);
    const detect = await detectOrientation(browser, URL);
    orientation = detect.orientation;
    console.log(`   Метод: ${detect.method} (${detect.width}x${detect.height}, ratio: ${detect.ratio?.toFixed(2)})`);
    console.log(`   ➜ Ориентация: ${orientation.toUpperCase()}\n`);
  }

  // Шаг 2: Скриншоты
  console.log(`📸 Основные скриншоты (${orientation}):\n`);
  for (const [name, preset] of Object.entries(devicePresets)) {
    await screenshot(browser, URL, name, preset, orientation);
  }

  const altOrientation = orientation === 'landscape' ? 'portrait' : 'landscape';
  console.log(`\n📸 Контроль ротации (${altOrientation}):\n`);
  await screenshot(browser, URL, 'iphone14', devicePresets.iphone14, altOrientation);

  // Шаг 3: UI-аудит
  let auditResult = null;
  if (!skipAudit) {
    auditResult = await runUIAudit(browser, URL, orientation);
  }

  await browser.close();

  // Итог
  console.log(`${'='.repeat(55)}`);
  console.log(`🎮 Ориентация: ${orientation.toUpperCase()}`);
  console.log(`📁 Скриншоты: ${DIR}/`);
  if (auditResult) {
    const s = auditResult.summary;
    const grade = s.fails === 0 && s.warns <= 1 ? '🟢 GOOD' : s.fails === 0 ? '🟡 OK' : '🔴 NEEDS FIX';
    console.log(`🔍 UI-аудит: ${grade} (${s.passes}✅ ${s.warns}⚠️  ${s.fails}❌)`);
  }
  console.log(`${'='.repeat(55)}`);

  console.log(`\nClaude Code — действия:`);
  console.log(`  1. Открой скриншоты — сравни mobile vs desktop`);
  console.log(`  2. Если аудит показал FAIL — исправь по правилам .claude/skills/mobile-game-ui/SKILL.md`);
  console.log(`  3. После исправлений — запусти повторно: node mobile-check.mjs\n`);
}

run().catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
