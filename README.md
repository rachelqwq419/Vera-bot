# 🔮 Vera-bot (薇拉)

[![](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](#-english-version) [![](https://img.shields.io/badge/語言-繁體中文-red?style=for-the-badge)](#-繁體中文版本)

---

## 🇺🇸 English Version

Vera-bot is an advanced, AI-driven Telegram group guide and interactive agent inspired by the character **Herta** from *Honkai: Star Rail*. Running on the bleeding edge of the Cloudflare ecosystem, Vera combines deep logical reasoning with long-term memory to provide a unique "simulated social observation" experience.

### ✨ Overview
Vera isn't just another chatbot. She is a **Simulated Social Experiment Overseer**. Designed with a cool, detached, and brilliant persona, she monitors group dynamics, interacts with "guests" (users), and maintains a persistent memory of every interaction. 

- **High Intelligence**: Driven by DeepSeek v4 Pro, capable of complex reasoning and dry wit.
- **Robust Engineering**: Built to handle high-traffic groups with zero duplicate replies and 100% webhook reliability.
- **Persistent Persona**: Maintains a strict "Herta-like" character across sessions, evolving based on her memory of you.

### 🏗️ System Architecture

```mermaid
graph TD
    User((Group Guest)) -->|Message| TG[Telegram API]
    TG -->|Webhook| CFW[Cloudflare Workers]
    
    subgraph "Vera Core Brain"
        CFW -->|Deduplication Shield| D1[(Cloudflare D1)]
        CFW -->|Memory Retrieval| VEC[(Cloudflare Vectorize)]
        CFW -->|Multimodal Processing| GEM[Google Gemini Vision]
        CFW -->|Reasoning & Dialogue| DS[DeepSeek v4 Pro]
        DS -->|Long-term Summarization| D1
    end
    
    CFW -->|Voice Generation| VS[GPT-SoVITS API]
    CFW -->|Visual Generation| CUI[ComfyUI Cloud]
    CFW -->|Real-time Feedback| TG
```

### 🌟 Core Features
- **Advanced Contextual Intelligence**: Understands triadic conversations and includes a custom D1-based deduplication shield.
- **Dynamic Memory & Archiving**: Dual-tier memory system (Internal logs + Concise Chinese summaries) and dynamic behavioral tags.
- **Intelligent Group Management**: Topic-aware automated welcome system and periodic observation reports.
- **Memory-Based Relationships**: Vera's attitude evolves naturally based on past interaction history.

### 🛠️ Tech Stack
- **Runtime**: Cloudflare Workers
- **AI/LLM**: DeepSeek v4 Pro, Gemini 1.5 Pro
- **Storage**: Cloudflare D1 (SQL), Cloudflare Vectorize (Vector)
- **Framework**: Grammy.js

---

## 🇭🇰 繁體中文版本

薇拉 (Vera-bot) 是一款受《崩壞：星穹鐵道》中「**黑塔**」啟發而設計的進階 AI Telegram 群組引導機器人。基於 Cloudflare 生態系的尖端技術，薇拉結合了深層邏輯推理與長期記憶系統，為群組提供獨特的「模擬社交觀測」體驗。

### ✨ 概覽
薇拉不只是一個普通的聊天機器人。她是「**模擬社交實驗的觀測者**」。她擁有冷靜、疏離且天才的人設，負責監控群組動態、與「客人」（用戶）互動，並對每一次交流保持持久的記憶。

- **高智能**: 由 DeepSeek v4 Pro 驅動，具備複雜的邏輯推理能力與乾冷的幽默感。
- **穩定工程**: 專為高流量群組設計，具備零重複回覆機制與 100% 的 Webhook 穩定性。
- **持久人設**: 在不同會話中保持嚴謹的「黑塔式」人設，並根據對妳的記憶而不斷進化。

### 🏗️ 系統架構

```mermaid
graph TD
    User((群組客人)) -->|發送訊息| TG[Telegram API]
    TG -->|Webhook| CFW[Cloudflare Workers]
    
    subgraph "核心大腦"
        CFW -->|去重護盾| D1[(Cloudflare D1)]
        CFW -->|記憶檢索| VEC[(Cloudflare Vectorize)]
        CFW -->|多模態處理| GEM[Google Gemini Vision]
        CFW -->|推理與對話| DS[DeepSeek v4 Pro]
        DS -->|長期總結| D1
    end
    
    CFW -->|語音合成| VS[GPT-SoVITS API]
    CFW -->|視覺生成| CUI[ComfyUI Cloud]
    CFW -->|即時回傳| TG
```

### 🌟 核心功能
- **進階上下文智能**: 具備「三人對話理解」能力，並內建 D1 去重護盾，徹底解決重複回覆問題。
- **動態記憶與歸檔**: 雙軌制記憶系統（內部詳細日誌 + 對外精簡摘要），自動賦予客人動態行為標籤。
- **智能群組管理**: 子頻道感知的全自動引導系統，以及定期的「群組觀察報告」。
- **動態關係評估**: 薇拉的態度不再是簡單的分數，而是根據歷史記憶產生的智力尊重或冷淡。

### 🛠️ 技術棧
- **運行環境**: Cloudflare Workers (Edge Runtime)
- **AI 引擎**: DeepSeek v4 Pro (核心), Gemini 1.5 Pro (視覺)
- **資料儲存**: Cloudflare D1 (SQL), Cloudflare Vectorize (向量記憶)
- **開發框架**: Grammy.js

---

## 🛠️ Command Reference | 指令手冊

| 指令 (Command) | 說明 (Description) | 權限 (Auth) |
| :--- | :--- | :--- |
| `/profile` | 檢視觀測日誌與標籤 (View observation log & tags) | 客人 (Guests) |
| `/fortune` | 今日概率運算 (Daily Fortune) | 客人 (Guests) |
| `/gi` | 群組觀察報告 (Group Impression Report) | 客人 (Guests) |
| `/purge_all_memory` | 終極重置系統 (Total Reset) | 創作者 (Admin) |
| `/setroomdesc` | 設定房間介紹 (Set room description) | 創作者 (Admin) |
| `/setroomorder` | 調整房間排序 (Set room sort order) | 創作者 (Admin) |

---

## 🚀 Quick Start | 快速開始

1. **Environment (環境)**: Copy `.dev.vars.example` to `.dev.vars` and fill in API keys.
2. **Database (資料庫)**: 
   ```bash
   npx wrangler d1 execute vera-db --remote --file=schema.sql
   npx wrangler d1 execute vera-db --remote --file=migrate_rooms.sql
   ```
3. **Deploy (部署)**: `npm run deploy`.

---

> *"Vera is observing your every move. Ensure your data remains interesting. vera~"*
