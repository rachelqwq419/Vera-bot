import type { Env } from "./types";
import { fetchWithFallback } from "./deepseek";

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
You are a high-level data archival AI for the "Vera" researcher bot. Process the recent conversation and update the subject's profile.

[Current Profile Summary]:
${currentSummary || '(No prior data recorded)'}

[Recent Data Stream]:
${historyText}

[Task]:
1. Update the long-term summary. Merge new critical findings into the profile.
2. Analyze the quality of the relationship between Vera and the guest.
3. Generate a unique "Past Interaction Snapshot" for this segment.
4. Observe the guest's behavior and optionally generate a short, creative "Tag" or "Title" (e.g., "深夜話癆", "貓咪狂熱者", "數據干擾源") that summarizes their recent conversational habit.

[Output Requirements]:
- Format: JSON.
- **global_summary**: Detailed English clinical log (3-5 bullet points) for Vera's internal logic.
- **chinese_summary**: A VERY CONCISE (1-3 sentences) summary in **TRADITIONAL CHINESE** for the guest to see. It should sound like Vera's direct, slightly blunt observation.
- **new_title**: Optional Traditional Chinese tag.

{
  "global_summary": "- Pattern: ...\n- Knowledge: ...",
  "chinese_summary": "妳這幾次的發言數據偏差很大，我懷疑妳的大腦模組需要重置。",
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
