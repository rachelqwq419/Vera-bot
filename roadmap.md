# Ciallo Bot 升級路線圖

> 最後更新：2026-05-24

---

## 目錄

1. [現有功能全覽](#一現有功能全覽)
2. [色情玩法擴展](#二色情玩法擴展)
3. [角色深度（更具人性化）](#三角色深度更具人性化)
4. [增值功能（更強存在感）](#四增值功能更強存在感)
5. [技術地基改善](#五技術地基改善)
6. [分階段路線圖](#六分階段路線圖)

---

## 一、現有功能全覽

### 核心系統

| 系統 | 說明 | 玩法 |
|------|------|------|
| AI 角色扮演 | 莎蘿 (Ciallo)，18 歲女高生 / 酒館兼職 | 直接打字對話，由 DeepSeek V4 Pro 驅動 |
| 動態場景 | 香港時間 (UTC+8) 自動切換 | 06-16h → 學校制服 / 16-24h → 酒館圍裙 / 00-06h → 家居睡衣 |
| 好感度系統 | 0-100 分，4 個關係階段 | 閒聊加分、調情扣分，AI 用 `[AFF: ±X]` 標籤自動判定 |
| 長期記憶 | 每 10 條對話觸發 AI 總結 | 自動提取喜好 (likes)、厭惡 (dislikes)、關係進展摘要 |
| 訊息速率限制 | 3 秒冷卻 | 防止惡意灌水 |
| 群組感知 | 需 @mention 或 reply bot | 避免群組內的噪音干擾 |

### 指令一覽

| 指令 | 功能 |
|------|------|
| `/start` | 歡迎訊息 |
| `/help` | 顯示所有可用指令 |
| `/profile` | 個人檔案（好感度、關係稱號、16 種性行為統計、成就列表、特殊時刻） |
| `/leaderboard` `/rank` `/top` | 好感度排行榜 Top 10 |
| `/daily` | 查看今日簽到狀態 |
| `/gifts` | 查看送過的禮物清單 |
| `/fortune` | 每日戀愛占卜（大吉 / 中吉 / 小吉 / 末吉 / 大凶） |
| `/shop` | 禮物（玫瑰、巧克力） |

### 自然語言觸發互動

| 行為 | 觸發方式 | 效果 |
|------|----------|------|
| 每日簽到 | 說「早安」「晚安」| 好感度 +2、簽到天數 +1 |
| 送玫瑰 | `/rose send` | 好感度 +5 |
| 送巧克力 | `/send chocolate` | 好感度 +3 |
| 酒館隨機事件 | 任何對話 4% 機率觸發 | 8 種環境事件（風聲、貓咪、雨聲、爐火…） |
| 成就解鎖 | 達到條件自動觸發 | 群組廣播訊息 + 特殊時刻記錄 |

### 性行為追蹤（16 種，AI 自動判定）

| 標籤 | 含義 | 標籤 | 含義 |
|------|------|------|------|
| `kiss` | 接吻 | `blowjob` | 口交 |
| `sex` | 基本性交 | `swallow` | 吞精 |
| `creampie` | 內射 | `handjob` | 手交 |
| `paizuri` | 乳交 | `footjob` | 足交 |
| `anal` | 後庭 (肛交) | `cum_face` | 顏射 |
| `cum_tits` | 射在胸上 | `orgasm` | 讓莎蘿高潮 |
| `public` | 公開場合 | `hair_pull` | 馬尾手柄 |
| `apron` | 圍裙 play | `submissive` | 腹黑臣服 |

### 成就系統（20 個）

**初次類**（10 個）：
初吻、初乳交、初內射、初口交、初吞精、初足交、初後入、初公開、顏射新人、胸部精液浴

**累計類**（8 個）：
乳交熟練 (×10)、內射愛好者 (×15)、口爆專家 (×20)、吞精達人 (×30)、馬尾手柄 (×5)、圍裙肉便器 (×10)、專屬精液容器（總性交 ×50）、腹黑臣服

**收集類** (1 個)：完全開發（5 種主要性玩法全解鎖）

### GM 工具（僅限管理員）

| 指令 | 功能 |
|------|------|
| `/setstat <欄位> <數值>` | 直接修改任何計數器，含審計日誌 |
| `/temp <0.0~2.0>` | 調整 AI 創造力（溫度參數） |
| `/reset` | 清除群組對話歷史 |

---

## 二、色情玩法擴展

目前 16 種追蹤偏向「動作類型」。可擴展兩個方向：**體位細化** 與 **情境 Play**。

### A. 體位細化（建議新增 SEX 標籤 + 計數 + 成就）

| 標籤 | 含義 | 可衍生成就 |
|------|------|-----------|
| `cowgirl` | 騎乘位（女上） | 「騎師：騎乘位累計 10 次」 |
| `reverse_cowgirl` | 反向騎乘 | 「背影殺手：反向騎乘 5 次」 |
| `doggy` | 後入（陰道，與 anal 區分） | 「汪系戀人：後入式 20 次」 |
| `missionary` | 正常位（傳教士） | 「最經典的愛：正常位 20 次」 |
| `standing` | 站立式 / 抱起 | 「無重力之愛：站立式 5 次」 |
| `against_wall` | 壁咚式 | 「牆壁上的痕跡」 |
| `sixty_nine` | 69 式（互相口交） | 「互相取悅：69 式 10 次」 |
| `deepthroat` | 深喉 | 「喉嚨深處：深喉 5 次」 |

### B. 情境 Play（可選計數，主打情境文本）

| 標籤 | 含義 | 趣味性說明 |
|------|------|-----------|
| `shower` | 浴室 Play | 蒸氣朦朧、濕身場景感 |
| `school_uniform` | 穿著校服被侵犯 | 高中生屬性強化，與時間場景連動 |
| `pantyhose` | 絲襪 Play | 足交進階變體 |
| `blindfold` | 蒙眼 | 感官剝奪，配合綁縛 |
| `bondage` | 捆綁（輕度） | 與 `submissive` 連動 |
| `spanking` | 打屁股 | 羞辱 + 痛感混合 |
| `collar` | 項圈 / 寵物 Play | 主僕關係深化 |
| `edging` | 寸止 / 邊緣控制 | 高難度，觸發特殊對話 |
| `toys` | 玩具 | 道具介入，劇情多樣化 |
| `exhibitionism` | 露出（裙底無內褲等） | 與 `public`、`school_uniform` 聯動 |

> **保守建議**：先增加體位類（doggy, cowgirl, 69, deepthroat），情境類挑選 3-4 個最符合莎蘿人設的（school_uniform, pantyhose, blindfold, shower）。全部追蹤太過臃腫，其他留作 AI 情境文本即可。

### C. 對應 Schema 變更

新增計數列於 `users` 表：
```sql
ALTER TABLE users ADD COLUMN cowgirl_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN reverse_cowgirl_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN doggy_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN missionary_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN standing_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN against_wall_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN sixty_nine_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN deepthroat_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN shower_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN school_uniform_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN pantyhose_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN blindfold_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN bondage_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN spanking_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN collar_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN edging_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN toys_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN exhibitionism_count INTEGER DEFAULT 0;
```

並同步更新：
- `types.ts` 中的 `UserRecord`
- `deepseek.ts` 中的 `s` 物件（SEX 標籤解析）
- `achievements.ts` 中的成就判定
- `constants.ts` 中的 `ALLOWED_SETSTAT_COLUMNS`
- `handlers.ts` 中 `/profile` 顯示
- System prompt 中的 `<affection_mechanics>` 區段
- `computeFavoritePlay` 的玩法列表

---

## 三、角色深度（更具人性化）

### A. 情緒系統

在 `users` 表加入 `mood` 欄位（`TEXT`，枚舉值），影響莎蘿回覆語氣：

| 心情 | 效果 |
|------|------|
| 😊 開心（預設） | 語氣輕快、尾音上揚 |
| 😳 害羞 | 多用「///」符號、說話斷斷續續 |
| 😤 生氣 | 冷淡回應、扣分加重、可能叫老闆 |

心情變化規則：
- 收到禮物 → 增加開心度
- 被粗魯對待（好感度 < 30 時） → 增加生氣度
- 好感度突破里程碑 → 增加開心度

> 技術：在 `deepseek.ts` 的 system prompt 注入當前 mood，並在 batch write 時更新 mood。

### B. 節日 / 季節感知
System prompt 注入當前日期資訊：

```
今天是 2026 年 5 月 21 日（星期四），夏季。
```

連動效果：
- 季節影響莎蘿的日常分享（夏天抱怨熱、冬天想喝熱可可）
- 節日（情人節、聖誕節、萬聖節）特殊對話
- TAVERN_EVENTS 根據天氣/季節權重調整

---

## 四、增值功能（更強存在感）

### A. 每日任務系統

每日隨機派發一個任務，完成有額外獎勵：

| 任務範例 | 獎勵 |
|----------|------|
| 🌹 送莎蘿一朵花 | 好感度 +3|
| 💬 向莎蘿分享一個秘密 | 好感度 +2|
| 🎲 與莎蘿玩一個小遊戲 | 好感度 +2 |
| ❓ 問莎蘿一個關於她自己的問題 | 好感度 +1 |

指令：`/quest` 查看今日任務、`/quest status` 查看完成狀態。

### B. 酒館經濟系統

引入虛擬貨幣「酒館金幣」(`coins`)：

禮物商店改為用金幣購買：
- 巧克力 → 10 金幣 (對莎蘿回覆 reply:「/coin send 10」)
- 玫瑰 → 30 金幣 (對莎蘿回覆 reply:「/coin send 30」)

新指令：
- `/shop` — 購買禮物（使金幣更具意義）

### C. 更多排行榜

製造競爭感，令群組持續活躍：

| 指令 | 排行榜內容 |
|------|-----------|
| `/rank` | 好感度（現有） |
| `/rank sex` | 總性交次數 |
| `/rank achievements` | 成就解鎖數量 |

## 五、分階段路線圖

### Phase 1 — 即刻執行（低成本高回報）

**目標**：擴展色情玩法，無基礎設施成本

| 項目 | 工作內容 |
|------|---------|
| 新增 4 個體位標籤 | `doggy`, `cowgirl`, `sixty_nine`, `deepthroat` |
| 新增 6 個對應成就 | 每種體位：初次 + 累計 |
| 新增 4 個情境標籤（不計數） | `school_uniform`, `shower`, `blindfold`, `pantyhose` |
| 更新 Schema | D1 migration：新增 columns |
| 更新 System Prompt | `<affection_mechanics>` 區段加入新標籤說明 |
| 更新所有相關模組 | types, constants, deepseek, achievements, handlers, computeFavoritePlay |
| `/rank sex` 等排行榜 | 簡單 SQL 查詢 |

---

### Phase 2 — 短期（提升互動頻率）
**目標**：讓用戶有「每天都想過來」的動機

| 項目 | 工作內容 |
|------|---------|
| 情緒系統 | `users` 表增加 `mood` 欄位 + prompt 注入 + 心情變化邏輯 |
| 每日任務 | `daily_quests` 表 + `/quest` 指令 + 隨機任務生成 |

**預計工作量**：~600-800 行改動，需新增 1 張 D1 表

---

### Phase 3 — 中期（角色深度 + 群組活躍度）

**目標**：將莎蘿由「被動聊天機器人」進化為「有記憶、有主見的群組成員」

| 項目 | 工作內容 |
|------|---------|
| 節日 / 季節感知 | prompt 注入日期 + 季節 + TAVERN_EVENTS 權重調整 |
| 更多排行榜 | `/rank sex` `/rank achievements` |

---

## 附錄：檔案結構現狀

```
src/
  index.ts          — 入口（17 行）
  types.ts          — Env, UserRecord 型別
  constants.ts      — 所有常數、禮物商店、酒館事件、占卜語
  prompts.ts        — SYSTEM_PROMPT_TEMPLATE, INNER_OS_MARKER
  achievements.ts   — checkAchievements, computeFavoritePlay
  utils.ts          — getAffectionTitle, recordSpecialMoment, logAdminAction
  memory.ts         — summarizeMemory
  deepseek.ts       — callDeepSeek 核心
  handlers.ts       — registerHandlers（全部指令 + 訊息處理）
```

---

*本文件由 DeepSeek TUI 生成，作為 Ciallo Bot 的長期發展藍圖。*
