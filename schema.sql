-- ============================================================
-- 学校国际象棋比赛系统 — 数据库建表（参考用）
-- 实际迁移文件见 migrations/0001_schema.sql
-- ============================================================

-- 比赛
CREATE TABLE tournaments (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  total_rounds INTEGER NOT NULL DEFAULT 5,
  tie_breakers TEXT NOT NULL DEFAULT '["buchholz","direct","sonneborn"]',
  current_round INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'SETUP',
  admin_token  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 选手
CREATE TABLE players (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  name          TEXT NOT NULL,
  grade         TEXT DEFAULT '',
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 对局
CREATE TABLE matches (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  round         INTEGER NOT NULL,
  board_number  INTEGER NOT NULL,
  white_player_id TEXT DEFAULT NULL,
  black_player_id TEXT DEFAULT NULL,
  result        TEXT NOT NULL DEFAULT 'PENDING',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
