import { Bot, InputFile } from "grammy";
import type { Env } from "../shared/types";
import { callDeepSeek } from "../services/deepseek";
import { analyzeImageWithGemini } from "../services/gemini";
import { generateVoice } from "../services/voice";

export function registerMessageEvents(bot: Bot, env: Env, execCtx: ExecutionContext) {
  // ── 一般訊息 (文字 或 圖片) ──
  bot.on(["message:text", "message:photo"], async (ctx) => {
    if (!ctx.message) return;
    if (ctx.message.from?.is_bot) return;

    // ── 🛡️ [去重機制] 檢查 Message ID 防止多個 Bot Webhook 或 Timeout 導致的重複回覆 ──
    const chatIdStr = ctx.chat.id.toString();
    const msgId = ctx.message.message_id;
    try {
      await env.vera_db.prepare(`INSERT INTO processed_messages (chat_id, message_id) VALUES (?, ?)`).bind(chatIdStr, msgId).run();
    } catch (e) {
      console.warn(`[去重攔截] 偵測到重複的訊息: Chat ${chatIdStr}, Msg ${msgId}，已跳過處理。`);
      return;
    }

    const chatId = chatIdStr;
    const threadId = ctx.message.message_thread_id;

    try {
      const stopFlag: any = await env.vera_db.prepare(
        `SELECT affection FROM users WHERE user_id = ?`
      ).bind(`FLAG_STOP_${chatId}`).first();
      
      if (stopFlag?.affection === 1) {
        const userText = ctx.message.text || ctx.message.caption || "";
        if (userText.startsWith("/adminresume")) return;
        
        console.log(`[停止模式] 已忽略來自群組 ${chatId} 的訊息。`);
        return;
      }
    } catch (e) {
      console.error("檢查停止狀態出錯:", e);
    }

    let userMessage = (ctx.message.text || ctx.message.caption || "").trim();

    // 🛑 核心修復：如果訊息是以 / 開頭的指令，直接跳過 AI 處理，防止重複回應與 Timeout 重試
    if (userMessage.startsWith("/")) return;

    // 🛑 群組發言過濾機制（防止 Token 爆炸）
    if (ctx.chat.type !== "private") {
      const botUsername = ctx.me.username;
      const normalizedMsg = userMessage.toLowerCase();
      
      const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
      const isAtMentioned = botUsername && normalizedMsg.includes(`@${botUsername.toLowerCase()}`);
      const isNameCalled = normalizedMsg.includes("薇拉") || 
                           normalizedMsg.includes("薇菈") || 
                           normalizedMsg.includes("vera") ||
                           normalizedMsg.includes("引導人");

      if (!isReplyToBot && !isAtMentioned && !isNameCalled) {
        return;
      }
    }

    try {
      await ctx.replyWithChatAction("typing");
      const userId = ctx.from?.id.toString();
      if (!userId) return;
      const userName = ctx.from?.first_name || "客人";
      const userLogin = ctx.from?.username ? `@${ctx.from.username}` : undefined;

      // ── 獲取房間名稱 (優先從資料庫獲取) ──
      let roomName = (ctx.chat.type !== "private" && 'title' in ctx.chat) ? (ctx.chat as any).title : "私人對話";
      if (threadId) {
        const dbRoom: any = await env.vera_db.prepare(
          `SELECT room_name FROM rooms WHERE chat_id = ? AND thread_id = ?`
        ).bind(chatId, threadId).first();
        if (dbRoom?.room_name) {
          roomName = dbRoom.room_name;
        } else {
          roomName = `${roomName} (子房間 ID: ${threadId})`;
        }
      }
      
      // ── 檢測回覆內容 (Reply Context) ──
      const replyMsg = ctx.message.reply_to_message;
      if (replyMsg) {
        const repliedName = replyMsg.from?.first_name || "客人";
        
        let contentBrief = "";
        if (replyMsg.text) contentBrief = replyMsg.text;
        else if (replyMsg.caption) contentBrief = replyMsg.caption;
        else if (replyMsg.photo) contentBrief = "(圖片)";
        else if (replyMsg.sticker) contentBrief = "(貼圖)";
        else if (replyMsg.animation) contentBrief = "(GIF動圖)";
        else if (replyMsg.document) contentBrief = "(檔案)";
        else if (replyMsg.voice) contentBrief = "(語音)";
        else if (replyMsg.video) contentBrief = "(影片)";
        else contentBrief = "(其他內容)";

        if (contentBrief.length > 50) contentBrief = contentBrief.substring(0, 50) + "...";

        if (replyMsg.from?.id === ctx.me.id) {
            userMessage = `[回覆薇拉：「${contentBrief}」] ` + userMessage;
        } else {
            userMessage = `[對 ${repliedName} 回覆：「${contentBrief}」] ` + userMessage;
        }
      }

      // ── 圖像識別處理 ──
      const photoMsg = ctx.message.photo ? ctx.message : (ctx.message.reply_to_message?.photo ? ctx.message.reply_to_message : null);

      if (photoMsg && photoMsg.photo) {
        const photos = photoMsg.photo;
        const bestPhoto = photos[photos.length - 1];
        
        try {
          const file = await ctx.api.getFile(bestPhoto.file_id);
          const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
          
          const response = await fetch(fileUrl);
          if (!response.ok) {
            throw new Error(`Telegram 文件下載失敗: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          
          const description = await analyzeImageWithGemini(env, base64, "image/jpeg");
          
          const imagePrefix = photoMsg === ctx.message ? "發送" : "回覆";
          userMessage = `[客人${imagePrefix}了一張圖片，內容描述如下：${description}] ${userMessage}`;
        } catch (visionError) {
          console.error("Vision Processing Error:", visionError);
          userMessage = `[客人${photoMsg === ctx.message ? "發送" : "回覆"}了一張圖片，但系統識別失敗] ${userMessage}`;
        }
      }

      const { reply, image } = await callDeepSeek(env, execCtx, userId, userName, userMessage, chatId, roomName, threadId, userLogin);
      
      if (!reply && !image) {
        return; 
      }

      // ── 語音生成邏輯 ──
      let voiceData: Uint8Array | null = null;
      try {
        const voiceKeywords = ["發語音", "用語音", "語音", "說話", "說點什麼", "聲音", "配音"];
        const isVoiceRequested = voiceKeywords.some(kw => userMessage.includes(kw));
        const randomVoiceTrigger = Math.random() < 0.10;

        if (env.VOICE_API_URL && (isVoiceRequested || randomVoiceTrigger)) {
          const cleanReply = reply.replace(/\(.*?\)/g, '').replace(/（.*?）/g, '').trim();
          if (cleanReply) {
            voiceData = await generateVoice(env, cleanReply);
          }
        }
      } catch (voiceErr) {
        console.error("Voice Logic Error:", voiceErr);
      }

      // ── 發送回覆 ──
      const replyOptions: any = {
        reply_parameters: { message_id: ctx.message.message_id },
        message_thread_id: threadId
      };

      try {
        if (voiceData) {
          await ctx.replyWithVoice(new InputFile(voiceData), {
            caption: reply,
            ...replyOptions
          });
        } else if (image) {
          await ctx.replyWithPhoto(new InputFile(image), {
            caption: reply,
            ...replyOptions
          });
        } else {
          await ctx.reply(reply, replyOptions);
        }
      } catch (e: any) {
        console.error(`❌ [發送失敗]`, e.message);
        const fallbackOptions = { message_thread_id: threadId };
        if (voiceData) {
          await ctx.replyWithVoice(new InputFile(voiceData), { caption: reply, ...fallbackOptions });
        } else if (image) {
          await ctx.replyWithPhoto(new InputFile(image), { caption: reply, ...fallbackOptions });
        } else {
          await ctx.reply(reply, fallbackOptions);
        }
      }
    } catch (error) {
      console.error("DeepSeek API 錯誤:", error);
      await ctx.reply("（薇拉似乎在想事情時被打斷了，請再對她說一次吧。）", { message_thread_id: threadId }).catch(() => {});
    }
  });
}
