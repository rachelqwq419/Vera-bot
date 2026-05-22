export interface Env {
  BOT_TOKEN: string;
  DEEPSEEK_API_KEY: string;
  ciallo_db: D1Database;
}

/** 使用者資料型別（對齊 schema.sql） */
export interface UserRecord {
  user_id: string;
  first_name: string;
  username: string | null;
  affection: number;
  conversation_summary: string;
  check_in_days: number;
  last_greeting_date: string | null;
  date_count: number;
  gifts_received: string;
  favorite_call: string;
  achievements: string;
  user_likes: string;
  user_dislikes: string;
  special_moments: string;

  // 心情 (Phase 2)
  mood: string;

  // 基本性行為
  sex_count: number;
  creampie_count: number;
  paizuri_count: number;
  blowjob_count: number;
  swallow_count: number;
  handjob_count: number;
  footjob_count: number;
  public_sex_count: number;
  orgasms_given: number;
  favorite_play: string;
  cum_on_face: number;
  cum_on_tits: number;
  anal_count: number;
  kiss_count: number;
  longest_session: number;
  hair_pull_count: number;
  apron_sex_count: number;
  submissive_count: number;

  // Phase 1: 體位
  cowgirl_count: number;
  reverse_cowgirl_count: number;
  doggy_count: number;
  missionary_count: number;
  standing_count: number;
  against_wall_count: number;
  sixty_nine_count: number;
  deepthroat_count: number;

  // Phase 1: 情境
  shower_count: number;
  school_uniform_count: number;
  pantyhose_count: number;
  blindfold_count: number;

  last_sex_date: string | null;
  created_at: string;
  updated_at: string;
  unsummarized_count: number;
  last_message_time: string | null;
  temperature: number;
  unlocked_cgs: string;

  // Phase 2: 結構化用戶筆記 + 場景追蹤
  user_notes: string;    // JSON: {"name":"小明","nickname":"..."}
  last_scene: string;    // 上次場景標籤: "school" | "bar" | "home" | ""
}
