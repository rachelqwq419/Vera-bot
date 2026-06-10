// 🌟 基礎設定 🌟
export const ADMIN_USER_ID = "1039189463";
export const ADMIN_ALIASES = ["姐姐", "小音", "音姐姐", "Yin", "音姐姐大人", "姐姐大人", "小音姐姐大人","主人","小主人","音音","音大人"];
export const MARU_USER_ID = "6172812239";    // 舞瑠的 TG ID
export const BOSS_ID = "7804622477";         // 瑪麗老闆的 TG ID   
export const LALA_USER_ID = "6299565972";    // 菈菈 的 TG ID       
export const KANON_USER_ID = "7234543848";   // 花音 的 TG ID      
export const BOSS_USERNAME = "@Merryhiruwa"; // 瑪麗老闆的 TG 帳號
export const HISTORY_LIMIT = 30;       // 記憶歷史訊息數量以控制上下文長度

/** 允許透過 /setstat 指令修改的屬性白名單（防止 SQL Injection） */
export const ALLOWED_SETSTAT_COLUMNS: readonly string[] = [
  "unsummarized_count", "temperature"
];

/** 每日占卜 */
export const FORTUNES: string[] = [
  "大吉 ✨ 今天你會遇到很棒的事情喔！快點去買張彩票吧！",
  "中吉 🌟 不錯的一天，和別人聊聊天會收穫好心情。",
  "小吉 🌸 平靜就是福，喝杯熱茶享受今天的悠閒吧。",
  "平靜 🍵 今天適合好好休息，不要給自己太多壓力。",
  "大凶 🌩️ 今天說話要小心點，不然可能會惹人生氣喔…",
];

/** CG 分類對應顯示名稱 */
export const CG_CATEGORIES: Record<string, string> = {
  selfie:          '📸 日常自拍',
  uniform:         '👗 酒館制服',
  school:          '🎒 學校日常',
};

/** 心情狀態 */
export const MOODS = {
  HAPPY:    { emoji: "😊", label: "開心",    description: "心情非常愉快，充滿活力" },
  SHY:      { emoji: "😳", label: "害羞",    description: "覺得有點不好意思，臉頰微紅" },
  ANGRY:    { emoji: "😡", label: "生氣",    description: "覺得被冒犯了，有點不爽" },
  HUNGRY:   { emoji: "🤤", label: "肚子餓",  description: "想吃點甜食或者零食" },
} as const;
export type Mood = keyof typeof MOODS;
