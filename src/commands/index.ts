import { Bot } from "grammy";
import type { Env } from "../shared/types";

import { registerStartCommands } from "./start";
import { registerAdminCommands } from "./admin";
import { registerRoomCommands } from "./room";
import { registerCgCommands } from "./cg";
import { registerUserCommands } from "./user";
import { registerEmergencyCommands } from "./emergency";

export function registerAllCommands(bot: Bot, env: Env) {
  registerStartCommands(bot, env);
  registerAdminCommands(bot, env);
  registerRoomCommands(bot, env);
  registerCgCommands(bot, env);
  registerUserCommands(bot, env);
  registerEmergencyCommands(bot, env);
}
