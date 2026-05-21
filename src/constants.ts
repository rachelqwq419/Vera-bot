// ── 常數 ──
export const ADMIN_USER_ID = "1039189463";
export const RATE_LIMIT_MS = 3000;     // 3 秒冷卻
export const HISTORY_LIMIT = 5;        // 最近的歷史訊息條數（節省 token）
export const EVENT_CHANCE = 0.04;      // 隨機酒館事件觸發機率
export const TAVERN_GROUP_NAME = "紫罗兰喵喵酒馆（休闲区）"; // 只在此群觸發隨機事件

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

/** 酒館隨機事件（使用者互動時觸發） */
export const TAVERN_EVENTS: string[] = [
  "一陣涼風從門口吹入，壁爐的火焰搖曳了一下。",
  "酒館角落的留聲機換了一首輕柔的爵士樂。",
  "店貓「奶油」輕巧地跳上吧檯，用尾巴掃過莎蘿的手背。",
  "窗外傳來細微的雨聲，雨滴輕輕敲打著玻璃窗。",
  "壁爐裡的柴火發出劈啪聲，溫暖的火光照亮了半個房間。",
  "遠處傳來馬車的鈴聲，漸漸消失在街角。",
  "一片枯葉從門縫飄了進來，落在窗台上。",
  "吧檯上的燭火輕輕晃動，在牆上投下搖曳的影子。",
];

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

/** 心情枚舉 */
export const MOODS = {
  HAPPY:   { emoji: "😊", label: "開心", description: "語氣輕快" },
  SHY:     { emoji: "😳", label: "害羞", description: "說話斷斷續續，多用「///」" },
  ANGRY:   { emoji: "😤", label: "生氣", description: "冷淡回應，扣分加重" },
} as const;
export type Mood = keyof typeof MOODS;
