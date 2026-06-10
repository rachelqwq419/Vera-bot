export interface Env {
  BOT_TOKEN: string;
  DEEPSEEK_API_KEY: string;
  GEMINI_API_KEY: string;
  TAVILY_API_KEY?: string;
  VOICE_API_URL?: string; // GPT-SoVITS API 端點
  vera_db: D1Database;
  VECTOR_INDEX: VectorizeIndex;
  AI: any;
}

/** 使用者資料結構（對應 schema.sql） */
export interface UserRecord {
  user_id: string;
  first_name: string;
  username: string | null;
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

  mood: string;
  favorite_play: string;

  created_at: string;
  updated_at: string;
  unsummarized_count: number;
  last_message_time: string | null;
  temperature: number;
  unlocked_cgs: string;
  join_order?: number | null;

  user_notes: string;    // JSON: {"name":"小明","nickname":"..."}
  last_scene: string;    // 上次場景標籤: "school" | "bar" | "home" | ""
  titles: string;        // JSON array of strings: '["貓科動物觀測對象"]'
}
