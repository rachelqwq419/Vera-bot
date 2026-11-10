import { Bot } from "grammy";
import type { Env } from "../shared/types";

export function registerRoomCommands(bot: Bot, env: Env) {
  // ── /setroomname (手動教學房間名稱) ──
  bot.command("setroomname", async (ctx) => {
    const threadId = ctx.message?.message_thread_id;
    const chatId = ctx.chat.id.toString();
    const newName = ctx.match?.trim();

    if (!threadId) return ctx.reply("這裡是大廳，不需要設置名字喔～請在子頻道（Topic）中使用此指令。");
    if (!newName) return ctx.reply("請告訴我這個房間叫什麼名字：/setroomname <名字>");

    await env.vera_db.prepare(
      `INSERT INTO rooms (chat_id, thread_id, room_name, sort_order) VALUES (?, ?, ?, 999)
       ON CONFLICT(chat_id, thread_id) DO UPDATE SET room_name = ?`
    ).bind(chatId, threadId, newName, newName).run();

    await ctx.reply(`✅ 好的，我已經記住這裡叫做「${newName}」了！下次別再考我了喔～`);
  });

  // ── /setroomdesc (手動教學房間介紹) ──
  bot.command("setroomdesc", async (ctx) => {
    const threadId = ctx.message?.message_thread_id;
    const chatId = ctx.chat.id.toString();
    const desc = ctx.match?.trim();

    if (!threadId) return ctx.reply("請在子頻道（Topic）中使用此指令來設置該房間的介紹。");
    if (!desc) return ctx.reply("請輸入房間介紹：/setroomdesc <介紹內容>\n輸入「隱藏」可將此房間從新成員導覽中移除。");

    if (desc === "隱藏") {
      await env.vera_db.prepare(
        `UPDATE rooms SET is_visible = 0 WHERE chat_id = ? AND thread_id = ?`
      ).bind(chatId, threadId).run();
      return ctx.reply("✅ 已將此房間從新成員導覽中隱藏。");
    }

    await env.vera_db.prepare(
      `INSERT INTO rooms (chat_id, thread_id, description, is_visible, sort_order) VALUES (?, ?, ?, 1, 999)
       ON CONFLICT(chat_id, thread_id) DO UPDATE SET description = ?, is_visible = 1`
    ).bind(chatId, threadId, desc, desc).run();

    await ctx.reply(`✅ 好的，新成員加入時我會這樣介紹這裡：\n「${desc}」`);
  });

  // ── /setroomorder (設定房間顯示順序) ──
  bot.command("setroomorder", async (ctx) => {
    const threadId = ctx.message?.message_thread_id;
    const chatId = ctx.chat.id.toString();
    const orderStr = ctx.match?.trim();

    if (!threadId) return ctx.reply("請在子頻道（Topic）中使用此指令來設置該房間的排序。");
    if (!orderStr) return ctx.reply("請輸入排序數字（越小越前面）：/setroomorder <數字>");
    
    const order = parseInt(orderStr, 10);
    if (isNaN(order)) return ctx.reply("排序必須是純數字喔！");

    await env.vera_db.prepare(
      `UPDATE rooms SET sort_order = ? WHERE chat_id = ? AND thread_id = ?`
    ).bind(order, chatId, threadId).run();

    await ctx.reply(`✅ 好的，我已經將此房間的排序順序設定為 ${order}。`);
  });

  // ── /debug_room (偵錯專用) ──
  bot.command("debug_room", async (ctx) => {
    const chatId = ctx.chat.id;
    const threadId = ctx.message?.message_thread_id;
    
    let roomDisplayName = "Main Hall";
    if (threadId) {
      const room: any = await env.vera_db.prepare(
        `SELECT room_name FROM rooms WHERE chat_id = ? AND thread_id = ?`
      ).bind(chatId.toString(), threadId).first();
      roomDisplayName = room?.room_name || `Sub-room ${threadId}`;
    }

    const groupName = (ctx.chat.type !== "private" && 'title' in ctx.chat) ? (ctx.chat as any).title : "Private";
    
    await ctx.reply(
      `🔍 **房間數據偵錯**\n\n` +
      `📍 Group: \`${groupName}\`\n` +
      `🏠 Room Name: \`${roomDisplayName}\`\n` +
      `🧵 Thread ID: \`${threadId || '0 (Main)'}\`\n` +
      `🤖 My Username: \`@${ctx.me.username}\``,
      { 
        parse_mode: "Markdown",
        message_thread_id: ctx.message?.message_thread_id 
      }
    );
  });
}
