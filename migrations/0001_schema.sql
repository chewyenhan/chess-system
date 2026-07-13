-- ============================================================
-- 学校国际象棋比赛系统 — 数据库建表
-- Cloudflare D1 (SQLite)
-- ============================================================

-- 比赛
CREATE TABLE IF NOT EXISTS tournaments (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  total_rounds INTEGER NOT NULL DEFAULT 5,
  tie_breakers TEXT NOT NULL DEFAULT '["buchholz","direct","sonneborn"]',  -- JSON 数组, 破同分规则优先级
  current_round INTEGER NOT NULL DEFAULT 0,  -- 0=准备中, 1-N=进行中
  status       TEXT NOT NULL DEFAULT 'SETUP', -- SETUP, PAIRING_PUBLISHED, ROUND_ENDED, FINISHED
  admin_token  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 选手
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  name          TEXT NOT NULL,
  grade         TEXT DEFAULT '',              -- 年级（如"初一", "高三"）
  is_active     INTEGER NOT NULL DEFAULT 1,   -- 0=退赛
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 对局
CREATE TABLE IF NOT EXISTS matches (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  round         INTEGER NOT NULL,
  board_number  INTEGER NOT NULL,
  white_player_id TEXT DEFAULT NULL,          -- 轮空(BYE)时双方均为 NULL
  black_player_id TEXT DEFAULT NULL,
  result        TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, WHITE_WIN, BLACK_WIN, DRAW, BYE
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_players_tournament   ON players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament   ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_round        ON matches(tournament_id, round);
CREATE INDEX IF NOT EXISTS idx_tournaments_token     ON tournaments(admin_token);
