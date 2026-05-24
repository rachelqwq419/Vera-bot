import { InputFile } from "grammy";
import type { Env } from "./types";

/**
 * 呼叫 GPT-SoVITS API 生成語音
 */
export async function generateVoice(env: Env, text: string): Promise<Uint8Array | null> {
  const VOICE_API_URL = env.VOICE_API_URL; // 妳需要在 wrangler.jsonc 或環境變數設定
  if (!VOICE_API_URL) return null;

  try {
    // 這裡的參數需要對應妳 GPT-SoVITS API 的格式
    // 預設常見格式為: /?text=...&text_language=...
    const url = new URL(VOICE_API_URL);
    url.searchParams.append("text", text);
    url.searchParams.append("text_lang", "zh"); // 或者是 "ja" / "en" / "auto"
    
    // 如果妳的 API 需要參考音頻，這裡可能需要額外參數，例如:
    // url.searchParams.append("ref_audio_path", "C:/path/to/ref.wav");
    // url.searchParams.append("prompt_text", "參考音頻的文字內容");
    // url.searchParams.append("prompt_lang", "zh");

    const response = await fetch(url.toString(), {
      method: "GET",
      // 有些 API 是 POST 請求，如果是 POST 則改為:
      // method: "POST",
      // headers: { "Content-Type": "application/json" },
      // body: JSON.stringify({ text, text_lang: "zh", ... })
    });

    if (!response.ok) {
      console.error("TTS API Error:", await response.text());
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error("Voice Generation Failed:", error);
    return null;
  }
}
