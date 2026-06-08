import type { UserRecord } from "./types";

/** 🏆 成就判定系統 */
export function checkAchievements(user: UserRecord): string[] {
  let unlocked: string[] = [];
  try { unlocked = JSON.parse(user.achievements || '[]'); } catch (_e) { /* first run */ }

  const has = (name: string) => unlocked.includes(name);
  const add = (name: string) => unlocked.push(name);

  // ── 初次類成就 ──
  if (user.kiss_count >= 1 && !has("初吻：與你第一次接吻")) add("初吻：與你第一次接吻");
  if (user.paizuri_count >= 1 && !has("初乳交：第一次用巨乳為你乳交")) add("初乳交：第一次用巨乳為你乳交");
  if (user.creampie_count >= 1 && !has("初內射：第一次被你內射")) add("初內射：第一次被你內射");
  if (user.blowjob_count >= 1 && !has("初口交：第一次為你口交")) add("初口交：第一次為你口交");
  if (user.swallow_count >= 1 && !has("初吞精：第一次吞下你的精液")) add("初吞精：第一次吞下你的精液");
  if (user.footjob_count >= 1 && !has("初足交：第一次用腳服侍你")) add("初足交：第一次用腳服侍你");
  if (user.anal_count >= 1 && !has("初後入：第一次被你從後面進入")) add("初後入：第一次被你從後面進入");
  if (user.public_sex_count >= 1 && !has("初公開：第一次在公開場合")) add("初公開：第一次在公開場合");
  if (user.cum_on_face >= 1 && !has("顏射新人：第一次被你射在臉上")) add("顏射新人：第一次被你射在臉上");
  if (user.cum_on_tits >= 1 && !has("胸部精液浴：第一次被你射滿胸部")) add("胸部精液浴：第一次被你射滿胸部");
  if (user.cowgirl_count >= 1 && !has("騎師入門：第一次騎乘位")) add("騎師入門：第一次騎乘位");
  if (user.reverse_cowgirl_count >= 1 && !has("背影殺手：第一次反向騎乘")) add("背影殺手：第一次反向騎乘");
  if (user.doggy_count >= 1 && !has("汪系初戀：第一次後入式")) add("汪系初戀：第一次後入式");
  if (user.missionary_count >= 1 && !has("經典之愛：第一次正常位")) add("經典之愛：第一次正常位");
  if (user.standing_count >= 1 && !has("無重力體驗：第一次站立式")) add("無重力體驗：第一次站立式");
  if (user.against_wall_count >= 1 && !has("牆壁上的痕跡：第一次壁咚式")) add("牆壁上的痕跡：第一次壁咚式");
  if (user.sixty_nine_count >= 1 && !has("互相取悅：第一次69式")) add("互相取悅：第一次69式");
  if (user.deepthroat_count >= 1 && !has("喉嚨深處：第一次深喉")) add("喉嚨深處：第一次深喉");

  // ── 累計類成就 ──
  if (user.paizuri_count >= 10 && !has("乳交熟練：與你乳交累計10次")) add("乳交熟練：與你乳交累計10次");
  if (user.creampie_count >= 15 && !has("內射愛好者：被你內射累計15次")) add("內射愛好者：被你內射累計15次");
  if (user.blowjob_count >= 20 && !has("口爆專家：為你口交累計20次")) add("口爆專家：為你口交累計20次");
  if (user.swallow_count >= 30 && !has("吞精達人：累計吞下你的精液30次")) add("吞精達人：累計吞下你的精液30次");
  if (user.hair_pull_count >= 5 && !has("馬尾手柄：被你抓住雙馬尾做愛5次")) add("馬尾手柄：被你抓住雙馬尾做愛5次");
  if (user.apron_sex_count >= 10 && !has("圍裙肉便器：穿着女僕圍裙被你幹超過10次")) add("圍裙肉便器：穿着女僕圍裙被你幹超過10次");
  if (user.sex_count >= 50 && !has("專屬精液容器：與你總性交超過50次")) add("專屬精液容器：與你總性交超過50次");
  if (user.submissive_count >= 1 && !has("腹黑臣服：被你羞辱時主動求你繼續")) add("腹黑臣服：被你羞辱時主動求你繼續");
  if (user.cowgirl_count >= 10 && !has("騎師：騎乘位累計10次")) add("騎師：騎乘位累計10次");
  if (user.reverse_cowgirl_count >= 5 && !has("背影殺手：反向騎乘5次")) add("背影殺手：反向騎乘5次");
  if (user.doggy_count >= 20 && !has("汪系僕從：後入式20次")) add("汪系僕從：後入式20次");
  if (user.missionary_count >= 20 && !has("經典之愛：正常位20次")) add("經典之愛：正常位20次");
  if (user.standing_count >= 5 && !has("無重力之愛：站立式5次")) add("無重力之愛：站立式5次");
  if (user.sixty_nine_count >= 10 && !has("互相取悅：69式10次")) add("互相取悅：69式10次");
  if (user.deepthroat_count >= 5 && !has("喉嚨深處：深喉5次")) add("喉嚨深處：深喉5次");

  // ── 收集類成就 ──
  const fullyDeveloped = user.paizuri_count > 0 && user.creampie_count > 0 && user.blowjob_count > 0 && user.handjob_count > 0 && user.footjob_count > 0;
  if (fullyDeveloped && !has("完全開發：與你解鎖全部主要性玩法")) add("完全開發：與你解鎖全部主要性玩法");

  return unlocked;
}

/** 從計數器計算最愛玩法 */
export function computeFavoritePlay(u: Pick<UserRecord,
  "creampie_count" | "blowjob_count" | "paizuri_count" | "footjob_count" | "handjob_count" | "anal_count" |
  "cowgirl_count" | "reverse_cowgirl_count" | "doggy_count" | "missionary_count" |
  "standing_count" | "against_wall_count" | "sixty_nine_count" | "deepthroat_count"
>): string {
  const plays: Record<string, number> = {
    "內射": u.creampie_count || 0,
    "口交": u.blowjob_count || 0,
    "乳交": u.paizuri_count || 0,
    "足交": u.footjob_count || 0,
    "手交": u.handjob_count || 0,
    "後庭": u.anal_count || 0,
    "騎乘位": u.cowgirl_count || 0,
    "反向騎乘": u.reverse_cowgirl_count || 0,
    "後入式": u.doggy_count || 0,
    "正常位": u.missionary_count || 0,
    "站立式": u.standing_count || 0,
    "壁咚式": u.against_wall_count || 0,
    "69式": u.sixty_nine_count || 0,
    "深喉": u.deepthroat_count || 0,
  };
  const maxPlay = Object.entries(plays).reduce((a, b) => a[1] > b[1] ? a : b);
  return maxPlay[1] > 0 ? maxPlay[0] : "尚未開發";
}
