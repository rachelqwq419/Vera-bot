import type { Env } from "./types";

/**
 * 封裝 ComfyUI 調用邏輯
 * @returns 如果是新提交任務，回傳 { prompt_id: string }；如果是檢查狀態，回傳 Uint8Array 或 null
 */
export async function drawWithComfyUI(env: Env, positivePrompt: string, negativePrompt: string, existingPromptId?: string): Promise<any> {
  const COMFYUI_URL = "https://mills-myself-few-respective.trycloudflare.com";
  const clientId = crypto.randomUUID();
  let prompt_id = existingPromptId;

  try {
    if (!prompt_id) {
      // 1. 定義工作流模板
      const workflow = {
        "3": { "inputs": { "seed": Math.floor(Math.random() * 1000000000000), "steps": 29, "cfg": 5.5, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1, "model": ["25", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] }, "class_type": "KSampler" },
        "5": { "inputs": { "width": 1024, "height": 1344, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
        "6": { "inputs": { "text": positivePrompt, "clip": ["25", 1] }, "class_type": "CLIPTextEncode" },
        "7": { "inputs": { "text": negativePrompt, "clip": ["25", 1] }, "class_type": "CLIPTextEncode" },
        "8": { "inputs": { "samples": ["3", 0], "vae": ["11", 2] }, "class_type": "VAEDecode" },
        "9": { "inputs": { "filename_prefix": "CialloBot", "images": ["8", 0] }, "class_type": "SaveImage" },
        "11": { "inputs": { "ckpt_name": "WAI_NSFW-illustrious_NSFW-illustrious-SDXL_16.safetensors" }, "class_type": "CheckpointLoaderSimple" },
        "16": { "inputs": { "lora_name": "薄塗り USNR STYLE.safetensors", "strength_model": 0.6, "strength_clip": 1, "model": ["11", 0], "clip": ["11", 1] }, "class_type": "LoraLoader" },
        "25": { "inputs": { "lora_name": "SatouMatsuzaka_HappySugarLife.safetensors", "strength_model": 0.6, "strength_clip": 1, "model": ["33", 0], "clip": ["33", 1] }, "class_type": "LoraLoader" },
        "33": { "inputs": { "lora_name": "748cmSDXL (2).safetensors", "strength_model": 0.3, "strength_clip": 1, "model": ["16", 0], "clip": ["16", 1] }, "class_type": "LoraLoader" },
        "36": { "inputs": { "model_name": "realesrganX4plusAnime_v1.pt" }, "class_type": "UpscaleModelLoader" },
        "42": { "inputs": { "upscale_model": ["36", 0], "image": ["8", 0] }, "class_type": "ImageUpscaleWithModel" },
        "43": { "inputs": { "pixels": ["48", 0], "vae": ["11", 2] }, "class_type": "VAEEncode" },
        "45": { "inputs": { "seed": Math.floor(Math.random() * 1000000000000), "steps": 20, "cfg": 7, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 0.45, "model": ["25", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["43", 0] }, "class_type": "KSampler" },
        "46": { "inputs": { "samples": ["45", 0], "vae": ["11", 2] }, "class_type": "VAEDecode" },
        "47": { "inputs": { "filename_prefix": "CialloBot_Final", "images": ["46", 0] }, "class_type": "SaveImage" },
        "48": { "inputs": { "upscale_method": "nearest-exact", "scale_by": 0.38, "image": ["42", 0] }, "class_type": "ImageScaleBy" }
      };

      const promptRes = await fetch(`${COMFYUI_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify({ prompt: workflow, client_id: clientId })
      });

      if (!promptRes.ok) {
        const errorText = await promptRes.text();
        throw new Error(`COMFYUI_HTTP_ERROR: ${promptRes.status} - ${errorText}`);
      }

      const data = await promptRes.json() as any;
      if (!data.prompt_id) {
        const bodyStr = JSON.stringify(data);
        throw new Error(`COMFYUI_MISSING_ID: Server returned no prompt_id. Body: ${bodyStr}`);
      }
      return { prompt_id: data.prompt_id }; 
    }

    // ── 檢查狀態模式 ──
    const historyRes = await fetch(`${COMFYUI_URL}/history/${prompt_id}`);
    if (!historyRes.ok) return null;
    
    const history = await historyRes.json() as any;
    if (history[prompt_id]) {
      const historyData = history[prompt_id];
      const outputs = historyData.outputs;
      
      // 🚀 高清優先邏輯：優先抓取 Node 47 (高品質輸出)，若無則回退至 Node 9 (標準輸出)
      let nodeToTry = outputs["47"];
      if (!nodeToTry || !nodeToTry.images || nodeToTry.images.length === 0) {
        console.log(`ℹ️ [ComfyUI] Node 47 未就緒，嘗試回退至 Node 9...`);
        nodeToTry = outputs["9"];
      }
      
      if (nodeToTry && nodeToTry.images && nodeToTry.images.length > 0) {
        const filename = nodeToTry.images[0].filename;
        const imageRes = await fetch(`${COMFYUI_URL}/view?filename=${filename}&subfolder=&type=output`);
        if (imageRes.ok) {
          const arrayBuffer = await imageRes.arrayBuffer();
          return new Uint8Array(arrayBuffer);
        }
      }
    }
    return null;
  } catch (error) {
    console.error("ComfyUI 通訊失敗:", error);
    return null;
  }
}

/**
 * 直接透過 Telegram API 發送圖片 (用於後台任務)
 * @returns 回傳 Telegram 的 file_id
 */
export async function sendPhotoToTelegram(token: string, chatId: string, photo: Uint8Array, caption: string, threadId?: number): Promise<string | null> {
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("caption", caption);
  if (threadId) formData.append("message_thread_id", threadId.toString());
  
  const file = new File([photo], "selfie.jpg", { type: "image/jpeg" });
  formData.append("photo", file);

  const response = await fetch(url, { method: "POST", body: formData });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TG_SEND_FAIL: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json() as any;
  // 提取最高畫質的 file_id
  const fileId = data.result?.photo?.pop()?.file_id;
  return fileId || null;
}

