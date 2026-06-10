import { ADMIN_USER_ID } from "./constants";
import type { Env } from "./types";

/** 記錄特殊數據時刻 */
export async function recordSpecialMoment(env: Env, userId: string, event: string) {
  try {
    const user = await env.vera_db.prepare(
      `SELECT special_moments FROM users WHERE user_id = ?`
    ).bind(userId).first() as { special_moments: string } | null;
    if (!user) return;

    let moments: Array<{ time: string; event: string }> = [];
    try { moments = JSON.parse(user.special_moments || '[]'); } catch (_e) { /* ignore */ }

    moments.push({ time: new Date().toISOString(), event });
    if (moments.length > 50) moments = moments.slice(-50);

    await env.vera_db.prepare(
      `UPDATE users SET special_moments = ? WHERE user_id = ?`
    ).bind(JSON.stringify(moments), userId).run();
  } catch (_e) { /* silently fail */ }
}

/** 記錄管理員操作 */
export async function logAdminAction(env: Env, adminId: string, targetUserId: string, action: string, details: string = ''): Promise<void> {
  await env.vera_db.prepare(
    `INSERT INTO admin_logs (admin_id, target_user_id, action, details) VALUES (?, ?, ?, ?)`
  ).bind(adminId, targetUserId, action, details).run();
}

/** 記錄系統錯誤 */
export async function logError(env: Env, userId: string | null, chatId: string | null, type: string, message: string, details: string = ''): Promise<void> {
  try {
    await env.vera_db.prepare(
      `INSERT INTO error_logs (user_id, chat_id, error_type, message, details) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, chatId, type, message, details).run();
  } catch (e) {
    console.error("Failed to log error to DB:", e);
  }
}

/** 確保用戶記錄存在 */
export async function ensureUserExists(env: Env, userId: string, userName: string, userLogin?: string): Promise<void> {
  await env.vera_db.prepare(
    `INSERT INTO users (user_id, first_name, username, unsummarized_count, join_order) 
     VALUES (?, ?, ?, 0, (SELECT IFNULL(MAX(join_order), 0) + 1 FROM users))
     ON CONFLICT(user_id) DO UPDATE SET 
       first_name = CASE WHEN first_name = '' THEN excluded.first_name ELSE first_name END,
       username = excluded.username`
  ).bind(userId, userName, userLogin || null).run();
}

/** 清理舊數據 */
export async function pruneOldMessages(env: Env): Promise<void> {
  try {
    const { results } = await env.vera_db.prepare(`SELECT COUNT(*) as total FROM messages`).all();
    const total = (results?.[0] as any)?.total || 0;
    if (total >= 1000) {
      await env.vera_db.prepare(`DELETE FROM messages`).run();
      console.log(`🧹 [系統清理] 數據緩存已清空。`);
      return;
    }
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await env.vera_db.prepare(`DELETE FROM messages WHERE created_at < ?`).bind(cutoff).run();
  } catch (_e) { 
    console.error("清理數據出錯:", _e);
  }
}
