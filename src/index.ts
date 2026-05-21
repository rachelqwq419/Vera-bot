import { Bot, webhookCallback } from "grammy";
import type { Env } from "./types";
import { registerHandlers } from "./handlers";

export default {
  async fetch(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
    // ── Debug：記錄所有進入的請求 ──
    const requestId = crypto.randomUUID();
    console.log(`[${requestId}] 收到請求: ${request.method} ${request.url}`);

    // ── 健康檢查 endpoint ──
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const hasToken = !!env.BOT_TOKEN;
      const hasApiKey = !!env.DEEPSEEK_API_KEY;
      return new Response(JSON.stringify({
        status: "ok",
        bot_token_set: hasToken,
        deepseek_key_set: hasApiKey,
        bot_token_preview: hasToken ? `${env.BOT_TOKEN.substring(0, 6)}...${env.BOT_TOKEN.slice(-4)}` : "MISSING",
      }), { headers: { "Content-Type": "application/json" } });
    }

    const bot = new Bot(env.BOT_TOKEN);
    registerHandlers(bot, env, execCtx);

    try {
      const handleUpdate = webhookCallback(bot, "cloudflare-mod");
      return await handleUpdate(request);
    } catch (error) {
      console.error(`[${requestId}] Webhook 處理失敗:`, error);
      return new Response("Error processing update", { status: 500 });
    }
  },
};