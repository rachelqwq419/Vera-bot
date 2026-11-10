import type { Env } from "../shared/types";
import { fetchWithFallback } from "../services/deepseek";

/**
 * 記憶歸檔系統 (薇拉版)
 */
export async function summarizeMemory(
  env: Env,
  userId: string,
  userName: string,
  currentSummary: string,
  chatId: string,
) {
  const { results: recentMsgs } = await env.vera_db.prepare(`
    SELECT m.role, m.content, u.first_name, u.username, u.user_notes
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.user_id
    WHERE m.chat_id = ? AND m.user_id = ?
    ORDER BY m.id DESC LIMIT 50
  `).bind(chatId, userId).all();

  if (!recentMsgs || recentMsgs.length === 0) return;

  const historyText = (recentMsgs as any[]).reverse()
    .map(m => {
      let name = m.first_name || "未知對象";
      try {
        const notes = JSON.parse(m.user_notes || '{}');
        if (notes["稱呼"]) name = notes["稱呼"];
      } catch {}

      if (m.role === 'user') {
        return `${name}: ${m.content.replace(/^\[.*?\]\s*/, '')}`;
      } else {
        const match = m.content.match(/^\(薇拉對\s*(.*?)\s*的回覆\)\s*/);
        const targetName = match ? match[1] : "對象";
        const cleanContent = m.content.replace(/^\(薇拉對.*?的回覆\)\s*/, '');
        return `薇拉 (對 ${targetName} 回覆): ${cleanContent}`;
      }
    })
    .join('\n');

  const summaryPrompt = `
妳是薇拉(Vera)的心跳回憶錄系統。請幫薇拉整理她與朋友們的相處點滴。

[目前的記憶摘要]:
${currentSummary || '(目前還沒有相關紀錄喔)'}

[最近的對話內容]:
${historyText}

[任務]:
1. 更新長期記憶。將新的發現（例如對方的興趣、重要的事情）融入摘要中。
2. 感受這段時間薇拉與對方的互動氣氛。
3. 為這段互動寫下一個簡短的「心情快照」。
4. 觀察對方的習慣，給他一個可愛的「小標籤」或「頭銜」（例如：「深夜話癆」、「貓咪狂熱者」、「溫柔的傾聽者」）。

[輸出要求]:
- 格式：JSON。
- **global_summary**: 薇拉內心的詳細筆記（繁體中文），記錄對方的性格與重要細節。
- **chinese_summary**: 一段**非常精簡**（1-3 句話）的溫馨話語，這是給對方看的。語氣要像薇拉溫柔的真心話。
- **new_title**: 可選的小標籤。

{
  "global_summary": "對方很喜歡分享日常，特別是...",
  "chinese_summary": "最近能和你聊這麼多，薇拉覺得心裡暖暖的，也更了解你了喔。",
  "likes": [],
  "dislikes": [],
  "new_title": ""
}
`;

try {
    const data = await fetchWithFallback(env, {
      model: "deepseek-v4-pro", 
      messages: [{ role: "system", content: summaryPrompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    if (!data?.choices?.[0]?.message?.content) return;

    const parsed = JSON.parse(data.choices[0].message.content.trim());
    const newGlobalSummary = parsed.global_summary || currentSummary;
    const chineseSummary = parsed.chinese_summary || "";
    const segmentSnapshot = parsed.segment_snapshot;
    const newTitle = parsed.new_title;

    let titlesUpdate = "";
    let binds: any[] = [newGlobalSummary, chineseSummary, JSON.stringify(parsed.likes || []), JSON.stringify(parsed.dislikes || []), userId];

    if (newTitle && newTitle.trim() !== "") {
      const user = await env.vera_db.prepare(`SELECT titles FROM users WHERE user_id = ?`).bind(userId).first() as any;
      let currentTitles: string[] = [];
      try { currentTitles = JSON.parse(user?.titles || '[]'); } catch {}
      if (!currentTitles.includes(newTitle)) {
        currentTitles.push(newTitle);
        if (currentTitles.length > 5) currentTitles = currentTitles.slice(-5);
        titlesUpdate = ", titles = ?";
        binds = [newGlobalSummary, chineseSummary, JSON.stringify(parsed.likes || []), JSON.stringify(parsed.dislikes || []), JSON.stringify(currentTitles), userId];
      }
    }

    await env.vera_db.prepare(
      `UPDATE users SET
         conversation_summary = ?,
         chinese_summary = ?,
         unsummarized_count = 0,
         user_likes = ?,
         user_dislikes = ?${titlesUpdate}
       WHERE user_id = ?`
    ).bind(...binds).run();

    if (segmentSnapshot) {
      await storeVectorMemory(env, userId, `[Archive Record] ${segmentSnapshot}`);
    }
    console.log(`✅ 已歸檔對象 ${userName} 的數據紀錄。`);
  } catch (e) {
    console.error("歸檔失敗:", e);
  }
}

export async function storeVectorMemory(env: Env, userId: string, text: string) {
  if (!env.VECTOR_INDEX || !env.AI) return;
  const embeddingResponse = await env.AI.run("@cf/baai/bge-m3", { text: [text] });
  const vector = embeddingResponse.data[0];
  const id = crypto.randomUUID();
  await env.vera_db.prepare(`INSERT INTO vector_memories (id, user_id, content) VALUES (?, ?, ?)`).bind(id, userId, text).run();
  await env.VECTOR_INDEX.upsert([{ id: id, values: vector, metadata: { user_id: userId } }]);
}

export async function retrieveVectorMemories(env: Env, userId: string, query: string): Promise<string[]> {
  if (!env.VECTOR_INDEX || !env.AI) return [];
  try {
    const embeddingResponse = await env.AI.run("@cf/baai/bge-m3", { text: [query] });
    const matches = await env.VECTOR_INDEX.query(embeddingResponse.data[0], { topK: 3, filter: { user_id: userId } });
    const ids = matches.matches.filter((m: any) => m.score > 0.6).map((m: any) => m.id);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await env.vera_db.prepare(`SELECT content FROM vector_memories WHERE id IN (${placeholders})`).bind(...ids).all();
    return (results as any[]).map(r => r.content);
  } catch { return []; }
}
