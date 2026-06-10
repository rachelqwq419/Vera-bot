# 🍇 Vera-bot (薇拉 AI)

> **基於 Cloudflare Workers + D1 Database + DeepSeek API 的二次元傲嬌看板娘與社交互動 Telegram 機器人**

[![Tech Stack](https://img.shields.io/badge/Stack-TypeScript%20%7C%20Cloudflare%20Workers%20%7C%20D1%20Database-blue)](https://workers.cloudflare.com/)
[![LLM Engine](https://img.shields.io/badge/LLM-DeepSeek--V3-green)](https://api.deepseek.com)
[![Bot Framework](https://img.shields.io/badge/Framework-grammy.js-yellow)](https://grammy.dev/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Vera--bot-181717?logo=github)](https://github.com/rachelqwq419/Vera-bot)

`Vera-bot` 是一款專為 Telegram 平台設計的高級二次元角色扮演互動機器人。項目核心人物 **薇拉 (Vera)** 定位為一名 18 歲的傲嬌高中生兼酒館看板娘。本項目完全運行於 Serverless 環境，具備動態時間場景切換、長期記憶系統以及基於性別界定的社交互動邏輯。

---

## 🌟 角色核心設定：薇拉 (Vera)

薇拉擁有多重身份與鮮明的性格特徵，旨在提供極具沉浸感的互動體驗：

*   **性格標籤**：傲嬌 (Tsundere)、微毒舌 (Sharp-tongued)、外冷內熱。
*   **外貌特徵**：155cm，紫髮紫瞳，獨特的水母頭髮型（Jellyfish Cut）。
*   **交互原則**：
    *   **女性友好**：對女性用戶展現溫柔、害羞的一面，允許進行擁抱、摸頭等輕微親密互動。
    *   **男性防衛**：對男性用戶保持冷淡與防範，嚴格拒絕肢體接觸及任何冒犯行為。

---

## 🚀 核心功能特性

### 1. 🎭 動態場景與時間感知
系統會根據香港時間 (UTC+8) 自動切換薇拉的身份設定（校園/酒館/居家）、服裝描述及對話風格。

### 2. 💖 數據驅動的好感度系統
透過 D1 數據庫記錄用戶與薇拉的每一項互動：
*   **好感度分階**：從「陌生」到「親密羈絆」，薇拉的態度會隨數據等級提升而演變。
*   **性別界定社交**：系統會根據用戶性別調整社交邊界，確保護理級別的互動安全。

### 3. 🧠 長期記憶與數據壓縮
*   **記憶總結**：系統會自動對近期對話進行特徵提取與摘要，確保存儲核心羈絆。
*   **向量檢索**：利用 Vectorize 實現語義化記憶搜索，讓薇拉擁有「回憶」能力。

### 4. 📸 視覺數據傳輸
*   **圖像識別**：薇拉能透過「眼睛」(Gemini Vision) 看見用戶發送的圖片並給予評論。
*   **AI 自拍**：整合 ComfyUI 異步生成薇拉的各種生活照與酒館工作照。

---

## 📋 指令手冊

*   `/start` - 初始化與薇拉的數據連線。
*   `/vera` - 獲取薇拉的系統協議與幫助指南。
*   `/profile` - 渲染精美的個人專屬數據檔案卡。
*   `/daily` - 進行每日簽到與心情互動。
*   `/cg` - 查看已解鎖的視覺圖鑑（私聊專用）。
*   `/fortune` - 抽取今日戀愛占卜數據。

---

## 🛠️ 技術架構

*   **Runtime**: Cloudflare Workers
*   **Database**: Cloudflare D1 & Vectorize
*   **LLM Engine**: DeepSeek-V3 (Text) / Gemini-1.5-Flash (Vision)
*   **Image Gen**: ComfyUI API

---

## ⚠️ 免責聲明

本項目已移除所有露骨色情內容 (NSFW/SEX)。項目僅供娛樂及 AI 技術研究用途。請確保您的使用符合當地法律法規。

---
*© 2026 Vera Project. Created by 音 (Yin).*
