// ── 常數 ──
export const ADMIN_USER_ID = "1039189463";
export const MARU_USER_ID = "6172812239";    // 舞瑠的 TG ID
export const BOSS_ID = "7804622477";         // 👑 瑪麗老闆的 TG ID
export const BOSS_USERNAME = "@Merryhiruwa"; // 👑 瑪麗老闆的 TG 帳號
export const RATE_LIMIT_MS = 3000;     // 3 秒冷卻
export const HISTORY_LIMIT = 12;       // 最近的歷史訊息條數（多用戶場景需要更多上下文）

/** 允許透過 /setstat 直接修改的欄位白名單（防止 SQL Injection） */
export const ALLOWED_SETSTAT_COLUMNS: readonly string[] = [
  "affection", "check_in_days", "sex_count", "kiss_count",
  "creampie_count", "paizuri_count", "blowjob_count", "swallow_count",
  "handjob_count", "footjob_count", "anal_count", "cum_on_face", "cum_on_tits",
  "orgasms_given", "public_sex_count", "hair_pull_count", "apron_sex_count",
  "submissive_count", "longest_session", "unsummarized_count", "temperature",
  // Phase 1: 新增體位
  "cowgirl_count", "reverse_cowgirl_count", "doggy_count", "missionary_count",
  "standing_count", "against_wall_count", "sixty_nine_count", "deepthroat_count",
  // Phase 1: 新增情境（不計次數但仍可 setstat）
  "shower_count", "school_uniform_count", "pantyhose_count", "blindfold_count",
];

/** 禮物定義（送禮指令觸發） */
export const GIFT_SHOP: Record<string, { name: string; affection: number; emoji: string }> = {
  rose:     { name: "玫瑰花",   affection: 5,  emoji: "🌹" },
  chocolate:{ name: "巧克力",   affection: 3,  emoji: "🍫" },
};

/** 每日占卜 */
export const FORTUNES: string[] = [
  "大吉 ★ 今天你與莎蘿的羈絆會更加深刻，說不定能解鎖新的成就。",
  "中吉 ★ 適合與莎蘿聊聊天，她今天心情似乎特別好。",
  "小吉 ★ 運勢平穩，送一朵玫瑰花會讓今天更加美好。",
  "末吉 ★ 今天可能不太順利，但莎蘿會在酒館等你來傾訴。",
  "大凶 ★ 今天諸事不宜……不過莎蘿會在酒館替你加油的。",
];

/** 每日任務池 */
export const DAILY_QUESTS: Array<{ id: string; description: string; reward: number }> = [
  { id: "send_rose",    description: "送莎蘿一朵玫瑰花",           reward: 3 },
  { id: "tell_secret",  description: "向莎蘿分享一個秘密",         reward: 2 },
  { id: "play_game",    description: "和莎蘿玩一個小遊戲",         reward: 2 },
  { id: "ask_question", description: "問莎蘿一個關於她的問題",     reward: 1 },
  { id: "compliment",   description: "讚美莎蘿",                   reward: 2 },
  { id: "order_drink",  description: "在酒館點一杯飲料",           reward: 2 },
];

/** CG 分類對照表（category → 顯示名稱） */
export const CG_CATEGORIES: Record<string, string> = {
  kiss:            '💋 親吻',
  creampie:        '💦 內射',
  paizuri:         '🍼 乳交',
  blowjob:         '👄 口交',
  swallow:         '👅 吞精',
  handjob:         '👐 手交',
  footjob:         '🦶 足交',
  anal:            '🍑 後庭',
  cum_face:        '🎯 顏射',
  cum_tits:        '💗 胸射',
  orgasm:          '🌟 高潮',
  public:          '🚫 公開場合',
  hair_pull:       '💇 抓髮',
  apron:           '👗 圍裙',
  submissive:      '🔗 臣服',
  cowgirl:         '🐮 騎乘位',
  reverse_cowgirl: '🔄 反向騎乘',
  doggy:           '🐕 後入式',
  missionary:      '🛐 正常位',
  standing:        '🧍 站立式',
  against_wall:    '🧱 壁咚',
  sixty_nine:      '🔢 69式',
  deepthroat:      '🗣️ 深喉',
  shower:          '🚿 浴室',
  school_uniform:  '👔 制服',
  pantyhose:       '🧦 絲襪',
  blindfold:       '🙈 蒙眼',
};

/** 心情枚舉 */
export const MOODS = {
  HAPPY:    { emoji: "😊", label: "開心",    description: "語氣輕快活潑，樂於互動" },
  SHY:      { emoji: "😳", label: "害羞",    description: "說話斷斷續續，多用「///」，容易臉紅" },
  ANGRY:    { emoji: "😤", label: "生氣",    description: "冷淡回應，扣分加重，不願配合" },
  AROUSED:  { emoji: "🔥", label: "興奮",    description: "性愛狀態中被挑起慾望，語氣嬌喘、主動迎合" },
  LUST:     { emoji: "💗", label: "淫亂",    description: "完全發情，極度渴望被侵犯，語氣大膽放蕩，主動索求" },
} as const;
export type Mood = keyof typeof MOODS;
