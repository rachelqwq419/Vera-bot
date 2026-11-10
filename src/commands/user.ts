import { Bot } from "grammy";
import type { Env } from "../shared/types";
import { FORTUNES } from "../shared/constants";

export function registerUserCommands(bot: Bot, env: Env) {
  // ── /fortune ──
  bot.command("fortune", async (ctx) => {
    const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    await ctx.reply(`🔮 【今日戀愛占卜】\n\n${fortune}`);
  });

  // ── /group_impression (薇拉的群組印象) ──
  bot.command(["group_impression", "gi"], async (ctx) => {
    if (ctx.chat?.type === "private") {
      return ctx.reply("這個指令要在群組裡用，薇拉才能看大家互動的樣子喔～");
    }

    try {
      await ctx.replyWithChatAction("typing");
      const chatId = ctx.chat.id.toString();
      const roomName = ('title' in ctx.chat) ? (ctx.chat as any).title || "群組" : "群組";

      const { results: recentMsgs } = await env.vera_db.prepare(`
        SELECT m.role, m.content, u.first_name, u.user_notes
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.user_id
        WHERE m.chat_id = ?
        ORDER BY m.id DESC LIMIT 50
      `).bind(chatId).all();

      if (!recentMsgs || recentMsgs.length < 5) {
        return ctx.reply("唔...薇拉對這個群組的印象還不夠深呢，大家再多聊聊天吧！");
      }

      const historyText = (recentMsgs as any[]).reverse()
        .map(m => {
          let name = m.first_name || "未知客人";
          try {
            const notes = JSON.parse(m.user_notes || '{}');
            if (notes["稱呼"]) name = notes["稱呼"];
          } catch {}
          const content = m.content.replace(/^\[.*?\]\s*/, '').replace(/^\(薇拉對.*?的回覆\)\s*/, '');
          return `${m.role === 'user' ? name : '薇拉'}: ${content}`;
        })
        .join('\n');

      const { results: userSummaries } = await env.vera_db.prepare(`
        SELECT u.first_name, u.conversation_summary, COUNT(m.id) as msg_count
        FROM users u
        JOIN messages m ON u.user_id = m.user_id
        WHERE m.chat_id = ? AND u.first_name IS NOT NULL
        GROUP BY u.user_id
        ORDER BY msg_count DESC LIMIT 10
      `).bind(chatId).all();

      let memberContext = "【成員們的點點滴滴】:\n";
      for (const u of (userSummaries as any[])) {
        memberContext += `- ${u.first_name}: ${u.conversation_summary || '最近剛加入的朋友'}\n`;
      }

      const messages = [
        {
          role: "system",
          content: `妳現在是薇拉(Vera)，一個溫柔、貼心且開朗的女孩。妳在「紫羅蘭酒館」陪伴大家。請使用「自然口語化的繁體中文（白話）」撰寫這份報告，口吻要像好朋友一樣親切。`
        },
        {
          role: "user",
          content: `
薇拉，請根據「${roomName}」最近的對話和妳對大家的記憶，寫一段溫馨的「群組觀察報告」。

${memberContext}

【最近的對話紀錄】:
${historyText}

【任務要求】:
1. 內容包括：對群組氛圍的感受、對幾位活躍成員的小觀察（可以開點善意的小玩笑），以及妳對大家的祝福。
2. 保持溫柔、俏皮且充滿關懷的性格。
3. 字數大約 150-300 字。
4. 最後用「vera～」可愛地結尾。
`
        }
      ];

      const { fetchWithFallback } = await import("../services/deepseek");
      const data = await fetchWithFallback(env, {
        model: "deepseek-v4-pro",
        messages: messages,
        temperature: 0.7,
      });
      
      if (data?.choices?.[0]?.message?.content) {
        let aiReply = data.choices[0].message.content.trim();
        await ctx.reply(`🌸 **薇拉的群組觀察報告：${roomName}** 🌸\n\n${aiReply}`, { parse_mode: "Markdown" });
      } else {
        await ctx.reply("（薇拉托著腮幫子想了好久，臉紅紅地說不出話來...）");
      }
    } catch (error) {
      console.error("Group Impression Error:", error);
      await ctx.reply("抱歉呀，薇拉現在有點害羞，腦袋空空的寫不出來... >_<");
    }
  });

  // ── /profile (個人數據面板) ──
  bot.command("profile", async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const user = await env.vera_db.prepare(
        `SELECT titles, user_notes, chinese_summary FROM users WHERE user_id = ?`
      ).bind(userId).first() as any;

      if (!user) {
        return ctx.reply("✨ 薇拉提示：我還沒有關於你的紀錄呢，快來跟我聊天吧！");
      }

      let titlesArray: string[] = [];
      try { titlesArray = JSON.parse(user.titles || '[]'); } catch {}
      const titlesDisplay = titlesArray.length > 0 ? titlesArray.join('、') : '無 (還在觀察中喔～)';

      let notes = {};
      try { notes = JSON.parse(user.user_notes || '{}'); } catch {}
      const customName = (notes as any)["稱呼"] || "未設定";

      const text = 
        `🌸 **[薇拉的小筆記]**\n\n` +
        `👤 **名字**: ${ctx.from?.first_name}\n` +
        `📝 **我對你的稱呼**: ${customName}\n` +
        `🏷️ **給你的小標籤**: ${titlesDisplay}\n\n` +
        `📂 **薇拉的心聲 (Memory)**:\n` +
        `\`\`\`\n` +
        `正在回憶中...\n` +
        `------------------\n` +
        `${user.chinese_summary || '我們才剛開始建立回憶呢...'}\n` +
        `\`\`\`\n` +
        `*「能和你相遇並留下這些回憶，薇拉覺得很幸福喔。」*`;

      await ctx.reply(text, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("Profile Error:", e);
      await ctx.reply("❌ 讀取檔案失敗。");
    }
  });
}
