import { Context, NextFunction } from "grammy";
import { ADMIN_USER_ID, MARU_USER_ID, LALA_USER_ID, KANON_USER_ID } from "../shared/constants";

export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  if (ctx.chat?.type === "private") {
    const fromId = ctx.from?.id.toString();
    if (fromId === ADMIN_USER_ID || fromId === MARU_USER_ID || fromId === LALA_USER_ID || fromId === KANON_USER_ID) return next();
    
    // 允許 callback_query (InlineKeyboard 按鈕) 通過
    if (ctx.callbackQuery) return next();
    
    // 允許 /cg 圖鑑指令通過
    const msgText = ctx.message?.text || ctx.message?.caption || '';
    if (msgText.startsWith('/cg')) return next();
    
    await ctx.reply("vera～ 薇拉目前只在「紫羅蘭酒館」服務喔！雖然很想見你，但我們還是在酒館裡聊吧～");
    return;
  }
  return next();
}
