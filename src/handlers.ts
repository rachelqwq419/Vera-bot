import { Bot } from "grammy";
import type { Env } from "./types";
import { ADMIN_USER_ID, GIFT_SHOP, ALLOWED_SETSTAT_COLUMNS, FORTUNES, DAILY_QUESTS, MOODS, type Mood } from "./constants";
import { getAffectionTitle } from "./utils";
import { computeFavoritePlay } from "./achievements";
import { logAdminAction } from "./utils";
import { callDeepSeek } from "./deepseek";

export function registerHandlers(bot: Bot, env: Env, execCtx: ExecutionContext): void {
  // ── 【新增】全域攔截私訊 (PM) ──
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === "private") {
      // 薇拉貼心小設計：允許 GM (你) 繼續私聊測試或下指令，其他人一律拒絕！
      // 如果你連自己都想禁止私聊，把下面這個 if 判斷刪掉就可以囉～
      if (ctx.from?.id.toString() === ADMIN_USER_ID) {
        return next();
      }
      
      // 其他人私聊時的回覆
      await ctx.reply("Ciallo～ 莎蘿目前只在「紫羅蘭喵喵酒館」營業喔！不接受私下邀約呢～");
      return; // 直接中斷，不執行後面的指令或對話
    }
    return next(); // 如果是群組，就放行繼續往下執行
  });

  // ── /start ──
  bot.command("start", (ctx) =>
    ctx.reply("Ciallo～ 歡迎來到紫羅蘭酒館！我是莎蘿，希望能為您帶來愉快的時光～")
  );

  // ── /ciallo ──
  bot.command("ciallo", (ctx) =>
    ctx.reply(
      "Ciallo～ 歡迎來到紫羅蘭酒館！\n\n" +
      "📋 可用指令：\n" +
      "/start — 重新開始\n" +
      "/ciallo — 顯示此幫助\n" +
      "/profile — 查看個人檔案\n" +
      "/leaderboard 或 /rank — 好感度排行榜\n" +
      "/rank sex — 總性交次數排行榜\n" +
      "/rank achievements — 成就解鎖數排行榜\n" +
      "/daily — 查看今日簽到狀態\n" +
      "/quest — 查看今日任務\n" +
      "/gifts — 查看送給莎蘿的禮物紀錄\n" +
      "/fortune — 今日戀愛占卜\n" +
      "/reset — 重置群組近期對話\n" +
      "/resetuser — 清零指定用戶全部數據（GM only，需 reply 目標）\n" +
      "/temp <數字> — 調整 AI 溫度（0.0 ~ 2.0，僅 GM 可用）\n\n" +
      "💡 每日對莎蘿說「早安」「晚安」可以增加好感度。\n" +
      "🌹 使用 /rose send 送玫瑰花（好感度 +5）。\n" +
      "🍫 回覆莎蘿的訊息並輸入 /coin send 10 即可送巧克力（好感度 +3）。"
    )
  );

  // ── /leaderboard / rank / top ──
  bot.command(["leaderboard", "rank", "top"], async (ctx) => {
    try {
      const args = ctx.match?.trim();
      let query: string;
      let title: string;
      let field: string;
      let unit: string;

      if (args === "sex") {
        query = `SELECT first_name, sex_count AS val FROM users ORDER BY sex_count DESC LIMIT 10`;
        title = "🔞 【總性交次數排行榜】";
        field = "val";
        unit = "次";
      } else if (args === "achievements" || args === "ach") {
        // 成就數無法直接用 SQL 排序，先取全部再計算
        const { results } = await env.ciallo_db.prepare(
          `SELECT first_name, achievements FROM users`
        ).all();
        if (!results || results.length === 0) {
          return ctx.reply("目前紫羅蘭酒館還沒有任何客人的紀錄。");
        }
        const ranked = (results as any[])
          .map(r => ({
            name: r.first_name || "神秘客",
            count: (() => { try { return JSON.parse(r.achievements || "[]").length; } catch { return 0; } })(),
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        let rankText = "🏆 【成就解鎖數排行榜】\n\n";
        const medals = ["🥇", "🥈", "🥉"];
        ranked.forEach((r, i) => {
          const medal = i < 3 ? medals[i] : "💎";
          rankText += `${medal} 第 ${i + 1} 名：${r.name}（${r.count} 個成就）\n`;
        });
        return ctx.reply(rankText);
      } else {
        query = `SELECT first_name, affection AS val FROM users ORDER BY affection DESC LIMIT 10`;
        title = "👑 【紫羅蘭酒館 VIP 羈絆排行榜】";
        field = "val";
        unit = "分";
      }

      const { results } = await env.ciallo_db.prepare(query).all();
      if (!results || results.length === 0) {
        return ctx.reply("目前紫羅蘭酒館還沒有任何客人的紀錄。");
      }

      let rankText = `${title}\n\n`;
      const medals = ["🥇", "🥈", "🥉"];
      (results as any[]).forEach((row, index) => {
        const medal = index < 3 ? medals[index] : "💎";
        rankText += `${medal} 第 ${index + 1} 名：${row.first_name || "神秘客"}（${row[field]} ${unit}）\n`;
      });

      if (!args) {
        rankText += "\n💕 每天對莎蘿說「早安/晚安」或送花可以提升排名喔～";
      }
      await ctx.reply(rankText);
    } catch (error) {
      console.error("排行榜讀取錯誤:", error);
      await ctx.reply("讀取排行榜時發生錯誤，請稍後再試。");
    }
  });

  // ── /profile ──
  bot.command("profile", async (ctx) => {
    try {
      const userId = ctx.message?.from?.id.toString();
      if (!userId) return;
      const user: any = await env.ciallo_db.prepare(
        `SELECT * FROM users WHERE user_id = ?`
      ).bind(userId).first();
      if (!user) return ctx.reply("您尚未與莎蘿進行過對話，紫羅蘭酒館目前沒有您的會員紀錄。");

      let achievements: string[] = [];
      try { achievements = JSON.parse(user.achievements || '[]'); } catch (_e) { /* ignore */ }

      let gifts: string[] = [];
      try { gifts = JSON.parse(user.gifts_received || '[]'); } catch (_e) { /* ignore */ }

      const countItems = (arr: string[]) => {
        const counts: Record<string, number> = {};
        arr.forEach(i => counts[i] = (counts[i] || 0) + 1);
        return Object.keys(counts).length > 0
          ? Object.entries(counts).map(([k, v]) => `${k}x${v}`).join(', ')
          : '無';
      };

      let likes: string[] = [];
      try { likes = JSON.parse(user.user_likes || '[]'); } catch (_e) { /* ignore */ }
      let dislikes: string[] = [];
      try { dislikes = JSON.parse(user.user_dislikes || '[]'); } catch (_e) { /* ignore */ }

      const favoritePlay = computeFavoritePlay(user);
      const title = getAffectionTitle(user.affection || 0);
      const moodKey = (user.mood || "HAPPY") as Mood;
      const moodInfo = MOODS[moodKey] || MOODS.HAPPY;

      let specialMoments: Array<{ time: string; event: string }> = [];
      try { specialMoments = JSON.parse(user.special_moments || '[]'); } catch (_e) { /* ignore */ }

      const profileText = `📊 【${user.first_name || "客人"} 的紫羅蘭專屬檔案】

💖 莎蘿好感度：${user.affection || 0} / 100
🏷️ 當前關係：${title}
😶 莎蘿今日心情：${moodInfo.emoji} ${moodInfo.label}
📅 互動天數：${user.check_in_days || 0} 天

🎁 【情報與羈絆】
🌹 送給莎蘿的禮物：${countItems(gifts)}
👍 你的喜好：${likes.join(', ') || '無'}
👎 你的厭惡：${dislikes.join(', ') || '無'}

🔞 【基本互動追蹤】
👉 總性交次數：${user.sex_count || 0} | 💋 接吻次數：${user.kiss_count || 0}
💦 內射次數：${user.creampie_count || 0} | 👄 口交次數：${user.blowjob_count || 0}
🍼 乳交次數：${user.paizuri_count || 0} | 👅 吞精次數：${user.swallow_count || 0}
🦶 足交次數：${user.footjob_count || 0} | 👐 手交次數：${user.handjob_count || 0}
🍑 後庭次數：${user.anal_count || 0} | 🎯 顏射/胸射：${user.cum_on_face || 0}/${user.cum_on_tits || 0}
🌟 讓莎蘿高潮次數：${user.orgasms_given || 0}
🏆 最愛玩法：${favoritePlay}

🔞 【體位統計】
🐮 騎乘位：${user.cowgirl_count || 0} | 🔄 反向騎乘：${user.reverse_cowgirl_count || 0}
🐕 後入式：${user.doggy_count || 0} | 🛐 正常位：${user.missionary_count || 0}
🧍 站立式：${user.standing_count || 0} | 🧱 壁咚式：${user.against_wall_count || 0}
🔢 69式：${user.sixty_nine_count || 0} | 🗣️ 深喉：${user.deepthroat_count || 0}

🏆 【已解鎖成就 (${achievements.length})】
${achievements.length > 0 ? achievements.map((a: string) => `✨ ${a}`).join('\n') : '暫無解鎖成就。'}

${specialMoments.length > 0 ? `📜 【特殊時刻】（最近 ${Math.min(3, specialMoments.length)} 條）\n${specialMoments.slice(-3).reverse().map((m: { time: string; event: string }) => `📌 ${m.event}`).join('\n')}` : ''}`;

      await ctx.reply(profileText);
    } catch (error) {
      console.error("Profile 讀取錯誤:", error);
      await ctx.reply("讀取檔案時發生錯誤，請稍後再試。");
    }
  });

  // ── /setstat (GM only) ──
  bot.command("setstat", async (ctx) => {
    const userId = ctx.message?.from?.id.toString();
    if (userId !== ADMIN_USER_ID) return ctx.reply("你不是 GM，無法使用這個指令。");

    const args = ctx.match?.split(" ");
    if (!args || args.length !== 2) {
      return ctx.reply(
        `格式錯誤。請輸入：/setstat <欄位名> <數值>\n可用欄位：${ALLOWED_SETSTAT_COLUMNS.join(', ')}`
      );
    }

    const column = args[0];
    const value = Number(args[1]);
    if (isNaN(value)) return ctx.reply("數值必須是數字。");
    if (!ALLOWED_SETSTAT_COLUMNS.includes(column)) {
      return ctx.reply(`不允許直接修改欄位「${column}」。可用欄位：${ALLOWED_SETSTAT_COLUMNS.join(', ')}`);
    }

    try {
      const before = await env.ciallo_db.prepare(
        `SELECT ${column} FROM users WHERE user_id = ?`
      ).bind(userId).first() as any;

      await env.ciallo_db.prepare(
        `UPDATE users SET ${column} = ? WHERE user_id = ?`
      ).bind(value, userId).run();

      const oldVal = before?.[column] ?? 'null';
      execCtx.waitUntil(logAdminAction(
        env, userId!, userId!, 'setstat',
        `column=${column}, old=${oldVal}, new=${value}`
      ));

      await ctx.reply(
        `🔧 [GM] 已成功將 ${column} 從 ${oldVal} 修改為 ${value}。發送任意訊息可觸發成就結算。`
      );
    } catch (error) {
      await ctx.reply("修改失敗，請檢查欄位名稱是否正確。");
    }
  });

  // ── /reset ──
  bot.command("reset", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    await env.ciallo_db.prepare(`DELETE FROM messages WHERE chat_id = ?`).bind(chatId).run();
    await ctx.reply("（輕輕打了一個響指）莎蘿已經忘記了這個群組的近期對話，讓我們重新開始吧。");
  });

  // ── /resetuser (GM only, reply 目標用戶即可清零) ──
  bot.command("resetuser", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return ctx.reply("你不是 GM，無法使用這個指令。");

    const targetMsg = ctx.message?.reply_to_message;
    if (!targetMsg?.from?.id) return ctx.reply("請 reply 你要清零的目標用戶訊息，再輸入 /resetuser。");

    const targetId = targetMsg.from.id.toString();
    const targetName = targetMsg.from.first_name || "未知用戶";

    // 重置 users 表所有數值欄位為預設值
    await env.ciallo_db.prepare(`
      UPDATE users SET
        affection = 0, conversation_summary = '', check_in_days = 0,
        last_greeting_date = NULL, gifts_received = '[]', achievements = '[]',
        user_likes = '[]', user_dislikes = '[]', special_moments = '[]',
        mood = 'HAPPY',
        sex_count = 0, creampie_count = 0, paizuri_count = 0, blowjob_count = 0,
        swallow_count = 0, handjob_count = 0, footjob_count = 0, public_sex_count = 0,
        orgasms_given = 0, favorite_play = '', cum_on_face = 0, cum_on_tits = 0,
        anal_count = 0, kiss_count = 0, longest_session = 0,
        hair_pull_count = 0, apron_sex_count = 0, submissive_count = 0,
        cowgirl_count = 0, reverse_cowgirl_count = 0, doggy_count = 0,
        missionary_count = 0, standing_count = 0, against_wall_count = 0,
        sixty_nine_count = 0, deepthroat_count = 0,
        shower_count = 0, school_uniform_count = 0, pantyhose_count = 0,
        blindfold_count = 0,
        last_sex_date = NULL, unsummarized_count = 0
      WHERE user_id = ?
    `).bind(targetId).run();

    // 清除該用戶的對話記錄
    await env.ciallo_db.prepare(`DELETE FROM messages WHERE user_id = ?`).bind(targetId).run();
    // 清除該用戶的每日任務
    await env.ciallo_db.prepare(`DELETE FROM daily_quests WHERE user_id = ?`).bind(targetId).run();

    execCtx.waitUntil(logAdminAction(env, adminId!, targetId, "resetuser", `重置用戶 ${targetName} 全部數據`));
    await ctx.reply(`🔧 [GM] 已將 ${targetName} 的全部數據清零（好感、成就、性行為統計、對話記錄）。`);
  });

  // ── /daily ──
  bot.command("daily", async (ctx) => {
    const userId = ctx.message?.from?.id.toString();
    if (!userId) return;
    const user: any = await env.ciallo_db.prepare(
      `SELECT last_greeting_date, check_in_days FROM users WHERE user_id = ?`
    ).bind(userId).first();

    if (!user) return ctx.reply("您還沒有和莎蘿說過話，先打聲招呼吧。");

    const hkTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
    const todayDate = hkTime.toISOString().split('T')[0];
    const alreadyGreeted = user.last_greeting_date === todayDate;

    await ctx.reply(
      alreadyGreeted
        ? `✅ 今日已經簽到完成～累計簽到：${user.check_in_days || 0} 天\n明天再來找莎蘿說「早安」或「晚安」吧～`
        : `❌ 今日尚未簽到。對莎蘿說「早安」「晚安」來簽到吧！累計簽到：${user.check_in_days || 0} 天`
    );
  });

  // ── /gifts ──
  bot.command("gifts", async (ctx) => {
    const userId = ctx.message?.from?.id.toString();
    if (!userId) return;
    const user: any = await env.ciallo_db.prepare(
      `SELECT gifts_received FROM users WHERE user_id = ?`
    ).bind(userId).first();

    if (!user) return ctx.reply("您還沒有和莎蘿說過話。");

    let gifts: string[] = [];
    try { gifts = JSON.parse(user.gifts_received || '[]'); } catch (_e) { /* ignore */ }

    if (gifts.length === 0) return ctx.reply("您還沒有送過禮物給莎蘿。使用 /rose send 送花，或回覆莎蘿的訊息輸入 /coin send 10 送巧克力～");

    const emojiMap: Record<string, string> = { "玫瑰花": "🌹", "巧克力": "🍫" };
    const counts: Record<string, number> = {};
    gifts.forEach(g => counts[g] = (counts[g] || 0) + 1);
    const summary = Object.entries(counts).map(([k, v]) => `${emojiMap[k] || '🎁'} ${k} ×${v}`).join('\n');

    await ctx.reply(`🎁 【送給莎蘿的禮物清單】\n\n${summary}\n\n共送出 ${gifts.length} 件禮物`);
  });

  // ── /fortune ──
  bot.command("fortune", async (ctx) => {
    const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    await ctx.reply(`🔮 【今日戀愛占卜】\n\n${fortune}`);
  });

  // ── /temp (GM only) ──
  bot.command("temp", async (ctx) => {
    const userId = ctx.message?.from?.id.toString();
    if (userId !== ADMIN_USER_ID) return ctx.reply("你不是 GM，無法使用這個指令。");

    const args = ctx.match?.split(" ");
    if (!args || args.length !== 1) return ctx.reply("格式錯誤。請輸入：/temp <數值> (0.0 ~ 2.0)");

    const value = parseFloat(args[0]);
    if (isNaN(value) || value < 0 || value > 2) return ctx.reply("溫度必須在 0.0 到 2.0 之間。");

    await env.ciallo_db.prepare(
      `UPDATE users SET temperature = ? WHERE user_id = ?`
    ).bind(value, userId).run();

    await ctx.reply(`🌡️ 已將 AI 溫度調整為 ${value}。較低溫度（0.3~0.7）讓莎蘿更穩定，較高溫度（1.0~2.0）讓莎蘿更有創造力。`);
  });

  // ── /quest ──
  bot.command("quest", async (ctx) => {
    const userId = ctx.message?.from?.id.toString();
    if (!userId) return;

    const args = ctx.match?.trim();

    if (args === "status") {
      const quest: any = await env.ciallo_db.prepare(
        `SELECT * FROM daily_quests WHERE user_id = ? ORDER BY quest_date DESC LIMIT 1`
      ).bind(userId).first();

      if (!quest) return ctx.reply("你今天還沒有領取任務。輸入 /quest 來領取吧。");

      await ctx.reply(
        quest.completed
          ? `✅ 今日任務已完成：「${quest.description}」\n獎勵：好感度 +${quest.reward}`
          : `⏳ 今日任務尚未完成：「${quest.description}」\n完成後自動獲得獎勵：好感度 +${quest.reward}`
      );
      return;
    }

    // 領取/查看今日任務
    const hkTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
    const todayDate = hkTime.toISOString().split('T')[0];

    const existing: any = await env.ciallo_db.prepare(
      `SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ?`
    ).bind(userId, todayDate).first();

    if (existing) {
      await ctx.reply(
        existing.completed
          ? `✅ 今日任務已完成：「${existing.description}」\n獎勵：好感度 +${existing.reward}`
          : `⏳ 今日任務進行中：「${existing.description}」\n完成後自動獲得獎勵：好感度 +${existing.reward}`
      );
      return;
    }

    // 生成新任務
    const quest = DAILY_QUESTS[Math.floor(Math.random() * DAILY_QUESTS.length)];
    await env.ciallo_db.prepare(
      `INSERT INTO daily_quests (user_id, quest_date, quest_id, description, reward) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, todayDate, quest.id, quest.description, quest.reward).run();

    await ctx.reply(
      `📋 【今日任務】\n\n${quest.description}\n\n完成後可獲得：好感度 +${quest.reward}\n使用 /quest status 查看完成狀態。`
    );
  });

  // ── 一般文字訊息 ──
  bot.on("message:text", async (ctx) => {
    if (ctx.message.from?.is_bot) return;

    // 群組模式：必須 @mention 或 reply 莎蘿才回應
    if (ctx.chat.type !== "private") {
      const msg = ctx.message;
      const isMentioned = msg.entities?.some(e => e.type === "mention" || e.type === "text_mention");
      const isTrueReply = msg.reply_to_message?.from?.id === ctx.me.id;
      if (!isMentioned && !isTrueReply) return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const userId = ctx.message.from.id.toString();
      const userName = ctx.message.from.first_name || "客人";
      const chatId = ctx.chat.id.toString();

      const roomName = (ctx.chat.type !== "private" && 'title' in ctx.chat) ? (ctx.chat as any).title || "群組" : "私人對話";
      const aiReply = await callDeepSeek(env, execCtx, userId, userName, ctx.message.text, chatId, roomName);
      await ctx.reply(aiReply, { reply_parameters: { message_id: ctx.message.message_id } });
    } catch (error) {
      console.error("DeepSeek API 錯誤:", error);
      await ctx.reply("（莎蘿似乎被什麼事情打斷了，不好意思……請再對她說一次吧。）").catch(() => {});
    }
  });
}
