import { Bot } from "grammy";
import type { Env } from "../shared/types";

import { registerCallbackEvents } from "./callback";
import { registerNewMemberEvents } from "./newMember";
import { registerTopicEvents } from "./topic";
import { registerMessageEvents } from "./message";

export function registerAllEvents(bot: Bot, env: Env, execCtx: ExecutionContext) {
  registerCallbackEvents(bot, env);
  registerNewMemberEvents(bot, env);
  registerTopicEvents(bot, env);
  registerMessageEvents(bot, env, execCtx);
}
