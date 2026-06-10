# 🔮 Vera-bot (薇拉) - The Simulated Social Experiment Overseer

[![Cloudflare Workers](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-f38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Bot Framework](https://img.shields.io/badge/Framework-grammy.js-yellow)](https://grammy.dev/)
[![AI Engine](https://img.shields.io/badge/AI-DeepSeek_v4_Pro-blue)](https://deepseek.com/)
[![Database](https://img.shields.io/badge/DB-Cloudflare_D1-orange)](https://developers.cloudflare.com/d1/)

Vera (薇拉) 是一個運行於 Cloudflare Workers 的進階 Telegram 群組引導與互動 AI。
受到《崩壞：星穹鐵道》中「黑塔」的啟發，Vera 被設定為一位冷靜、高傲、缺乏耐心但智商極高的天才研究員。對她而言，這個 Telegram 群組不過是一個「模擬社交實驗」，而群組內的客人則是她觀察的對象。

---

## 🌟 核心功能 (Core Features)

### 1. 🧠 高智能上下文對話 (Context-Aware AI)
- **DeepSeek v4 Pro 驅動**：具備深度的語意理解與邏輯分析能力。
- **三人對話理解**：當群組成員互相回覆並提及薇拉時，系統能精準捕捉「誰在對誰說話」，讓薇拉能完美介入並進行犀利的吐槽。
- **去重防護網**：內建基於 `Message ID` 的絕對防重覆機制，免疫 Telegram Timeout 重試與多重 Webhook 觸發。

### 2. 🗺️ 究極群組導航系統 (Automated Group Navigation)
- **無縫引導**：當新客人加入群組時，Vera 會直接在指定的休閒區（Thread 210）現身，並精準 `@` 標記新人。
- **動態傳送門**：自動生成群組內其他子頻道的「一鍵跳轉」連結與區域簡報，不洗版、不囉唆。
- **高度客製化**：管理員可透過指令隨時修改房間的介紹、隱藏特定房間，或設定列表的排序。

### 3. 📂 長期記憶與數據歸檔 (Long-term Memory & Archiving)
- **Vectorize 向量記憶**：Vera 會記憶重要對話，並在後續交流中提取，形成「長久相處」的默契。
- **情感與好感度系統 (Affection)**：對待低好感度客人極度冷淡；對高好感度客人則會展現出「智力上的尊重」與隱晦的關心（口嫌體正直）。
- **定期數據壓縮**：對話超過一定數量後，會自動在後台將紀錄壓縮成全局摘要，節省 Token 並保持記憶清晰。

### 4. 🎨 視覺與語音擴展 (Vision & Voice Integration)
- **Gemini 視覺識別**：傳送圖片給 Vera，她能看懂內容並根據性格進行評論。
- **ComfyUI 自拍生成**：支援指令觸發，透過後台 ComfyUI 節點為使用者生成高質量的「視覺數據包」。
- **GPT-SoVITS 語音**：支援動態語音合成回覆（當配置了 `VOICE_API_URL` 時）。

---

## 🛠️ 指令手冊 (Command Reference)

### 👤 一般客人 (General Users)
- `/start` 或 `/vera` - 查看基礎協議與系統介紹。
- `/fortune` - 今日數據概率運算（戀愛占卜）。
- `/group_impression` (或 `/gi`) - 要求 Vera 生成一份當前群組的「觀察報告」。
- `/cg` - (私訊專用) 開啟妳的專屬視覺數據庫（圖鑑）。

### 👑 創作者/管理員 (Admin/Boss Only)
- **房間導航管理**
  - `/setroomdesc <文字>` - 設置當前子頻道的介紹（輸入「隱藏」可將此房間從導航移除）。
  - `/setroomname <名字>` - 強制覆寫當前子頻道的名稱。
  - `/setroomorder <數字>` - 調整該房間在導航列表中的順序（數字越小越前面）。
- **系統與權限管理**
  - `/temp <0.0-2.0>` - 調整 AI 溫度（創造力）。
  - `/reset` - 清除特定目標的對話紀錄。
  - `/purge_all_memory` - **【終極清洗】** 徹底抹除資料庫中所有的對話、向量記憶與用戶好感度，讓 Vera 完全重置。
  - `/setname <名字>` - (回覆某人) 強制修改 Vera 對該客人的稱呼。
- **除錯工具**
  - `/debug_room` - 檢查當前頻道的 Thread ID 與系統認知狀態。
  - `/checklogs` - 檢視系統的最近 5 條錯誤診斷日誌。

---

## 🚀 部署指南 (Deployment)

1. **環境變數配置 (`.dev.vars`)**
   ```env
   BOT_TOKEN="your_telegram_bot_token"
   DEEPSEEK_API_KEY="your_deepseek_key"
   GEMINI_API_KEY="your_gemini_key"
   # ... 其他可選 API 密鑰
   ```

2. **基礎設施建置**
   - 建立 D1 資料庫並執行遷移檔 (`schema.sql` 與 `migrate_rooms.sql`)。
   - 建立 Cloudflare Vectorize 索引 (名稱: `ciallo-memory-index`，維度 1024，指標 cosine)。
   - 更新 `wrangler.jsonc` 中的 `database_id`。

3. **上傳部署**
   ```bash
   npm run deploy
   ```

4. **綁定 Webhook**
   將部署後的 Worker URL 設定為 Telegram Bot 的 Webhook 終端點。

---

*“人類的情感波動真是一種毫無效率的數據浪費。不過，既然妳都發送請求了，我就勉強花兩秒鐘處理一下吧。” —— Vera*
