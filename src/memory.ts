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
    WHERE m.chat_id = ?
    ORDER BY m.id DESC LIMIT 50
  `).bind(chatId).all();

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
2. Generate a unique "Past Interaction Snapshot" for this segment.

[Output Requirements]:
- Language: ENGLISH.
- Format: JSON.
{
  "global_summary": "Updated summary.",
  "segment_snapshot": "Brief description of this interaction.",
  "likes": ["Identified interests"],
  "dislikes": ["Identified aversions"]
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
    const segmentSnapshot = parsed.segment_snapshot;

    await env.vera_db.prepare(
      `UPDATE users SET
         conversation_summary = ?,
         unsummarized_count = 0,
         user_likes = ?,
         user_dislikes = ?
       WHERE user_id = ?`
    ).bind(newGlobalSummary, JSON.stringify(parsed.likes || []), JSON.stringify(parsed.dislikes || []), userId).run();

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
