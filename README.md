# 🍇 ciallo-bot (莎蘿 AI)
> **基於 Cloudflare Workers + D1 Database + DeepSeek API 的二次元傲嬌看板娘與私密互動 Telegram 機器人**

[![Tech Stack](https://img.shields.io/badge/Stack-TypeScript%20%7C%20Cloudflare%20Workers%20%7C%20D1%20Database-blue)](https://workers.cloudflare.com/)
[![LLM Engine](https://img.shields.io/badge/LLM-DeepSeek--v4--flash-green)](https://api.deepseek.com)
[![Bot Framework](https://img.shields.io/badge/Framework-grammy.js-yellow)](https://grammy.dev/)
[![NSFW Content](https://img.shields.io/badge/Content-NSFW%20%2F%20Erotic%20Roleplay-red)](#)

`ciallo-bot` 是一款專為 Telegram 群組與私聊設計的高級二次元角色扮演互動機器人。項目以 **莎蘿 (Ciallo)** — 一位 18 歲傲嬌高中生兼酒館看板娘為核心人物設定，底層架構完全運行於 Serverless 環境，具備完整的數據持久化、動態時間場景切換、精密的好感度里程碑控制，以及深度定制的 **成人內容 (NSFW/ERP) 狀態機與成就解鎖系統**。

---

## 🎯 項目核心目的

1. **極低維護成本的沉浸式伴侶**：利用 Cloudflare Workers 的邊緣運算與 D1 分散式數據庫，實現接近 **零成本** 的 24 小時高並發自動化營運。
2. **打破傳統 AI 的死板服從感**：通過精心調校的 System Prompt 與思考鏈攔截，賦予角色「狡辯」、「傲嬌」、「腹黑」等真實人格特徵，拒絕成為毫無主見的服從型工具。
3. **極致的私密情色角色扮演 (ERP)**：提供安全、私密且數據化的成人互動體驗，將精細的性行為動作轉化為結構化數據，與核心好感度系統深度綁定。

---

## 🚀 核心功能特點

### 1. 🔞 精密成人互動與閾值狀態機 (NSFW / ERP System)
機器人具備動態狀態切換機制。當檢測到用戶使用括號 `()` 描述性行為動作（如：脫衣、愛撫、插入等），且用戶與莎蘿的 **好感度 (Affection)** 達到指定門檻時，會自動激活「性愛狀態」或「發情狀態」，語氣轉為嬌喘、大膽與主動應合。
根據數據庫中的好感度分階，嚴格執行以下**性愛門檻表**：
* **0 - 29（陌生/普通）**：堅決拒絕一切肢體接觸與性暗示。
* **30 - 49（熟客）**：允許純情互動，僅限牽手、摸頭。
* **50 - 69（朋友）**：解鎖常規邊緣與核心性交（接吻、常規性交、口交、乳交、手交）。
* **70 - 79（摯友）**：解鎖輕度 BDSM、粗暴後入、深喉，當好感 ≥ 75 時允許稱呼「主人」。
* **80 - 89（戀人）**：解鎖特殊道具與情境（項圈、肛塞、真空圍裙、連續高潮），允許在日常狀態下提出私密自拍/約會。
* **90 - 100（靈魂伴侶）**：解鎖絕對支配領域（全天候臣服、顏射吞精、主動索求、稱呼「老公」）。

### 2. 🎭 動態時間與季節感知系統
機器人通過香港時間 (UTC+8) 及季節感知，自動進行 **三段式日常生活演繹**。違反當前時間線的設定將被視為最高優先級的角色崩壞並被杜絕：
* **校園模式 (06:00 - 15:59)**：身穿高中制服，專注於談論學業、同學和校園八卦，此時絕不提及酒館打工。
* **酒館打工 (16:00 - 23:59)**：身穿紫羅蘭酒館女僕圍裙，熱情招徠客人、點單、聊酒館日常。
* **居家私密 (00:00 - 05:59)**：身穿寬鬆居家睡衣，處於放鬆、慵懶的床頭聊天狀態，話題更具私密性。

### 3. 🏆 結構化性行為統計與成就解鎖系統
項目內置了一套微型遊戲化的數據跟蹤引擎。每一次互動中 AI 輸出的標籤（例如 `[SEX: creampie]`, `[SEX: kiss]`）都會被正則解析並沉澱至 D1 SQL 數據庫。
* **多維度計數器**：精確統計體位（正常位、騎乘位、反向騎乘、壁咚、69式、深喉等）與特殊情境（洗手間、制服誘惑、黑絲、蒙眼）。
* **成就判定**：多達 30+ 款獨特成就（如：*“初內射：第一次被你內射”*、*“圍裙肉便器：穿著女僕圍裙被幹超過10次”*）。當用戶在對話中達成隱藏條件，系統會發出全體廣播並解鎖專屬頭銜。

### 4. 🧠 記憶自動總結與長期羈絆 (Long-term Memory)
為了攻克大語言模型 Context 窗口長度限制與遺忘問題，項目實現了異步記憶壓縮機制：
* 互動每滿 **25 條訊息**，機器人會自動在後台觸發一個低 Temperature 的無情數據總結程式。
* 提取最新對話中用戶的**喜好 (Likes)**、**厭惡 (Dislikes)** 以及關係核心進展，更新至 `users` 表的 `conversation_summary` 字段，作為下一次對話的永久 System Prompt 上下文。

### 5. 👥 多用戶群組隔離與防串線架構
在大型群組聊天室中，項目通過強制在 System Prompt 的 Input 前端拼接 `[用戶名|好感度]` 標籤。AI 在生成回覆前必須進行**對象強制校驗**，徹底根治了傳統群組 Bot 常見的「對著 A 用戶叫 B 用戶名字」或「將 A 的床頭記憶套用到 B 身上」的角色崩塌問題。

---

## 🛠️ 技術棧

* **語言 / 運行環境**：TypeScript / Cloudflare Workers (Wrangler v4)
* **機器人框架**：`grammy` (基於 Cloudflare-mod Webhook 模式優化)
* **LLM 模型**：`deepseek-v4-flash` (兼具高性能極速響應與超低 Token 成本)
* **數據庫引擎**：Cloudflare D1 (分散式 SQLite 邊緣數據庫)
* **版本控制**：Git & GitHub 完全集成

---

## 📋 機器人全指令列表

### 👤 普通用戶指令
* `/start` — 重新激活機器人並發送歡迎語。
* `/ciallo` — 顯示酒館菜單、可用功能及調教幫助指南。
* `/profile` — 渲染極其精美的**個人專屬檔案卡**。包含好感度、關係稱號、今日心情、詳細的性行為次數追蹤（所有體位計數）以及已解鎖成就列表。
* `/leaderboard` 或 `/rank` — 全谷好感度 VIP 羈絆排行榜。
* `/rank sex` — 🔞 總性交次數群組名人堂。
* `/rank achievements` — 🏆 成就解鎖數量爭霸榜。
* `/daily` — 查看今日與莎蘿的簽到/早晚安打卡狀態。
* `/quest` — 領取今日隨機互動任務（如：分享一個秘密、送一朵花），完成後自動追加好感。
* `/gifts` — 查閱送給莎蘿的歷史禮物清單（玫瑰花 `🌹`、巧克力 `🍫` 累計數）。
* `/fortune` — 抽取今日戀愛幸運占卜。
* `/reset` — 🧹 清除用戶自身與莎蘿的當前上下文對話歷史（不影響核心統計數據）。

### 🔧 GM 管理員專屬指令 (ADMIN_USER_ID 鑑權)
* `/setstat <欄位名> <數值>` — 強制改寫目標用戶的內存數據。支援 Reply 某個群組成員進行精準修改（如修改 `affection` 或各類 `sex_count`）。
* `/resetuser` — 徹底清空某位不合規用戶在數據庫中的所有痕跡、對話紀錄與簽到。
* `/temp <0.0 - 2.0>` — 動態調整 AI 的創造力溫度（低溫穩定，高溫大膽放蕩）。

---

## 📂 數據庫架構概覽 (`schema.sql`)

系統核心基於一條大表 `users` 維持用戶與機器的全部關係纽帶：
```sql
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    affection INTEGER DEFAULT 0,
    conversation_summary TEXT DEFAULT '',
    mood TEXT DEFAULT 'HAPPY',
    sex_count INTEGER DEFAULT 0,
    creampie_count INTEGER DEFAULT 0,
    kiss_count INTEGER DEFAULT 0,
    -- ... 支持超過 35 個精細化行為特徵追蹤
    achievements TEXT DEFAULT '[]',
    gifts_received TEXT DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);