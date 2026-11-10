import { Bot } from "grammy";
import type { Env } from "../shared/types";

export function registerNewMemberEvents(bot: Bot, env: Env) {
  // ── 🆕 新成員加入引導 (溫馨版 + 防重複) ──
  bot.on("message:new_chat_members", async (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    const chatId = ctx.chat.id.toString();
    const cleanChatId = chatId.replace("-100", "");

    for (const member of newMembers) {
      if (member.is_bot) continue;

      const userIdStr = member.id.toString();
      
      try {
        const { success } = await env.vera_db.prepare(`
          INSERT INTO welcome_logs (user_id) VALUES (?)
        `).bind(userIdStr).run();
        
        if (!success) {
            console.log(`[引導攔截] 用戶 ${member.first_name} 已經被迎歡過了，跳過本次重複觸發。`);
            continue;
        }
        
        ctx.api.config.use(async (prev, method, payload, signal) => {
            env.vera_db.prepare(`DELETE FROM welcome_logs WHERE created_at < datetime('now', '-10 minutes')`).run().catch(()=>console.log("Cleanup welcome logs failed"));
            return prev(method, payload, signal);
        });

      } catch (e) {
          if ((e as any).message?.includes("UNIQUE")) {
             console.log(`[引導攔截] 用戶 ${member.first_name} 已經被歡迎過了，跳過本次重複觸發。`);
             continue;
          }
      }

      const { results: allRooms } = await env.vera_db.prepare(
        `SELECT thread_id, room_name, description FROM rooms 
         WHERE chat_id = ? AND thread_id > 0 AND is_visible = 1 
         ORDER BY sort_order ASC, thread_id ASC 
         LIMIT 10`
      ).bind(chatId).all();

      const mention = member.username ? `@${member.username}` : `[${member.first_name}](tg://user?id=${member.id})`;

      let roomLinks = (allRooms as any[]).map(r => {
        return `📍 **[${r.room_name}](https://t.me/c/${cleanChatId}/${r.thread_id})**\n└─ ${r.description || '溫馨整理中'}`;
      }).join("\n\n");

      if (!roomLinks) roomLinks = "（目前還沒有開放其他區域，我們先在大廳聊聊天吧～）";

      const welcomeMsg = 
        `🌸 **[引導]**\n\n` +
        `哈囉 ${mention}！歡迎來到紫羅蘭酒館喔～我是薇拉。\n` +
        `很高興你能加入這個大家庭！為了讓你快速熟悉這裡，我準備了區域導覽，你可以點擊下方連結去逛逛：\n\n` +
        `${roomLinks}\n\n` +
        `💡 **薇拉的小提醒**：\n` +
        `如果你想更了解我，或者想知道怎麼跟我互動，可以對我說「讀取薇拉的小手冊」，我會把指南傳給你喔！\n\n` +
        `祝你在這裡玩得開心！～ ♡`;

      try {
        await ctx.api.sendMessage(ctx.chat.id, welcomeMsg, { 
          parse_mode: "Markdown", 
          link_preview_options: { is_disabled: true }, 
          message_thread_id: 210
        });
        console.log(`✅ [導航成功] 已將新人導航發送至 ID 210 頻道`);
      } catch (e) {
        console.error("發送新人導覽失敗:", e);
      }
    }
  });
}
