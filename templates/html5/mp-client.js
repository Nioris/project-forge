/**
 * mp-client.js — клиентский слой асинхронного мультиплеера Forge.
 * Подключается ПОСЛЕ инициализации Yandex SDK. Никогда не шлёт свой ID —
 * только подпись платформы, ID сервер извлекает сам.
 *
 * const MP = createMP({ base: 'https://mp.example.ru/api', ysdk });
 * await MP.ready();  const me = await MP.me();
 */
function createMP(opts) {
  var base = String(opts.base || '').replace(/\/+$/, '');
  var ysdk = opts.ysdk, sig = null, offline = false;

  async function ready() {
    try {
      var player = await ysdk.getPlayer({ signed: true, scopes: false });
      sig = (typeof player.signature === 'string') ? player.signature : null;
      if (!sig && player.getSignature) sig = await player.getSignature();
    } catch (e) { sig = null; }
    if (!sig) { offline = true; console.warn('[MP] нет подписи игрока — оффлайн-режим'); }
    return !offline;
  }

  async function call(path, body, method) {
    if (offline) throw new Error('offline');
    var res = await fetch(base + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: Object.assign({ 'x-player-signature': sig || '' },
        body ? { 'content-type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) throw new Error('rate_limit');
    if (!res.ok) throw new Error('http_' + res.status);
    return res.json();
  }
  // одна повторная попытка на сетевую икоту, дальше — наверх
  async function callRetry(p, b, m) {
    try { return await call(p, b, m); }
    catch (e) { if (String(e.message).startsWith('http_5') || e.message === 'Failed to fetch') {
      await new Promise(function (r) { setTimeout(r, 800); }); return call(p, b, m); } throw e; }
  }

  return {
    ready: ready,
    get offline() { return offline; },
    me: function () { return callRetry('/me'); },
    createClan: function (name) { return callRetry('/clan/create', { name: name }); },
    joinClan: function (id) { return callRetry('/clan/join', { clan_id: id }); },
    clanState: function (id) { return callRetry('/clan/' + id + '/state'); },
    feed: function (id, since) { return callRetry('/clan/' + id + '/feed?since=' + (since | 0)); },
    action: function (kind, payload) { return callRetry('/action', { kind: kind, payload: payload || {} }); },
    submitScore: function (board, score) { return callRetry('/score', { board: board, score: score }); },
    leaderboard: function (board) { return callRetry('/leaderboard/' + encodeURIComponent(board)); },
  };
}
