import { Context, NextFunction } from "grammy";

export function createAutoDeleteMiddleware(execCtx: ExecutionContext) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const text = ctx.message?.text;
    
    // 1. 確認是指令，且排除不需要自動刪除的指令
    if (text && text.startsWith("/")) {
      // 豁免清單：不執行自動刪除，也不顯示刪除提示
      if (
        text.startsWith("/vera") ||
        text.startsWith("/cg") || 
        text.startsWith("/deletecg") || 
        text.startsWith("/group_impression") || 
        text.startsWith("/gi") ||
        text.startsWith("/info")
      ) {
        return next();
      }

      const originalReply = ctx.reply.bind(ctx);
      
      // 2. 覆寫 ctx.reply
      ctx.reply = async (msgText: string, ...rest: any[]) => {
        const textWithNotice = msgText + "\n\n(✨ 為了保持環境整潔，這條訊息 20 秒後會自動消失喔)";
        const sentMsg = await originalReply(textWithNotice, ...rest);
        
        // 3. 執行倒數刪除
        execCtx.waitUntil((async () => {
          await new Promise(resolve => setTimeout(resolve, 20000));
          try {
            if (ctx.chat?.id && sentMsg.message_id) await ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id);
          } catch (e) { console.log("無法刪除 AI 回覆"); }
          try {
            if (ctx.chat?.id && ctx.message?.message_id) await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
          } catch (e) { console.log("無法刪除指令"); }
        })());
        
        return sentMsg;
      };
    }
    return next();
  };
}
