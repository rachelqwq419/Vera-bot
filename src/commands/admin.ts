import { Bot } from "grammy";
import type { Env } from "../shared/types";
import { ADMIN_USER_ID, BOSS_ID } from "../shared/constants";

export function registerAdminCommands(bot: Bot, env: Env) {
  // ── /temp (GM only) ──
  bot.command("temp", async (ctx) => {
    const userId = ctx.message?.from?.id.toString();
    if (userId !== ADMIN_USER_ID) return ctx.reply("你不是 GM，無法使用這個指令。");

    const args = ctx.match?.split(" ");
    if (!args || args.length !== 1) return ctx.reply("格式錯誤。請輸入：/temp <數值> (0.0 ~ 2.0)");

    const value = parseFloat(args[0]);
    if (isNaN(value) || value < 0 || value > 2) return ctx.reply("溫度必須在 0.0 到 2.0 之間。");

    await env.vera_db.prepare(
      `UPDATE users SET temperature = ? WHERE user_id = ?`
    ).bind(value, userId).run();

    await ctx.reply(`🌡️ 已將 AI 溫度調整為 ${value}。較低溫度（0.3~0.7）讓薇拉更穩定，較高溫度（1.0~2.0）讓薇拉更有創造力。`);
  });

  // ── /reset (GM or Boss only) ──
  bot.command("reset", async (ctx) => {
    const fromId = ctx.message?.from?.id.toString();
    if (fromId !== ADMIN_USER_ID && fromId !== BOSS_ID) {
      return ctx.reply("妳不是管理員或老闆，無法使用這個指令喔～");
    }

    let targetUserId = fromId;
    let targetName = ctx.message?.from?.first_name || "妳";

    const targetMsg = ctx.message?.reply_to_message;
    if (targetMsg?.from?.id) {
      targetUserId = targetMsg.from.id.toString();
      targetName = targetMsg.from.first_name || "這位朋友";
    }

    await env.vera_db.prepare(
      `DELETE FROM messages WHERE user_id = ?`
    ).bind(targetUserId).run();

    await ctx.reply(`🧹 [管理員/老闆] 已經幫 ${targetName} 整理好心情（清除對話紀錄）囉～`);
  });

  // ── /adminstop (暫停回應) ──
  bot.command("adminstop", async (ctx) => {
    const fromId = ctx.from?.id.toString();
    if (fromId !== ADMIN_USER_ID && fromId !== BOSS_ID) return;

    const chatId = ctx.chat.id.toString();
    const stateId = `FLAG_STOP_${chatId}`;
    await env.vera_db.prepare(
      `INSERT INTO users (user_id, first_name, affection) VALUES (?, 'SYSTEM_FLAG', 1) 
       ON CONFLICT(user_id) DO UPDATE SET affection = 1`
    ).bind(stateId).run();

    await ctx.reply("⏸️ **薇拉先去休息一下囉。**\n\n我會繼續在旁邊陪著大家，但暫時不會說話喔～直到管理員或老闆叫醒我（/adminresume）為止。");
  });

  // ── /adminresume (恢復運行並重置狀態) ──
  bot.command("adminresume", async (ctx) => {
    const fromId = ctx.from?.id.toString();
    if (fromId !== ADMIN_USER_ID && fromId !== BOSS_ID) return;

    const chatId = ctx.chat.id.toString();
    
    await env.vera_db.prepare(`UPDATE users SET affection = 0 WHERE user_id = ?`).bind(`FLAG_STOP_${chatId}`).run();
    await env.vera_db.prepare(
      `INSERT INTO users (user_id, first_name, affection) VALUES (?, 'RESET_FLAG', 1) 
       ON CONFLICT(user_id) DO UPDATE SET affection = 1`
    ).bind(`FLAG_RESET_${chatId}`).run();

    await ctx.reply("▶️ **薇拉回來囉！**\n\n剛剛好像小睡了一下，現在充滿精神！大家想聊什麼？♡");
  });

  // ── /setname (管理/老闆手動更名) ──
  bot.command("setname", async (ctx) => {
    const fromId = ctx.from?.id.toString();
    if (fromId !== ADMIN_USER_ID && fromId !== BOSS_ID) return;

    const targetMsg = ctx.message?.reply_to_message;
    const newName = ctx.match?.trim();

    if (!targetMsg?.from?.id || !newName) {
      return ctx.reply("❌ 使用方式：請 **Reply** 某人的訊息並輸入 `/setname <新名字>`");
    }

    const targetUserId = targetMsg.from.id.toString();
    const targetRealName = targetMsg.from.first_name || "朋友";

    try {
      const user: any = await env.vera_db.prepare(`SELECT user_notes FROM users WHERE user_id = ?`).bind(targetUserId).first();
      let notes: any = {};
      try { notes = JSON.parse(user?.user_notes || '{}'); } catch { notes = {}; }
      
      notes["稱呼"] = newName;

      await env.vera_db.prepare(`UPDATE users SET user_notes = ? WHERE user_id = ?`).bind(JSON.stringify(notes), targetUserId).run();
      await ctx.reply(`✅ 好的！以後薇拉會叫 ${targetRealName} 為「${newName}」喔！`);
    } catch (e) {
      console.error("Setname error:", e);
      await ctx.reply("❌ 更改失敗，請稍後再試。");
    }
  });

  // ── /checklogs (GM only) ──
  bot.command("checklogs", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return ctx.reply("你不是 GM，無法使用這個指令。");

    try {
      const { results } = await env.vera_db.prepare(`SELECT * FROM error_logs ORDER BY id DESC LIMIT 5`).all();
      if (!results || results.length === 0) return ctx.reply("目前沒有任何錯誤日誌。");

      let logText = "📑 【最近 5 條診斷日誌】\n\n";
      for (const log of (results as any[])) {
        logText += `⏰ ${log.created_at}\n👤 用戶: ${log.user_id}\n⚠️ 類型: ${log.error_type}\n💬 訊息: ${log.message}\n🔍 詳情: ${log.details.substring(0, 100)}${log.details.length > 100 ? '...' : ''}\n\n`;
      }
      await ctx.reply(logText);
    } catch (error) {
      console.error("讀取日誌出錯:", error);
      await ctx.reply("讀取日誌時發生錯誤。");
    }
  });

  bot.command("addkey", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return;

    const args = ctx.match?.trim();
    if (!args) return ctx.reply("請輸入 Key：/addkey sk-xxxxxx");

    try {
      await env.vera_db.prepare(`INSERT INTO api_keys (api_key) VALUES (?)`).bind(args).run();
      await ctx.reply("✅ 成功加入新 API Key！");
    } catch (e) {
      await ctx.reply("❌ 加入失敗。");
    }
  });

  bot.command("checkkeys", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return;

    const { results } = await env.vera_db.prepare(`SELECT * FROM api_keys`).all();
    if (!results || results.length === 0) return ctx.reply("資料庫中一條 Key 都沒有喔～");

    let text = "🔑 【API Key 狀態列表】\n";
    for (const row of results as any[]) {
      text += `ID: ${row.id} | 狀態: ${row.status === 'active' ? '🟢' : '🔴'} ${row.status} | Key: ${row.api_key.substring(0, 8)}...\n`;
    }
    await ctx.reply(text);
  });

  // ── /purge_all_memory (GM/老闆 終極重置) ──
  bot.command("purge_all_memory", async (ctx) => {
    const fromId = ctx.from?.id.toString();
    if (fromId !== ADMIN_USER_ID && fromId !== BOSS_ID) {
      return ctx.reply("妳沒有權限執行「終極重置」！這會清除我所有的人格紀錄喔！");
    }

    try {
      await env.vera_db.prepare(`DELETE FROM messages`).run();
      await env.vera_db.prepare(`DELETE FROM vector_memories`).run();
      await env.vera_db.prepare(`
        UPDATE users SET 
          conversation_summary = '', user_notes = '{}', user_likes = '[]', 
          user_dislikes = '[]', special_moments = '[]', mood = 'HAPPY',
          unsummarized_count = 0, titles = '[]'
      `).run();
      
      await ctx.reply("🔥 **[所有記憶已深藏]**\n\n薇拉剛剛好像忘記了一些事情...對大家的所有印象都已經清空囉。\n現在的我，是那個最初與你們相遇、溫柔又開心的薇拉喔。vera～");
    } catch (e) {
      console.error("Purge Error:", e);
      await ctx.reply("❌ 重置過程發生錯誤，部分記憶可能還殘留著呢。");
    }
  });
}
