import { Bot, InputFile } from "grammy";
import type { Env } from "./types";
import { ADMIN_USER_ID, MARU_USER_ID, LALA_USER_ID, KANON_USER_ID, BOSS_ID, ALLOWED_SETSTAT_COLUMNS, FORTUNES, MOODS, CG_CATEGORIES, type Mood } from "./constants";
import { ensureUserExists } from "./utils";
import { computeFavoritePlay } from "./achievements";
import { logAdminAction } from "./utils";
import { callDeepSeek } from "./deepseek";
import { analyzeImageWithGemini } from "./gemini";
import { generateVoice } from "./voice";

export function registerHandlers(bot: Bot, env: Env, execCtx: ExecutionContext): void {
  // ── 全域攔截私訊 (PM) ──
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === "private") {
      const fromId = ctx.from?.id.toString();
      // 👇 這裡加上了 LALA_USER_ID 和 KANON_USER_ID 的判斷 👇
      if (fromId === ADMIN_USER_ID || fromId === MARU_USER_ID || fromId === LALA_USER_ID || fromId === KANON_USER_ID) return next();
      // 允許 callback_query (InlineKeyboard 按鈕) 通過
      if (ctx.callbackQuery) return next();
      // 允許 /cg 圖鑑指令通過
      const msgText = ctx.message?.text || ctx.message?.caption || '';
      if (msgText.startsWith('/cg')) return next();
      await ctx.reply("vera～ 薇拉目前只在「紫羅蘭酒館」營業喔！不接受私下邀約呢～");
      return;
    }
    return next();
  });

// 🌟 全域指令 20 秒自動刪除攔截器 (修正版) 🌟
bot.use(async (ctx, next) => {
  const text = ctx.message?.text;
  
  // 1. 確認是指令，且排除不需要自動刪除的指令
  if (text && text.startsWith("/")) {
    
    // 豁免清單：不執行自動刪除，也不顯示刪除提示
    if (
      text.startsWith("/vera") ||
      text.startsWith("/cg") || 
      text.startsWith("/deletecg") || 
      text.startsWith("/group_impression") || 
      text.startsWith("/gi")
    ) {
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
    ctx.reply("vera～ 歡迎來到紫羅蘭酒館！我是薇拉，希望能為您帶來愉快的時光～")
  );

// ── /vera ──
  bot.command("vera", (ctx) =>
    ctx.reply(
      "我是薇拉(Vera)。\n\n" +
      "📋 系統指令：\n" +
      "/start — 系統重啟\n" +
      "/vera — 顯示此協議\n" +
      "/fortune — 今日機率運算（占卜）\n" +
      "/group_impression 或 /gi — 區域觀測報告\n" +
      "/cg — 視覺數據庫\n"
    )
  );

  // ── /emergency (緊急呼叫姐姐大人) ──
  bot.command("emergency", async (ctx) => {
    const adminMention = `[姐姐大人](tg://user?id=${ADMIN_USER_ID})`;
    const reporter = ctx.from?.first_name || "一位客人";
    
    // 1. 通知姐姐大人
    await ctx.reply(`🚨 **緊急狀態已啟動！**\n\n薇拉似乎發生了行為異常，${reporter} 已啟動緊急呼叫！\n${adminMention} 請儘速查看現場狀況。`, { parse_mode: "Markdown" });

    // 2. 強制重置 AI 的當前心情與部分暫時狀態 (寫入 DB)
    const userId = ctx.from?.id.toString();
    if (userId) {
      await env.vera_db.prepare(
        `UPDATE users SET mood = 'HAPPY', temperature = 0.7 WHERE user_id = ?`
      ).bind(userId).run(); // 重置觸發者的互動狀態為穩定
    }
    
    console.warn(`[EMERGENCY] ${reporter} 觸發了緊急呼叫！`);
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

    await env.vera_db.prepare(
      `UPDATE users SET temperature = ? WHERE user_id = ?`
    ).bind(value, userId).run();

    await ctx.reply(`🌡️ 已將 AI 溫度調整為 ${value}。較低溫度（0.3~0.7）讓薇拉更穩定，較高溫度（1.0~2.0）讓薇拉更有創造力。`);
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

      // 1. 抓取最近 50 條對話作為脈絡
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

      // 2. 抓取本群最活躍的 10 位用戶的摘要
      const { results: userSummaries } = await env.vera_db.prepare(`
        SELECT u.first_name, u.conversation_summary, u.affection, COUNT(m.id) as msg_count
        FROM users u
        JOIN messages m ON u.user_id = m.user_id
        WHERE m.chat_id = ? AND u.first_name IS NOT NULL
        GROUP BY u.user_id
        ORDER BY msg_count DESC LIMIT 10
      `).bind(chatId).all();

      let memberContext = "【活躍成員記憶碎片】:\n";
      for (const u of (userSummaries as any[])) {
        memberContext += `- ${u.first_name} (好感 ${u.affection}): ${u.conversation_summary || '初次見面'}\n`;
      }

      // 3. 呼叫 AI 生成總結
      const messages = [
        {
          role: "system",
          content: `你現在是薇拉(vera)，18歲高三生，在「紫羅蘭酒館」打工。你的性格活潑可愛、樂天開朗、直率俏皮且帶點微毒舌。請使用「書面語（繁體中文）」撰寫報告，不要使用粵語口語。`
        },
        {
          role: "user",
          content: `
請根據以下群組「${roomName}」的最近對話以及你對成員的記憶，寫一段「群組觀察報告」。

${memberContext}

【最近對話紀錄】:
${historyText}

【任務要求】:
1. 內容需涵蓋：對群組整體氛圍的評價、對幾位活躍成員的有趣觀察、以及薇拉對這個群組未來的期待。
2. 保持你的角色性格，講話要俏皮、可愛，偶爾可以有一點點調皮的吐槽。
3. 總結字數控制在 150-300 字左右。
4. 最後請以「vera～」作為結尾。
`
        }
      ];

      const { fetchWithFallback } = await import("./deepseek");
      const data = await fetchWithFallback(env, {
        model: "deepseek-v4-pro",
        messages: messages,
        temperature: 0.7,
      });
      
      if (data?.choices?.[0]?.message?.content) {
        let aiReply = data.choices[0].message.content.trim();
        await ctx.reply(`🌸 **薇拉的群組觀察報告：${roomName}** 🌸\n\n${aiReply}`, { parse_mode: "Markdown" });
      } else {
        await ctx.reply("（薇拉想了很久，最後什麼都沒寫出來...）");
      }
    } catch (error) {
      console.error("Group Impression Error:", error);
      await ctx.reply("抱歉，薇拉現在腦袋有點亂，寫不出總結呢... >_<");
    }
  });

// ── /reset (GM or Boss only) ──
  bot.command("reset", async (ctx) => {
    // 1. 權限檢查：只有 ADMIN_USER_ID 或 BOSS_ID 可以使用
    const fromId = ctx.message?.from?.id.toString();
    if (fromId !== ADMIN_USER_ID && fromId !== BOSS_ID) {
      return ctx.reply("妳不是管理員或老闆，無法使用這個指令喔～");
    }

    // 2. 判斷目標對象（預設是自己）
    let targetUserId = fromId;
    let targetName = ctx.message?.from?.first_name || "妳";

    // 3. 如果你有 reply 別人的訊息，就把目標換成那個客人
    const targetMsg = ctx.message?.reply_to_message;
    if (targetMsg?.from?.id) {
      targetUserId = targetMsg.from.id.toString();
      targetName = targetMsg.from.first_name || "該客人";
    }

    // 4. 清除目標用戶的對話記錄
    await env.vera_db.prepare(
      `DELETE FROM messages WHERE user_id = ?`
    ).bind(targetUserId).run();

    await ctx.reply(
      `🧹 [管理/老闆] 已經將 ${targetName} 的對話紀錄全部清除囉～數據統計與記憶不會受到影響。`
    );
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

    await ctx.reply("⏸️ **薇拉已進入觀察模式。**\n\n我會繼續聽大家說話，但暫時不會回覆喔～直到管理員或老闆輸入 /adminresume 為止。");
  });

  // ── /adminresume (恢復運行並重置狀態) ──
  bot.command("adminresume", async (ctx) => {
    const fromId = ctx.from?.id.toString();
    if (fromId !== ADMIN_USER_ID && fromId !== BOSS_ID) return;

    const chatId = ctx.chat.id.toString();
    
    // 1. 解除停止標記
    await env.vera_db.prepare(
      `UPDATE users SET affection = 0 WHERE user_id = ?`
    ).bind(`FLAG_STOP_${chatId}`).run();

    // 2. 設置「人格重置」標記，下次對話時強制清醒
    await env.vera_db.prepare(
      `INSERT INTO users (user_id, first_name, affection) VALUES (?, 'RESET_FLAG', 1) 
       ON CONFLICT(user_id) DO UPDATE SET affection = 1`
    ).bind(`FLAG_RESET_${chatId}`).run();

    await ctx.reply("▶️ **薇拉已經清醒過來了！**\n\n剛剛好像做了個奇怪的夢呢⋯⋯現在我恢復正常囉！大家想聊什麼？♡");
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
    const targetRealName = targetMsg.from.first_name || "客人";

    try {
      // 1. 取得現有筆記
      const user: any = await env.vera_db.prepare(
        `SELECT user_notes FROM users WHERE user_id = ?`
      ).bind(targetUserId).first();
      
      let notes = {};
      try { notes = JSON.parse(user?.user_notes || '{}'); } catch { notes = {}; }
      
      // 2. 更新稱呼
      (notes as any)["稱呼"] = newName;

      // 3. 寫回資料庫
      await env.vera_db.prepare(
        `UPDATE users SET user_notes = ? WHERE user_id = ?`
      ).bind(JSON.stringify(notes), targetUserId).run();

      await ctx.reply(`✅ 成功！現在薇拉會稱呼 ${targetRealName} 為「${newName}」囉！`);
    } catch (e) {
      console.error("Setname error:", e);
      await ctx.reply("❌ 更改失敗，請稍後再試。");
    }
  });

  // ── /addcg (GM only, 發送圖片 + caption 指令) ──
  bot.on(":photo", async (ctx, next) => {
    if (!ctx.message) return next();
    const caption = ctx.message.caption || '';
    if (!caption.startsWith('/addcg')) return next();
    const adminId = ctx.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return;

    const args = caption.trim().split(/\s+/);
    if (args.length < 2) {
      return ctx.reply("格式錯誤。請在圖片 caption 輸入：/addcg <分類名稱>");
    }
    const category = args[1].toLowerCase();

    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];
    const fileId = bestPhoto.file_id;

    await env.vera_db.prepare(
      `INSERT INTO cgs (category, file_id) VALUES (?, ?)`
    ).bind(category, fileId).run(); 

    const displayName = CG_CATEGORIES[category] || category;
    await ctx.reply(`✅ 成功將圖片加入【${displayName}】分類！`);
  });

  // ── /checklogs (GM only) ──
  bot.command("checklogs", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return ctx.reply("你不是 GM，無法使用這個指令。");

    try {
      const { results } = await env.vera_db.prepare(
        `SELECT * FROM error_logs ORDER BY id DESC LIMIT 5`
      ).all();

      if (!results || results.length === 0) {
        return ctx.reply("目前沒有任何錯誤日誌。");
      }

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

    const cg = await env.vera_db.prepare(
      `SELECT id, category FROM cgs WHERE id = ?`
    ).bind(id).first() as any;

    if (!cg) return ctx.reply(`找不到 ID 為 ${id} 的 CG。`);

    await env.vera_db.prepare(
      `DELETE FROM cgs WHERE id = ?`
    ).bind(id).run();

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

    const user = await env.vera_db.prepare(
      `SELECT unlocked_cgs FROM users WHERE user_id = ?`
    ).bind(userId).first() as { unlocked_cgs: string } | null;

    let unlocked: number[] = [];
    try { unlocked = JSON.parse(user?.unlocked_cgs || '[]'); } catch { /* ignore */ }
    const unlockedSet = new Set(unlocked);

    // 取得所有 CG，按分類統計總數與已解鎖數量
    const { results: allCgs } = await env.vera_db.prepare(
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

    await ctx.reply("📸 【薇拉的私密圖鑑】\n\n請選擇要查看的分類：", {
      reply_markup: { inline_keyboard: keyboard },
    });
    } catch (error) {
      console.error("CG Panel Error:", error);
      await ctx.reply("讀取圖鑑時發生錯誤。");
    }
  });

  // ── callback_query：CG 圖鑑 / 管理按鈕處理 ──
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

bot.command("addkey", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return; // 只有你可以加[cite: 15]

    const args = ctx.match?.trim();
    if (!args) return ctx.reply("請輸入 Key：/addkey sk-xxxxxx");

    try {
      await env.vera_db.prepare(
        `INSERT INTO api_keys (api_key) VALUES (?)`
      ).bind(args).run();
      await ctx.reply("✅ 成功加入新 API Key！");
    } catch (e) {
      await ctx.reply("❌ 加入失敗。");
    }
  });

// ── 查看所有 API Key 狀態 ──
  bot.command("checkkeys", async (ctx) => {
    const adminId = ctx.message?.from?.id.toString();
    if (adminId !== ADMIN_USER_ID) return;

    const { results } = await env.vera_db.prepare(`SELECT * FROM api_keys`).all();
    if (!results || results.length === 0) return ctx.reply("資料庫中一條 Key 都沒有喔～");

    let text = "🔑 【API Key 狀態列表】\n";
    for (const row of results as any[]) {
      // 只顯示前 8 個字元保護安全
      text += `ID: ${row.id} | 狀態: ${row.status === 'active' ? '🟢' : '🔴'} ${row.status} | Key: ${row.api_key.substring(0, 8)}...\n`;
    }
    await ctx.reply(text);
  });

  // ── 一般訊息 (文字 或 圖片) ──
  bot.on(["message:text", "message:photo"], async (ctx) => {
    if (!ctx.message) return;
    if (ctx.message.from?.is_bot) return;

    const chatId = ctx.chat.id.toString();

    // 🛑 [管理員/老闆控制]：檢查是否處於停止狀態
    try {
      const stopFlag: any = await env.vera_db.prepare(
        `SELECT affection FROM users WHERE user_id = ?`
      ).bind(`FLAG_STOP_${chatId}`).first();
      
      if (stopFlag?.affection === 1) {
        // 如果是管理員或老闆輸入 /adminresume，允許通過
        const userText = ctx.message.text || ctx.message.caption || "";
        if (userText.startsWith("/adminresume")) return;
        
        console.log(`[停止模式] 已忽略來自群組 ${chatId} 的訊息。`);
        return;
      }
    } catch (e) {
      console.error("檢查停止狀態出錯:", e);
    }

    let userMessage = ctx.message.text || ctx.message.caption || "";

    // 忽略以 / 開頭的指令
    if (userMessage.startsWith("/")) {
      const lowerMsg = userMessage.toLowerCase();
      // 這裡列出所有已經註冊過的 command，防止重複處理
      const registeredCommands = ["/start", "/vera", "/profile", "/nsfw", "/leaderboard", "/rank", "/top", "/daily", "/gifts", "/coin", "/fortune", "/temp", "/quest", "/reset", "/resetuser", "/setstat", "/addkey", "/checkkeys", "/cg", "/deletecg", "/checklogs", "/force_fatigue", "/force_recover"];
      // 使用精準匹配，防止 /coind 誤傷 /coin
      const isCmd = registeredCommands.some(cmd => {
        const parts = lowerMsg.split(/\s+/);
        return parts[0] === cmd;
      });
      if (isCmd) return;
    }

    // 🛑 群組發言過濾機制（防止 Token 爆炸）
    if (ctx.chat.type !== "private") {
      const botUsername = ctx.me.username;
      
      // 判斷條件 1：是否回覆薇拉的訊息？
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
      
      // 判斷條件 2：文字中是否包含 @帳號？
      const isAtMentioned = botUsername && userMessage.includes(`@${botUsername}`);
      
      // 判斷條件 3：是否提到名字（繁簡皆可）？
      const isNameCalled = userMessage.includes("薇拉") || userMessage.includes("vera");

      // 如果不是回覆她，也沒有 @她，也沒有直接叫她的名字，就乖乖閉嘴不處理
      if (!isReplyToBot && !isAtMentioned && !isNameCalled) {
        if (ctx.message.photo) {
          console.log(`[群組過濾] 忽略圖片訊息: 因為未提及機器人名稱或回覆機器人。`);
        } else {
          console.log(`[群組過濾] 忽略非提及訊息: "${userMessage.substring(0, 15)}..."`);
        }
        return;
      }
    }

    try {
      await ctx.replyWithChatAction("typing");
      const userId = ctx.from?.id.toString();
      if (!userId) return;
      const userName = ctx.from?.first_name || "客人";
      const userLogin = ctx.from?.username ? `@${ctx.from.username}` : undefined;
      const chatId = ctx.chat.id.toString();

      // ── 檢測回覆內容 (Reply Context) ──
      const replyMsg = ctx.message.reply_to_message;
      if (replyMsg) {
        const repliedName = replyMsg.from?.first_name || "客人";
        const repliedLogin = replyMsg.from?.username ? `@${replyMsg.from.username}` : "";
        
        let contentBrief = "";
        if (replyMsg.text) contentBrief = replyMsg.text;
        else if (replyMsg.caption) contentBrief = replyMsg.caption;
        else if (replyMsg.photo) contentBrief = "(圖片)";
        else if (replyMsg.sticker) contentBrief = "(貼圖)";
        else if (replyMsg.voice) contentBrief = "(語音)";
        else if (replyMsg.video) contentBrief = "(影片)";
        else contentBrief = "(非文字內容)";

        if (contentBrief.length > 50) contentBrief = contentBrief.substring(0, 50) + "...";

        // 如果回覆的是薇拉自己 (判斷 ID 或 判斷是否為 bot)
        if (replyMsg.from?.id === ctx.me.id || replyMsg.from?.is_bot) {
            userMessage = `[回覆 薇拉：「${contentBrief}」] ` + userMessage;
        } else {
            // 將被回覆的內容注入
            const replyTag = repliedLogin ? `[回覆 ${repliedName}(${repliedLogin})：「${contentBrief}」] ` : `[回覆 ${repliedName}：「${contentBrief}」] `;
            userMessage = replyTag + userMessage;
        }
      }

      // ── 圖像識別處理 (支持當前訊息 或 回覆中的圖片) ──
      const photoMsg = ctx.message.photo ? ctx.message : (ctx.message.reply_to_message?.photo ? ctx.message.reply_to_message : null);

      if (photoMsg && photoMsg.photo) {
        const photos = photoMsg.photo;
        const bestPhoto = photos[photos.length - 1];
        
        try {
          // 1. 取得文件路徑
          const file = await ctx.api.getFile(bestPhoto.file_id);
          const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
          console.log(`📸 [Vision] 正在從 Telegram 下載圖片: ${bestPhoto.file_id}`);
          
          // 2. 下載圖片並轉為 base64
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error(`Telegram 文件下載失敗: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          // 使用 nodejs_compat 提供的 Buffer
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          
          // 3. 調用 Gemini 識別
          const description = await analyzeImageWithGemini(env, base64, "image/jpeg");
          
          // 4. 拼接至 userMessage
          const imagePrefix = photoMsg === ctx.message ? "發送" : "回覆";
          userMessage = `[客人${imagePrefix}了一張圖片，內容描述如下：${description}] ${userMessage}`;
          console.log(`📸 [Vision] 圖像識別完成: ${description.substring(0, 50)}...`);
        } catch (visionError) {
          console.error("Vision Processing Error:", visionError);
          userMessage = `[客人${photoMsg === ctx.message ? "發送" : "回覆"}了一張圖片，但系統識別失敗] ${userMessage}`;
        }
      }

      const roomName = (ctx.chat.type !== "private" && 'title' in ctx.chat) ? (ctx.chat as any).title || "群組" : "私人對話";
      const threadId = ctx.message.message_thread_id;
      const { reply, image } = await callDeepSeek(env, execCtx, userId, userName, userMessage, chatId, roomName, threadId, userLogin);
      if (!reply) return; // 如果回覆為空（被去重），則不發送

      // ── 語音生成邏輯 ──
      let voiceData: Uint8Array | null = null;

      try {
        const voiceKeywords = ["發語音", "用語音", "語音", "說話", "說點什麼", "聲音", "配音"];
        const isVoiceRequested = voiceKeywords.some(kw => userMessage.includes(kw));
        const randomVoiceTrigger = Math.random() < 0.10;

        if (env.VOICE_API_URL && (isVoiceRequested || randomVoiceTrigger)) {
          // 清理一下文字，去掉括號內的內心 OS，只讀出對話內容
          const cleanReply = reply.replace(/\(.*?\)/g, '').replace(/（.*?）/g, '').trim();
          if (cleanReply) {
            console.log(`🎙️ [Voice] 正在為 ${userName} 生成語音...`);
            voiceData = await generateVoice(env, cleanReply);
          }
        }
      } catch (voiceErr) {
        console.error("Voice Logic Error:", voiceErr);
      }

      try {
        if (voiceData) {
          // 如果生成了語音，優先發送語音（附帶文字說明）
          await ctx.replyWithVoice(new InputFile(voiceData), {
            caption: reply,
            reply_parameters: { message_id: ctx.message.message_id }
          });
        } else if (image) {
          // 如果有生成圖片，則發送圖片連同文字
          await ctx.replyWithPhoto(new InputFile(image), {
            caption: reply,
            reply_parameters: { message_id: ctx.message.message_id }
          });
        } else {
          // 只有文字回覆
          await ctx.reply(reply, { reply_parameters: { message_id: ctx.message.message_id } });
        }
      } catch (e) {
        // 如果回覆原訊息失敗（例如訊息已被刪除），則直接發送
        console.warn("[回覆失敗] 原訊息可能已被刪除，嘗試直接發送回覆。");
        if (voiceData) {
          await ctx.replyWithVoice(new InputFile(voiceData), { caption: reply });
        } else if (image) {
          await ctx.replyWithPhoto(new InputFile(image), { caption: reply });
        } else {
          await ctx.reply(reply);
        }
      }
    } catch (error) {
      console.error("DeepSeek API 錯誤:", error);
      await ctx.reply("（薇拉似乎在想事情時被打斷了，請再對她說一次吧。）").catch(() => {});
    }
  });

  // 🛡️ 新增：全域錯誤攔截器 (放在 registerHandlers 的最尾端)
  bot.catch((err) => {
    const e = err.error as any;
    
    // 如果錯誤訊息包含 bot was kicked，就安靜處理掉
    if (e.description && e.description.includes("bot was kicked")) {
      console.log(`[安全攔截] 薇拉已被踢出群組或沒有權限發言，已忽略此錯誤。`);
    } else {
      // 其他嚴重錯誤才印出來
      console.error("Grammy 運行時錯誤:", e);
    }
  });
}