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
  // 並聯表查詢發言者的名稱與稱呼，確保總結時人名精準
  const { results: recentMsgs } = await env.ciallo_db.prepare(`
    SELECT m.role, m.content, u.first_name, u.username, u.user_notes
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.user_id
    WHERE m.chat_id = ?
    ORDER BY m.id DESC LIMIT 50
  `).bind(chatId).all();

  if (!recentMsgs || recentMsgs.length === 0) {
    console.log(`記憶總結跳過: ${userName} — 無最近訊息`);
    return;
  }

  const historyText = (recentMsgs as any[]).reverse()
    .map(m => {
      let name = m.first_name || "未知客人";
      const login = m.username ? `(${m.username})` : "";
      try {
        const notes = JSON.parse(m.user_notes || '{}');
        if (notes["稱呼"]) name = notes["稱呼"];
      } catch {}

      if (m.role === 'user') {
        return `${name}${login}: ${m.content.replace(/^\[.*?\]\s*/, '')}`;
      } else {
        const match = m.content.match(/^\(莎蘿對\s*(.*?)\s*的回覆\)\s*/);
        const targetName = match ? match[1] : "客人";
        const cleanContent = m.content.replace(/^\(莎蘿對.*?的回覆\)\s*/, '');
        return `莎蘿 (對 ${targetName} 回覆): ${cleanContent}`;
      }
    })
    .join('\n');

  const summaryPrompt = `
You are a back-end data archival system. Your goal is to process the recent conversation and update the user's memory records.

[Current Cumulative Summary (Global State)]:
${currentSummary || '(No previous memory)'}

[Recent Conversation Segment (Last 10-15 messages)]:
${historyText}

[Task]:
1. **Global Summary**: Update the cumulative long-term summary. Merge new critical facts (relationships, milestones, core changes) into the old summary. Keep it concise.
2. **Segment Snapshot**: Create a brief, unique description of *only* what happened in the [Recent Conversation Segment]. Do not include old facts. Focus on the specific events, mood, or topics discussed in this chunk.

[Output Requirements]:
- Language: **ENGLISH** only.
- Format: JSON.
{
  "global_summary": "Updated cumulative memory (max 300 words).",
  "segment_snapshot": "A unique snapshot of this specific 10-message interaction (e.g., 'The user discussed X and felt Y during the evening at the tavern.')",
  "likes": ["New or confirmed likes"],
  "dislikes": ["New or confirmed dislikes"]
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

    const raw = data.choices[0].message.content.trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch { return; }

    const newGlobalSummary = parsed.global_summary || currentSummary;
    const segmentSnapshot = parsed.segment_snapshot;
    const likes = parsed.likes || [];
    const dislikes = parsed.dislikes || [];

    // 1. 更新 D1 核心狀態
    await env.ciallo_db.prepare(
      `UPDATE users SET
         conversation_summary = ?,
         unsummarized_count = 0,
         user_likes = ?,
         user_dislikes = ?
       WHERE user_id = ?`
    ).bind(newGlobalSummary, JSON.stringify(likes), JSON.stringify(dislikes), userId).run();

    // 2. 存入向量資料庫 (僅存入本次片段的獨特 Snapshot，避免重複)
    if (segmentSnapshot) {
      try {
        await storeVectorMemory(env, userId, `[Past Event Snapshot] ${segmentSnapshot}`);
      } catch (ve) {
        console.error("向量記憶存儲失敗:", ve);
      }
    }

    console.log(`✅ 已完成 ${userName} 的記憶歸檔。Snapshot: ${segmentSnapshot?.substring(0, 50)}...`);
  } catch (e) {
    console.error("記憶總結失敗:", e);
  }
}

/**
 * 將文字轉化為向量並存入 Vectorize
 */
export async function storeVectorMemory(env: Env, userId: string, text: string) {
  if (!env.VECTOR_INDEX || !env.AI) return;

  // 1. 生成向量 (使用 bge-m3, 1024 dims)
  const embeddingResponse = await env.AI.run("@cf/baai/bge-m3", {
    text: [text],
  });
  const vector = embeddingResponse.data[0];

  // 2. 生成唯一 ID
  const id = crypto.randomUUID();

  // 3. 存入 D1 (存儲原始文字)
  await env.ciallo_db.prepare(
    `INSERT INTO vector_memories (id, user_id, content) VALUES (?, ?, ?)`
  ).bind(id, userId, text).run();

  // 4. 存入 Vectorize
  await env.VECTOR_INDEX.upsert([
    {
      id: id,
      values: vector,
      metadata: { user_id: userId },
    },
  ]);

  console.log(`📍 [Vectorize] 已存入新的語義記憶 (#${id.substring(0, 8)})`);
}

/**
 * 根據當前訊息檢索相關記憶
 */
export async function retrieveVectorMemories(env: Env, userId: string, query: string): Promise<string[]> {
  if (!env.VECTOR_INDEX || !env.AI) return [];

  try {
    // 1. 將查詢轉化為向量
    const embeddingResponse = await env.AI.run("@cf/baai/bge-m3", {
      text: [query],
    });
    const vector = embeddingResponse.data[0];

    // 2. 檢索最相似的 3 條記憶 (過濾該用戶)
    const matches = await env.VECTOR_INDEX.query(vector, {
      topK: 3,
      filter: { user_id: userId },
    });

    if (matches.matches.length === 0) return [];

    // 3. 從 D1 抓取對應文字 (過濾分數 > 0.6 的記憶)
    const ids = matches.matches
      .filter((m: any) => m.score > 0.6)
      .map((m: any) => m.id);

    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    const { results } = await env.ciallo_db.prepare(
      `SELECT content FROM vector_memories WHERE id IN (${placeholders})`
    ).bind(...ids).all();

    return (results as any[]).map(r => r.content);
  } catch (e) {
    console.error("向量檢索失敗:", e);
    return [];
  }
}
