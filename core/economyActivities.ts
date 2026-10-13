import {
  addEconomyXp,
  economyUser,
  saveEconomy,
  formatMoney,
} from "./economyRuntime.ts";
import { cooldownText } from "./economyConfig.ts";
import { economyTexts } from "./economyTexts.ts";
import type { CommandContext } from "../types/commands.d.ts";
import { t } from "../src/langs/index.ts";


type EconomyTextsKey = keyof typeof economyTexts;

type ActivityOptions = {
  names: string[];
  description: string;
  title: string;
  icon: string;
  cooldown: number;
  reward: [number, number];
  xp: [number, number];
  success: string[];
  fail: string[];
};

const randomBetween = ([min, max]: [number, number]) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export function createEconomyActivity(options: ActivityOptions) {
  const key = options.names[0];
  const lastKey = `last${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return {
    name: options.names,
    category: "economy",
    description: options.description,
    async run(ctx: CommandContext) {
      const user = economyUser(ctx);
      const now = Date.now();
      const last = Number(user[lastKey] ?? 0);
      if (last && now - last < options.cooldown) {
        return ctx.reply(
          `⏳ Estás cansado. Vuelve en *${cooldownText(options.cooldown - (now - last))}*.`,
        );
      }

      const xp = randomBetween(options.xp);
      const success = Math.random() > 0.3;
      const reward = success ? randomBetween(options.reward) : 0;
      user[lastKey] = now;
      user.bolsillo += reward;
      saveEconomy(ctx, ctx.sender, user);
      addEconomyXp(ctx.sender, xp);

      const configuredTexts = (
        economyTexts as Record<
          string,
          string[] | { success?: string[]; fail?: string[] }
        >
      )[key];
      const isTextArray = Array.isArray(configuredTexts);
      const successTexts = isTextArray
        ? configuredTexts
        : configuredTexts?.success;
      const failTexts = isTextArray ? undefined : configuredTexts?.fail;
      const successMessage = successTexts?.length
        ? successTexts
        : options.success;
      const failMessage = failTexts?.length ? failTexts : options.fail;

      let text = t("core_value0_value1_f5f66371", { value0: options.icon, value1: options.title });
      text += t("core_hola_value0_aura_ganado_value1_2bc80777", { value0: ctx.sender.split("@")[0], value1: xp });
      text += success
        ? t("core_value0_value1_f333d265", { value0: successMessage[Math.floor(Math.random() * successMessage.length)], value1: formatMoney(reward, ctx) })
        : t("core_value0_17cf0eab", { value0: failMessage[Math.floor(Math.random() * failMessage.length)] });
      text += t("core_saldo_actual_value0_babe4597", { value0: formatMoney(user.bolsillo, ctx) });
      return ctx.reply({ text, mentions: [ctx.sender] });
    },
  };
}
