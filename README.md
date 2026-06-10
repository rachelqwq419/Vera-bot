# 🍇 Vera-bot (薇拉 AI)

> **基於 Cloudflare Workers + D1 Database + DeepSeek API 的二次元傲嬌看板娘與私密互動 Telegram 機器人**

[![Tech Stack](https://img.shields.io/badge/Stack-TypeScript%20%7C%20Cloudflare%20Workers%20%7C%20D1%20Database-blue)](https://workers.cloudflare.com/)
[![LLM Engine](https://img.shields.io/badge/LLM-DeepSeek--V3-green)](https://api.deepseek.com)
[![Bot Framework](https://img.shields.io/badge/Framework-grammy.js-yellow)](https://grammy.dev/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Vera--bot-181717?logo=github)](https://github.com/rachelqwq419/Vera-bot)

`Vera-bot` 是一款專為 Telegram 平台設計的高級二次元角色扮演互動機器人。項目核心人物 **薇拉 (Vera)** 定位為一名 18 歲的傲嬌高中生兼酒館看板娘。本項目完全運行於 Serverless 環境，結合了精密的好感度控制系統、動態時間場景切換、以及深度定制的成人內容 (NSFW/ERP) 狀態機。

---

## 🌟 角色核心設定：薇拉 (Vera)

薇拉擁有多重身份與鮮明的性格特徵，旨在提供極具沉浸感的互動體驗：

*   **性格標籤**：傲嬌 (Tsundere)、微毒舌 (Sharp-tongued)、外冷內熱。
*   **外貌特徵**：155cm，紫髮紫瞳，獨特的水母頭髮型（Jellyfish Cut）。
*   **動態身份**：
    *   **校園模式 (06:00 - 15:59)**：身著高中制服，話題聚焦於學業與校園生活。
    *   **酒館模式 (16:00 - 23:59)**：身著精緻的女僕裝，在「紫羅蘭酒館」擔任看板娘。
    *   **居家模式 (00:00 - 05:59)**：穿著寬鬆睡衣，展現放鬆且私密的一面。

---

## 🚀 核心功能特性

### 1. 🎭 動態場景與時間感知
系統會根據香港時間 (UTC+8) 自動切換薇拉的身份設定、服裝描述及對話風格。角色會嚴格遵守當前時間線的行為邏輯。

### 2. 💖 數據驅動的好感度系統
透過 D1 數據庫記錄用戶與薇拉的每一項互動：
*   **好感度分階**：從「陌生」到「終極忠誠」，薇拉的語氣、稱呼及解鎖動作會隨好感度提升而產生顯著變化。
*   **互動追蹤**：記錄簽到天數、禮物贈送次數及各類細節互動數據。

### 3. 🔞 精密 NSFW/ERP 狀態機
內置自動化標籤解析引擎，能識別用戶的動作描述並觸發相應的成人互動狀態。
*   **動作檢測**：自動識別接吻、撫摸、性行為等 30 餘種體位與情境。
*   **成就系統**：達成特定互動條件後，將自動解鎖成就並更新於用戶專屬檔案卡中。

### 4. 🧠 長期記憶與數據壓縮
*   **記憶總結**：系統每隔 25 條訊息會自動觸發非同步任務，對近期對話進行特徵提取與摘要，確保存儲核心羈絆。
*   **向量檢索**：利用 Vectorize 實現語義化記憶搜索，使薇拉能夠「記住」用戶的細節愛好。

---

## 🛠️ 技術架構

*   **Runtime**: Cloudflare Workers (TypeScript)
*   **Framework**: `grammy` (Telegram Bot API)
*   **Database**: Cloudflare D1 (SQL) & Vectorize (Vector Index)
*   **LLM Engine**: DeepSeek-V3 / Gemini-1.5-Flash (Vision)
*   **Image Gen**: ComfyUI API (後台異步生成自拍照)

---

## 📋 指令手冊

### 用戶端指令
*   `/start` - 初始化與薇拉的數據連線。
*   `/vera` - 獲取薇拉的系統協議與幫助指南。
*   `/profile` - 渲染精美的個人專屬數據檔案卡。
*   `/daily` - 進行每日簽到與心情互動。
*   `/cg` - 查看已解鎖的私密視覺圖鑑（私聊專用）。
*   `/fortune` - 抽取今日戀愛占卜數據。

### 管理員指令 (GM Only)
*   `/addkey` - 動態新增 DeepSeek API 通路。
*   `/setstat` - 手動修正用戶數據標籤。
*   `/adminstop` - 讓薇拉進入純粹觀察模式。

---

## 📦 部署指南

1.  **環境配置**：
    ```bash
    npm install
    ```
2.  **Secret 設置**：
    ```bash
    npx wrangler secret put BOT_TOKEN
    npx wrangler secret put DEEPSEEK_API_KEY
    ```
3.  **發布至生產環境**：
    ```bash
    npm run deploy
    ```

---

## ⚠️ 免責聲明

本項目內含成人內容 (NSFW) 互動邏輯，僅供娛樂及技術研究用途。請確保您的使用符合當地法律法規。

---
*© 2026 Vera Project. Created by 音 (Yin).*
