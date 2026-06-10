import type { Env } from "./types";

/**
 * 呼叫 ComfyUI 產生自拍
 * @returns 如果是提交任務，返回 { prompt_id: string }；如果是查詢結果，返回 Uint8Array 或 null
 */
export async function drawWithComfyUI(env: Env, positivePrompt: string, negativePrompt: string, existingPromptId?: string): Promise<any> {
  const COMFYUI_URL = "https://mills-myself-few-respective.trycloudflare.com";
  const clientId = crypto.randomUUID();
  let prompt_id = existingPromptId;

  try {
    if (!prompt_id) {
      // 1. 構建 ComfyUI 任務 JSON
      const workflow = {
        "3": { "inputs": { "seed": Math.floor(Math.random() * 1000000000000), "steps": 29, "cfg": 5.5, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1, "model": ["25", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] }, "class_type": "KSampler" },
        "5": { "inputs": { "width": 1024, "height": 1344, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
        "6": { "inputs": { "text": positivePrompt, "clip": ["25", 1] }, "class_type": "CLIPTextEncode" },       
        "7": { "inputs": { "text": negativePrompt, "clip": ["25", 1] }, "class_type": "CLIPTextEncode" },       
        "8": { "inputs": { "samples": ["3", 0], "vae": ["11", 2] }, "class_type": "VAEDecode" },
        "9": { "inputs": { "filename_prefix": "VeraBot", "images": ["8", 0] }, "class_type": "SaveImage" },   
        "11": { "inputs": { "ckpt_name": "WAI_NSFW-illustrious_NSFW-illustrious-SDXL_16.safetensors" }, "class_type": "CheckpointLoaderSimple" },
        "16": { "inputs": { "lora_name": "USNR STYLE.safetensors", "strength_model": 0.6, "strength_clip": 1, "model": ["11", 0], "clip": ["11", 1] }, "class_type": "LoraLoader" },
        "25": { "inputs": { "lora_name": "SatouMatsuzaka_HappySugarLife.safetensors", "strength_model": 0.6, "strength_clip": 1, "model": ["33", 0], "clip": ["33", 1] }, "class_type": "LoraLoader" },
        "33": { "inputs": { "lora_name": "748cmSDXL (2).safetensors", "strength_model": 0.3, "strength_clip": 1, "model": ["16", 0], "clip": ["16", 1] }, "class_type": "LoraLoader" },
        "36": { "inputs": { "model_name": "realesrganX4plusAnime_v1.pt" }, "class_type": "UpscaleModelLoader" },
        "42": { "inputs": { "upscale_model": ["36", 0], "image": ["8", 0] }, "class_type": "ImageUpscaleWithModel" },
        "43": { "inputs": { "pixels": ["48", 0], "vae": ["11", 2] }, "class_type": "VAEEncode" },
        "45": { "inputs": { "seed": Math.floor(Math.random() * 1000000000000), "steps": 20, "cfg": 7, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 0.45, "model": ["25", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["43", 0] }, "class_type": "KSampler" },
        "46": { "inputs": { "samples": ["45", 0], "vae": ["11", 2] }, "class_type": "VAEDecode" },
        "47": { "inputs": { "filename_prefix": "VeraBot_Final", "images": ["46", 0] }, "class_type": "SaveImage" },
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
        throw new Error(`COMFYUI_MISSING_ID`);
      }
      return { prompt_id: data.prompt_id };
    }

    // 2. 查詢任務進度
    const historyRes = await fetch(`${COMFYUI_URL}/history/${prompt_id}`);
    if (!historyRes.ok) return null;

    const history = await historyRes.json() as any;
    if (history[prompt_id]) {
      const historyData = history[prompt_id];
      const outputs = historyData.outputs;

      let nodeToTry = outputs["47"];
      if (!nodeToTry || !nodeToTry.images || nodeToTry.images.length === 0) {
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
    console.error("ComfyUI 錯誤:", error);
    return null;
  }
}

/**
 * 發送照片到 Telegram API (用於後台異步回調)
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
  if (!response.ok) throw new Error(`TG_SEND_FAIL: ${response.status}`);
  const data = await response.json() as any;
  return data.result?.photo?.pop()?.file_id || null;
}
