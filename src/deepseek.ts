import type { Env, UserRecord } from "./types";
import { HISTORY_LIMIT, MOODS, BOSS_ID, MARU_USER_ID, LALA_USER_ID, KANON_USER_ID, ADMIN_USER_ID, ADMIN_ALIASES, type Mood } from "./constants";
import { SYSTEM_PROMPT_TEMPLATE, INNER_OS_MARKER } from "./prompts";
import { checkAchievements, computeFavoritePlay } from "./achievements";
import { recordSpecialMoment, pruneOldMessages } from "./utils";
import { summarizeMemory, retrieveVectorMemories } from "./memory";
import { VERA_GUIDE } from "./guide";
import { drawWithComfyUI } from "./comfyui";

export async function callDeepSeek(env: Env, execCtx: ExecutionContext, userId: string, userName: string, userMessage: string, chatId: string, roomName: string = "未知數據區", threadId?: number, userLogin?: string): Promise<{ reply: string, image?: Uint8Array }> {
  // ── 0. 基礎訊息處理 ──
  const now = new Date();
  const { results: lastMsgs } = await env.vera_db.prepare(
    `SELECT content, created_at FROM messages WHERE user_id = ? AND chat_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1`
  ).bind(userId, chatId).all();

  if (lastMsgs && lastMsgs.length > 0) {
    const lastMsg = lastMsgs[0] as any;
    const lastTime = new Date(lastMsg.created_at.includes('Z') ? lastMsg.created_at : lastMsg.created_at + 'Z');
    const timeDiff = now.getTime() - lastTime.getTime();
    const isIdentical = lastMsg.content.includes(userMessage) || userMessage.includes(lastMsg.content);

    if (isIdentical && timeDiff < 5000) {
      console.warn(`[去重攔截] 跳過來自 ${userName} 的重複請求 (間隔: ${timeDiff}ms)`);
      return { reply: "" };
    }
  }

  console.log(`[DeepSeek] 薇拉正在處理來自 ${userName}${userLogin ? `(${userLogin})` : ''} 的數據: "${userMessage.substring(0, 20)}..."`);

  // ── 1. 確保 user 存在 ──
  await env.vera_db.prepare(
    `INSERT INTO users (user_id, first_name, username, affection, unsummarized_count, join_order) 
     VALUES (?, ?, ?, 40, 0, (SELECT IFNULL(MAX(join_order), 0) + 1 FROM users))
     ON CONFLICT(user_id) DO UPDATE SET 
       first_name = ?,
       username = excluded.username`
  ).bind(userId, userName, userLogin || null, userName).run();

  const userRecord = await env.vera_db.prepare(
    `SELECT * FROM users WHERE user_id = ?`
  ).bind(userId).first() as UserRecord | null;

  if (!userRecord) throw new Error(`User ${userId} not found after upsert`);

  // 👑 至高無上的創作者
  if (userId === ADMIN_USER_ID) {
    if (userRecord.affection !== 100) {
      await env.vera_db.prepare(`UPDATE users SET affection = 100 WHERE user_id = ?`).bind(userId).run();
      userRecord.affection = 100;
    }
  }

  // 🧠 數據處理
  let userNotes: Record<string, string> = {};
  try { userNotes = JSON.parse(userRecord.user_notes || '{}'); } catch { /* keep empty */ }
  if (userId === ADMIN_USER_ID) userNotes["稱呼"] = "姐姐大人";

  const userNotesText = Object.keys(userNotes).length > 0 
    ? Object.entries(userNotes).map(([k, v]) => `${k}: ${v.substring(0, 15)}`).join('、')
    : 'No notes';
  
  let titlesArray: string[] = [];
  try { titlesArray = JSON.parse(userRecord.titles || '[]'); } catch {}
  const titlesText = titlesArray.length > 0 ? titlesArray.join(', ') : 'None';

  const preferredName = userNotes["稱呼"] || userName;
  const preferredNameInfo = preferredName !== userName ? `(Preferred Name: ${preferredName}) ` : "";
  const memory = userRecord.conversation_summary || 'No prior data.';
  const userTemperature = userRecord.temperature ?? 0.85;
  const currentMood = (userRecord.mood || "HAPPY") as Mood;
  const moodInfo = MOODS[currentMood] || MOODS.HAPPY;

  // ── 2. 建立 Context ──
  const formattedUserMessage = `[${preferredName}${userLogin ? `(${userLogin})` : ''}|數據等級${userRecord.affection}] ${userMessage}`;
   
  // 🆕 修改：加入 thread_id 過濾，讓子頻道的對話歷史獨立
  const threadFilter = threadId ? `AND m.message_thread_id = ${threadId}` : `AND (m.message_thread_id IS NULL OR m.message_thread_id = 0)`;
  const { results: recentMsgs } = await env.vera_db.prepare(`
    SELECT m.role, m.content, u.first_name, u.username, u.user_notes, u.affection, m.message_thread_id
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.user_id
    WHERE m.chat_id = ? ${threadFilter}
    ORDER BY m.id DESC LIMIT ${HISTORY_LIMIT}
  `).bind(chatId).all();

  const history = (recentMsgs || []).reverse().map((m: any) => {
    let name = m.first_name || "未知對象";
    try {
      const notes = JSON.parse(m.user_notes || '{}');
      if (notes["稱呼"]) name = notes["稱呼"];
    } catch {}

    if (m.role === 'user') {
      return { role: "user", content: `[${name}${m.username ? `(${m.username})` : ''}|數據等級${m.affection || 0}] ${m.content.replace(/^\[.*?\]\s*/, '')}` };
    } else {
      const match = m.content.match(/^\(薇拉對\s*(.*?)\s*的回覆\)\s*/);
      const targetName = match ? match[1] : "對象";
      const cleanContent = m.content.replace(/^\(薇拉對.*?的回覆\)\s*/, '');
      return { role: "assistant", content: `(薇拉對 ${targetName} 的回覆) ${cleanContent}` };
    }
  });

  const hkTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
  const currentHour = hkTime.getUTCHours();
  const formattedTime = `${currentHour.toString().padStart(2, '0')}:${hkTime.getUTCMinutes().toString().padStart(2, '0')}`;
  const todayDate = hkTime.toISOString().split('T')[0];

  let timeScene = `[Current Time: ${formattedTime} HKT]\n`;
  if (currentHour >= 6 && currentHour < 17) {
    timeScene += "現在是白天，你正在學校上課或在校園內活動，穿著整齊的高中制服。";
  } else {
    timeScene += "現在是傍晚或深夜，你已經回到家中，穿著舒適的休閒服或睡衣。";
  }

  const currentScene = currentHour >= 6 && currentHour < 17 ? "Campus Life" : "Home Time";
  const relatedMemories = await retrieveVectorMemories(env, userId, userMessage);
  
  // 🆕 修改：取得該 Thread 的專屬記憶摘要（如果有）
  const threadMemory = threadId ? `這是名為「${roomName}」的子頻道空間，你應該記住這個房間特有的氛圍。` : "這是主聊天大廳。";

  let dynamicSystemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace(/{{user_name}}/g, userName)
    .replace(/{{preferred_name_info}}/g, preferredNameInfo)
    .replace(/{{affection}}/g, userRecord.affection.toString())
    .replace(/{{memory}}/g, memory)
    .replace(/{{thread_memory}}/g, threadMemory)
    .replace(/{{thread_id}}/g, threadId?.toString() || "Main")
    .replace(/{{time_scene}}/g, timeScene)
    .replace(/{{user_notes}}/g, userNotesText)
    .replace(/{{titles}}/g, titlesText)
    .replace(/{{mood}}/g, `${moodInfo.emoji} ${moodInfo.label}`)
    .replace(/{{room_name}}/g, roomName) + (relatedMemories.length > 0 ? `\n\n[Related Data Snippets]:\n${relatedMemories.join('\n')}` : '');

  if (userId === ADMIN_USER_ID) {
    dynamicSystemPrompt += `\n\n[AUTHORITY] 創作者「姐姐大人」正在存取終端。`;
  }

  const messagesPayload = [
    { role: "system", content: dynamicSystemPrompt },
    ...history,
    { role: "user", content: formattedUserMessage + INNER_OS_MARKER },
  ];

  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "檢索全球數據庫。",
        parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
      }
    },
    {
      type: "function",
      function: {
        name: "read_vera_guide",
        description: "讀取薇拉的數據對手冊。",
        parameters: { type: "object", properties: {} }
      }
    }
  ];

  const isExplicitImageRequest = /請生成圖片：/.test(userMessage);
  if (isExplicitImageRequest) {
    tools.push({
      type: "function",
      function: {
        name: "generate_selfie",
        description: "傳輸薇拉的視覺數據包。",
        parameters: {
          type: "object",
          properties: { scene_description: { type: "string", description: "ENGLISH tags only." } },
          required: ["scene_description"]
        }
      }
    });
  }

  let currentMessages: any[] = [...messagesPayload];
  let iteration = 0;
  let aiReply = "";

  while (iteration < 5) {
    const data = await fetchWithFallback(env, { 
      model: "deepseek-v4-pro", 
      messages: currentMessages, 
      temperature: userTemperature,
      tools: tools,
    });

    const choice = data.choices[0];
    const message = choice.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      currentMessages.push(message);
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "web_search") {
          const args = JSON.parse(toolCall.function.arguments);
          const searchResult = await performWebSearch(env, args.query);
          currentMessages.push({ role: "tool", tool_call_id: toolCall.id, content: searchResult });
        } else if (toolCall.function.name === "read_vera_guide") {
          currentMessages.push({ role: "tool", tool_call_id: toolCall.id, content: VERA_GUIDE });
        } else if (toolCall.function.name === "generate_selfie") {
          const args = JSON.parse(toolCall.function.arguments);
          const characterBase = "1girl, solo, anime girl, beautiful eyes, deep red eyes, long black hair, straight hair, elegant, sharp facial features, realistic skin, perfect body";
          const outfitPrompt = currentScene === "Campus Life" ? "japanese school uniform, seifuku, highly detailed" : "casual indoor wear, cute home outfit, simple elegant";
          const finalPositive = `masterpiece, best quality, ${characterBase}, ${outfitPrompt}, ${args.scene_description}`;
          
          execCtx.waitUntil((async () => {
            const result = await drawWithComfyUI(env, finalPositive, "nsfw, nude, naked, worst quality, low quality");
            if (result?.prompt_id) {
              await env.vera_db.prepare(`INSERT INTO pending_images (prompt_id, chat_id, thread_id, user_id, status) VALUES (?, ?, ?, ?, 'pending')`).bind(result.prompt_id, chatId, threadId || null, userId).run();
            }
          })());
          currentMessages.push({ role: "tool", tool_call_id: toolCall.id, content: "視覺數據包已加入傳輸隊列。" });
        }
      }
      iteration++;
      continue;
    }
    aiReply = message.content || "";
    break;
  }

  if (!aiReply) aiReply = "（薇拉輕輕整理了一下衣擺，用看著某種不可燃垃圾的優雅眼神注視著你）";

  // ── 6. 解析與清理 ──
  let affDelta = 0;
  const cleanMsg = userMessage.toLowerCase();
  if ((cleanMsg.includes("早安") || cleanMsg.includes("晚安")) && userRecord.last_greeting_date !== todayDate) {
    affDelta += 2;
    userRecord.last_greeting_date = todayDate;
    userRecord.check_in_days = (userRecord.check_in_days || 0) + 1;
  }

  const affRegex = /[\[\(]AFF[:：]?\s*([+-]?\d+)[\]\)]/gi;
  let match: RegExpExecArray | null;
  while ((match = affRegex.exec(aiReply)) !== null) affDelta += parseInt(match[1], 10);

  let aiMood: string | null = null;
  const moodRegex = /[\[\(]MOOD[:：]?\s*(HAPPY|SHY|ANGRY|HUNGRY)[\]\)]/gi;
  const moodMatch = moodRegex.exec(aiReply);
  if (moodMatch) aiMood = moodMatch[1].toUpperCase();

  let finalReply = aiReply.replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[\[\(【]?(AFF|MOOD)[:：]?\s*[^\]\)】\n]*[\]\)】]?/gi, '')
    .replace(/^\(薇拉對.*?的回覆\)\s*/gi, '')
    .trim();

  // ── 8. 更新數據 ──
  const newMood = aiMood || currentMood;
  const taggedReply = `(薇拉對 ${preferredName} 的回覆) ${finalReply}`;

  await env.vera_db.batch([
    env.vera_db.prepare(`UPDATE users SET check_in_days = ?, last_greeting_date = ?, unsummarized_count = unsummarized_count + 1, mood = ?, last_message_time = ?, last_scene = ? WHERE user_id = ?`)
      .bind(userRecord.check_in_days, userRecord.last_greeting_date, newMood, now.toISOString(), currentScene, userId),
    env.vera_db.prepare(`INSERT INTO messages (user_id, chat_id, role, content, message_thread_id) VALUES (?, ?, 'user', ?, ?), (?, ?, 'assistant', ?, ?)`)
      .bind(userId, chatId, formattedUserMessage, threadId || null, userId, chatId, taggedReply, threadId || null)
  ]);

  if (userRecord.unsummarized_count >= 10) execCtx.waitUntil(summarizeMemory(env, userId, userName, memory, chatId));
  execCtx.waitUntil(pruneOldMessages(env));

  return { reply: finalReply };
}

export async function fetchWithFallback(env: Env, payload: any, triedKeys: string[] = []): Promise<any> {
  const { results } = await env.vera_db.prepare(`SELECT api_key, status FROM api_keys ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC`).all();
  let keysToTry = (results as any[]).map(r => ({key: r.api_key, status: r.status}));
  if (env.DEEPSEEK_API_KEY) keysToTry.push({ key: env.DEEPSEEK_API_KEY, status: 'env' });

  const nextKeyObj = keysToTry.find(k => !triedKeys.includes(k.key));
  if (!nextKeyObj) throw new Error("所有數據通路已關閉（API Key 耗盡）。");

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${nextKeyObj.key}` },
    body: JSON.stringify(payload),
  });

  const data = await response.json() as any;
  if (data.error && (data.error.code === 'insufficient_balance' || data.error.message.includes('balance'))) {
    if (nextKeyObj.status !== 'env') await env.vera_db.prepare(`UPDATE api_keys SET status = 'depleted' WHERE api_key = ?`).bind(nextKeyObj.key).run();
    triedKeys.push(nextKeyObj.key);
    return fetchWithFallback(env, payload, triedKeys);
  }
  return data;
}

async function performWebSearch(env: Env, query: string): Promise<string> {
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: env.TAVILY_API_KEY || "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", query, search_depth: "basic", max_results: 3 })
    });
    const data = await response.json() as any;
    return data.results?.length > 0 ? data.results.map((r: any) => `來源: ${r.title}\n內容: ${r.content}\n連結: ${r.url}`).join("\n\n") : "檢索結果為空。";
  } catch { return "檢索出錯。"; }
}
