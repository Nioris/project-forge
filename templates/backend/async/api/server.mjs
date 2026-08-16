/**
 * Forge async multiplayer — минимальный авторитарный бэкенд.
 * Правило: клиент присылает НАМЕРЕНИЕ, сервер считает результат и хранит истину.
 */
import Fastify from 'fastify';
import pg from 'pg';
import { verifyYandexSignature } from './sig.mjs';

const PORT = 3000;
const SECRET = process.env.YANDEX_SECRET || '';
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const app = Fastify({ logger: true, bodyLimit: 256 * 1024 });

// ── CORS: только домены платформы ──────────────────────────────
app.addHook('onRequest', async (req, reply) => {
  const o = req.headers.origin;
  if (o && ORIGINS.some(a => o === a || o.endsWith('.games.s3.yandex.net'))) {
    reply.header('Access-Control-Allow-Origin', o);
    reply.header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Headers', 'content-type,x-player-signature');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return reply.code(204).send();
});

// ── Аутентификация: ID берётся ТОЛЬКО из проверенной подписи ────
const rate = new Map(); // playerId → {n, ts} — грубый лимит 60 запросов/мин
app.decorate('auth', async (req, reply) => {
  const sig = req.headers['x-player-signature'];
  const p = verifyYandexSignature(sig, SECRET);
  if (!p) { reply.code(401).send({ error: 'bad_signature' }); return null; }
  const now = Date.now(), r = rate.get(p.id);
  if (!r || now - r.ts > 60000) rate.set(p.id, { n: 1, ts: now });
  else if (++r.n > 60) { reply.code(429).send({ error: 'rate_limit' }); return null; }
  await pool.query(
    `INSERT INTO players(id,name) VALUES($1,$2)
     ON CONFLICT(id) DO UPDATE SET seen_at=now(), name=COALESCE(EXCLUDED.name, players.name)`,
    [p.id, p.name]);
  return p;
});

app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

// ── Профиль ────────────────────────────────────────────────────
app.get('/api/me', async (req, reply) => {
  const p = await app.auth(req, reply); if (!p) return;
  const { rows } = await pool.query(
    `SELECT p.id, p.name, c.id AS clan_id, c.name AS clan_name, m.role
     FROM players p
     LEFT JOIN clan_members m ON m.player_id = p.id
     LEFT JOIN clans c ON c.id = m.clan_id
     WHERE p.id = $1`, [p.id]);
  return rows[0] || { id: p.id };
});

// ── Кланы ──────────────────────────────────────────────────────
app.post('/api/clan/create', async (req, reply) => {
  const p = await app.auth(req, reply); if (!p) return;
  const name = String(req.body?.name || '').trim().slice(0, 32);
  if (name.length < 3) return reply.code(400).send({ error: 'bad_name' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(
      `INSERT INTO clans(name, owner_id) VALUES($1,$2)
       ON CONFLICT(name) DO NOTHING RETURNING id`, [name, p.id]);
    if (!rows.length) { await c.query('ROLLBACK'); return reply.code(409).send({ error: 'name_taken' }); }
    await c.query(`INSERT INTO clan_members(clan_id, player_id, role) VALUES($1,$2,'owner')
                   ON CONFLICT DO NOTHING`, [rows[0].id, p.id]);
    await c.query('COMMIT');
    return { clan_id: rows[0].id, name };
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
});

app.post('/api/clan/join', async (req, reply) => {
  const p = await app.auth(req, reply); if (!p) return;
  const id = parseInt(req.body?.clan_id, 10);
  if (!id) return reply.code(400).send({ error: 'bad_clan' });
  await pool.query(`INSERT INTO clan_members(clan_id, player_id) VALUES($1,$2)
                    ON CONFLICT DO NOTHING`, [id, p.id]);
  return { ok: true };
});

app.get('/api/clan/:id/state', async (req, reply) => {
  const p = await app.auth(req, reply); if (!p) return;
  const { rows } = await pool.query('SELECT id, name, state, updated_at FROM clans WHERE id=$1',
    [parseInt(req.params.id, 10)]);
  if (!rows.length) return reply.code(404).send({ error: 'not_found' });
  return rows[0];
});

// ── Действие игрока: НАМЕРЕНИЕ → сервер решает ──────────────────
app.post('/api/action', async (req, reply) => {
  const p = await app.auth(req, reply); if (!p) return;
  const kind = String(req.body?.kind || '').slice(0, 40);
  const payload = req.body?.payload ?? {};
  if (!kind) return reply.code(400).send({ error: 'bad_kind' });

  const { rows: mem } = await pool.query(
    'SELECT clan_id FROM clan_members WHERE player_id=$1 LIMIT 1', [p.id]);
  const clanId = mem[0]?.clan_id || null;

  // ⬇⬇ ЗДЕСЬ ЛОГИКА ИГРЫ: проверить право, стоимость, кулдаун, посчитать результат.
  //    Никогда не принимать результат от клиента — только его намерение.
  const result = applyAction(kind, payload);

  const { rows } = await pool.query(
    `INSERT INTO actions(player_id, clan_id, kind, payload, result)
     VALUES($1,$2,$3,$4,$5) RETURNING id, created_at`,
    [p.id, clanId, kind, payload, result]);
  return { id: rows[0].id, result, at: rows[0].created_at };
});

function applyAction(kind, payload) {
  // Заглушка: замени на правила своей игры.
  return { ok: true, kind, echo: payload };
}

// ── Лента действий клана (асинхронная синхронизация) ────────────
app.get('/api/clan/:id/feed', async (req, reply) => {
  const p = await app.auth(req, reply); if (!p) return;
  const since = parseInt(req.query.since || '0', 10);
  const { rows } = await pool.query(
    `SELECT id, player_id, kind, result, created_at FROM actions
     WHERE clan_id=$1 AND id > $2 ORDER BY id ASC LIMIT 200`,
    [parseInt(req.params.id, 10), since]);
  return { events: rows, last_id: rows.length ? rows[rows.length - 1].id : since };
});

// ── Лидерборд (свой, вне лидербордов платформы) ─────────────────
app.post('/api/score', async (req, reply) => {
  const p = await app.auth(req, reply); if (!p) return;
  const board = String(req.body?.board || 'main').slice(0, 32);
  const score = Math.max(0, Math.min(Number(req.body?.score) || 0, 1e12));
  await pool.query(
    `INSERT INTO scores(board, player_id, score) VALUES($1,$2,$3)
     ON CONFLICT(board, player_id) DO UPDATE SET score=GREATEST(scores.score, EXCLUDED.score), updated_at=now()`,
    [board, p.id, score]);
  return { ok: true };
});

app.get('/api/leaderboard/:board', async (req, reply) => {
  const p = await app.auth(req, reply); if (!p) return;
  const { rows } = await pool.query(
    `SELECT s.player_id, pl.name, s.score FROM scores s
     LEFT JOIN players pl ON pl.id = s.player_id
     WHERE s.board=$1 ORDER BY s.score DESC LIMIT 100`, [req.params.board.slice(0, 32)]);
  return { board: req.params.board, top: rows };
});

// ── Покупка: валидация чека на сервере (гибридная модель) ──────
// Клиентскому «я купил» не верим. Порядок: чек → проверка у платформы → выдача → флаг платящего.
app.post('/api/purchase/validate', async (req, reply) => {
  const p = await app.auth(req, reply); if (!p) return;
  const { purchase_id, product_id, platform = 'rustore', raw } = req.body || {};
  if (!purchase_id || !product_id) return reply.code(400).send({ error: 'bad_purchase' });

  // идемпотентность: этот чек уже отработан?
  const seen = await pool.query(
    'SELECT granted FROM purchases WHERE platform=$1 AND purchase_id=$2', [platform, purchase_id]);
  if (seen.rows.length) return { ok: true, already: true, granted: seen.rows[0].granted };

  // ⬇⬇ ЗДЕСЬ проверка чека у платформы (RuStore Pay SDK server API).
  //    Пока не подключена — считаем покупку НЕподтверждённой и товар НЕ выдаём.
  const validated = await validateReceipt(platform, purchase_id, raw);
  if (!validated) return reply.code(402).send({ error: 'not_validated' });

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`INSERT INTO purchases(player_id, platform, purchase_id, product_id, raw, validated, granted)
                   VALUES($1,$2,$3,$4,$5,true,true)
                   ON CONFLICT (platform, purchase_id) DO NOTHING`,
      [p.id, platform, purchase_id, product_id, raw || {}]);
    await c.query('UPDATE players SET is_payer=true WHERE id=$1', [p.id]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }

  return { ok: true, granted: true, product_id };
});

async function validateReceipt(platform, purchaseId, raw) {
  // TODO: серверная проверка у RuStore. До подключения — false: лучше не выдать,
  // чем выдать по поддельному чеку.
  return false;
}

app.listen({ port: PORT, host: '0.0.0.0' }).catch(e => { app.log.error(e); process.exit(1); });
