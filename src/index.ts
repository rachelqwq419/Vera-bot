import { Bot, webhookCallback } from "grammy";
import type { Env } from "./types";
import { registerHandlers } from "./handlers";

// 喺 index.ts 入面

export default {
  async fetch(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. 保留原本嘅健康檢查
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } });
    }

    // 2. 🔥 新增呢度：只有 POST 請求先畀 webhookCallback 處理
    if (request.method !== "POST") {
      return new Response("Ciallo! 這裡是莎蘿的酒館，請不要亂闖喔～", { status: 200 });
    }

    const bot = new Bot(env.BOT_TOKEN);
    registerHandlers(bot, env, execCtx);

    try {
      const handleUpdate = webhookCallback(bot, "cloudflare-mod");
      return await handleUpdate(request);
    } catch (error) {
      console.error("Webhook 處理失敗:", error);
      return new Response("Error", { status: 500 });
    }
  },
};