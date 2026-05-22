-- 用戶資料表
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    first_name TEXT,
    username TEXT,
    affection INTEGER DEFAULT 0,
    conversation_summary TEXT DEFAULT '',
    unsummarized_count INTEGER DEFAULT 0,

    check_in_days INTEGER DEFAULT 0,
    last_greeting_date TEXT,
    date_count INTEGER DEFAULT 0,
    gifts_received TEXT DEFAULT '[]',
    favorite_call TEXT DEFAULT '',
    achievements TEXT DEFAULT '[]',
    user_likes TEXT DEFAULT '[]',
    user_dislikes TEXT DEFAULT '[]',
    special_moments TEXT DEFAULT '[]',

    -- 心情系統 (Phase 2)
    mood TEXT DEFAULT 'HAPPY',

    -- 基本性行為統計
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

    hair_pull_count INTEGER DEFAULT 0,
    apron_sex_count INTEGER DEFAULT 0,
    submissive_count INTEGER DEFAULT 0,

    -- Phase 1: 新增體位統計
    cowgirl_count INTEGER DEFAULT 0,
    reverse_cowgirl_count INTEGER DEFAULT 0,
    doggy_count INTEGER DEFAULT 0,
    missionary_count INTEGER DEFAULT 0,
    standing_count INTEGER DEFAULT 0,
    against_wall_count INTEGER DEFAULT 0,
    sixty_nine_count INTEGER DEFAULT 0,
    deepthroat_count INTEGER DEFAULT 0,

    -- Phase 1: 新增情境統計（不計成就，僅 flavor tracking）
    shower_count INTEGER DEFAULT 0,
    school_uniform_count INTEGER DEFAULT 0,
    pantyhose_count INTEGER DEFAULT 0,
    blindfold_count INTEGER DEFAULT 0,

    last_sex_date DATETIME,
    last_message_time TEXT,             -- rate limit tracking (ISO datetime)
    temperature REAL DEFAULT 0.85,      -- per-user AI temperature

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 短期記憶對話表
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    chat_id TEXT,
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

-- 管理員操作日誌
CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    target_user_id TEXT,
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CG 圖鑑表 (Phase 3)
CREATE TABLE IF NOT EXISTS cgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    file_id TEXT NOT NULL
);

-- 每日任務表 (Phase 2)
CREATE TABLE IF NOT EXISTS daily_quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    quest_date TEXT NOT NULL,
    quest_id TEXT NOT NULL,
    description TEXT NOT NULL,
    reward INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

