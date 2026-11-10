import type { UserRecord } from "./types";

/** 🏆 成就判定系統 (薇拉女僕版) */
export function checkAchievements(user: UserRecord): string[] {
  let unlocked: string[] = [];
  try { unlocked = JSON.parse(user.achievements || '[]'); } catch (_e) { /* first run */ }

  const has = (name: string) => unlocked.includes(name);
  const add = (name: string) => unlocked.push(name);

  // ── 社交里程碑 ──
  if (user.check_in_days >= 1 && !has("訪客登記：在酒館留下了愚蠢的第一印象")) add("訪客登記：在酒館留下了愚蠢的第一印象");
  if (user.check_in_days >= 7 && !has("觀察樣本：連續一週被薇拉毒舌")) add("觀察樣本：連續一週被薇拉毒舌");
  if (user.check_in_days >= 30 && !has("合格的勞動力：薇拉承認你還算耐用")) add("合格 the 勞動力：薇拉承認你還算耐用");

  // ── 互動類 ──
  let gifts: string[] = [];
  try { gifts = JSON.parse(user.gifts_received || '[]'); } catch { /* ignore */ }
  
  if (gifts.length >= 1 && !has("物資上繳：第一次為女僕長提供服務")) add("物資上繳：第一次為女僕長提供服務");
  if (gifts.length >= 10 && !has("後勤雜工：累計提供10次有用的物資")) add("後勤雜工：累計提供10次有用的物資");
  
  return unlocked;
}

/** 從計數器計算最活躍互動 */
export function computeFavoritePlay(u: UserRecord): string {
  if (u.check_in_days > 10) return "日常被懟";
  return "觀察中";
}
