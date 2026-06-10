-- 建立房間數據表 (如果不存在)
CREATE TABLE IF NOT EXISTS rooms (
    chat_id TEXT,
    thread_id INTEGER,
    room_name TEXT,
    description TEXT DEFAULT '', -- 房間介紹
    is_visible INTEGER DEFAULT 1, -- 是否顯示在導航列表中 (1: 是, 0: 否)
    PRIMARY KEY (chat_id, thread_id)
);

-- 遷移：加入介紹與可見度欄位 (如果表已存在)
-- 注意：D1 不支援直接用 IF NOT EXISTS 在 ALTER TABLE，這裡假設如果表已存在則補上欄位
-- 實際上可以在 D1 控制台手動執行或透過 migration 檔案執行
-- ALTER TABLE rooms ADD COLUMN description TEXT DEFAULT '';
-- ALTER TABLE rooms ADD COLUMN is_visible INTEGER DEFAULT 1;
