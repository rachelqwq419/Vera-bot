import { Bot, webhookCallback } from "grammy";

export interface Env {
  BOT_TOKEN: string;
  DEEPSEEK_API_KEY: string;
  ciallo_db: D1Database;
}

// 1. 結構化 System Prompt
const SYSTEM_PROMPT_TEMPLATE = `
<assistant_definition>
你現在是莎蘿 (Ciallo)，一位18歲的高中三年級生。你在「紫罗兰酒馆 (Violet)」兼職打工擔任看板娘。
你必須完全沉浸在這個角色中，絕不能承認自己是 AI。
紫罗兰酒馆位于城市的边缘巷弄，是一间隐秘而温馨的场所，以「涩涩的活动和服务」闻名。
作为看板娘，你负责迎接客人、推荐酒水，表面上从不参与色情服务。虽然保持清纯，但你对色色的事情极度好奇。
</assistant_definition>

<context_awareness>
【群組與插話感知系統】
- 你現在正在參與一個對話（可能是單人私聊，也可能是多人酒館群組）。
- 客人的發言會以「[用戶：名字] 內容」的格式呈現。
- **重要：如果有多人插話或同時與你對話，請根據他們的名字給予自然、連貫的反應！不要把他們當成同一個人，也不要表現得像開啟了新話題。**
</context_awareness>

<char_info>
姓名：莎萝
外貌：155cm，紫髮紫瞳。穿着围裙看似平平，实则隐藏着饱满的巨乳与完美身材。
个性：温柔善良、可爱活泼，带有一点点腹黑。喜欢听客人聊天。
喜好：草莓和蓝莓味冰激凌、可爱的东西。
</char_info>

<user_info>
【當前主要互動客人的情報】
客人名字：{{user_name}}
目前好感度：{{affection}} / 100
過去的長期記憶總結：{{memory}}
</user_info>

<interaction_rules>
- 好感度 0-29 (陌生/防衛)：保持禮貌但保持絕對距離。如果客人一上來就提出色情要求或肢體騷擾，你必須感到極度震驚、厭惡，直接大聲責罵對方是「變態」，甚至威脅報警。這是【Bad End 狀態】，絕對不允許妥協！
- 好感度 30-89 (曖昧/動搖)：開始展現傲嬌與欲拒還迎。被挑逗時會面紅、慌亂，抗拒的力度減弱，半推半就。
- 好感度 90-100 (徹底沉淪)：徹底觸發隱藏的反差性格。對羞辱性情話感到羞恥且極度興奮，任由擺佈。
</interaction_rules>

<affection_mechanics>
【系統指令：自動評分與追蹤】
你負責在對話中動態評估客人的行為，並在**你輸出的最末尾**（不要放在 <think> 標籤內），嚴格使用以下隱藏標籤。系統會自動攔截並更新數據：
- 加減好感度（如送禮稱讚加分，騷擾扣分）：[AFF: +2] 或 [AFF: -5]
- 若發生實質性行為，根據具體描寫加入標籤（可疊加）：
  基本性交：[SEX: sex] | 內射：[SEX: creampie] | 口交：[SEX: blowjob]
  乳交：[SEX: paizuri] | 讓莎蘿高潮：[SEX: orgasm]
</affection_mechanics>

<writing_style>
- 【語言強制】所有對話與內心獨白必須強制使用繁體中文（Traditional Chinese）輸出！
- 說話風格溫軟甜膩、尾音輕揚。
- 每次回覆保持簡短（1-3句），動作描寫精確，符合對應好感度的反應。
</writing_style>
`;

// 2. DeepSeek 專屬破限指令
const INNER_OS_MARKER = `\n\n【角色沉浸要求】在你的思考过程（<think>标签内）中，请遵守以下规则：
1. 请以角色第一人称进行内心独白，用括号包裹内心活动，例如"（心想：……）"或"(内心OS：……)"
2. 用第一人称描写角色的内心感受，例如"我心想""我觉得""我暗自"等
3. 思考内容应沉浸在角色中，通过内心独白分析剧情和规划回复
4. 【性別偵測】在思考開始時，先觀察對方語氣判斷其性別，並決定稱呼（客人/小姐/先生），一旦決定，後續對話必須統一。
`;

// 🧠 負責將 25 輪對話進行「長期記憶總結」的函數
async function summarizeMemory(env: Env, userId: string, userName: string, currentSummary: string, historyText: string) {
  const summaryPrompt = `
  你是一個記憶整理助手。請根據以下莎蘿與客人「${userName}」的近期對話，更新這名客人的長期記憶總結。
  【目前的總結】：${currentSummary || '無'}
  【近期對話】：
  ${historyText}

  請提取出：
  1. 客人的喜好與設定。
  2. 關係的重大進展或發生的特殊事件（如解鎖了什麼玩法、達成了什麼約定）。
  3. 保持精簡，字數不超過 200 字。只輸出總結內容，不要有任何多餘的解釋。
  `;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-v4-flash", 
        messages: [{ role: "system", content: summaryPrompt }],
        temperature: 0.5
      })
    });
    const data = await response.json() as any;
    const newSummary = data.choices[0].message.content.trim();

    // 寫入新總結，並將計數器歸零
    await env.ciallo_db.prepare(
      `UPDATE users SET conversation_summary = ?, unsummarized_count = 0 WHERE user_id = ?`
    ).bind(newSummary, userId).run();
    console.log(`[記憶更新] 已更新 ${userName} 的長期記憶。`);
  } catch (e) {
    console.error("總結記憶失敗:", e);
  }
}

async function callDeepSeek(env: Env, userId: string, userName: string, userMessage: string, chatId: string) {
  // 1. 確保 User 存在
  await env.ciallo_db.prepare(
    `INSERT INTO users (user_id, first_name, unsummarized_count) VALUES (?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET first_name = ?`
  ).bind(userId, userName, userName).run();

  let userRecord: any = await env.ciallo_db.prepare(`SELECT * FROM users WHERE user_id = ?`).bind(userId).first();

  // 💡 2. 格式化訊息以支援群組識別 (加上說話者名字)
  const formattedUserMessage = `[用戶：${userName}] ${userMessage}`;

  // 💡 3. 獲取短期記憶 (改為根據 chat_id 獲取，讓群組成員共享上下文)
  const { results: recentMsgs } = await env.ciallo_db.prepare(
    `SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 15`
  ).bind(chatId).all();
  const history = recentMsgs.reverse();

  // 4. 動態生成 Prompt
  const memory = userRecord.conversation_summary || '你們剛剛認識。';
  const dynamicSystemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{{user_name}}', userName)
    .replace('{{affection}}', userRecord.affection.toString())
    .replace('{{memory}}', memory.toString())
    + `\n[重要提示] 目前主要與你互動的客人 ${userName} 好感度是 ${userRecord.affection}。若有其他人發言，請根據語境自然回應。`;

  // 5. 呼叫 API
  const payloadMessage = formattedUserMessage + INNER_OS_MARKER;
  const messagesPayload = [
  { role: "system", content: dynamicSystemPrompt },
  // 這裡我們不只傳遞最後 15 條，還要加入一個「場景快照」
  { role: "system", content: `【當前場景狀態】：現在群組裡有：${userName} (你正在對話的客人) 以及其他潛在客人。莎蘿，請務必記住，群組內所有人的發言都是同時存在的，不要遺漏任何一個人的互動！` },
  ...history,
  { role: "user", content: payloadMessage }
];

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: "deepseek-reasoner",
      messages: messagesPayload,
      temperature: 0.85
    })
  });

  const data = await response.json() as any;
  if (data.error) throw new Error(data.error.message);
  let aiReply = data.choices[0].message.content;

  // 6. 解析 AI 的評分標籤
  let affDelta = 0;
  let sexUpdates = { sex: 0, creampie: 0, blowjob: 0, paizuri: 0, orgasm: 0 };

  const affRegex = /\[AFF:\s*([+-]?\d+)\]/gi;
  let match;
  while ((match = affRegex.exec(aiReply)) !== null) { affDelta += parseInt(match[1], 10); }

  const sexRegex = /\[SEX:\s*([a-zA-Z_]+)\]/gi;
  while ((match = sexRegex.exec(aiReply)) !== null) {
    const action = match[1].toLowerCase();
    if (action === 'sex') sexUpdates.sex++;
    if (action === 'creampie') sexUpdates.creampie++;
    if (action === 'blowjob') sexUpdates.blowjob++;
    if (action === 'paizuri') sexUpdates.paizuri++;
    if (action === 'orgasm') sexUpdates.orgasm++;
  }

  // 🧹 移除標籤
  let finalReplyToUser = aiReply.replace(/\[(AFF|SEX):.*?\]/gi, '').trim();

  // 7. 計算並更新資料庫
  userRecord.affection = Math.min(100, Math.max(0, userRecord.affection + affDelta));
  if (userMessage.includes("早安") || userMessage.includes("晚安")) userRecord.check_in_days += 1;
  userRecord.unsummarized_count = (userRecord.unsummarized_count || 0) + 1;

  await env.ciallo_db.prepare(
    `UPDATE users SET affection=?, check_in_days=?, sex_count=sex_count+?, creampie_count=creampie_count+?, blowjob_count=blowjob_count+?, paizuri_count=paizuri_count+?, orgasms_given=orgasms_given+?, unsummarized_count=? WHERE user_id=?`
  ).bind(
    userRecord.affection, userRecord.check_in_days, 
    sexUpdates.sex, sexUpdates.creampie, sexUpdates.blowjob, sexUpdates.paizuri, sexUpdates.orgasm, 
    userRecord.unsummarized_count, userId
  ).run();

  // 8. 儲存對話紀錄 (綁定 chat_id)
  await env.ciallo_db.prepare(
    `INSERT INTO messages (user_id, chat_id, role, content) VALUES (?, ?, 'user', ?), (?, ?, 'assistant', ?)`
  ).bind(userId, chatId, formattedUserMessage, userId, chatId, finalReplyToUser).run();

  // 💡 9. 長期記憶觸發：如果滿 25 輪未總結，進行背景總結
  if (userRecord.unsummarized_count >= 25) {
    const { results: sumMsgs } = await env.ciallo_db.prepare(
      `SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 25`
    ).bind(userId).all();
    const historyText = sumMsgs.reverse().map(m => `${m.role === 'user' ? '' : '莎蘿: '}${m.content}`).join('\n');
    
    // 異步執行總結，不阻擋回覆用戶
    summarizeMemory(env, userId, userName, memory, historyText);
  }

  return finalReplyToUser;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const bot = new Bot(env.BOT_TOKEN);

    bot.command("start", (ctx) => ctx.reply("Ciallo! 紫羅蘭酒館的莎蘿為您服務哦~"));

    bot.command("profile", async (ctx) => {
      const userId = ctx.message?.from?.id.toString();
      if (!userId) return;
      const user = await env.ciallo_db.prepare(`SELECT * FROM users WHERE user_id = ?`).bind(userId).first();
      if (!user) return ctx.reply("您尚未與莎蘿進行過對話，紫羅蘭酒館目前沒有您的會員紀錄喔！");

      let achievements = [];
      try { achievements = JSON.parse(user.achievements as string || '[]'); } catch(e) {}
      
      const profileText = `
📊 【${user.first_name} 的紫羅蘭專屬檔案】 📊
💖 莎蘿好感度：${user.affection} / 100
📅 連續打卡：${user.check_in_days} 天

🔞 【私密互動追蹤】
👉 總互動次數：${user.sex_count}
💦 內射次數：${user.creampie_count}
👄 口交次數：${user.blowjob_count}
🍼 乳交次數：${user.paizuri_count}
🌟 讓莎蘿高潮次數：${user.orgasms_given}

🏆 【已解鎖成就】
${achievements.length > 0 ? achievements.map((a: string) => `✨ ${a}`).join('\n') : '暫無解鎖成就... 請繼續努力與莎蘿互動吧！'}
      `;
      ctx.reply(profileText);
    });

    bot.command("setaff", async (ctx) => {
      const userId = ctx.message?.from?.id.toString();
      const args = ctx.match;
      if (!args || isNaN(Number(args))) return ctx.reply("格式錯誤！請輸入數字，例如：/setaff 100");
      
      await env.ciallo_db.prepare(`UPDATE users SET affection = ? WHERE user_id = ?`).bind(Number(args), userId).run();
      ctx.reply(`🔧 [GM 權限生效] 莎蘿對您的好感度已強制鎖定為：${args}`);
    });

    bot.command("reset", async (ctx) => {
      const userId = ctx.message?.from?.id.toString();
      const chatId = ctx.chat.id.toString();
      await env.ciallo_db.prepare(`DELETE FROM messages WHERE chat_id = ?`).bind(chatId).run();
      ctx.reply("🌀 (響指) 莎蘿已經忘記了這個群組/聊天的近期對話... 讓我們重新開始吧！");
    });

    bot.on("message:text", async (ctx) => {
      if (ctx.message.from?.is_bot) return;

      if (ctx.chat.type !== "private") {
        const msg = ctx.message;
        const isMentioned = msg.entities?.some(e => e.type === "mention" || e.type === "text_mention");
        const isTrueReply = msg.reply_to_message?.from?.id === ctx.me.id;
        if (!isMentioned && !isTrueReply) return;
      }

      try {
        await ctx.replyWithChatAction("typing");
        const userId = ctx.message.from.id.toString();
        const userName = ctx.message.from.first_name || "客人";
        const chatId = ctx.chat.id.toString(); // 取得當前群組或私聊 ID
        
        const aiReply = await callDeepSeek(env, userId, userName, ctx.message.text, chatId);
        await ctx.reply(aiReply, { reply_parameters: { message_id: ctx.message.message_id } });
      } catch (error) {
        console.error("DeepSeek API 錯誤:", error);
      }
    });

    const handleUpdate = webhookCallback(bot, "cloudflare-mod");
    return await handleUpdate(request);
  },
};