import { ADMIN_USER_ID } from "./constants";
import type { Env } from "./types";

/** 好感度對應的關係稱號 */
export function getAffectionTitle(affection: number, userId?: string): string {
  // 👑 創作者 (音) 專屬稱號
  if (userId === ADMIN_USER_ID) {
    if (affection < 30)  return "敬愛的創作者";
    if (affection < 70)  return "最愛的姐姐大人";
    if (affection < 90)  return "至高無上的主宰";
    return "唯一的靈魂伴侶";
  }

  // 👥 普通客人稱號 (非戀愛向)
  if (affection <= 0)  return "陌生人";
  if (affection < 10)  return "初次見面";
  if (affection < 30)  return "普通客人";
  if (affection < 50)  return "熟客";
  if (affection < 70)  return "朋友";
  if (affection < 90)  return "摯友";
  if (affection < 100) return "深厚羈絆";
  return "終極忠誠侍奉";
}

/** 記錄特殊時刻 */
export async function recordSpecialMoment(env: Env, userId: string, event: string) {
  try {
    const user = await env.ciallo_db.prepare(
      `SELECT special_moments FROM users WHERE user_id = ?`
    ).bind(userId).first() as { special_moments: string } | null;
    if (!user) return;

    let moments: Array<{ time: string; event: string }> = [];
    try { moments = JSON.parse(user.special_moments || '[]'); } catch (_e) { /* ignore */ }

    moments.push({ time: new Date().toISOString(), event });
    // 保留最多 50 條
    if (moments.length > 50) moments = moments.slice(-50);

    await env.ciallo_db.prepare(
      `UPDATE users SET special_moments = ? WHERE user_id = ?`
    ).bind(JSON.stringify(moments), userId).run();
  } catch (_e) { /* silently fail */ }
}

/** 記錄管理員操作 */
export async function logAdminAction(env: Env, adminId: string, targetUserId: string, action: string, details: string = ''): Promise<void> {
  await env.ciallo_db.prepare(
    `INSERT INTO admin_logs (admin_id, target_user_id, action, details) VALUES (?, ?, ?, ?)`
  ).bind(adminId, targetUserId, action, details).run();
}

/**
 * 記錄錯誤日誌供後台診斷
 */
export async function logError(env: Env, userId: string | null, chatId: string | null, type: string, message: string, details: string = ''): Promise<void> {
  try {
    await env.ciallo_db.prepare(
      `INSERT INTO error_logs (user_id, chat_id, error_type, message, details) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, chatId, type, message, details).run();
  } catch (e) {
    console.error("Failed to log error to DB:", e);
  }
}

/** 確保用戶記錄存在（供指令 handler 使用，避免只打指令不聊天的用戶無紀錄） */
export async function ensureUserExists(env: Env, userId: string, userName: string, userLogin?: string): Promise<void> {
  await env.ciallo_db.prepare(
    `INSERT INTO users (user_id, first_name, username, affection, unsummarized_count, join_order) 
     VALUES (?, ?, ?, 40, 0, (SELECT IFNULL(MAX(join_order), 0) + 1 FROM users))
     ON CONFLICT(user_id) DO UPDATE SET 
       first_name = CASE WHEN first_name = '' THEN excluded.first_name ELSE first_name END,
       username = excluded.username`
  ).bind(userId, userName, userLogin || null).run();
}

/** 清理舊訊息：當總量超過 1000 條時執行大清掃（節省 Token 與防止邏輯混亂） */
export async function pruneOldMessages(env: Env): Promise<void> {
  try {
    // 1. 檢查總訊息量
    const { results } = await env.ciallo_db.prepare(
      `SELECT COUNT(*) as total FROM messages`
    ).all();
    const total = (results?.[0] as any)?.total || 0;

    if (total >= 1000) {
      await env.ciallo_db.prepare(`DELETE FROM messages`).run();
      console.log(`🧹 [自動清理] 訊息量達到 ${total} 條，已執行全量清空。`);
      return;
    }

    // 2. 次要保險：清理超過 7 天的舊訊息
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await env.ciallo_db.prepare(
      `DELETE FROM messages WHERE created_at < ?`
    ).bind(cutoff).run();
  } catch (_e) { 
    console.error("清理訊息出錯:", _e);
  }
}
