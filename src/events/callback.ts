import { Bot } from "grammy";
import type { Env } from "../shared/types";
import { ADMIN_USER_ID, CG_CATEGORIES } from "../shared/constants";

export function registerCallbackEvents(bot: Bot, env: Env) {
  // ── callback_query：處理導航與圖鑑 ──
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    // ── deletecg: 分類預覽（GM only） ──
    if (data.startsWith('deletecg:')) {
      const adminId = ctx.from?.id.toString();
      if (adminId !== ADMIN_USER_ID) {
        await ctx.answerCallbackQuery({ text: "你不是 GM，沒有權限預覽 CG。", show_alert: true });
        return;
      }

      const category = data.slice(9);
      const { results: cgList } = await env.vera_db.prepare(
        `SELECT id, file_id, category FROM cgs WHERE category = ? ORDER BY id`
      ).bind(category).all();

      if (!cgList || cgList.length === 0) {
        await ctx.answerCallbackQuery({ text: "這個分類沒有任何 CG。", show_alert: true });
        return;
      }

      const displayCat = CG_CATEGORIES[category] || category;
      await ctx.answerCallbackQuery({ text: `正在載入 ${displayCat} 全部 ${cgList.length} 張 CG...` });

      const rows = cgList as any[];
      for (let i = 0; i < rows.length; i++) {
        await ctx.replyWithPhoto(rows[i].file_id, {
          caption: `[ID: ${rows[i].id}] ${displayCat}`,
        });
      }
      await ctx.reply(
        `以上為【${displayCat}】全部 ${rows.length} 張 CG。\n使用 /deletecg <id> 刪除指定 CG。`
      );
      return;
    }

    // ── cg: 用戶圖鑑瀏覽 ──
    if (!data.startsWith('cg:')) return;

    const category = data.slice(3);
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const user = await env.vera_db.prepare(
      `SELECT unlocked_cgs FROM users WHERE user_id = ?`
    ).bind(userId).first() as { unlocked_cgs: string } | null;

    let unlocked: number[] = [];
    try { unlocked = JSON.parse(user?.unlocked_cgs || '[]'); } catch { /* ignore */ }
    const unlockedSet = new Set(unlocked);

    const { results: cgs } = await env.vera_db.prepare(
      `SELECT id, file_id FROM cgs WHERE category = ?`
    ).bind(category).all();

    const unlockedCgs = (cgs as any[]).filter((cg: any) => unlockedSet.has(cg.id));

    if (unlockedCgs.length === 0) {
      await ctx.answerCallbackQuery({ text: "你還沒有解鎖這個分類的任何 CG！", show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: `正在載入 ${CG_CATEGORIES[category] || category}...` });

    for (let i = 0; i < unlockedCgs.length; i += 10) {
      const batch = unlockedCgs.slice(i, i + 10);
      if (batch.length === 1) {
        await ctx.replyWithPhoto(batch[0].file_id, {
          caption: `${CG_CATEGORIES[category] || category} (1/${unlockedCgs.length})`,
        });
      } else {
        const media = batch.map((cg: any) => ({
          type: 'photo' as const,
          media: cg.file_id,
        }));
        await ctx.replyWithMediaGroup(media);
      }
    }
  });
}
