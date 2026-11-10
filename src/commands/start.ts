import { Bot } from "grammy";
import type { Env } from "../shared/types";

export function registerStartCommands(bot: Bot, env: Env) {
  bot.command("start", (ctx) =>
    ctx.reply("vera～ 歡迎來到紫羅蘭酒館！我是薇拉，很高興能見到你，希望這裡能讓你感到放鬆與開心喔～")
  );

  bot.command("vera", (ctx) =>
    ctx.reply(
      "我是薇拉(Vera)，你的專屬夥伴。 ♡\n\n" +
      "🌸 薇拉可以幫你做這些事：\n" +
      "/start — 重啟酒館服務\n" +
      "/vera — 顯示這些小提醒\n" +
      "/fortune — 看看今天的戀愛運勢（占卜）\n" +
      "/gi — 讓我幫大家寫一段溫馨的群組觀察報告\n" +
      "/cg — 打開我們專屬的視覺圖鑑\n"
    )
  );
}
