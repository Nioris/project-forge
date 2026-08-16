/**
 * @file sdk-loaded.mjs
 * @description MAX-SDK-LOADED — мини-приложение обязано подключать
 *              max-web-app.js с официального CDN в `<head>` для доступа
 *              к `window.WebApp`.
 *              Source: https://dev.max.ru/docs/webapps/bridge
 */

import path from 'node:path';
import { LEVELS, readTextSafe, findLineNo } from './_lib.mjs';

export const ID = 'sdk-loaded';
export const REQUIREMENTS = ['MAX-SDK-LOADED'];

export function validate(gamePath) {
  const issues = [];
  const htmlPath = path.join(gamePath, 'index.html');
  const html = readTextSafe(htmlPath);
  if (!html) {
    issues.push({
      id: 'MAX-SDK-LOADED',
      level: LEVELS.BLOCKER,
      message: 'index.html not found',
      file: htmlPath,
    });
    return issues;
  }

  const hasSdk =
    /<script[^>]+src=["'](https?:)?\/\/st\.max\.ru\/js\/max-web-app\.js["']/i.test(html) ||
    /<script[^>]+src=["'][^"']*max-web-app\.js["']/i.test(html);

  if (!hasSdk) {
    issues.push({
      id: 'MAX-SDK-LOADED',
      level: LEVELS.BLOCKER,
      message: 'MAX Bridge not loaded. Add <script src="https://st.max.ru/js/max-web-app.js"></script> to <head>.',
      citation: 'Через CDN добавьте библиотеку max-web-app.js. После подключения приложение получит доступ к объекту WebApp',
      url: 'https://dev.max.ru/docs/webapps/bridge',
      file: htmlPath,
    });
    return issues;
  }

  // Must be in <head>. Timing matters for getting initData before any UI logic.
  // IMPORTANT: Match the <script> tag itself, not just the filename — otherwise
  // a comment or doc link mentioning the SDK filename inside <head> masks a
  // real script tag in <body> (false negative).
  const headClose = html.search(/<\/head>/i);
  const sdkTagRe = /<script[^>]+src=["'][^"']*max-web-app\.js["']/i;
  const sdkTagMatch = sdkTagRe.exec(html);
  if (sdkTagMatch && headClose > 0 && sdkTagMatch.index > headClose) {
    issues.push({
      id: 'MAX-SDK-POSITION',
      level: LEVELS.WARNING,
      message: 'max-web-app.js loaded after </head>. Move into <head> so initData is available before game scripts run.',
      url: 'https://dev.max.ru/docs/webapps/bridge',
      file: htmlPath,
      line: html.slice(0, sdkTagMatch.index).split('\n').length,
    });
  }

  // Also flag if someone used a third-party mirror instead of st.max.ru
  const thirdPartyMirror = /<script[^>]+src=["'](https?:)?\/\/(?!st\.max\.ru)[^"']*max-web-app\.js["']/i.test(html);
  if (thirdPartyMirror) {
    issues.push({
      id: 'MAX-SDK-MIRROR',
      level: LEVELS.WARNING,
      message: 'max-web-app.js loaded from a non-official CDN. Use https://st.max.ru/js/max-web-app.js — third-party mirrors may go stale or compromise auth.',
      url: 'https://dev.max.ru/docs/webapps/bridge',
      file: htmlPath,
    });
  }

  return issues;
}
