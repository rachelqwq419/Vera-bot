-- Phase 1 体位/情境列 + unsummarized_count 迁移
-- 只对线上旧版数据库执行，全新部署不需要此文件
ALTER TABLE users ADD COLUMN cowgirl_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN reverse_cowgirl_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN doggy_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN missionary_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN standing_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN against_wall_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN sixty_nine_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN deepthroat_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN shower_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN school_uniform_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN pantyhose_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN blindfold_count INTEGER DEFAULT 0;
