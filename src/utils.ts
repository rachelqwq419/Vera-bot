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
