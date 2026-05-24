import type { Env } from "./types";

/**
 * 使用 Google Gemini 1.5 Flash 識別圖片內容
 * @param env 環境變數
 * @param base64Data 圖片的 base64 編碼數據
 * @param mimeType 圖片的 MIME 類型 (例如 image/jpeg)
 */
export async function analyzeImageWithGemini(env: Env, base64Data: string, mimeType: string): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing GEMINI_API_KEY");
    return "系統未配置圖像識別金鑰，莎蘿看不清楚呢...";
  }

  // 1. 定義要嘗試的模型列表 (優先使用 2.5，失效則回退到 1.5)
  const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let lastError = "";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: "你是一個專業的圖像描述與角色識別助手。如果圖片中包含知名的動漫、遊戲或現實人物，請務必先嘗試識別並給出確切的角色名稱與作品來源。接著請詳細描述這張圖片的內容，包括人物外貌特徵（髮色、瞳色）、服裝細節（如飾品、手套、鏈條等）、動作、背景以及整體的氛圍。你的描述將提供給一個扮演『莎蘿』的 AI 角色使用。請保持第三人稱客觀描述，字數建議在 150-200 字之間。"
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE"
        }
      ]
    };

    try {
      console.log(`📸 [Vision] 嘗試使用模型: ${model}`);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json() as any;
        lastError = errorData.error?.message || "Unknown error";
        console.warn(`⚠️ [Vision] 模型 ${model} 請求失敗: ${lastError}`);

        // 如果是 429 (限額已滿) 或 404 (模型不存在)，則嘗試下一個模型
        if (response.status === 429 || response.status === 404 || response.status === 400) {
          continue;
        }
        break; // 其他嚴重錯誤直接跳出
      }

      const data = await response.json() as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.warn(`[Vision] 模型 ${model} 回傳空內容`);
        continue;
      }

      console.log(`✨ [Vision] 使用模型 ${model} 識別成功`);
      return text.trim();
    } catch (error: any) {
      console.error(`Failed to analyze image with ${model}:`, error);
      lastError = error.message;
      continue;
    }
  }

  return `（莎蘿揉了揉眼睛，似乎看不清這張圖片... 最後錯誤: ${lastError}）`;
}

