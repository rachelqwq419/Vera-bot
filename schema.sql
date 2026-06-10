-- 基礎資料表
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

    mood TEXT DEFAULT 'HAPPY',
    favorite_play TEXT DEFAULT '',

    last_message_time TEXT,             -- rate limit tracking (ISO datetime)
    temperature REAL DEFAULT 0.85,      -- per-user AI temperature
    join_order INTEGER,                 -- 記錄是第幾位訪客
    unlocked_cgs TEXT DEFAULT '[]',

    user_notes TEXT DEFAULT '{}',       -- JSON: {"name":"小明","nickname":"..."}
    last_scene TEXT DEFAULT '',         -- 上次場景: "school" | "bar" | "home" | ""

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 聊天紀錄表
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    chat_id TEXT,
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

-- 管理員操作紀錄
CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    target_user_id TEXT,
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CG 圖片庫
CREATE TABLE IF NOT EXISTS cgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    file_id TEXT NOT NULL
);

-- 每日任務表
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

-- 系統錯誤日誌
CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    chat_id TEXT,
    error_type TEXT,
    message TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API Keys 管理
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 待生成的圖片任務
CREATE TABLE IF NOT EXISTS pending_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    thread_id INTEGER,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
