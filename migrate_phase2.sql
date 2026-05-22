-- Phase 2 用户笔记 + 场景追踪 + 记忆系统重构迁移
-- 全新部署不需要此文件（schema.sql 已包含），仅对线上旧库执行
ALTER TABLE users ADD COLUMN user_notes TEXT DEFAULT '{}';
ALTER TABLE users ADD COLUMN last_scene TEXT DEFAULT '';
