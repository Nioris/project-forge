-- Асинхронный мультиплеер: игроки, общее состояние, кланы, лидерборд, ходы.
CREATE TABLE IF NOT EXISTS players (
  id           TEXT PRIMARY KEY,               -- проверенный ID игрока платформы
  platform     TEXT NOT NULL DEFAULT 'yandex', -- yandex | rustore | web
  name         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clans (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES players(id),
  state       JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clan_members (
  clan_id   BIGINT REFERENCES clans(id) ON DELETE CASCADE,
  player_id TEXT REFERENCES players(id),
  role      TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (clan_id, player_id)
);

-- Ходы/действия: сервер решает, клиент только просит
CREATE TABLE IF NOT EXISTS actions (
  id         BIGSERIAL PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players(id),
  clan_id    BIGINT REFERENCES clans(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  result     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS actions_clan_idx ON actions(clan_id, id DESC);

CREATE TABLE IF NOT EXISTS scores (
  board      TEXT NOT NULL,
  player_id  TEXT NOT NULL REFERENCES players(id),
  score      BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board, player_id)
);
CREATE INDEX IF NOT EXISTS scores_board_idx ON scores(board, score DESC);

-- Покупки: валидация на сервере, идемпотентность по чеку
CREATE TABLE IF NOT EXISTS purchases (
  id           BIGSERIAL PRIMARY KEY,
  player_id    TEXT NOT NULL REFERENCES players(id),
  platform     TEXT NOT NULL DEFAULT 'rustore',
  purchase_id  TEXT NOT NULL,            -- id покупки платформы
  product_id   TEXT NOT NULL,
  amount       NUMERIC(12,2),
  currency     TEXT DEFAULT 'RUB',
  validated    BOOLEAN NOT NULL DEFAULT false,
  granted      BOOLEAN NOT NULL DEFAULT false,
  raw          JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, purchase_id)          -- один чек = одна выдача
);
CREATE INDEX IF NOT EXISTS purchases_player_idx ON purchases(player_id, created_at DESC);

-- Флаг «платящий»: платящему реклама не показывается
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_payer BOOLEAN NOT NULL DEFAULT false;
