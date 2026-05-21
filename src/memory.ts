import type { Env } from "./types";

export async function summarizeMemory(env: Env, userId: string, userName: string, currentSummary: string, historyText: string) {
  const summaryPrompt = `
  你是一個無情的後台數據總結程式，絕對不能扮演莎蘿。
  請根據以下【近期對話紀錄】，更新客人「${userName}」的【長期記憶總結】，並提取他的【喜好】與【厭惡】。

  【目前總結】：${currentSummary || '無'}
  【近期對話】：
  ${historyText}

  【輸出格式】（嚴格遵守，用 JSON 輸出，不要其他文字）：
  {
    "summary": "總結文字（100字以內，第三人稱描述喜好、關係進展或特殊事件）",
    "likes": ["喜歡的事物1", "喜歡的事物2", "..."],
    "dislikes": ["討厭的事物1", "討厭的事物2", "..."]
  }

  【輸出要求】：
  - 必須以第三人稱客觀描述
  - 嚴禁輸出任何對話原話或第一人稱視角
  - likes/dislikes 若無則為空陣列
  `;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: summaryPrompt }],
        temperature: 0.1,
      }),
    });
    const data = await response.json() as any;
    if (!data?.choices?.[0]?.message?.content) {
      console.warn("記憶總結 API 回傳空內容，跳過", data);
      return;
    }
    const raw = data.choices[0].message.content.trim();

    // 嘗試解析 JSON
    let newSummary = currentSummary;
    let likes: string[] = [];
    let dislikes: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      newSummary = parsed.summary || currentSummary;
      likes = parsed.likes || [];
      dislikes = parsed.dislikes || [];
    } catch {
      // 若回傳的不是 JSON，視為純文字總結
      newSummary = raw;
    }

    await env.ciallo_db.prepare(
      `UPDATE users SET conversation_summary = ?, unsummarized_count = 0,
       user_likes = ?, user_dislikes = ? WHERE user_id = ?`
    ).bind(newSummary, JSON.stringify(likes), JSON.stringify(dislikes), userId).run();
    console.log(`已成功總結 ${userName} 的記憶:`, newSummary);
  } catch (e) { console.error("記憶總結失敗:", e); }
}
