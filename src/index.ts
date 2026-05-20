import { Bot, webhookCallback } from "grammy";

export interface Env {
  BOT_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 必須要在這裡初始化 bot，並且將 token 傳入去
    const bot = new Bot(env.BOT_TOKEN);

    // 處理邏輯
    bot.command("start", (ctx) => ctx.reply("Ciallo! 隨時在這裡。"));
    bot.on("message:text", (ctx) => {
        if (ctx.message.text === "你好") {
            ctx.reply("Ciallo!");
        } else {
            ctx.reply("我收到您說：" + ctx.message.text);
        }
    });

    // 關鍵修正：將 bot 實例傳入 webhookCallback
    const handleUpdate = webhookCallback(bot, "cloudflare-mod");
    return await handleUpdate(request);
  },
};