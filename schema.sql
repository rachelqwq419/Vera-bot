DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS users;

-- 用戶資料表 (包含好感度與各種紀錄)
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    first_name TEXT,
    username TEXT,
    affection INTEGER DEFAULT 0, -- 好感度 0-100
    conversation_summary TEXT DEFAULT '', -- 長期記憶總結
    
    -- 日常紀錄
    check_in_days INTEGER DEFAULT 0,
    date_count INTEGER DEFAULT 0,
    gifts_received TEXT DEFAULT '[]', -- JSON array
    favorite_call TEXT DEFAULT '',
    achievements TEXT DEFAULT '[]', -- JSON array
    user_likes TEXT DEFAULT '[]', -- JSON array
    user_dislikes TEXT DEFAULT '[]', -- JSON array
    special_moments TEXT DEFAULT '[]', -- JSON array
    
    -- 性事追蹤紀錄
    sex_count INTEGER DEFAULT 0,
    creampie_count INTEGER DEFAULT 0,
    paizuri_count INTEGER DEFAULT 0,
    blowjob_count INTEGER DEFAULT 0,
    swallow_count INTEGER DEFAULT 0,
    handjob_count INTEGER DEFAULT 0,
    footjob_count INTEGER DEFAULT 0,
    public_sex_count INTEGER DEFAULT 0,
    orgasms_given INTEGER DEFAULT 0,
    favorite_play TEXT DEFAULT '',
    cum_on_face INTEGER DEFAULT 0,
    cum_on_tits INTEGER DEFAULT 0,
    anal_count INTEGER DEFAULT 0,
    kiss_count INTEGER DEFAULT 0,
    longest_session INTEGER DEFAULT 0,
    last_sex_date DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 短期記憶對話表
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    role TEXT, -- 'user' or 'assistant'
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);