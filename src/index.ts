import { Bot, webhookCallback } from "grammy";
import type { Env } from "./types";
import { registerHandlers } from "./handlers";

export default {
  async fetch(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
    const bot = new Bot(env.BOT_TOKEN);
    registerHandlers(bot, env, execCtx);

    try {
      const handleUpdate = webhookCallback(bot, "cloudflare-mod");
      return await handleUpdate(request);
    } catch (error) {
      console.error("Webhook 處理失敗:", error);
      return new Response("Error processing update", { status: 500 });
    }
  },
};
