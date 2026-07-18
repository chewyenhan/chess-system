-- ============================================================
-- 成绩撤销功能：为 matches 表添加 updated_at 字段
-- ============================================================

-- 添加 updated_at 字段（记录最后一次修改时间，默认为当前时间）
ALTER TABLE matches ADD COLUMN updated_at TEXT;

-- 更新现有记录的 updated_at
UPDATE matches SET updated_at = datetime('now') WHERE updated_at IS NULL;

-- 创建索引以优化查询
CREATE INDEX IF NOT EXISTS idx_matches_updated_at ON matches(updated_at);
