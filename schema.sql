-- 用戶資料表 (已補全所有隱藏計數器及簽到日期)
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    first_name TEXT,
    username TEXT,
    affection INTEGER DEFAULT 0,
    conversation_summary TEXT DEFAULT '',
    
    check_in_days INTEGER DEFAULT 0,
    last_greeting_date TEXT, -- 👈 新增這行：記錄最後一次簽到的日期
    date_count INTEGER DEFAULT 0,
    gifts_received TEXT DEFAULT '[]',
    favorite_call TEXT DEFAULT '',
    achievements TEXT DEFAULT '[]',
    user_likes TEXT DEFAULT '[]',
    user_dislikes TEXT DEFAULT '[]',
    special_moments TEXT DEFAULT '[]',
    
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
    
    -- 隱藏成就計數器
    hair_pull_count INTEGER DEFAULT 0,
    apron_sex_count INTEGER DEFAULT 0,
    submissive_count INTEGER DEFAULT 0,
    
    last_sex_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 短期記憶對話表 (已加入 chat_id)
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    chat_id TEXT, -- 新增了這個欄位！
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);