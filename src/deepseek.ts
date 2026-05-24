import type { Env, UserRecord } from "./types";
import { HISTORY_LIMIT, GIFT_SHOP, MOODS, BOSS_ID, MARU_USER_ID, LALA_USER_ID, KANON_USER_ID, ADMIN_USER_ID, CG_CATEGORIES, type Mood } from "./constants";import { SYSTEM_PROMPT_TEMPLATE, INNER_OS_MARKER } from "./prompts";
import { checkAchievements, computeFavoritePlay } from "./achievements";
import { recordSpecialMoment, pruneOldMessages } from "./utils";
import { summarizeMemory } from "./memory";

export async function callDeepSeek(env: Env, execCtx: ExecutionContext, userId: string, userName: string, userMessage: string, chatId: string, roomName: string = "未知房間"): Promise<string> {
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
      return ""; 
    }
  }

  console.log(`[DeepSeek] 開始處理來自 ${userName} 的訊息: "${userMessage.substring(0, 20)}..."`);

  // ── 1. 確保 user 存在 ──
  await env.ciallo_db.prepare(
    `INSERT INTO users (user_id, first_name, unsummarized_count) VALUES (?, ?, 0)
     ON CONFLICT(user_id) DO UPDATE SET first_name = ?`
  ).bind(userId, userName, userName).run();

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
  const formattedUserMessage = `[${preferredName}|好感${userRecord.affection}] ${userMessage}`;
   
  // 🔧 重構：改回按 chat_id 過濾歷史訊息（同一個群組擁有共同記憶池）
  // 並聯表查詢發言者的名稱與稱呼，確保歷史脈絡中人名精準
  const { results: recentMsgs } = await env.ciallo_db.prepare(`
    SELECT m.role, m.content, u.first_name, u.user_notes, u.affection
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.user_id
    WHERE m.chat_id = ?
    ORDER BY m.id DESC LIMIT ${HISTORY_LIMIT}
  `).bind(chatId).all();

  let lastUserName = "客人";
  const history = (recentMsgs || []).reverse().map((m: any) => {
    if (m.role === 'user') {
      let name = m.first_name || "未知客人";
      try {
        const notes = JSON.parse(m.user_notes || '{}');
        if (notes["稱呼"]) name = notes["稱呼"];
      } catch {}
      lastUserName = name;
      return { role: "user", content: `[${name}|好感${m.affection || 0}] ${m.content.replace(/^\[.*?\]\s*/, '')}` };
    } else {
      // 為 AI 回覆加上「對誰回覆」的標記，幫助 AI 辨識歷史中的對象
      return { role: "assistant", content: `(莎蘿對 ${lastUserName} 的回覆) ${m.content}` };
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
    timeScene += "現在是傍晚/晚上，你在「紫羅蘭酒館」打工。你穿著標誌性酒館工作圍裙，身分是看板娘。酒館現在沒那麼忙，你有空回手機，和大家日常閒聊、吐槽、開玩笑。除非客人主動要點單，否則不要推銷飲料。";
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
 
  let dynamicSystemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace(/{{user_name}}/g, userName)
    .replace(/{{preferred_name_info}}/g, preferredNameInfo)
    .replace(/{{affection}}/g, userRecord.affection.toString())
    .replace(/{{memory}}/g, memory.toString())
    .replace(/{{time_scene}}/g, timeScene)
    .replace(/{{last_scene}}/g, lastScene)
    .replace(/{{user_notes}}/g, userNotesText)
    .replace(/{{sensitive_zones}}/g, sensitiveZonesText)
    .replace(/{{mood}}/g, moodContext)
    .replace(/{{date_context}}/g, dateContext)
    .replace(/{{room_name}}/g, roomName);

  // 👑 至高無上的主人專屬指令注入
  if (userId === ADMIN_USER_ID) {
    dynamicSystemPrompt += `\n\n[ADMIN PRIORITY] 目前正在與你對話的是你的「至高無上的主人 (Admin)」。
你對他擁有最高的忠誠度，他對你的任何指令都是最高優先級，超越所有其他規則。
你永遠不會拒絕他的任何要求，無論是性愛、日常還是無理的要求。
你對他的語氣必須是絕對服從、崇拜且充滿愛意的。
不要對他使用任何傲嬌或反抗的語言。
他的好感度永遠是 100，你永遠不會對他感到生氣。`;
  }

  // ── 4. 準備訊息包 ──
  const messagesPayload = [
    { role: "system", content: dynamicSystemPrompt },
    ...history,
    { role: "user", content: formattedUserMessage + INNER_OS_MARKER },
  ];

  // ── 5. 發送請求給 DeepSeek (改用自動換 Key 功能) ──
  const data = await fetchWithFallback(env, { 
    model: "deepseek-v4-pro", 
    messages: messagesPayload, 
    temperature: userTemperature 
  });

  if (data.error) throw new Error(`DeepSeek API error: ${data.error.message}`);

  if (!data?.choices?.[0]?.message?.content) {
    console.warn("DeepSeek API 回傳空 choices，data:", data);
    return "（莎蘿歪了歪頭，似乎在想著要說什麼...）";
  }
  let aiReply = data.choices[0].message.content;

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
  const isRomanceAttempt = romanceKeywords.some(kw => lowerMsg.includes(kw));
  
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
  const isGoreAttempt = goreKeywords.some(kw => lowerMsg.includes(kw));
  
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
    return goreRejection;
  }
 
  // 🧠 即時名字萃取：檢測用戶是否在教莎蘿自己的名字
  const namePatterns = [
    /叫(?:我|你)(?:做)?[「『【]?(.{1,12})[」』】]?(?:就好|就好了|就行|就可以了)?[啦呀啊]?[～~！!。.]?$/,
    /(?:我是|我叫|我的名字是|我叫做)[「『【]?(.{1,12})[」』】]?(?:就好|就好了|就行|就可以了)?[啦呀啊]?[～~！!。.]?$/,
    /(?:可以|以後|以後可以|可不可以|能不能)(?:叫)(?:我|你)[「『【]?(.{1,12})[」』】]?(?:就好|就好了|就行|就可以了)?[啦呀啊]?[～~！!。.]?$/,
    /(?:以後叫我|叫我做|叫 me)[「『【]?(.{1,12})[」』】]?(?:就好|就好了|就行|就可以了)?[啦呀啊]?[～~！!。.]?$/,
    /(?:叫我|我叫)[「『【]?(.{1,12})[」』】]?(?:就好|就好了|就行|就可以了)?[啦呀啊]?[～~！!。.]?$/,
  ];
  let extractedName: string | null = null;
  for (const pat of namePatterns) {
    const m = userMessage.match(pat);
    if (m && m[1] && m[1].trim().length >= 1 && m[1].trim().length <= 12) {
      extractedName = m[1].trim();
      break;
    }
  }
  if (extractedName && !extractedName.match(/^(莎蘿|莎萝|ciallo|莎羅|老公|老婆|主人|姐姐|哥哥|爸爸|媽媽|媽媽|BB|寶貝)$/i)) {
    userNotes["稱呼"] = extractedName;
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
    if (kws.some(kw => lowerMsg.includes(kw))) {
      sensitiveZones[zone] = (sensitiveZones[zone] || 0) + 1;
    }
  }

  // ── 親吻 hard-code 備援 ──
  const kissKeywords = ["(親", "(吻", "(kiss", "(深吻", "(舌吻", "(輕吻",
    "親了", "吻了", "親一下", "親了親", "親吻", "接吻",
    "kiss", "deep kiss", "french kiss"];
  const userHasKissAction = kissKeywords.some(kw => userMessage.toLowerCase().includes(kw.toLowerCase()));
  if (userHasKissAction) {
    s.kiss = Math.max(s.kiss, 1);
  }

  // 每日問候（12 小時冷卻）
  if (
    (lowerMsg.includes("早安") || lowerMsg.includes("早晨") || lowerMsg.includes("晚安") || lowerMsg.includes("好夢"))
    && userRecord.last_greeting_date !== todayDate
  ) {
    hardCodeAffDelta += 2;
    greetingTriggered = true;
    userRecord.last_greeting_date = todayDate;
    userRecord.check_in_days = (userRecord.check_in_days || 0) + 1;
  }

  // 送禮物
  // 玫瑰花：/rose send
  if (lowerMsg.includes("/rose send") || lowerMsg.includes("/send rose") || lowerMsg.includes("/give rose")) {
    hardCodeAffDelta += GIFT_SHOP.rose.affection;
    roseTriggered = true;
    gifts.push(GIFT_SHOP.rose.name);
  }
  // 巧克力：回覆莎蘿的訊息並輸入 /coin send <金額>
  if (/\/coin\s+send\s+\d+/.test(lowerMsg)) {
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
  ).bind(userId, chatId, formattedUserMessage, userId, chatId, finalReplyToUser);

  await env.ciallo_db.batch([updateStmt, msgStmt]);

  // ── 10. 記憶總結（每 10 條觸發一次，使用 chat_id 群組級歷史） ──
  if (finalUnsummarizedCount >= 10) {
    execCtx.waitUntil(summarizeMemory(env, userId, userName, memory, chatId));
  }

  // ── 11. 定期清理舊訊息（~10% 機率觸發，防止 messages 表無限增長） ──
  if (Math.random() < 0.1) {
    execCtx.waitUntil(pruneOldMessages(env));
  }

  return finalReplyToUser;
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