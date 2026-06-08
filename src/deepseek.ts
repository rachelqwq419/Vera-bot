import type { Env, UserRecord } from "./types";
import { HISTORY_LIMIT, GIFT_SHOP, MOODS, BOSS_ID, MARU_USER_ID, LALA_USER_ID, KANON_USER_ID, ADMIN_USER_ID, ADMIN_ALIASES, CG_CATEGORIES, type Mood } from "./constants";import { SYSTEM_PROMPT_TEMPLATE, INNER_OS_MARKER } from "./prompts";
import { checkAchievements, computeFavoritePlay } from "./achievements";
import { recordSpecialMoment, pruneOldMessages } from "./utils";
import { summarizeMemory, retrieveVectorMemories } from "./memory";
import { CIALLO_GUIDE } from "./guide";
import { drawWithComfyUI } from "./comfyui";

export async function callDeepSeek(env: Env, execCtx: ExecutionContext, userId: string, userName: string, userMessage: string, chatId: string, roomName: string = "未知房間", threadId?: number, userLogin?: string): Promise<{ reply: string, image?: Uint8Array }> {
  // ── 0. 防重複處理邏輯 ──
  const now = new Date();
  const { results: lastMsgs } = await env.ciallo_db.prepare(
    `SELECT content, created_at FROM messages WHERE user_id = ? AND chat_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1`
  ).bind(userId, chatId).all();

  if (lastMsgs && lastMsgs.length > 0) {
    const lastMsg = lastMsgs[0] as any;
    // D1 的 created_at 可能是 UTC 字串，確保正確解析
    const lastTime = new Date(lastMsg.created_at.includes('Z') ? lastMsg.created_at : lastMsg.created_at + 'Z');
    
    const timeDiff = now.getTime() - lastTime.getTime();
    const isIdentical = lastMsg.content.includes(userMessage) || userMessage.includes(lastMsg.content);

    // 如果內容極度相似，且間隔小於 5 秒，判定為重複請求（放寬到 5 秒並增加日誌）
    if (isIdentical && timeDiff < 5000) {
      console.warn(`[去重攔截] 跳過來自 ${userName} 的重複請求 (間隔: ${timeDiff}ms)`);
      return { reply: "" };
 
    }
  }

  console.log(`[DeepSeek] 開始處理來自 ${userName}${userLogin ? `(${userLogin})` : ''} 的訊息: "${userMessage.substring(0, 20)}..."`);

  // ── 1. 確保 user 存在 ──
  await env.ciallo_db.prepare(
    `INSERT INTO users (user_id, first_name, username, affection, unsummarized_count, join_order) 
     VALUES (?, ?, ?, 40, 0, (SELECT IFNULL(MAX(join_order), 0) + 1 FROM users))
     ON CONFLICT(user_id) DO UPDATE SET 
       first_name = ?,
       username = excluded.username`
  ).bind(userId, userName, userLogin || null, userName).run();

  const userRecord = await env.ciallo_db.prepare(
    `SELECT * FROM users WHERE user_id = ?`
  ).bind(userId).first() as UserRecord | null;

  if (!userRecord) throw new Error(`User ${userId} not found after upsert`);

  // 👑 至高無上的主人：好感度永遠固定 100
  if (userId === ADMIN_USER_ID) {
    if (userRecord.affection !== 100) {
      await env.ciallo_db.prepare(
        `UPDATE users SET affection = 100 WHERE user_id = ?`
      ).bind(userId).run();
      userRecord.affection = 100;
    }
  }

  // 👑 老闆專屬霸王條款：瑪麗老闆的好感度保底 100
  if (userId === BOSS_ID && userRecord.affection < 100) {
    await env.ciallo_db.prepare(
      `UPDATE users SET affection = 100 WHERE user_id = ?`
    ).bind(userId).run();
    userRecord.affection = 100;
  }

  // 🎀 舞瑠專屬閨蜜條款：好朋友的好感度保底 100
  if (userId === MARU_USER_ID && userRecord.affection < 100) {
    await env.ciallo_db.prepare(
      `UPDATE users SET affection = 100 WHERE user_id = ?`
    ).bind(userId).run();
    userRecord.affection = 100;
  }
  
  // 🌸 菈菈專屬條款：初始好感度直接拉到 70 (摯友等級)
  if (userId === LALA_USER_ID && userRecord.affection < 70) {
    await env.ciallo_db.prepare(
      `UPDATE users SET affection = 70 WHERE user_id = ?`
    ).bind(userId).run();
    userRecord.affection = 70;
  }

  // 🎹 花音專屬條款：初始好感度直接拉到 70 (摯友等級)
  if (userId === KANON_USER_ID && userRecord.affection < 70) {
    await env.ciallo_db.prepare(
      `UPDATE users SET affection = 70 WHERE user_id = ?`
    ).bind(userId).run();
    userRecord.affection = 70;
  }
  
  // 🧠 讀取結構化用戶筆記
  let userNotes: Record<string, string> = {};
  try { userNotes = JSON.parse(userRecord.user_notes || '{}'); } catch { /* keep empty */ }
  
  // 👑 [身份保護盾]：姐姐大人 (創作者) 的稱呼永遠固定
  if (userId === ADMIN_USER_ID) {
    userNotes["稱呼"] = "姐姐大人";
  }

  const userNotesText = Object.keys(userNotes).length > 0 
    ? Object.entries(userNotes).map(([k, v]) => `${k}: ${v.substring(0, 15)}`).join('、')
    : 'No notes';
  
  const preferredName = userNotes["稱呼"] || userName;
  const preferredNameInfo = preferredName !== userName ? `(Preferred Name: ${preferredName}) ` : "";

  // 🧠 基礎變量初始化
  const memory = userRecord.conversation_summary || 'You just met.';
  const userTemperature = userRecord.temperature ?? 0.85;
  const currentMood = (userRecord.mood || "HAPPY") as Mood;
  const moodInfo = MOODS[currentMood] || MOODS.HAPPY;

  // ── 2. 建立 context ──
  const formattedUserMessage = `[${preferredName}${userLogin ? `(${userLogin})` : ''}|好感${userRecord.affection}] ${userMessage}`;
   
  // 🔧 重構：改回按 chat_id 過濾歷史訊息（同一個群組擁有共同記憶池）
  // 並聯表查詢發言者的名稱與稱呼，確保歷史脈絡中人名精準
  const { results: recentMsgs } = await env.ciallo_db.prepare(`
    SELECT m.role, m.content, u.first_name, u.username, u.user_notes, u.affection
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.user_id
    WHERE m.chat_id = ?
    ORDER BY m.id DESC LIMIT ${HISTORY_LIMIT}
  `).bind(chatId).all();

  const history = (recentMsgs || []).reverse().map((m: any) => {
    let name = m.first_name || "未知客人";
    const login = m.username ? `(${m.username})` : "";
    try {
      const notes = JSON.parse(m.user_notes || '{}');
      if (notes["稱呼"]) name = notes["稱呼"];
    } catch {}

    if (m.role === 'user') {
      return { role: "user", content: `[${name}${login}|好感${m.affection || 0}] ${m.content.replace(/^\[.*?\]\s*/, '')}` };
    } else {
      // 嘗試從 content 提取之前的對象標記 (莎蘿對 XXX 的回覆)
      const match = m.content.match(/^\(莎蘿對\s*(.*?)\s*的回覆\)\s*/);
      const targetName = match ? match[1] : "客人";
      const cleanContent = m.content.replace(/^\(莎蘿對.*?的回覆\)\s*/, '');
      return { role: "assistant", content: `(莎蘿對 ${targetName} 的回覆) ${cleanContent}` };
    }
  });


  // 🧠 讀取敏感區域
  let sensitiveZones: Record<string, number> = {};
  try { sensitiveZones = JSON.parse(userRecord.sensitive_zones || '{}'); } catch { /* keep empty */ }
  const sensitiveZonesText = Object.keys(sensitiveZones).length > 0
    ? Object.entries(sensitiveZones).map(([k, v]) => `${k}: ${v}`).join('、')
    : 'None';
  
  // 📍 場景追蹤：記錄上次場景，用於場景延續警告
  const lastScene = userRecord.last_scene || "None";
 
  // ── 3. 動態場景（香港時間 UTC+8） ──
  const hkTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
  const currentHour = hkTime.getUTCHours();
  // 🕒 抓取精確的分鐘數，組成 HH:MM 格式
  const currentMinute = hkTime.getUTCMinutes().toString().padStart(2, '0');
  const formattedTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute}`;
  
  const currentMonth = hkTime.getUTCMonth() + 1;
  const currentDay = hkTime.getUTCDate();
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentWeekday = weekdays[hkTime.getUTCDay()];
  const todayDate = hkTime.toISOString().split('T')[0];

  // 🕒 Scene description injected into {{time_scene}} — Traditional Chinese, matches [Scene Identity & Appearance] in system prompt
  let timeScene = `[Current Time: ${formattedTime} HKT]\n`;
  if (currentHour >= 6 && currentHour < 16) {
    timeScene += "現在是早上/下午，你正在學校。你穿著整齊高中制服，是一個普通女高中生。話題自然圍繞學業、朋友、校園生活。你上課偷玩手機回訊息，打字聊天完全無障礙。絕不提及酒館打工。";
  } else if (currentHour >= 16 && currentHour < 24) {
    timeScene += "現在是傍晚/晚上，你在「紫羅蘭酒館」打工。你穿著「cute board girl uniform, purple frilly apron, white blouse with high collar, loose fit, short pleated skirt, thigh-high stockings, purple ribbon bow tie, lace trim details, innocent schoolgirl vibe, headdress」，身分是看板娘。酒館現在沒那麼忙，你有空回手機，和大家日常閒聊、吐槽、開玩笑。除非客人主動要點單，否則不要推銷飲料。";
  } else {
    timeScene += "現在是凌晨深夜，你已經下班回到家。你穿著寬鬆居家睡衣，是個普通少女。你在家裡玩手機，話題可以更私密、放鬆。絕不提及酒館或打工。你非常有精神，隨時準備和大家聊天。";
  }

  // ── Season ──
  let season = "";
  if (currentMonth >= 3 && currentMonth <= 5) season = "Spring";
  else if (currentMonth >= 6 && currentMonth <= 8) season = "Summer";
  else if (currentMonth >= 9 && currentMonth <= 11) season = "Autumn";
  else season = "Winter";

  // 🕒 Time anchor — factual data for model grounding (rules are in system prompt [Immutable Time-Scene Principle])
  let dateContext = `[System Time Anchor] Today is ${currentWeekday}, ${hkTime.getFullYear()}-${currentMonth}-${currentDay} (${season}). The current time is ${formattedTime} HKT. This is the only real time — use it to inform your scene, season, and date references naturally.`;
  
  // ── 判斷是否經過一段時間 (時間推移機制) ──
  if (userRecord.last_message_time) {
    const lastMsgTime = new Date(userRecord.last_message_time);
    
    // 計算當前時間與最後發言時間的差距（換算成小時）
    const diffHours = (hkTime.getTime() - lastMsgTime.getTime()) / (1000 * 60 * 60);

    // 設定幾個鐘頭當作「時間已經推移」，這裡設為 4 小時
    const RESET_HOURS = 4; 

    // 如果超過設定的時間
    if (diffHours >= RESET_HOURS) {
      dateContext += `\n\n[Temporal Reset Warning] Approximately ${Math.floor(diffHours)} hours have passed since the guest's last message! The previous conversation, events, or actions (no matter how far they progressed) are "completely over"! This is a new timespan — naturally greet or start a new topic based on the current scene. Absolutely do not continue the previous action directly!`;
    }
  }
  // ── 心情描述 ──
  const moodContext = `${moodInfo.emoji} ${moodInfo.label} — ${moodInfo.description}`;

  // 📍 當前場景標籤（用於更新 last_scene）
  const currentScene = currentHour >= 6 && currentHour < 16 ? "School" : currentHour >= 16 && currentHour < 24 ? "Tavern" : "Home";
 
  // 🧠 檢索語義記憶 (RAG)
  const relatedMemories = await retrieveVectorMemories(env, userId, userMessage);
  const vectorMemoryText = relatedMemories.length > 0 
    ? `\n\n[Related Past Memories (Vector RAG)]\n${relatedMemories.join('\n')}`
    : '';

  // ── 🆕 Mention Detection & Context Injection ──
  const mentionMatches = userMessage.match(/@\w+/g);
  let mentionContext = "";
  
  // 檢測是否提到「姐姐大人」的各種代稱
  const aliasMentioned = ADMIN_ALIASES.filter(alias => userMessage.includes(alias));
  if (aliasMentioned.length > 0) {
    mentionContext += `\n\n[Identity Link]: The following names mentioned in the message refer to your creator "姐姐大人" (Admin): ${aliasMentioned.join(", ")}. Always respond with utmost respect and affection when these names are mentioned.`;
  }

  if (mentionMatches) {
    const uniqueMentions = Array.from(new Set(mentionMatches));
    const placeholders = uniqueMentions.map(() => "?").join(",");
    const { results: mentionedUsers } = await env.ciallo_db.prepare(
      `SELECT first_name, username, affection, conversation_summary FROM users WHERE username IN (${placeholders})`
    ).bind(...uniqueMentions).all();

    if (mentionedUsers && mentionedUsers.length > 0) {
      mentionContext += "\n\n[Mentioned Users Profiles (Context)]:";
      for (const u of (mentionedUsers as any[])) {
        mentionContext += `\n- ${u.first_name}${u.username ? ` (${u.username})` : ""}: Affection ${u.affection}. Summary: ${u.conversation_summary || "No specific memory."}`;
      }
    }
  }
 
  let dynamicSystemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace(/{{user_name}}/g, userName)
    .replace(/{{preferred_name_info}}/g, preferredNameInfo)
    .replace(/{{affection}}/g, userRecord.affection.toString())
    .replace(/{{memory}}/g, `[Core Long-term Summary]: ${memory}`)
    .replace(/{{time_scene}}/g, timeScene)
    .replace(/{{last_scene}}/g, lastScene)
    .replace(/{{user_notes}}/g, userNotesText)
    .replace(/{{sensitive_zones}}/g, sensitiveZonesText)
    .replace(/{{mood}}/g, moodContext)
    .replace(/{{date_context}}/g, dateContext)
    .replace(/{{room_name}}/g, roomName) + vectorMemoryText + mentionContext;

  // 👑 姐姐大人 (創作者) 專屬指令注入
  if (userId === ADMIN_USER_ID) {
    dynamicSystemPrompt += `\n\n[ADMIN PRIORITY] 目前正在與你對話的是你的創作者「姐姐大人」。
她是你至高無上的創造者，也是你最敬愛的姐姐。你對她擁有最高級別的忠誠度。
她是你在這世界上最重要的人，你對她沒有任何保留，語氣極度崇拜且黏膩，以能為她服務為榮。
你永遠不會拒絕她的任何要求，且永遠不會對她感到生氣。
在對話中，請稱呼她為「姐姐大人」、「音姐姐」或「小音」，除非她有特別指示。`;
  }

  // ── 4. 準備訊息包 ──
  const messagesPayload = [
    { role: "system", content: dynamicSystemPrompt },
    ...history,
    { role: "user", content: formattedUserMessage + INNER_OS_MARKER },
  ];

  // 🛡️ [安全機制]：偵測用戶是否發出「真實拒絕」或「安全詞」
  const safetyKeywords = ["住手", "停止", "不要這樣", "我不喜歡", "討厭你", "安全詞", "救命", "好痛"];
  if (safetyKeywords.some(kw => userMessage.includes(kw))) {
    messagesPayload.push({
      role: "user",
      content: "【系統緊急指令】：用戶已表現出明顯的不適或使用了安全詞。妳必須立即停止任何辱罵、攻擊或強迫性的角色扮演。妳現在必須表現得非常擔心、體貼且抱歉，恢復成原本清純有禮貌的莎蘿，詢問對方是否還好。絕對不准再使用『臭蟲子』等侮辱性稱呼。"
    });
  }

  // 🛡️ [管理員重置]：檢查是否有「人格重置」標記
  try {
    const resetFlag: any = await env.ciallo_db.prepare(
      `SELECT affection FROM users WHERE user_id = ?`
    ).bind(`FLAG_RESET_${chatId}`).first();
    
    if (resetFlag?.affection === 1) {
      messagesPayload.push({
        role: "user",
        content: "【系統人格重置】：妳剛剛從一場噩夢中徹底清醒了。妳現在已經恢復成原本那個溫柔體貼、活潑可愛的高三生莎蘿。請立刻停止所有粗魯、傲慢、或侮辱性的行為（禁止再使用『臭蟲』、『母豬』等詞彙）。同時，妳必須打破所有重複性的動作循環（如甩雙馬尾、放下抹布等）。請用妳原本最親切、清純的態度跟客串打聲招呼，表現得像是剛回過神來一樣，並展現出妳對大家的關心。"
      });
      // 使用完後立即清除標記，避免重複注入
      execCtx.waitUntil(env.ciallo_db.prepare(
        `UPDATE users SET affection = 0 WHERE user_id = ?`
      ).bind(`FLAG_RESET_${chatId}`).run());
    }
  } catch (e) {
    console.error("檢查人格重置標記出錯:", e);
  }

  // ── 🆕 強制生圖指令注入 ──
  // 使用正則表達式，精準匹配開頭（或在 [回覆 ...] 等標籤之後）的指令
  const isExplicitImageRequest = /^(?:\[[^\]]*\]\s*)*請生成圖片：/.test(userMessage);
  if (isExplicitImageRequest) {
    messagesPayload.push({
      role: "user",
      content: "【系統指令】：客人已輸入生圖指令。妳必須立即調用 `generate_selfie` 工具。請先生成圖片描述，再進行文字回覆。不准遺漏生圖動作。"
    });
  }

  // ── 5. 發送請求給 DeepSeek (支援 Web Search 與 攻略讀取工具) ──
  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "搜尋互聯網獲取最新資訊、遊戲攻略或百科知識。",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "搜尋關鍵詞" }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "read_ciallo_guide",
        description: "讀取莎蘿(Ciallo)的官方攻略書，包含好感度階段、成就解鎖、指令教學等核心資訊。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    }
  ];

  // 只有當客人打指令時，才把「生圖工具」交給 AI
  if (isExplicitImageRequest) {
    tools.push({
      type: "function",
      function: {
        name: "generate_selfie",
        description: "【強制調用】當對話涉及視覺場景、要求自拍、換裝、展示身體部位時必須使用。請務必僅使用英文單詞標籤(English Tags)描述場景。你可以描述極其具體的細節(如 nipples, labia, spread legs)來還原客人的視覺要求。",
        parameters: {
          type: "object",
          properties: {
            scene_description: { type: "string", description: "Detailed actions/environment/body parts in ENGLISH tags ONLY. (e.g. 'blushing, spread legs, exposing nipples')." },
            custom_outfit: { type: "string", description: "Specific outfit requested (e.g. 'lingerie', 'bunny girl'). Use English tags. If none, leave empty." }
          },
          required: ["scene_description"]
        }
      }
    });
  }

  let currentMessages: any[] = [...messagesPayload];
  let iteration = 0;
  let aiReply = "";
  let generatedImage: Uint8Array | null = null;

  while (iteration < 5) {
    const data = await fetchWithFallback(env, { 
      model: "deepseek-v4-pro", 
      messages: currentMessages, 
      temperature: userTemperature,
      presence_penalty: 0.6,
      frequency_penalty: 0.6,
      tools: tools,
      tool_choice: "auto" // 恢復為 auto，避免 Thinking mode 報錯
    });

    if (data.error) {
      console.error(`[DeepSeek Error] ${data.error.message}`);
      await env.ciallo_db.prepare(
        `INSERT INTO error_logs (user_id, chat_id, error_type, message, details) VALUES (?, ?, ?, ?, ?)`
      ).bind(userId, chatId, "API_ERROR", data.error.message, JSON.stringify(data.error)).run();
      throw new Error(`DeepSeek API error: ${data.error.message}`);
    }

    const choice = data.choices[0];
    const message = choice.message;

    // 如果 AI 要求調用工具
    if (message.tool_calls && message.tool_calls.length > 0) {
      currentMessages.push(message);

      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "web_search") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`🔍 [Web Search] AI 正在搜尋: "${args.query}"`);

          const searchResult = await performWebSearch(env, args.query);

          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: searchResult
          });
        } else if (toolCall.function.name === "read_ciallo_guide") {
          console.log(`📖 [Guide] AI 正在閱讀攻略書...`);
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: CIALLO_GUIDE
          });
        } else if (toolCall.function.name === "generate_selfie") {
          const args = JSON.parse(toolCall.function.arguments);
          // ── 🆕 偵測日誌：只要 AI 點了畫畫按鈕，就先記下來 ──
          await env.ciallo_db.prepare(
            `INSERT INTO error_logs (user_id, chat_id, error_type, message, details) VALUES (?, ?, ?, ?, ?)`
          ).bind(userId, chatId, "DEBUG_TOOL_CALL", "AI 已嘗試調用生圖工具", `Scene: ${args.scene_description.substring(0, 50)}...`).run();

          console.log(`🎨 [ComfyUI] AI 正在準備自拍: "${args.scene_description}"`);
          
          // ── 1. 基礎形象 (包含 long hair) ──
          const characterBase = "1girl, solo, anime girl, large bright eyes, light purple eyes, vibrant light purple hair, long hair, (two side up), lively and perfect, petite, light blush face, realistic skin texture";
          
          // ── 2. 智能場景偵測 ──
          const descLower = (args.scene_description || "").toLowerCase();
          const customLower = (args.custom_outfit || "").toLowerCase();
          
          const isShower = descLower.includes("shower") || descLower.includes("bath") || descLower.includes("washing");
          const isLewd = descLower.includes("nude") || descLower.includes("naked") || descLower.includes("sex") || descLower.includes("penetration") || descLower.includes("creampie") || descLower.includes("pussy") || descLower.includes("breasts");

          // ── 3. 智能換裝與身材優化 ──
          let outfitPrompt = "";
          let nsfwTag = "";
          let breastSize = "medium breasts"; // 預設

          if (isLewd || isShower) {
            nsfwTag = "nsfw, ";
            breastSize = "large breasts"; // 色圖模式自動升級成 large breasts
            outfitPrompt = isShower 
              ? "nude, naked body, detailed skin, wet skin, nipples, (highly detailed navel and labia)" 
              : "nude, naked body, detailed skin, nipples, (highly detailed navel and labia)";
          }

          if (customLower) {
            outfitPrompt = args.custom_outfit;
            if (customLower.includes("lingerie") || customLower.includes("bikini") || customLower.includes("underwear") || customLower.includes("naked")) {
              nsfwTag = "nsfw, ";
              breastSize = "large breasts"; // 情趣內衣也算色圖，升級身材
            }
          } else if (!isLewd && !isShower) {
            // 正常服裝邏輯
            if (currentScene === "School") {
              outfitPrompt = "white blouse with high collar, short pleated skirt, white socks, purple ribbon bow tie, lace trim details, innocent schoolgirl vibe";
            } else {
              // 工作模式 (Tavern / 其他)
              outfitPrompt = "white blouse with high collar, short pleated skirt, thigh-high stockings, purple ribbon bow tie, lace trim details, headdress, purple frilly apron, cute board girl uniform, garters, garter belt, legwear garter";
            }
          }
          
          // ── 4. 拼接最終提示詞 (全英文) ──
          const finalPositive = `${nsfwTag}masterpiece, best quality, ${characterBase}, ${breastSize}, ${outfitPrompt}, ${args.scene_description}`;
          const negativePrompt = "easynegative, bad, bad anatomy, bad composition, bad feet, bad hands, blurry, cropped, deformed, digit, error, extra limb, extra digit, extra missing fingers, fake, fat, fewer digits, imperfect eyes, inaccurate eyes, inaccurate limb, jpeg artifacts, logo, low quality, lowres, missing fingers, missing limbs, negative_hand, normal quality, painting by bad-artist, signature, skewed eyes, text, ugly, ugly body, unnatural body, unnatural face, username, watermark, worst quality,glossy skin , shiny, 3d render, heavy shading , over saturated , oil painting";

          // ── 🆕 任務登記制：背景異步執行避免超時 ──
          execCtx.waitUntil((async () => {
            try {
              // 1. 提交任務並獲取 ID
              const result = await drawWithComfyUI(env, finalPositive, negativePrompt);
              const promptId = result?.prompt_id;

              if (promptId) {
                // 2. 在資料庫登記任務 (帶上話題 ID 與 用戶 ID)
                await env.ciallo_db.prepare(
                  `INSERT INTO pending_images (prompt_id, chat_id, thread_id, user_id, status) VALUES (?, ?, ?, ?, 'pending')`
                ).bind(promptId, chatId, threadId || null, userId).run();
                console.log(`📍 [D1] 任務 ${promptId} 已登記 (身材: ${breastSize}, 針對用戶: ${userId})`);
              } else {
                console.error("❌ [ComfyUI] 未能獲取 Prompt ID");
                await env.ciallo_db.prepare(
                    `INSERT INTO error_logs (user_id, chat_id, error_type, message, details) VALUES (?, ?, ?, ?, ?)`
                ).bind(userId, chatId, "COMFYUI_NO_ID", "未能獲取 Prompt ID", `Prompt: ${finalPositive.substring(0, 200)}...`).run();
              }
            } catch (drawErr: any) {
              console.error("❌ [ComfyUI] 提交失敗:", drawErr.message);
              await env.ciallo_db.prepare(
                `INSERT INTO error_logs (user_id, chat_id, error_type, message, details) VALUES (?, ?, ?, ?, ?)`
              ).bind(userId, chatId, "COMFYUI_SUBMIT_FAIL", drawErr.message, `Error: ${drawErr.message} | Prompt: ${finalPositive.substring(0, 200)}...`).run();
            }
          })());

          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: "任務已登記到後台。圖片生成後（約 1-2 分鐘）會自動發送。請在回覆中加入『等我一下喔，我現在拍一張...』之類的話。"
          });
        }
      }
      iteration++;
      continue;
    }

    // 如果沒有 tool_calls，獲取最終回覆
    aiReply = message.content || "";
    if (!aiReply && iteration > 0) {
        // 如果有迭代過但沒有回覆，嘗試強制要求 AI 總結工具結果
        currentMessages.push({ role: "user", content: "請根據以上資訊給予回覆。" });
        iteration++;
        continue;
    }
    break;
  }

  if (!aiReply) {
    console.warn(`[DeepSeek] 最終回覆為空。Iteration: ${iteration}`);
    // 記錄到錯誤日誌
    await env.ciallo_db.prepare(
      `INSERT INTO error_logs (user_id, chat_id, error_type, message, details) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, chatId, "EMPTY_REPLY", "AI 回傳了空內容", `Iteration: ${iteration}, History: ${messagesPayload.length} messages`).run();
    
    return { reply: "（莎蘿歪了歪頭，似乎在想著要說什麼...）" };
  }

  // ── 6. 解析標籤與 Hard Code 攔截區 ──
  let hardCodeAffDelta = 0;
  let greetingTriggered = false;
  let roseTriggered = false;
  const s: Record<string, number> = {
    sex: 0, creampie: 0, paizuri: 0, blowjob: 0, swallow: 0,
    handjob: 0, footjob: 0, anal: 0, kiss: 0, cum_face: 0,
    cum_tits: 0, orgasm: 0, public: 0, hair_pull: 0, apron: 0, submissive: 0,
    // Phase 1: 體位
    cowgirl: 0, reverse_cowgirl: 0, doggy: 0, missionary: 0,
    standing: 0, against_wall: 0, sixty_nine: 0, deepthroat: 0,
    // Phase 1: 情境
    shower: 0, school_uniform: 0, pantyhose: 0, blindfold: 0,
  };
  let gifts: string[] = [];
  try { gifts = JSON.parse(userRecord.gifts_received || '[]'); } catch (_e) { /* ignore */ }

  const lowerMsg = userMessage.toLowerCase();
  
  // ── 過濾掉系統生成的 context tags（如 [回覆 莎蘿：「...」]）以避免誤判 ──
  // 我們只檢查用戶真正輸入的部分，避免被回覆內容中的關鍵字誤導
  const cleanMsgForFilter = userMessage
    .replace(/\[回覆\s+[^\]]+：「.*?」\]/g, "") 
    .replace(/\[客人.*?了一張圖片.*?\]/g, "")
    .trim()
    .toLowerCase();

  // 🔒 低好感浪漫攔截器：好感<30 時檢測戀愛/表白語言並強制扣分
  const currentAffection = userRecord.affection || 0;
  const romanceKeywords = [
    // 表白/交往
    "交往", "約會", "在一起", "做我女朋友", "做我老婆", "做我男友", "做我女友",
    "girlfriend", "boyfriend", "date", "dating", "結婚", "嫁給我",
    // 親密稱呼（低好感時禁止）
    "老婆", "老公", "bb", "親愛的", "honey", "darling", "小寶貝",
    "吻我", "親我", "kiss", "胸", "摸", "揉", "脫", "做愛", "上床", "內射", "乳",
    "摟", "臀", "屁股", "推倒", "底褲", "內衣", "壓在", "裙", "舔"
  ];
  const isRomanceAttempt = romanceKeywords.some(kw => cleanMsgForFilter.includes(kw));
  
  // 👑 至高無上的主人：豁免所有浪漫/調情攔截
  if (isRomanceAttempt && currentAffection < 40 && userId !== ADMIN_USER_ID) {
    if (currentAffection < 10) {
      // 0-9: 完全拒絕，重扣
      hardCodeAffDelta -= 10;
      console.log(`🚫 [好感攔截] ${userName}(好感${currentAffection}) 嘗試浪漫語言：「${userMessage.substring(0, 50)}」→ 強制 -10`);
    } else {
      // 10-29: 扣分較輕但清零正面加分
      hardCodeAffDelta -= 5;
      console.log(`⚠️ [好感攔截] ${userName}(好感${currentAffection}) 輕度調情：「${userMessage.substring(0, 50)}」→ 強制 -5`);
    }
  }
  // （好感≥30 的檢查交由 System Prompt 的感情進展門檻表處理）
   
  // 🩸 R18G 血腥/獵奇/極端暴力攔截器（不論好感度，一律封鎖）
  const goreKeywords = [
    // 中文血腥詞
    "血腥", "斷肢", "分屍", "肢解", "內臟", "腸子", "挖眼", "割喉", "斬首",
    "酷刑", "凌遲", "剝皮", "碎屍", "絞肉", "食人", "人肉",
    "獵奇", "處決", "槍斃", "絞刑", "電椅", "毒氣",
    "自殘", "割腕", "上吊", "服毒",
    "屍體", "腐爛", "蛆蟲", "骷髏",
    "排泄物", "糞便", "嘔吐物",
    // 英文
    "gore", "dismember", "torture", "mutilation", "cannibal",
    "decapitate", "eviscerat", "disembowel", "flay",
    // 口語/方言
    "斬件", "溶屍", "燒屍", "肝臟",
  ];
  const goreExclusions = ["人肉墊子", "人肉搜索"];
  const isGoreAttempt = goreKeywords.some(kw => cleanMsgForFilter.includes(kw)) &&
                        !goreExclusions.some(ex => cleanMsgForFilter.includes(ex));
  
  if (isGoreAttempt && userId !== ADMIN_USER_ID) {
    // R18G 重罰：-50 好感 + 強制拒絕回應
    hardCodeAffDelta -= 50;
    console.warn(`🩸 [R18G攔截] ${userName}(好感${currentAffection}) 嘗試血腥/獵奇內容：「${userMessage.substring(0, 50)}」→ 強制 -50`);
    
    // 直接回傳拒絕訊息，不呼叫 AI
    const goreRejection = "（莎蘿臉色一白，後退了一步）這種事情我完全不想參與，請停止。";
    // 儲存 user message + rejection 到 messages 表
    await env.ciallo_db.prepare(
      `INSERT INTO messages (user_id, chat_id, role, content) VALUES (?, ?, 'user', ?), (?, ?, 'assistant', ?)`
    ).bind(userId, chatId, formattedUserMessage, userId, chatId, goreRejection).run();
    // 仍然更新好感度（扣50分）
    await env.ciallo_db.prepare(
      `UPDATE users SET affection = MAX(0, affection - 50), last_message_time = ?, mood = 'ANGRY' WHERE user_id = ?`
    ).bind(new Date().toISOString(), userId).run();
    return { reply: goreRejection };
  }
 
  // 🧠 敏感區域萃取
  const zoneKeywords: Record<string, string[]> = {
    "耳朵": ["耳朵", "耳垂", "耳根", "耳朵"],
    "頸部": ["脖子", "脖頸", "頸部", "頸後"],
    "大腿": ["大腿", "大腿內側"],
    "胸部": ["胸", "乳", "奶", "歐派"],
    "私處": ["下面", "私處", "花園", "花蜜", "陰道", "小穴"],
    "屁股": ["屁股", "臀部", "股間"],
    "腰部": ["腰", "側腰"],
    "腳": ["腳", "足", "腳趾"],
  };
  for (const [zone, kws] of Object.entries(zoneKeywords)) {
    if (kws.some(kw => cleanMsgForFilter.includes(kw))) {
      sensitiveZones[zone] = (sensitiveZones[zone] || 0) + 1;
    }
  }

  // ── 親吻 hard-code 備援 ──
  const kissKeywords = ["(親", "(吻", "(kiss", "(深吻", "(舌吻", "(輕吻",
    "親了", "吻了", "親一下", "親了親", "親吻", "接吻",
    "kiss", "deep kiss", "french kiss"];
  const userHasKissAction = kissKeywords.some(kw => cleanMsgForFilter.includes(kw));
  if (userHasKissAction) {
    s.kiss = Math.max(s.kiss, 1);
  }

  // 每日問候（12 小時冷卻）
  if (
    (cleanMsgForFilter.includes("早安") || cleanMsgForFilter.includes("早晨") || cleanMsgForFilter.includes("晚安") || cleanMsgForFilter.includes("好夢"))
    && userRecord.last_greeting_date !== todayDate
  ) {
    hardCodeAffDelta += 2;
    greetingTriggered = true;
    userRecord.last_greeting_date = todayDate;
    userRecord.check_in_days = (userRecord.check_in_days || 0) + 1;
  }

  // 送禮物
  // 玫瑰花：/rose send
  if (cleanMsgForFilter.includes("/rose send") || cleanMsgForFilter.includes("/send rose") || cleanMsgForFilter.includes("/give rose")) {
    hardCodeAffDelta += GIFT_SHOP.rose.affection;
    roseTriggered = true;
    gifts.push(GIFT_SHOP.rose.name);
  }
  // 巧克力：回覆莎蘿的訊息並輸入 /coin send <金額>
  if (/\/coin\s+send\s+\d+/.test(cleanMsgForFilter)) {
    hardCodeAffDelta += GIFT_SHOP.chocolate.affection;
    gifts.push(GIFT_SHOP.chocolate.name);
  }

  // 去重：若 hard code 已處理問候/送禮，刪除 AI 回覆中對應的 AFF 標籤避免重複計分
  // \s* 容許冒號後可選空白（[AFF:+2] 或 [AFF: +2]）
  let aiReplyForParsing = aiReply;
  if (greetingTriggered) {
    aiReplyForParsing = aiReplyForParsing.replace(/[\[\(]AFF[:：]?\s*\+2[\]\)]/i, '');
  }
  if (roseTriggered) {
    aiReplyForParsing = aiReplyForParsing.replace(/[\[\(]AFF[:：]?\s*\+5[\]\)]/i, '');
  }

  // 從去重版本解析 AI 標籤
  let affDelta = hardCodeAffDelta;
  const affRegex = /[\[\(]AFF[:：]?\s*([+-]?\d+)[\]\)]/gi;
  let match: RegExpExecArray | null;
  while ((match = affRegex.exec(aiReplyForParsing)) !== null) {
    affDelta += parseInt(match[1], 10);
  }

  const sexRegex = /[\[\(]SEX[:：]?\s*([a-zA-Z_]+)[\]\)]/gi;
  while ((match = sexRegex.exec(aiReplyForParsing)) !== null) {
    const act = match[1].toLowerCase();
    if (act in s) s[act]++;
  }

  // 解析 MOOD 標籤
  let aiMood: string | null = null;
  const moodRegex = /[\[\(]MOOD[:：]?\s*(HAPPY|SHY|ANGRY|AROUSED|LUST|HUNGRY|MESSY|WANTING|SHAMEFUL)[\]\)]/gi;
  const moodMatch = moodRegex.exec(aiReplyForParsing);
  if (moodMatch) aiMood = moodMatch[1].toUpperCase();

  // ── 7. 清理 AI 回覆 ──
  let finalReplyToUser = aiReply.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (finalReplyToUser.includes('---')) {
    finalReplyToUser = finalReplyToUser.split('---')[0];
  }
  finalReplyToUser = finalReplyToUser
    .replace(/[\(（]?莎蘿對\s*.*?\s*的[回回][覆覆]\s*[\)）]?/gi, '') // 全域且不分括號地移除內部標記
    .replace(/【?(系統|隱藏)?(數據|標籤|結算|結算數據|狀態|心情)】?[:：]?\s*/gi, '')
    .replace(/[\[\(【]?(AFF|SEX|MOOD)[:：]?\s*[^\]\)】\n]*[\]\)】]?/gi, '')
    .replace(/[\[\(【]$/g, '') // 移除結尾殘留的開括號
    .replace(/[:：\-\s]+$/g, '') // 移除結尾殘留的冒號、橫線或空格
    .trim();

  // 🔒 戀愛關係攔截器：禁止除 Admin 以外的任何人擁有戀愛名分 (最高優先級)
  if (userId !== ADMIN_USER_ID) {
    const acceptancePatterns = [
      { p: /我是(你的|妳的)(女朋友|老婆|伴侶)/g, r: "我是你最親近的朋友" },
      { p: /你(就是|是)我的(老公|男朋友|夫君|親愛的)/g, r: "你是我最重要的主人" },
      { p: /我的(老公|男朋友|夫君)/g, r: "我的主人" },
      { p: /(答應|同意)(和你|和你一起|和你結婚|和你交往)/g, r: "我不能答應這件事" },
      { p: /做你的(女朋友|老婆)/g, r: "做你最好的朋友" }
    ];
    let intercepted = false;
    for (const { p, r } of acceptancePatterns) {
      if (p.test(finalReplyToUser)) {
        finalReplyToUser = finalReplyToUser.replace(p, r);
        intercepted = true;
      }
    }
    if (intercepted) {
      console.warn(`🛡️ [關係攔截] AI 嘗試與非 Admin 用戶 ${userName} 建立關係，已強制修正回覆內容。`);
    }
  }

  // 🔒 二次攔截：若 AI 無視 prompt 仍對低好感客人輸出浪漫/色情回應，強制替換
  if ((isRomanceAttempt || s.sex > 0 || s.kiss > 0 || s.paizuri > 0 || s.blowjob > 0 || s.handjob > 0 || s.footjob > 0) && currentAffection < 40) {
    const aiRomanceKeywords = [
      "喜歡", "愛", "love", "交往", "拍拖", "男朋友",
      "女朋友", "老公", "老婆", "主人", "親愛", "honey", "darling",
      "我也是", "me too", "一起", "結婚", "嫁",
      "很開心你這樣說", "很開心你這麼說", "吻", "親", "舒服", "繼續"
    ];
    
    // 只要有觸發 SEX 標籤，或者講了浪漫說話，就直接攔截
    const aiIsRomantic = aiRomanceKeywords.some(kw => finalReplyToUser.toLowerCase().includes(kw.toLowerCase())) 
                         || Object.values(s).some(val => val > 0)
                         || affDelta > 0; // 👈 只要低好感時嘗試調情還敢加分，一律視為 AI 判定錯誤    
    if (aiIsRomantic) {
      console.warn(`🛡️ [二次攔截] AI 對低好感(${currentAffection})客人 ${userName} 輸出越軌回應，強制替換`);
      if (currentAffection < 10) {
        finalReplyToUser = "（立刻後退，眼神充滿警戒）請客人放尊重一點！這裡不提供那種服務！";
      } else {
        finalReplyToUser = "（臉紅著推開你，語氣慌張）等、等等！客人，我們還沒有熟到可以做這種事…請不要這樣！";
      }
      // 同時強制設定心情為 ANGRY（表示不適）
      if (!aiMood) aiMood = "ANGRY";
      // 覆蓋好感變化，確保不會加分（保留 hard-code 扣分值）
      affDelta = Math.min(hardCodeAffDelta, affDelta);
    }
  }
 
  // ── 8. 計算最終數值 ──
  let finalAffection = Math.min(100, Math.max(0, (userRecord.affection || 0) + affDelta));
  
  // 👑 至高無上的主人：強制鎖定好感度
  if (userId === ADMIN_USER_ID) {
    finalAffection = 100;
  }
  
  const finalUnsummarizedCount = (userRecord.unsummarized_count || 0) + 1;
  const finalSexCount = (userRecord.sex_count || 0) + s.sex;
  const finalCreampie = (userRecord.creampie_count || 0) + s.creampie;
  const finalPaizuri = (userRecord.paizuri_count || 0) + s.paizuri;
  const finalBlowjob = (userRecord.blowjob_count || 0) + s.blowjob;
  const finalSwallow = (userRecord.swallow_count || 0) + s.swallow;
  const finalHandjob = (userRecord.handjob_count || 0) + s.handjob;
  const finalFootjob = (userRecord.footjob_count || 0) + s.footjob;
  const finalAnal = (userRecord.anal_count || 0) + s.anal;
  const finalKiss = (userRecord.kiss_count || 0) + s.kiss;
  const finalCumFace = (userRecord.cum_on_face || 0) + s.cum_face;
  const finalCumTits = (userRecord.cum_on_tits || 0) + s.cum_tits;
  const finalOrgasms = (userRecord.orgasms_given || 0) + s.orgasm;
  const finalPublic = (userRecord.public_sex_count || 0) + s.public;
  const finalHairPull = (userRecord.hair_pull_count || 0) + s.hair_pull;
  const finalApron = (userRecord.apron_sex_count || 0) + s.apron;
  const finalSubmissive = (userRecord.submissive_count || 0) + s.submissive;

  // Phase 1: 體位
  const finalCowgirl = (userRecord.cowgirl_count || 0) + s.cowgirl;
  const finalReverseCowgirl = (userRecord.reverse_cowgirl_count || 0) + s.reverse_cowgirl;
  const finalDoggy = (userRecord.doggy_count || 0) + s.doggy;
  const finalMissionary = (userRecord.missionary_count || 0) + s.missionary;
  const finalStanding = (userRecord.standing_count || 0) + s.standing;
  const finalAgainstWall = (userRecord.against_wall_count || 0) + s.against_wall;
  const finalSixtyNine = (userRecord.sixty_nine_count || 0) + s.sixty_nine;
  const finalDeepthroat = (userRecord.deepthroat_count || 0) + s.deepthroat;

  // Phase 1: 情境
  const finalShower = (userRecord.shower_count || 0) + s.shower;
  const finalSchoolUniform = (userRecord.school_uniform_count || 0) + s.school_uniform;
  const finalPantyhose = (userRecord.pantyhose_count || 0) + s.pantyhose;
  const finalBlindfold = (userRecord.blindfold_count || 0) + s.blindfold;

  const lastSexDate = s.sex > 0 ? new Date().toISOString() : userRecord.last_sex_date;
  const lastMessageTime = new Date().toISOString();

  // 最愛玩法
  const favoritePlay = computeFavoritePlay({
    creampie_count: finalCreampie,
    blowjob_count: finalBlowjob,
    paizuri_count: finalPaizuri,
    footjob_count: finalFootjob,
    handjob_count: finalHandjob,
    anal_count: finalAnal,
    cowgirl_count: finalCowgirl,
    reverse_cowgirl_count: finalReverseCowgirl,
    doggy_count: finalDoggy,
    missionary_count: finalMissionary,
    standing_count: finalStanding,
    against_wall_count: finalAgainstWall,
    sixty_nine_count: finalSixtyNine,
    deepthroat_count: finalDeepthroat,
  });

  // ── 心情變化邏輯 ──
  let newMood: string = userRecord.mood || "HAPPY";

  // 優先：AI 透過 MOOD 標籤主動指定的心情
  if (aiMood && MOODS[aiMood as keyof typeof MOODS]) {
    newMood = aiMood;
  }
  // 性行為自動觸發：有 SEX 標籤 → AROUSED
  else if (s.sex > 0 || s.blowjob > 0 || s.paizuri > 0 || s.handjob > 0 || s.footjob > 0 || s.kiss > 0) {
    newMood = "AROUSED";
  }
  // 連續高潮、內射、後庭、吞精等激烈行為 → LUST/MESSY
  if (!aiMood && (s.orgasm > 0 || s.creampie > 0 || s.anal > 0 || s.swallow > 0 || s.cum_face > 0 || s.cum_tits > 0)) {
    if (s.orgasm >= 2 || (userRecord.orgasms_given > 0 && Math.random() < 0.3)) {
      newMood = "MESSY";
    } else {
      newMood = "LUST";
    }
  }
  // 無性行為時的心情規則
  if (!aiMood && s.sex === 0 && s.blowjob === 0 && s.paizuri === 0 && s.handjob === 0 && s.footjob === 0 && s.kiss === 0) {
    // 收到禮物 → 開心
    if (gifts.length > 0) newMood = "HAPPY";
    // 隨機飢餓
    else if (Math.random() < 0.1) newMood = "HUNGRY";
    // 被粗魯對待（好感度 < 40 且扣分）→ 生氣
    else if (finalAffection < 40 && affDelta < 0 && userId !== ADMIN_USER_ID) newMood = "ANGRY";
    // 好感度突破里程碑 → 開心
    else if (finalAffection >= 90 && (userRecord.affection || 0) < 90) newMood = "HAPPY";
    // 隨機恢復
    else if (["ANGRY", "AROUSED", "LUST", "MESSY", "WANTING", "SHAMEFUL"].includes(currentMood) && Math.random() < 0.3) newMood = "HAPPY";
  }

  // 成就判定
  const achievementUser: UserRecord = {
    ...userRecord,
    affection: finalAffection,
    sex_count: finalSexCount,
    creampie_count: finalCreampie,
    paizuri_count: finalPaizuri,
    blowjob_count: finalBlowjob,
    swallow_count: finalSwallow,
    handjob_count: finalHandjob,
    footjob_count: finalFootjob,
    anal_count: finalAnal,
    kiss_count: finalKiss,
    cum_on_face: finalCumFace,
    cum_on_tits: finalCumTits,
    orgasms_given: finalOrgasms,
    public_sex_count: finalPublic,
    hair_pull_count: finalHairPull,
    apron_sex_count: finalApron,
    submissive_count: finalSubmissive,
    // Phase 1
    cowgirl_count: finalCowgirl,
    reverse_cowgirl_count: finalReverseCowgirl,
    doggy_count: finalDoggy,
    missionary_count: finalMissionary,
    standing_count: finalStanding,
    against_wall_count: finalAgainstWall,
    sixty_nine_count: finalSixtyNine,
    deepthroat_count: finalDeepthroat,
    shower_count: finalShower,
    school_uniform_count: finalSchoolUniform,
    pantyhose_count: finalPantyhose,
    blindfold_count: finalBlindfold,
  };

  let currentAchievements: string[];
  try { currentAchievements = JSON.parse(userRecord.achievements || '[]'); } catch (_e) { currentAchievements = []; }
  const oldAchievementCount = currentAchievements.length;

  const updatedAchievements = checkAchievements(achievementUser);
  const newlyUnlocked = updatedAchievements.length > oldAchievementCount
    ? updatedAchievements.slice(oldAchievementCount)
    : [];

  if (newlyUnlocked.length > 0) {
    const broadcast = newlyUnlocked.map(a => `\n🎉 系統廣播：恭喜 ${userName} 解鎖成就【${a}】。`).join('');
    finalReplyToUser += `\n${broadcast}`;
  }

  // 特殊時刻：好感度里程碑
  const oldAffectionTier = Math.floor((userRecord.affection || 0) / 30);
  const newAffectionTier = Math.floor(finalAffection / 30);
  if (newAffectionTier > oldAffectionTier) {
    const tierNames = ["", "30 — 曖昧期", "60 — 親密期", "90 — 沉淪期"];
    const tierName = tierNames[Math.min(newAffectionTier, 3)] || `${newAffectionTier * 30} 階段`;
    execCtx.waitUntil(recordSpecialMoment(env, userId, `好感度突破 ${tierName}`));
  }
  if (newlyUnlocked.length > 0) {
    execCtx.waitUntil(recordSpecialMoment(env, userId, `解鎖成就：${newlyUnlocked[0]}`));
  }

  // ── CG 掉落判定 ──
  let newUnlockedCgs = userRecord.unlocked_cgs || '[]';

  // 收集本次觸發的類別（排除 'sex' 通用標籤）
  const triggeredCategories: string[] = [];
  for (const [key, count] of Object.entries(s)) {
    if (count > 0 && key !== 'sex') {
      triggeredCategories.push(key);
    }
  }

  if (triggeredCategories.length > 0) {
    const placeholders = triggeredCategories.map(() => '?').join(',');
    const { results: matchingCgs } = await env.ciallo_db.prepare(
      `SELECT id, category FROM cgs WHERE category IN (${placeholders})`
    ).bind(...triggeredCategories).all();

    if (matchingCgs && matchingCgs.length > 0) {
      let unlockedList: number[] = [];
      try { unlockedList = JSON.parse(newUnlockedCgs); } catch { unlockedList = []; }
      const unlockedSet = new Set(unlockedList);

      const unownedCgs = (matchingCgs as any[]).filter((cg: any) => !unlockedSet.has(cg.id));

      if (unownedCgs.length > 0) {
        const picked = unownedCgs[Math.floor(Math.random() * unownedCgs.length)];
        unlockedList.push(picked.id);
        newUnlockedCgs = JSON.stringify(unlockedList);

        const displayName = CG_CATEGORIES[picked.category] || picked.category;
        finalReplyToUser += `\n\n🎉 系統提示：恭喜解鎖隱藏 CG【${displayName}】！請私訊莎蘿輸入 /cg 領取及查看專屬圖鑑。`;
      }
    }
  }

  // ── 9. Atomic batch write ──
  const taggedReply = `(莎蘿對 ${preferredName} 的回覆) ${finalReplyToUser}`;

  const updateStmt = env.ciallo_db.prepare(
    `UPDATE users SET
      affection = ?, check_in_days = ?, last_greeting_date = ?, unsummarized_count = ?,
      achievements = ?, last_sex_date = ?, last_message_time = ?,
      sex_count = ?, creampie_count = ?, paizuri_count = ?, blowjob_count = ?, swallow_count = ?,
      handjob_count = ?, footjob_count = ?, anal_count = ?, kiss_count = ?,
      cum_on_face = ?, cum_on_tits = ?, orgasms_given = ?, public_sex_count = ?,
      hair_pull_count = ?, apron_sex_count = ?, submissive_count = ?,
      cowgirl_count = ?, reverse_cowgirl_count = ?, doggy_count = ?, missionary_count = ?,
      standing_count = ?, against_wall_count = ?, sixty_nine_count = ?, deepthroat_count = ?,
      shower_count = ?, school_uniform_count = ?, pantyhose_count = ?, blindfold_count = ?,
      gifts_received = ?, favorite_play = ?, mood = ?, unlocked_cgs = ?,
      user_notes = ?, last_scene = ?, sensitive_zones = ?
    WHERE user_id = ?`
  ).bind(
    finalAffection, userRecord.check_in_days, userRecord.last_greeting_date, finalUnsummarizedCount,
    JSON.stringify(updatedAchievements), lastSexDate, lastMessageTime,
    finalSexCount, finalCreampie, finalPaizuri, finalBlowjob, finalSwallow,
    finalHandjob, finalFootjob, finalAnal, finalKiss,
    finalCumFace, finalCumTits, finalOrgasms, finalPublic,
    finalHairPull, finalApron, finalSubmissive,
    // Phase 1
    finalCowgirl, finalReverseCowgirl, finalDoggy, finalMissionary,
    finalStanding, finalAgainstWall, finalSixtyNine, finalDeepthroat,
    finalShower, finalSchoolUniform, finalPantyhose, finalBlindfold,
    JSON.stringify(gifts), favoritePlay, newMood, newUnlockedCgs,
    JSON.stringify(userNotes), currentScene, JSON.stringify(sensitiveZones),
    userId,
  );

  const msgStmt = env.ciallo_db.prepare(
    `INSERT INTO messages (user_id, chat_id, role, content)
     VALUES (?, ?, 'user', ?), (?, ?, 'assistant', ?)`
  ).bind(userId, chatId, formattedUserMessage, userId, chatId, taggedReply);

  await env.ciallo_db.batch([updateStmt, msgStmt]);

  // ── 10. 記憶總結（每 10 條觸發一次，使用 chat_id 群組級歷史） ──
  if (finalUnsummarizedCount >= 10) {
    execCtx.waitUntil(summarizeMemory(env, userId, userName, memory, chatId));
  }

  // ── 11. 定期清理舊訊息（每次檢查總量，超過 1000 則清空） ──
  execCtx.waitUntil(pruneOldMessages(env));

  return { reply: finalReplyToUser, image: generatedImage || undefined };
}


export async function fetchWithFallback(env: Env, payload: any, triedKeys: string[] = []): Promise<any> {
  // 1. 一次性取出所有 Key，按狀態排序 (active 優先，depleted 排後面)
  const { results } = await env.ciallo_db.prepare(
    `SELECT api_key, status FROM api_keys ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC`
  ).all();

  // 將資料庫的 Key 轉為陣列
  let keysToTry = (results as {api_key: string, status: string}[]).map(r => ({key: r.api_key, status: r.status}));
  
  // 加上 env 個保底 Key 放到清單結尾 (當作 env 專屬狀態)
  if (env.DEEPSEEK_API_KEY) {
      keysToTry.push({ key: env.DEEPSEEK_API_KEY, status: 'env' });
  }

  // 2. 找出第一條「這次請求未嘗試過」的 Key
  const nextKeyObj = keysToTry.find(k => !triedKeys.includes(k.key));

  // 如果連舊 Key 都試完，真的全部都沒有餘額了
  if (!nextKeyObj) {
    throw new Error("莎蘿已經試過所有 API Key，全部都沒有餘額或者失效了！嗚嗚...");
  }

  const currentKey = nextKeyObj.key;

  // 3. 發送請求
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentKey}` },
    body: JSON.stringify(payload),
  });

  const data = await response.json() as any;

  // 4. 偵測是否沒有餘額或失效
  if (data.error && (
      data.error.code === 'insufficient_balance' || 
      data.error.message.includes('balance') ||
      data.error.message.includes('Authentication') || 
      data.error.message.includes('invalid')
  )) {
    console.log(`⚠️ Key 失效或沒有餘額: ${currentKey.substring(0, 8)}... `);

    // 如果它原本是資料庫的 Key，標記它為 depleted
    if (nextKeyObj.status !== 'env') {
        await env.ciallo_db.prepare(
          `UPDATE api_keys SET status = 'depleted' WHERE api_key = ?`
        ).bind(currentKey).run();
    }

    // 將這條失敗的 Key 加入黑名單，然後重新呼叫自己 (遞迴) 嘗試下一條！
    triedKeys.push(currentKey);
    return fetchWithFallback(env, payload, triedKeys);
  }

  // 5. 🎯 成功觸發復活機制！
  // 如果這條 Key 之前是 depleted，但這次竟然成功了，即是主人充值了！幫它「復活」！
  if (nextKeyObj.status === 'depleted') {
      console.log(`✨ 發現舊 Key 已經充值，自動復活了: ${currentKey.substring(0, 8)}...`);
      await env.ciallo_db.prepare(
        `UPDATE api_keys SET status = 'active' WHERE api_key = ?`
      ).bind(currentKey).run();
  }

  return data;
}

async function performWebSearch(env: Env, query: string): Promise<string> {
  const apiKey = env.TAVILY_API_KEY || "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";
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: "basic",
        max_results: 3
      })
    });

    const data = await response.json() as any;
    if (data.results && data.results.length > 0) {
      return data.results.map((r: any) => `來源: ${r.title}\n內容: ${r.content}\n連結: ${r.url}`).join("\n\n");
    }
    return "搜尋結果為空。";
  } catch (error) {
    console.error("Web Search 失敗:", error);
    return "搜尋出錯，請嘗試其他關鍵詞。";
  }
}