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
      return new Response("Ciallo! 這裡是莎蘿的酒館，請不要亂闖喔～", { status: 200 });
    }

    // 🛑 機器人暫停中 (Maintenance Mode)
    // 為了安全地停止機器人但不報錯（避免 Telegram 移除 Webhook），這裡直接回傳 200 OK 攔截所有請求。
    // 當需要重新開啟時，只需將以下三行註解掉並重新部署即可。
    return new Response("OK", { status: 200 });

    /* 
    // === 下方為正常運作邏輯，暫時被上面的 return 攔截 ===
    const bot = new Bot(env.BOT_TOKEN);
    */
    /*
    registerHandlers(bot, env, execCtx);

    try {
      const handleUpdate = webhookCallback(bot, "cloudflare-mod", {
        timeoutMilliseconds: 60000, 
      });
      return await handleUpdate(request);
    } catch (error) {
      console.error("Webhook 處理失敗:", error);
      return new Response("Error", { status: 500 });
    }
    */
  },

  // ── 🆕 定時任務：穩定性增強版 ──
  async scheduled(event: ScheduledEvent, env: Env, execCtx: ExecutionContext) {
    // 查詢待處理或卡在發送中的任務 (限 3 條)
    const { results } = await env.ciallo_db.prepare(
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
          await env.ciallo_db.prepare(`UPDATE pending_images SET status = 'sending' WHERE id = ?`).bind(row.id).run();

          // 2. 發送到 Telegram 並獲取 file_id
          const fileId = await sendPhotoToTelegram(env.BOT_TOKEN, row.chat_id, image, "（畫好囉！這是你要的自拍照～♡）", row.thread_id);

          if (fileId) {
            // ... (存檔邏輯保持不變)
            const cgRes = await env.ciallo_db.prepare(
              `INSERT INTO cgs (category, file_id) VALUES ('selfie', ?) RETURNING id`
            ).bind(fileId).first() as any;

            if (cgRes && row.user_id) {
              const cgId = cgRes.id;
              const user = await env.ciallo_db.prepare(`SELECT unlocked_cgs FROM users WHERE user_id = ?`).bind(row.user_id).first() as any;
              let unlocked: number[] = [];
              if (user) {
                try { unlocked = JSON.parse(user.unlocked_cgs || '[]'); } catch { unlocked = []; }
                if (!unlocked.includes(cgId)) {
                  unlocked.push(cgId);
                  await env.ciallo_db.prepare(`UPDATE users SET unlocked_cgs = ? WHERE user_id = ?`).bind(JSON.stringify(unlocked), row.user_id).run();
                }
              }
            }
          }

          // 4. 標記完成
          await env.ciallo_db.prepare(`UPDATE pending_images SET status = 'completed' WHERE id = ?`).bind(row.id).run();
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
            await env.ciallo_db.prepare(`UPDATE pending_images SET status = 'failed' WHERE id = ?`).bind(row.id).run();
          } else {
            console.log(`⏳ [Cron] 任務 ${row.prompt_id} 尚未就緒，等待中... (${Math.round(diffMin)}min)`);
          }
        }
      } catch (e: any) {
        console.error(`❌ [Cron] 處理失敗:`, e.message);

        // 🚨 重要：如果是因為話題關閉導致的失敗，且 thread_id 為空，直接標記為 failed 防止死循環
        if (e.message.includes("TOPIC_CLOSED") || e.message.includes("400")) {
           await env.ciallo_db.prepare(`UPDATE pending_images SET status = 'failed' WHERE id = ?`).bind(row.id).run();
        }

        await env.ciallo_db.prepare(
          `INSERT INTO error_logs (user_id, chat_id, error_type, message, details) VALUES (?, ?, ?, ?, ?)`
        ).bind("SYSTEM", row.chat_id, "CRON_SEND_FAIL", e.message, `PromptID: ${row.prompt_id} | Thread: ${row.thread_id}`).run();
      }
    }
  }

};