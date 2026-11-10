import { Bot } from "grammy";
import type { Env } from "../shared/types";
import { ADMIN_USER_ID, CG_CATEGORIES } from "../shared/constants";

export function registerCgCommands(bot: Bot, env: Env) {
  // ── /deletecg (GM only, 列出或刪除 CG) ──
  bot.command("deletecg", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return ctx.reply("你不是 GM，無法使用這個指令。");

    const args = ctx.match?.trim();

    // ── 無參數：顯示分類列表 + Inline 按鈕（預覽用） ──
    if (!args) {
      const { results } = await env.vera_db.prepare(
        `SELECT id, category FROM cgs ORDER BY category, id`
      ).all();

      if (!results || results.length === 0) {
        return ctx.reply("目前沒有任何 CG。");
      }

      const grouped: Record<string, number[]> = {};
      for (const row of (results as any[])) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push(row.id);
      }

      let text = "📋 【CG 管理面板】\n\n";
      for (const [cat, ids] of Object.entries(grouped)) {
        const display = CG_CATEGORIES[cat] || cat;
        text += `${display}: ID ${ids.join(', ')}\n`;
      }
      text += "\n👇 點擊下方按鈕可預覽該分類所有 CG 圖片（每張會標明 ID）";
      text += "\n確認後使用 /deletecg <id> 刪除指定 CG。";

      const categories = Object.keys(grouped);
      const keyboard: any[][] = [];
      for (let i = 0; i < categories.length; i += 2) {
        const row: any[] = [];
        for (let j = i; j < Math.min(i + 2, categories.length); j++) {
          const cat = categories[j];
          const display = CG_CATEGORIES[cat] || cat;
          row.push({
            text: `${display} (${grouped[cat].length}張)`,
            callback_data: `deletecg:${cat}`,
          });
        }
        keyboard.push(row);
      }

      return ctx.reply(text, { reply_markup: { inline_keyboard: keyboard } });
    }

    // ── 帶參數：刪除指定 ID ──
    const id = parseInt(args, 10);
    if (isNaN(id)) return ctx.reply("請輸入有效的 CG ID（純數字），或使用 /deletecg 查看所有 CG。");

    const cg = await env.vera_db.prepare(`SELECT id, category FROM cgs WHERE id = ?`).bind(id).first() as any;
    if (!cg) return ctx.reply(`找不到 ID 為 ${id} 的 CG。`);

    await env.vera_db.prepare(`DELETE FROM cgs WHERE id = ?`).bind(id).run();

    const displayName = CG_CATEGORIES[cg.category] || cg.category;
    await ctx.reply(`🗑️ 已刪除 CG #${id}（分類：${displayName}）。`);
  });

  // ── /cg (私訊圖鑑系統) ──
  bot.command("cg", async (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply("請私訊薇拉使用 /cg 來查看你的專屬圖鑑喔～");
    }
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) return;

      const user = await env.vera_db.prepare(`SELECT unlocked_cgs FROM users WHERE user_id = ?`).bind(userId).first() as any;

      let unlocked: number[] = [];
      try { unlocked = JSON.parse(user?.unlocked_cgs || '[]'); } catch { /* ignore */ }
      const unlockedSet = new Set(unlocked);

      const { results: allCgs } = await env.vera_db.prepare(`SELECT id, category FROM cgs`).all();

      const categoryTotal: Record<string, number> = {};
      const categoryUnlocked: Record<string, number> = {};

      for (const row of (allCgs as any[])) {
        categoryTotal[row.category] = (categoryTotal[row.category] || 0) + 1;
        if (unlockedSet.has(row.id)) {
          categoryUnlocked[row.category] = (categoryUnlocked[row.category] || 0) + 1;
        }
      }

      const categories = Object.keys(categoryTotal);
      if (categories.length === 0) return ctx.reply("目前還沒有任何 CG 可以收集。");

      const keyboard: any[][] = [];
      for (let i = 0; i < categories.length; i += 2) {
        const row: any[] = [];
        for (let j = i; j < Math.min(i + 2, categories.length); j++) {
          const cat = categories[j];
          const display = CG_CATEGORIES[cat] || cat;
          const unlockedCount = categoryUnlocked[cat] || 0;
          const total = categoryTotal[cat];
          row.push({
            text: `${display} (${unlockedCount}/${total})`,
            callback_data: `cg:${cat}`,
          });
        }
        keyboard.push(row);
      }

      await ctx.reply("📸 【薇拉的私密圖鑑】\n\n請選擇要查看的分類：", {
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (error) {
      console.error("CG Panel Error:", error);
      await ctx.reply("讀取圖鑑時發生錯誤。");
    }
  });
}
