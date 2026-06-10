import { Bot, webhookCallback } from "grammy";
import type { Env } from "./types";
import { registerHandlers } from "./handlers";
import { sendPhotoToTelegram, drawWithComfyUI } from "./comfyui";

export default {
  async fetch(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } });
    }
    if (request.method !== "POST") {
      return new Response("vera! 這裡是莎蘿的酒館，請不要亂闖喔～", { status: 200 });
    }

    // 🛑 機器人維護模式 (Active Maintenance Mode)
    // 這裡我們初始化 bot，但只掛載一個全域攔截器，用來發送罐頭訊息。
    const bot = new Bot(env.BOT_TOKEN);
    
    bot.use(async (ctx, next) => {
      // 如果不是訊息，就不理會 (例如 callback query)
      if (!ctx.message) return;
      
      const text = ctx.message.text || ctx.message.caption || "";
      const isPrivate = ctx.chat?.type === "private";
      
      // 判斷是否有人找她
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
      const isAtMentioned = ctx.me.username && text.includes(`@${ctx.me.username}`);
      const isNameCalled = text.includes("莎蘿") || text.includes("莎萝") || text.includes("vera") || text.startsWith("/");

      if (isPrivate || isReplyToBot || isAtMentioned || isNameCalled) {
        try {
          await ctx.reply("vera～ 莎蘿目前正在系統維護中喔 💤\n暫時無法回覆大家，請等姐姐大人喚醒我再見吧～");
        } catch (e) {
          console.error("發送維護訊息失敗:", e);
        }
      }
      // 不呼叫 next()，所以後續的所有邏輯 (如果有) 都不會執行
    });

    /* 
    // === 下方為正常運作邏輯，當需要重新開啟機器人時： ===
    // 1. 刪除上方 🛑 機器人維護模式 的 bot.use 區塊
    // 2. 解開下方 registerHandlers 的註解
    
    registerHandlers(bot, env, execCtx);
    */

    try {
      const handleUpdate = webhookCallback(bot, "cloudflare-mod", {
        timeoutMilliseconds: 60000, 
      });
      return await handleUpdate(request);
    } catch (error) {
      console.error("Webhook 處理失敗:", error);
      return new Response("Error", { status: 500 });
    }
  },

  // ── 🆕 定時任務：穩定性增強版 ──
  async scheduled(event: ScheduledEvent, env: Env, execCtx: ExecutionContext) {
    // 查詢待處理或卡在發送中的任務 (限 3 條)
    const { results } = await env.vera_db.prepare(
      `SELECT * FROM pending_images WHERE status IN ('pending', 'sending') LIMIT 3`
    ).all();

    if (!results || results.length === 0) return;

    for (const row of (results as any[])) {
      try {
        console.log(`⏰ [Cron] 正在處理任務: ${row.prompt_id} (ID: ${row.id}, 狀態: ${row.status}, 話題: ${row.thread_id || '無'})`);

        // 1. 嘗試從 ComfyUI 抓取
        const image = await drawWithComfyUI(env, "", "", row.prompt_id); 

        if (image) {
          // 更新狀態為正在發送
          await env.vera_db.prepare(`UPDATE pending_images SET status = 'sending' WHERE id = ?`).bind(row.id).run();

          // 2. 發送到 Telegram 並獲取 file_id
          const fileId = await sendPhotoToTelegram(env.BOT_TOKEN, row.chat_id, image, "（畫好囉！這是你要的自拍照～♡）", row.thread_id);

          if (fileId) {
            // ... (存檔邏輯保持不變)
            const cgRes = await env.vera_db.prepare(
              `INSERT INTO cgs (category, file_id) VALUES ('selfie', ?) RETURNING id`
            ).bind(fileId).first() as any;

            if (cgRes && row.user_id) {
              const cgId = cgRes.id;
              const user = await env.vera_db.prepare(`SELECT unlocked_cgs FROM users WHERE user_id = ?`).bind(row.user_id).first() as any;
              let unlocked: number[] = [];
              if (user) {
                try { unlocked = JSON.parse(user.unlocked_cgs || '[]'); } catch { unlocked = []; }
                if (!unlocked.includes(cgId)) {
                  unlocked.push(cgId);
                  await env.vera_db.prepare(`UPDATE users SET unlocked_cgs = ? WHERE user_id = ?`).bind(JSON.stringify(unlocked), row.user_id).run();
                }
              }
            }
          }

          // 4. 標記完成
          await env.vera_db.prepare(`UPDATE pending_images SET status = 'completed' WHERE id = ?`).bind(row.id).run();
          console.log(`✅ [Cron] 任務 ${row.prompt_id} 已成功發送`);
        } else {
          // 檢查是否超時 (15 分鐘)
          // 修正 D1 時間解析：SQLite 預設格式 "YYYY-MM-DD HH:MM:SS" 在 JS 可能解析失敗，補上 T 和 Z
          const createdAtStr = row.created_at.includes("T") ? row.created_at : row.created_at.replace(" ", "T") + "Z";
          const createdTime = new Date(createdAtStr).getTime();
          const now = Date.now();
          const diffMin = (now - createdTime) / (1000 * 60);

          if (isNaN(createdTime) || diffMin > 15) {
            console.warn(`⏳ [Cron] 任務 ${row.prompt_id} 超時或無效 (${Math.round(diffMin)}min)，標記為失敗`);
            await env.vera_db.prepare(`UPDATE pending_images SET status = 'failed' WHERE id = ?`).bind(row.id).run();
          } else {
            console.log(`⏳ [Cron] 任務 ${row.prompt_id} 尚未就緒，等待中... (${Math.round(diffMin)}min)`);
          }
        }
      } catch (e: any) {
        console.error(`❌ [Cron] 處理失敗:`, e.message);

        // 🚨 重要：如果是因為話題關閉導致的失敗，且 thread_id 為空，直接標記為 failed 防止死循環
        if (e.message.includes("TOPIC_CLOSED") || e.message.includes("400")) {
           await env.vera_db.prepare(`UPDATE pending_images SET status = 'failed' WHERE id = ?`).bind(row.id).run();
        }

        await env.vera_db.prepare(
          `INSERT INTO error_logs (user_id, chat_id, error_type, message, details) VALUES (?, ?, ?, ?, ?)`
        ).bind("SYSTEM", row.chat_id, "CRON_SEND_FAIL", e.message, `PromptID: ${row.prompt_id} | Thread: ${row.thread_id}`).run();
      }
    }
  }

};