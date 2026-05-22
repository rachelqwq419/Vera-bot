import type { Env, UserRecord } from "./types";
import { RATE_LIMIT_MS, HISTORY_LIMIT, GIFT_SHOP, MOODS, BOSS_ID, MARU_USER_ID, type Mood } from "./constants";import { SYSTEM_PROMPT_TEMPLATE, INNER_OS_MARKER } from "./prompts";
import { checkAchievements, computeFavoritePlay } from "./achievements";
import { recordSpecialMoment } from "./utils";
import { summarizeMemory } from "./memory";

export async function callDeepSeek(env: Env, execCtx: ExecutionContext, userId: string, userName: string, userMessage: string, chatId: string, roomName: string = "未知房間"): Promise<string> {
  // ── 1. 確保 user 存在 ──
  await env.ciallo_db.prepare(
    `INSERT INTO users (user_id, first_name, unsummarized_count) VALUES (?, ?, 0)
     ON CONFLICT(user_id) DO UPDATE SET first_name = ?`
  ).bind(userId, userName, userName).run();

  const userRecord = await env.ciallo_db.prepare(
    `SELECT * FROM users WHERE user_id = ?`
  ).bind(userId).first() as UserRecord | null;

  if (!userRecord) throw new Error(`User ${userId} not found after upsert`);

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
  
  // ── 2. 建立 context ──
  const formattedUserMessage = `[${userName}|好感${userRecord.affection}] ${userMessage}`;
  const { results: recentMsgs } = await env.ciallo_db.prepare(
    `SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ${HISTORY_LIMIT}`
  ).bind(chatId).all();
  const history = (recentMsgs || []).reverse();

  const memory = userRecord.conversation_summary || '你們剛剛認識。';
  const userTemperature = userRecord.temperature ?? 0.85;
  const currentMood = (userRecord.mood || "HAPPY") as Mood;
  const moodInfo = MOODS[currentMood] || MOODS.HAPPY;

  // ── 3. 動態場景（香港時間 UTC+8） ──
  const hkTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
  const currentHour = hkTime.getUTCHours();
  // 🕒 抓取精確的分鐘數，組成 HH:MM 格式
  const currentMinute = hkTime.getUTCMinutes().toString().padStart(2, '0');
  const formattedTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute}`;
  
  const currentMonth = hkTime.getUTCMonth() + 1;
  const currentDay = hkTime.getUTCDate();
  const currentWeekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][hkTime.getUTCDay()];
  const todayDate = hkTime.toISOString().split('T')[0];

  // 🕒 強制在場景開頭注入「當前精確時間」
  let timeScene = `【當前精確時間：${formattedTime}】\n`;
  if (currentHour >= 6 && currentHour < 16) {
    timeScene += "現在是早上/下午，你在學校上課或下課休息。你穿著整齊的高中制服。你是以女高中生的身分在校園角落或用手機和客人聊天。";
  } else if (currentHour >= 16 && currentHour < 24) {
    timeScene += "現在是晚上，你在「紫羅蘭酒館」打工。你穿著標誌性的酒館工作圍裙。周圍有酒館的氛圍和酒水。";
  } else {
    timeScene += "現在是凌晨深夜。你已經下班回到家裡，穿著寬鬆舒適的居家睡衣。你還沒睡，躺在床上或坐在書桌前和客人聊天。";
  }

  // ── 季節感知 ──
  let season = "";
  if (currentMonth >= 3 && currentMonth <= 5) season = "春季";
  else if (currentMonth >= 6 && currentMonth <= 8) season = "夏季";
  else if (currentMonth >= 9 && currentMonth <= 11) season = "秋季";
  else season = "冬季";

  // 🕒 這裡也把時間加進去
  let dateContext = `今天是 ${hkTime.getFullYear()} 年 ${currentMonth} 月 ${currentDay} 日（${currentWeekday}），${season}。現在手錶上的時間是 ${formattedTime}。你可以根據季節、時間和日期自然地融入對話中。`;
  
  // ── 判斷是否經過一段時間 (時間推移機制) ──
  if (userRecord.last_message_time) {
    const lastMsgTime = new Date(userRecord.last_message_time);
    
    // 計算當前時間與最後發言時間的差距（換算成小時）
    const diffHours = (hkTime.getTime() - lastMsgTime.getTime()) / (1000 * 60 * 60);

    // 設定幾個鐘頭當作「時間已經推移」，這裡設為 4 小時
    const RESET_HOURS = 4; 

    // 如果超過設定的時間
    if (diffHours >= RESET_HOURS) {
      dateContext += `\n\n【⚠️時間推移強制警告】距離客人上次發言已經過了約 ${Math.floor(diffHours)} 小時！之前的對話、事件或動作（無論進展到哪裡）都「已經完全結束」！現在是新的一段時間，請根據當下場景自然地重新打招呼或開啟新話題，絕對不可以直接接續上一次的動作！`;
    }
  }
  // ── 心情描述 ──
  const moodContext = `${moodInfo.emoji} ${moodInfo.label} — ${moodInfo.description}`;

  const dynamicSystemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{{user_name}}', userName)
    .replace('{{affection}}', userRecord.affection.toString())
    .replace('{{memory}}', memory.toString())
    .replace('{{time_scene}}', timeScene)
    .replace('{{mood}}', moodContext)
    .replace('{{date_context}}', dateContext)
    .replace('{{room_name}}', roomName);

  // ── 4. 準備訊息包 ──
  const messagesPayload = [
    { role: "system", content: dynamicSystemPrompt },
    ...history,
    { role: "user", content: formattedUserMessage + INNER_OS_MARKER },
  ];

  // ── 5. 發送請求給 DeepSeek ──
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: "deepseek-v4-flash", messages: messagesPayload, temperature: userTemperature }),
  });

  const data = await response.json() as any;
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

  // ── 親吻 hard-code 備援：若用戶訊息含親吻動作，AI 可能漏標，強制 +1 ──
  const kissKeywords = ["(親", "(吻", "(kiss", "(深吻", "(舌吻", "(輕吻",
    "親了", "吻了", "親一下", "親了親", "親吻", "接吻",
    "kiss", "deep kiss", "french kiss"];
  const userHasKissAction = kissKeywords.some(kw => userMessage.toLowerCase().includes(kw.toLowerCase()));
  if (userHasKissAction) {
    s.kiss = Math.max(s.kiss, 1);
  }

  // 每日問候（12 小時冷卻）
  if (
    (lowerMsg.includes("早安") || lowerMsg.includes("早晨") || lowerMsg.includes("晚安") || lowerMsg.includes("早抖"))
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

  // 去重：若 hard code 已處理問候/送禮，在 AI 回覆中刪除第一個對應數值的 AFF 標籤
  let aiReplyForParsing = aiReply;
  if (greetingTriggered) {
    aiReplyForParsing = aiReplyForParsing.replace(/\[AFF:\s*\+2\]/i, '');
  }
  if (roseTriggered) {
    aiReplyForParsing = aiReplyForParsing.replace(/\[AFF:\s*\+5\]/i, '');
  }

  // 從去重版本解析 AI 標籤
  let affDelta = hardCodeAffDelta;
  const affRegex = /\[AFF:\s*([+-]?\d+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = affRegex.exec(aiReplyForParsing)) !== null) {
    affDelta += parseInt(match[1], 10);
  }

  const sexRegex = /\[SEX:\s*([a-zA-Z_]+)\]/gi;
  while ((match = sexRegex.exec(aiReplyForParsing)) !== null) {
    const act = match[1].toLowerCase();
    if (act in s) s[act]++;
  }

  // 解析 MOOD 標籤
  let aiMood: string | null = null;
  const moodRegex = /\[MOOD:\s*(HAPPY|SHY|ANGRY|AROUSED|LUST)\]/gi;
  const moodMatch = moodRegex.exec(aiReplyForParsing);
  if (moodMatch) aiMood = moodMatch[1].toUpperCase();

  // ── 7. 清理 AI 回覆 ──
  let finalReplyToUser = aiReply.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (finalReplyToUser.includes('---')) {
    finalReplyToUser = finalReplyToUser.split('---')[0];
  }
  finalReplyToUser = finalReplyToUser
    .replace(/【?(系統|隱藏)?(數據|標籤|結算)】?[:：]?\s*/gi, '')
    .replace(/\[(AFF|SEX|MOOD):.*?\]/gi, '')
    .trim();

  // ── 8. 計算最終數值 ──
  const finalAffection = Math.min(100, Math.max(0, (userRecord.affection || 0) + affDelta));
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
  if (aiMood && ["HAPPY", "SHY", "ANGRY", "AROUSED", "LUST"].includes(aiMood)) {
    newMood = aiMood;
  }
  // 性行為自動觸發：有 SEX 標籤 → AROUSED
  else if (s.sex > 0 || s.blowjob > 0 || s.paizuri > 0 || s.handjob > 0 || s.footjob > 0 || s.kiss > 0) {
    newMood = "AROUSED";
  }
  // 連續高潮、內射、後庭、吞精等激烈行為 → LUST
  if (!aiMood && (s.orgasm > 0 || s.creampie > 0 || s.anal > 0 || s.swallow > 0 || s.cum_face > 0 || s.cum_tits > 0)) {
    newMood = "LUST";
  }
  // 無性行為時的心情規則
  if (!aiMood && s.sex === 0 && s.blowjob === 0 && s.paizuri === 0 && s.handjob === 0 && s.footjob === 0 && s.kiss === 0) {
    // 收到禮物 → 開心
    if (gifts.length > 0) newMood = "HAPPY";
    // 被粗魯對待（好感度 < 30 且扣分）→ 生氣
    else if (finalAffection < 30 && affDelta < 0) newMood = "ANGRY";
    // 好感度突破里程碑 → 開心
    else if (finalAffection >= 90 && (userRecord.affection || 0) < 90) newMood = "HAPPY";
    // 隨機衰減：生氣 → 開心（過了幾個互動後自然恢復）
    else if (currentMood === "ANGRY" && Math.random() < 0.3) newMood = "HAPPY";
    // 從興奮/淫亂恢復（無性行為時回到開心）
    else if ((currentMood === "AROUSED" || currentMood === "LUST") && Math.random() < 0.4) newMood = "HAPPY";
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
      gifts_received = ?, favorite_play = ?, mood = ?
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
    JSON.stringify(gifts), favoritePlay, newMood,
    userId,
  );

  const msgStmt = env.ciallo_db.prepare(
    `INSERT INTO messages (user_id, chat_id, role, content)
     VALUES (?, ?, 'user', ?), (?, ?, 'assistant', ?)`
  ).bind(userId, chatId, formattedUserMessage, userId, chatId, finalReplyToUser);

  await env.ciallo_db.batch([updateStmt, msgStmt]);

  // ── 10. 記憶總結（每 25 條觸發一次） ──
  if (finalUnsummarizedCount >= 25) {
    const { results: sumMsgs } = await env.ciallo_db.prepare(
      `SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 25`
    ).bind(userId).all();
    const historyText = (sumMsgs || []).reverse()
      .map(m => `${m.role === 'user' ? '' : '莎蘿: '}${m.content}`)
      .join('\n');
    execCtx.waitUntil(summarizeMemory(env, userId, userName, memory, historyText));
  }

  return finalReplyToUser;
}