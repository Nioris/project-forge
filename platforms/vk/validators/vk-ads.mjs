/**
 * @file vk-ads.mjs
 * @description VK-ADS-CHECK-BEFORE-SHOW — перед VKWebAppShowNativeAds
 *              ОБЯЗАТЕЛЬНО сначала вызвать VKWebAppCheckNativeAds. Иначе
 *              VK может вернуть «баннер не загружен» и интерстициал
 *              не покажется при первом запуске — частая причина провалов
 *              монетизации.
 *
 *              Также проверяем gesture-требование: interstitial и rewarded
 *              реклама в VK должна быть вызвана из обработчика клика, не
 *              из setTimeout/setInterval (аналог REQ-4.4 Yandex).
 *
 *              Source: https://dev.vk.com/ru/bridge/VKWebAppShowNativeAds
 *                      https://dev.vk.com/ru/bridge/VKWebAppCheckNativeAds
 */

import { LEVELS, walkFiles, readTextSafe } from './_lib.mjs';

export const ID = 'vk-ads';
export const REQUIREMENTS = ['VK-ADS-CHECK-BEFORE-SHOW', 'VK-ADS-GESTURE'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath);

  let hasShow = false, hasCheck = false;
  let showFile = null, showLine = null;

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    if (/bridge\.send\s*\(\s*["']VKWebAppCheckNativeAds["']/.test(t)) hasCheck = true;

    const showMatch = t.match(/bridge\.send\s*\(\s*["']VKWebAppShowNativeAds["']/);
    if (showMatch && !showFile) {
      hasShow = true;
      showFile = f;
      showLine = t.slice(0, t.indexOf(showMatch[0])).split('\n').length;
    }

    // GESTURE: ShowNativeAds inside setInterval/setTimeout
    const gestureRe = /(setInterval|setTimeout)\s*\([^;]*?bridge\.send\s*\(\s*["']VKWebAppShowNativeAds["']/gs;
    let m;
    while ((m = gestureRe.exec(t)) !== null) {
      issues.push({
        id: 'VK-ADS-GESTURE',
        level: LEVELS.BLOCKER,
        message: `VKWebAppShowNativeAds called inside ${m[1]} — VK requires ads to fire from a user gesture. Move into a click handler.`,
        citation: 'Interstitial и rewarded показываются только по пользовательскому действию, не из таймера/лупа',
        url: 'https://dev.vk.com/ru/mini-apps/ads/placement',
        file: f,
        line: t.slice(0, m.index).split('\n').length,
      });
    }
  }

  if (hasShow && !hasCheck) {
    issues.push({
      id: 'VK-ADS-CHECK-BEFORE-SHOW',
      level: LEVELS.WARNING,
      message: 'VKWebAppShowNativeAds is called, but VKWebAppCheckNativeAds is never invoked. Without pre-check, first-show misses often. Call Check → wait for result → Show.',
      citation: 'Перед показом рекламы рекомендуется использовать VKWebAppCheckNativeAds — проверить, готов ли баннер к показу',
      url: 'https://dev.vk.com/ru/bridge/VKWebAppCheckNativeAds',
      file: showFile,
      line: showLine,
    });
  }

  return issues;
}
