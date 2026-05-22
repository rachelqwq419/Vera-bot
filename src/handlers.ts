import { Bot } from "grammy";
import type { Env } from "./types";
import { ADMIN_USER_ID, MARU_USER_ID, GIFT_SHOP, ALLOWED_SETSTAT_COLUMNS, FORTUNES, DAILY_QUESTS, MOODS, CG_CATEGORIES, type Mood } from "./constants";import { getAffectionTitle } from "./utils";
import { computeFavoritePlay } from "./achievements";
import { logAdminAction } from "./utils";
import { callDeepSeek } from "./deepseek";

export function registerHandlers(bot: Bot, env: Env, execCtx: ExecutionContext): void {
  // ── 全域攔截私訊 (PM) ──
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === "private") {
      const fromId = ctx.from?.id.toString();
      if (fromId === ADMIN_USER_ID || fromId === MARU_USER_ID) return next();
      // 允許 callback_query (InlineKeyboard 按鈕) 通過
      if (ctx.callbackQuery) return next();
      // 允許 /cg 圖鑑指令通過
      const msgText = ctx.message?.text || ctx.message?.caption || '';
      if (msgText.startsWith('/cg')) return next();
      await ctx.reply("Ciallo～ 莎蘿目前只在「紫羅蘭喵喵酒館」營業喔！不接受私下邀約呢～");
      return;
    }
    return next();
  });

// 🌟 全域指令 20 秒自動刪除攔截器 (修正版) 🌟
bot.use(async (ctx, next) => {
  const text = ctx.message?.text;
  
  // 1. 確認係指令，且排除 /ciallo
  if (text && text.startsWith("/") && !text.startsWith("/ciallo")) {
    
    // 🔥 修改呢度：將 `/cg` 同 `/deletecg` 加入豁免清單
    if (text.startsWith("/cg") || text.startsWith("/deletecg")) {
      return next();
    }

    const originalReply = ctx.reply.bind(ctx);
    
    // 2. 覆寫 ctx.reply
    ctx.reply = async (msgText: string, ...rest: any[]) => {
      const textWithNotice = msgText + "\n\n(🗑️ 此指令回覆將於 20 秒後自動刪除)";
      const sentMsg = await originalReply(textWithNotice, ...rest);
      
      // 3. 執行倒數刪除
      execCtx.waitUntil((async () => {
        await new Promise(resolve => setTimeout(resolve, 20000));
        try {
          if (ctx.chat?.id && sentMsg.message_id) await ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id);
        } catch (e) { console.log("無法刪除 AI 回覆"); }
        try {
          if (ctx.chat?.id && ctx.message?.message_id) await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
        } catch (e) { console.log("無法刪除客人指令"); }
      })());
      
      return sentMsg;
    };
  }
  return next();
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
      "/nsfw — 查看私密互動數據 (🔞)\n" + // 👈 新增呢一行
      "/leaderboard 或 /rank — 好感度排行榜\n" +
      "/rank sex — 總性交次數排行榜\n" +
      "/rank achievements — 成就解鎖數排行榜\n" +
      "/daily — 查看今日簽到狀態\n" +
      "/quest — 查看今日任務\n" +
      "/gifts — 查看送給莎蘿的禮物紀錄\n" +
      "/fortune — 今日戀愛占卜\n" +
      "/cg — 查看CG圖鑑\n\n" +

      "💡 每日對莎蘿說「早安」「晚安」可以增加好感度。\n" +
      "🌹 使用 /rose send 送玫瑰花（好感度 +5）。\n" +
      "🍫 回覆莎蘿的訊息並輸入 /coin send 10 即可送巧克力（好感度 +3）。\n"+
      "<b>送禮系統暫時無法使用正常增加好感度</b>" 
      
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

// ── /profile（純愛日常檔案） ──
  bot.command("profile", async (ctx) => {
    try {
      const userId = ctx.message?.from?.id.toString();
      if (!userId) return;
      const user: any = await env.ciallo_db.prepare(
        `SELECT * FROM users WHERE user_id = ?`
      ).bind(userId).first();
      if (!user) return ctx.reply("您尚未與莎蘿進行過對話，紫羅蘭酒館目前沒有您的會員紀錄。");

      const title = getAffectionTitle(user.affection || 0);
      const moodKey = (user.mood || "HAPPY") as Mood;
      const moodInfo = MOODS[moodKey] || MOODS.HAPPY;

      // 📊 依你要求，只留下好感度、關係、心情和互動天數
      const profileText = `📊 【${user.first_name || "客人"} 的紫羅蘭專屬檔案】

💖 莎蘿好感度：${user.affection || 0} / 100
🏷️ 當前關係：${title}
😶 莎蘿今日心情：${moodInfo.emoji} ${moodInfo.label}
📅 互動天數：${user.check_in_days || 0} 天`;

      await ctx.reply(profileText);
    } catch (error) {
      console.error("Profile 讀取錯誤:", error);
      await ctx.reply("讀取檔案時發生錯誤，請稍後再試。");
    }
  });

  // ── /nsfw（🔞 私密互動數據追蹤） ──
  bot.command("nsfw", async (ctx) => {
    try {
      const userId = ctx.message?.from?.id.toString();
      if (!userId) return;
      const user: any = await env.ciallo_db.prepare(
        `SELECT * FROM users WHERE user_id = ?`
      ).bind(userId).first();
      if (!user) return ctx.reply("您尚未與莎蘿進行過對話，目前沒有您的私密紀錄。");

      let achievements: string[] = [];
      try { achievements = JSON.parse(user.achievements || '[]'); } catch (_e) { /* ignore */ }

      const favoritePlay = computeFavoritePlay(user);
      let specialMoments: Array<{ time: string; event: string }> = [];
      try { specialMoments = JSON.parse(user.special_moments || '[]'); } catch (_e) { /* ignore */ }

      // 🔞 所有色情追蹤、體位統計同成就移到呢到
      const nsfwText = `🔞 【${user.first_name || "客人"} 的私密互動追蹤】

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

🔞 【情境統計】
🚿 洗澡次數：${user.shower_count || 0} | 👔 制服次數：${user.school_uniform_count || 0}
🧦 絲襪次數：${user.pantyhose_count || 0} | 🙈 蒙眼次數：${user.blindfold_count || 0}

🏆 【已解鎖成就 (${achievements.length})】
${achievements.length > 0 ? achievements.map((a: string) => `✨ ${a}`).join('\n') : '暫無解鎖成就。'}

${specialMoments.length > 0 ? `📜 【特殊時刻】（最近 ${Math.min(3, specialMoments.length)} 條）\n${specialMoments.slice(-3).reverse().map((m: { time: string; event: string }) => `📌 ${m.event}`).join('\n')}` : ''}`;

      await ctx.reply(nsfwText);
    } catch (error) {
      console.error("NSFW 指令錯誤:", error);
      await ctx.reply("讀取私密檔案時發生錯誤，請稍後再試。");
    }
  });

  // ── /setstat (GM only, 支援改自己或 reply 改別人) ──
  bot.command("setstat", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return ctx.reply("你不是 GM，無法使用這個指令。");

    // 🎯 薇拉新增：判斷目標對象
    let targetUserId = adminId; // 預設改自己
    let targetName = ctx.message?.from?.first_name || "你";

    // 如果你有 reply 別人的訊息，就把目標換成那個客人！
    const targetMsg = ctx.message?.reply_to_message;
    if (targetMsg?.from?.id) {
      targetUserId = targetMsg.from.id.toString();
      targetName = targetMsg.from.first_name || "該客人";
    }

    const args = ctx.match?.split(" ");
    if (!args || args.length !== 2) {
      return ctx.reply(
        `格式錯誤。請輸入：/setstat <欄位名> <數值>\n若要修改他人，請 Reply 該客人的訊息。\n可用欄位：${ALLOWED_SETSTAT_COLUMNS.join(', ')}`
      );
    }

    const column = args[0];
    const value = Number(args[1]);
    if (isNaN(value)) return ctx.reply("數值必須是數字。");
    if (!ALLOWED_SETSTAT_COLUMNS.includes(column)) {
      return ctx.reply(`不允許直接修改欄位「${column}」。`);
    }

    try {
      const before = await env.ciallo_db.prepare(
        `SELECT ${column} FROM users WHERE user_id = ?`
      ).bind(targetUserId).first() as any;

      // 更新目標客人的數據
      await env.ciallo_db.prepare(
        `UPDATE users SET ${column} = ? WHERE user_id = ?`
      ).bind(value, targetUserId).run();

      const oldVal = before?.[column] ?? 'null';
      execCtx.waitUntil(logAdminAction(
        env, adminId!, targetUserId!, 'setstat',
        `column=${column}, old=${oldVal}, new=${value}`
      ));

      await ctx.reply(
        `🔧 [GM] 已成功將 ${targetName} 的 ${column} 從 ${oldVal} 修改為 ${value}。`
      );
    } catch (error) {
      await ctx.reply("修改失敗，請檢查欄位名稱是否正確或該客人是否已註冊。");
    }
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
        unlocked_cgs = '[]',
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

  // ── /coin (動態金額打賞與送巧克力) ──
  bot.command("coin", async (ctx) => {
    const args = ctx.match?.trim() || "";
    
    // 提取可能的數字 (使用更寬鬆的正則，只要有 send 和數字就抓出來)
    const match = args.match(/send.*?(\d+)/i);
    
    if (!match) return; // 格式完全不對就忽略

    const amount = parseInt(match[1], 10);
    if (amount <= 0) return;

    // 🎯 智能判斷：這筆錢是不是給莎蘿的？
    // 條件 1：Reply 了莎蘿的訊息
    const isReplyToCiallo = ctx.message?.reply_to_message?.from?.id === ctx.me.id;
    // 條件 2：文字裡面直接 @ 了莎蘿的帳號
    const isMentioningCiallo = ctx.me.username && args.includes(`@${ctx.me.username}`);

    if (!isReplyToCiallo && !isMentioningCiallo) {
      return; // 不是給她的，乖乖閉嘴讓真正的經濟機器人 (殷娘莉莉) 處理
    }

    const userId = ctx.message!.from.id.toString();

    try {
      const user: any = await env.ciallo_db.prepare(
        `SELECT affection, gifts_received FROM users WHERE user_id = ?`
      ).bind(userId).first();

      if (!user) return ctx.reply("您還沒有和莎蘿說過話，先打聲招呼吧！");

      // 讀取目前的禮物庫
      let gifts: string[] = [];
      try { gifts = JSON.parse(user.gifts_received || '[]'); } catch (_e) {}

      let newAffection = user.affection || 0;
      let replyText = "";

      if (amount === 10) {
        // 剛好 10 蚊：送巧克力 (+3)
        gifts.push("巧克力");
        newAffection = Math.min(100, newAffection + 3);
        replyText = "（莎蘿開心地接過巧克力，紫色的眼眸亮了起來）\n哇！謝謝你送的巧克力～我會好好品嚐的！🍫\n\n(💖 好感度 +3)";
      } else {
        // 其他金額：小費金幣 (+1)
        gifts.push("小費金幣");
        newAffection = Math.min(100, newAffection + 1);
        if (amount < 10) {
           replyText = `（莎蘿收下了 ${amount} 個金幣，微微一笑）\n謝謝客人的打賞～蚊子再小也是肉呢！🪙\n\n(💖 好感度 +1)`;
        } else {
           replyText = `（莎蘿驚訝地看著 ${amount} 個金幣，睜大了眼睛）\n老闆！這裡有大戶啊！謝謝客人的慷慨打賞！🪙\n\n(💖 好感度 +1)`;
        }
      }

      // 寫入資料庫
      await env.ciallo_db.prepare(
        `UPDATE users SET affection = ?, gifts_received = ? WHERE user_id = ?`
      ).bind(newAffection, JSON.stringify(gifts), userId).run();

      // 發送回覆 (這個回覆會被全域攔截器捕捉，20秒後自動刪除)
      await ctx.reply(replyText);
    } catch (error) {
      console.error("送禮物出錯:", error);
    }
  });
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

  // ── /reset ──
  bot.command("reset", async (ctx) => {
    const userId = ctx.message?.from?.id.toString();
    if (!userId) return ctx.reply("無法辨識您的身分。");

    const userName = ctx.message!.from.first_name || "客人";

    // 清除該用戶的對話記錄
    await env.ciallo_db.prepare(
      `DELETE FROM messages WHERE user_id = ?`
    ).bind(userId).run();

    await ctx.reply(
      `🧹 ${userName}，莎蘿已經將您與我的對話紀錄全部清除囉～放心，數據統計不會受到影響，只有對話歷史被遺忘了呢。`
    );
  });

  // ── /addcg (GM only, 發送圖片 + caption 指令) ──
  bot.on(":photo", async (ctx) => {
    if (!ctx.message) return;
    const caption = ctx.message.caption || '';
    if (!caption.startsWith('/addcg')) return;
    const adminId = ctx.message.from.id.toString();
    if (adminId !== ADMIN_USER_ID) return;

    const args = caption.trim().split(/\s+/);
    if (args.length < 2) {
      return ctx.reply("格式錯誤。請在圖片 caption 輸入：/addcg <分類名稱>\n可用分類：kiss, creampie, paizuri, blowjob, swallow, handjob, footjob, anal, cum_face, cum_tits, orgasm, public, hair_pull, apron, submissive, cowgirl, reverse_cowgirl, doggy, missionary, standing, against_wall, sixty_nine, deepthroat, shower, school_uniform, pantyhose, blindfold");
    }
    const category = args[1].toLowerCase();

    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];
    const fileId = bestPhoto.file_id;

    await env.ciallo_db.prepare(
      `INSERT INTO cgs (category, file_id) VALUES (?, ?)`
    ).bind(category, fileId).run();

    const displayName = CG_CATEGORIES[category] || category;
    await ctx.reply(`✅ 成功將圖片加入【${displayName}】分類！`);
  });

  // ── /deletecg (GM only, 列出或刪除 CG) ──
  bot.command("deletecg", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return ctx.reply("你不是 GM，無法使用這個指令。");

    const args = ctx.match?.trim();

    // ── 無參數：顯示分類列表 + Inline 按鈕（預覽用） ──
    if (!args) {
      const { results } = await env.ciallo_db.prepare(
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

      // 文字摘要
      let text = "📋 【CG 管理面板】\n\n";
      for (const [cat, ids] of Object.entries(grouped)) {
        const display = CG_CATEGORIES[cat] || cat;
        text += `${display}: ID ${ids.join(', ')}\n`;
      }
      text += "\n👇 點擊下方按鈕可預覽該分類所有 CG 圖片（每張會標明 ID）";
      text += "\n確認後使用 /deletecg <id> 刪除指定 CG。";

      // Inline 按鈕：每個分類一個按鈕（2 個一行）
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

    const cg = await env.ciallo_db.prepare(
      `SELECT id, category FROM cgs WHERE id = ?`
    ).bind(id).first() as any;

    if (!cg) return ctx.reply(`找不到 ID 為 ${id} 的 CG。`);

    await env.ciallo_db.prepare(
      `DELETE FROM cgs WHERE id = ?`
    ).bind(id).run();

    const displayName = CG_CATEGORIES[cg.category] || cg.category;
    await ctx.reply(`🗑️ 已刪除 CG #${id}（分類：${displayName}）。`);
  });

  // ── /cg (私訊圖鑑系統) ──
  bot.command("cg", async (ctx) => {
    if (ctx.chat?.type !== "private") {
      return ctx.reply("請私訊莎蘿使用 /cg 來查看你的專屬圖鑑喔～");
    }

    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const user = await env.ciallo_db.prepare(
      `SELECT unlocked_cgs FROM users WHERE user_id = ?`
    ).bind(userId).first() as { unlocked_cgs: string } | null;

    let unlocked: number[] = [];
    try { unlocked = JSON.parse(user?.unlocked_cgs || '[]'); } catch { /* ignore */ }
    const unlockedSet = new Set(unlocked);

    // 取得所有 CG，按分類統計總數與已解鎖數量
    const { results: allCgs } = await env.ciallo_db.prepare(
      `SELECT id, category FROM cgs`
    ).all();

    const categoryTotal: Record<string, number> = {};
    const categoryUnlocked: Record<string, number> = {};

    for (const row of (allCgs as any[])) {
      categoryTotal[row.category] = (categoryTotal[row.category] || 0) + 1;
      if (unlockedSet.has(row.id)) {
        categoryUnlocked[row.category] = (categoryUnlocked[row.category] || 0) + 1;
      }
    }

    const categories = Object.keys(categoryTotal);
    if (categories.length === 0) {
      return ctx.reply("目前還沒有任何 CG 可以收集。");
    }

    // 建立 InlineKeyboard（每行 2 個按鈕）
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

    await ctx.reply("📸 【莎蘿的私密圖鑑】\n\n請選擇要查看的分類：", {
      reply_markup: { inline_keyboard: keyboard },
    });
  });

  // ── callback_query：CG 圖鑑 / 管理按鈕處理 ──
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    // ── deletecg: 分類預覽（GM only） ──
    if (data.startsWith('deletecg:')) {
      const adminId = ctx.from?.id.toString();
      if (adminId !== ADMIN_USER_ID) {
        await ctx.answerCallbackQuery({ text: "你唔係 GM，冇權限預覽 CG。", show_alert: true });
        return;
      }

      const category = data.slice(9);
      const { results: cgList } = await env.ciallo_db.prepare(
        `SELECT id, file_id, category FROM cgs WHERE category = ? ORDER BY id`
      ).bind(category).all();

      if (!cgList || cgList.length === 0) {
        await ctx.answerCallbackQuery({ text: "呢個分類冇任何 CG。", show_alert: true });
        return;
      }

      const displayCat = CG_CATEGORIES[category] || category;
      await ctx.answerCallbackQuery({ text: `正在載入 ${displayCat} 全部 ${cgList.length} 張 CG...` });

      // 逐張發送，每張標明 [ID: X]
      const rows = cgList as any[];
      for (let i = 0; i < rows.length; i++) {
        await ctx.replyWithPhoto(rows[i].file_id, {
          caption: `[ID: ${rows[i].id}] ${displayCat}`,
        });
      }
      // 總結提示
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

    const user = await env.ciallo_db.prepare(
      `SELECT unlocked_cgs FROM users WHERE user_id = ?`
    ).bind(userId).first() as { unlocked_cgs: string } | null;

    let unlocked: number[] = [];
    try { unlocked = JSON.parse(user?.unlocked_cgs || '[]'); } catch { /* ignore */ }
    const unlockedSet = new Set(unlocked);

    const { results: cgs } = await env.ciallo_db.prepare(
      `SELECT id, file_id FROM cgs WHERE category = ?`
    ).bind(category).all();

    const unlockedCgs = (cgs as any[]).filter((cg: any) => unlockedSet.has(cg.id));

    if (unlockedCgs.length === 0) {
      await ctx.answerCallbackQuery({ text: "你還沒有解鎖這個分類的任何 CG！", show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: `正在載入 ${CG_CATEGORIES[category] || category}...` });

    // 使用 MediaGroup 發送（每批最多 10 張）
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


// ── 一般文字訊息 ──
  bot.on("message:text", async (ctx) => {
    if (!ctx.message) return;
    if (ctx.message.from?.is_bot) return;

    // 忽略以 / 開頭的未註冊指令
    if (ctx.message.text.startsWith("/")) return;

// 🛑 新增：群組發言過濾機制（防止 Token 爆炸）
    if (ctx.chat.type !== "private") {
      const botUsername = ctx.me.username;
      const text = ctx.message.text;
      
      // 判斷條件：是否回覆莎蘿的訊息？
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
      // 判斷條件：文字中是否包含 @帳號，或是提到繁體的「莎蘿」或簡體的「莎萝」？
      const isMentioned = text.includes(`@${botUsername}`) || text.includes("莎蘿") || text.includes("莎萝");

      // 如果不是回覆她，也沒有 @她，也沒有直接叫她的名字，就乖乖閉嘴不處理
      if (!isReplyToBot && !isMentioned) {
        return;
      }
    }

    try {
      await ctx.replyWithChatAction("typing");
      const userId = ctx.message!.from.id.toString();
      const userName = ctx.message!.from.first_name || "客人";
      const chatId = ctx.chat.id.toString();

      const roomName = (ctx.chat.type !== "private" && 'title' in ctx.chat) ? (ctx.chat as any).title || "群組" : "私人對話";
      const aiReply = await callDeepSeek(env, execCtx, userId, userName, ctx.message.text, chatId, roomName);
      await ctx.reply(aiReply, { reply_parameters: { message_id: ctx.message.message_id } });
    } catch (error) {
      console.error("DeepSeek API 錯誤:", error);
      await ctx.reply("（莎蘿似乎被什麼事情打斷了，不好意思……請再對她說一次吧。）").catch(() => {});
    }
  });

  // 🛡️ 新增：全域錯誤攔截器 (放在 registerHandlers 的最尾端)
  bot.catch((err) => {
    const e = err.error as any;
    
    // 如果錯誤訊息包含 bot was kicked，就安靜處理掉
    if (e.description && e.description.includes("bot was kicked")) {
      console.log(`[安全攔截] 莎蘿已被踢出群組或沒有權限發言，已忽略此錯誤。`);
    } else {
      // 其他嚴重錯誤才印出來
      console.error("Grammy 運行時錯誤:", e);
    }
  });

}