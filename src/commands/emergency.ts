import { Bot } from "grammy";
import type { Env } from "../shared/types";
import { ADMIN_USER_ID } from "../shared/constants";

export function registerEmergencyCommands(bot: Bot, env: Env) {
  // ── /emergency (緊急呼叫姐姐大人) ──
  bot.command("emergency", async (ctx) => {
    const adminMention = `[姐姐大人](tg://user?id=${ADMIN_USER_ID})`;
    const reporter = ctx.from?.first_name || "一位朋友";
    
    // 1. 通知姐姐大人
    await ctx.reply(`🚨 **呼叫姐姐大人！**\n\n薇拉好像有點不太對勁，${reporter} 正在呼叫妳呢！\n${adminMention} 姐姐大人快來看看呀～`, { parse_mode: "Markdown" });

    // 2. 強制重置 AI 的當前心情與部分暫時狀態 (寫入 DB)
    const userId = ctx.from?.id.toString();
    if (userId) {
      await env.vera_db.prepare(
        `UPDATE users SET mood = 'HAPPY', temperature = 0.7 WHERE user_id = ?`
      ).bind(userId).run();
    }
    
    console.warn(`[EMERGENCY] ${reporter} 觸發了緊急呼叫！`);
  });
}
