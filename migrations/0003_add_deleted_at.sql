-- ============================================================
-- 软删除比赛：为 tournaments 表添加 deleted_at 字段
-- ============================================================

-- 添加 deleted_at 字段（记录删除时间）
ALTER TABLE tournaments ADD COLUMN deleted_at TEXT;

-- 创建索引以优化查询
CREATE INDEX IF NOT EXISTS idx_tournaments_deleted ON tournaments(deleted_at);
