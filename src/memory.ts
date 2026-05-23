import type { Env } from "./types";
import { fetchWithFallback } from "./deepseek";

/**
 * 記憶總結函式
 * - chat_id: 用於群組級歷史擷取（多人對話脈絡）
 * - userId: 用於寫入該用戶的 conversation_summary
 * - currentSummary: 舊的長期記憶，新總結必須合併而非丟棄
 */
export async function summarizeMemory(
  env: Env,
  userId: string,
  userName: string,
  currentSummary: string,
  chatId: string,
) {
  // 從群組共用記憶池擷取最近對話（涵蓋所有參與者，提供完整脈絡）
  const { results: recentMsgs } = await env.ciallo_db.prepare(
    `SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 25`
  ).bind(chatId).all();

  if (!recentMsgs || recentMsgs.length === 0) {
    console.log(`記憶總結跳過: ${userName} — 無最近訊息`);
    return;
  }

  const historyText = (recentMsgs as any[]).reverse()
    .map(m => `${m.role === 'user' ? '客人' : '莎蘿'}: ${m.content}`)
    .join('\n');

  const summaryPrompt = `
你是一個無情的後台數據總結程式，絕對不能扮演莎蘿。
請根據以下資料，更新客人「${userName}」的【長期記憶總結】。

【目前長期記憶總結（必須保留其中仍然重要的資訊）】：
${currentSummary || '（尚無記憶）'}

【近期群組對話紀錄】（包含多位客人與莎蘿的互動，僅提取與 ${userName} 相關的部分）：
${historyText}

【輸出格式】（嚴格遵守，用 JSON 輸出，不要其他任何文字）：
{
  "summary": "總結文字（100字以內，第三人稱客觀描述。必須合併「目前長期記憶」與「近期對話」中關於此客人的新進展。舊記憶中仍然有效的資訊（喜好、關係里程碑、特殊事件）必須保留，只新增或更新近期變化。）",
  "likes": ["喜歡的事物1", "不重複列出", "合併新舊"],
  "dislikes": ["討厭的事物1", "不重複列出", "合併新舊"]
}

【輸出要求】：
- 必須以第三人稱客觀描述
- 嚴禁輸出任何對話原話或第一人稱視角
- 合併新舊記憶 — 新的喜好/厭惡加入，舊的保留不要丟
- likes/dislikes 必須去重，不要重複列出相同項目
- 若無則為空陣列 []
`;

try {
    // 改用有 Fallback 嘅函數
    const data = await fetchWithFallback(env, {
      model: "deepseek-v4-pro", 
      messages: [{ role: "system", content: summaryPrompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    if (data.error) {
      console.warn("記憶總結 API 錯誤:", data.error.message);
      return;
    }
    if (!data?.choices?.[0]?.message?.content) {
      console.warn("記憶總結 API 回傳空內容，跳過");
      return;
    }

    const raw = data.choices[0].message.content.trim();

    let newSummary = currentSummary; // 預設保留舊記憶，避免 JSON 解析失敗時全部丟失
    let likes: string[] = [];
    let dislikes: string[] = [];

    try {
      const parsed = JSON.parse(raw);
      newSummary = parsed.summary || currentSummary;
      likes = parsed.likes || [];
      dislikes = parsed.dislikes || [];
    } catch {
      // JSON 解析失敗時保留舊記憶，不覆蓋
      console.warn(`記憶總結 JSON 解析失敗，保留舊記憶。原始內容: ${raw.substring(0, 200)}`);
      await env.ciallo_db.prepare(
        `UPDATE users SET unsummarized_count = 0 WHERE user_id = ?`
      ).bind(userId).run();
      return;
    }

    await env.ciallo_db.prepare(
      `UPDATE users SET
         conversation_summary = ?,
         unsummarized_count = 0,
         user_likes = ?,
         user_dislikes = ?
       WHERE user_id = ?`
    ).bind(newSummary, JSON.stringify(likes), JSON.stringify(dislikes), userId).run();

    console.log(`已成功總結 ${userName} 的記憶: ${newSummary}`);
  } catch (e) {
    console.error("記憶總結失敗:", e);
  }
}
