import { Bot } from "grammy";
import type { Env } from "../shared/types";
import { ADMIN_USER_ID } from "../shared/constants";

export function registerTopicEvents(bot: Bot, env: Env) {
  // ── 自動捕捉子頻道名稱變更 (快速學習方案) ──
  bot.on("message:forum_topic_edited", async (ctx) => {
    const threadId = ctx.message.message_thread_id;
    const chatId = ctx.chat.id.toString();
    const name = ctx.message.forum_topic_edited?.name;

    if (name && threadId) {
      await env.vera_db.prepare(
        `INSERT INTO rooms (chat_id, thread_id, room_name, sort_order) VALUES (?, ?, ?, 999)
         ON CONFLICT(chat_id, thread_id) DO UPDATE SET room_name = ?`
      ).bind(chatId, threadId, name, name).run();
      
      const adminId = ctx.from?.id.toString();
      if (adminId === ADMIN_USER_ID) {
        await ctx.reply(`✨ 薇拉筆記：已同步此房間名稱為「${name}」。`, { message_thread_id: threadId });
      }
    }
  });

  // ── 自動捕捉子頻道創建訊息 ──
  bot.on("message:forum_topic_created", async (ctx) => {
    const threadId = ctx.message.message_thread_id;
    const chatId = ctx.chat.id.toString();
    const name = ctx.message.forum_topic_created?.name;

    if (name && threadId) {
      await env.vera_db.prepare(
        `INSERT INTO rooms (chat_id, thread_id, room_name, sort_order) VALUES (?, ?, ?, 999)
         ON CONFLICT(chat_id, thread_id) DO UPDATE SET room_name = ?`
      ).bind(chatId, threadId, name, name).run();
    }
  });
}
