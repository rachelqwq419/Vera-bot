import type { Env } from "./types";

/** 好感度對應的關係稱號 */
export function getAffectionTitle(affection: number): string {
  if (affection <= 0)  return "陌生人";
  if (affection < 10)  return "初次見面";
  if (affection < 30)  return "普通客人";
  if (affection < 50)  return "熟客";
  if (affection < 70)  return "朋友";
  if (affection < 90)  return "摯友";
  if (affection < 100) return "戀人";
  return "靈魂伴侶";
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
export async function logAdminAction(env: Env, adminId: string, targetUserId: string, action: string, details: string) {
  try {
    await env.ciallo_db.prepare(
      `INSERT INTO admin_logs (admin_id, target_user_id, action, details) VALUES (?, ?, ?, ?)`
    ).bind(adminId, targetUserId, action, details).run();
  } catch (_e) { /* silently fail */ }
}

/** 確保用戶記錄存在（供指令 handler 使用，避免只打指令不聊天的用戶無紀錄） */
export async function ensureUserExists(env: Env, userId: string, userName: string): Promise<void> {
  await env.ciallo_db.prepare(
    `INSERT INTO users (user_id, first_name, unsummarized_count) VALUES (?, ?, 0)
     ON CONFLICT(user_id) DO UPDATE SET first_name = excluded.first_name WHERE first_name = ''`
  ).bind(userId, userName).run();
}

/** 清理超過 7 天的舊訊息（防止 messages 表無限增長） */
export async function pruneOldMessages(env: Env): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { meta } = await env.ciallo_db.prepare(
      `DELETE FROM messages WHERE created_at < ?`
    ).bind(cutoff).run();
    if ((meta as any)?.changes > 0) {
      console.log(`🧹 已清理 ${(meta as any).changes} 條舊訊息（早於 ${cutoff}）`);
    }
  } catch (_e) { /* silently fail */ }
}
