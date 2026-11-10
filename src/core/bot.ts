import { Bot } from "grammy";
import type { Env } from "../shared/types";

import { authMiddleware } from "../middlewares/auth";
import { createAutoDeleteMiddleware } from "../middlewares/autoDelete";

import { registerAllCommands } from "../commands";
import { registerAllEvents } from "../events";

export function registerHandlers(bot: Bot, env: Env, execCtx: ExecutionContext): void {
  // ── 1. 註冊全域 Middlewares ──
  bot.use(authMiddleware);
  bot.use(createAutoDeleteMiddleware(execCtx));

  // ── 2. 註冊所有指令 (Commands) ──
  registerAllCommands(bot, env);

  // ── 3. 註冊所有事件 (Events, 包含主要對話邏輯) ──
  registerAllEvents(bot, env, execCtx);

  // ── 4. 全域錯誤攔截器 ──
  bot.catch((err) => {
    const e = err.error as any;
    if (e.description && e.description.includes("bot was kicked")) {
      console.log(`[安全攔截] 薇拉已被踢出群組或沒有權限發言，已忽略此錯誤。`);
    } else {
      console.error("Grammy 運行時錯誤:", e);
    }
  });
}
