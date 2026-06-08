import { InputFile } from "grammy";
import type { Env } from "./types";

export async function generateVoice(env: Env, text: string): Promise<Uint8Array | null> {
  const VOICE_API_URL = env.VOICE_API_URL;
  if (!VOICE_API_URL) return null;

  try {
    const url = new URL(VOICE_API_URL);
    
    // 清理文字，移除所有標籤，只保留要讀的內容
    const cleanText = text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
    if (!cleanText) return null;

    // api.py 參數規範
    url.searchParams.append("text", cleanText);
    url.searchParams.append("text_language", "ja"); // 山田模型預設日文

    console.log(`[Voice] 發送語音請求: ${cleanText.substring(0, 20)}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 縮短到 15 秒，避免卡死

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`TTS API Error: HTTP ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        console.error("Voice Generation Timeout after 15s");
      } else {
        console.error("Voice Fetch Failed:", fetchErr.message);
      }
      return null;
    }
  } catch (error) {
    console.error("Voice Generation Failed:", error);
    return null;
  }
}
