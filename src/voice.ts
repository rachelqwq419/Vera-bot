import { InputFile } from "grammy";
import type { Env } from "./types";

/**
 * 呼叫 GPT-SoVITS API 生成語音
 */
export async function generateVoice(env: Env, text: string): Promise<Uint8Array | null> {
  const VOICE_API_URL = env.VOICE_API_URL; // e.g., "https://ciallo-voice.trycloudflare.com"
  if (!VOICE_API_URL) return null;

  try {
    const url = new URL(VOICE_API_URL);
    
    // 根據 GPT-SoVITS V2 API 規範設定參數
    url.searchParams.append("text", text);
    url.searchParams.append("text_lang", "zh"); // 強制指定合成中文
    
    // 如果啟動 API 時沒有預設加載參考音頻，必須在這裡指定：
    // （姐姐大人需要根據最終選擇的聲線，在這裡填入對應的日文語音路徑和文字）
    // url.searchParams.append("ref_audio_path", "E:\\GPT-SOVITS\\參考音頻\\anon_sample.wav");
    // url.searchParams.append("prompt_text", "えっと、あのね..."); // 參考音頻說的日文
    // url.searchParams.append("prompt_lang", "ja"); // 參考音頻是日文

    const response = await fetch(url.toString(), {
      method: "GET",
    });

    if (!response.ok) {
      console.error(`TTS API Error: HTTP ${response.status} - ${await response.text()}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error("Voice Generation Request Failed:", error);
    return null;
  }
}
