import type { CommandContext } from "../../types/index.d.ts";
import { getProfile, profileTarget } from "../../core/profileConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["lvl", "level", "nivel", "rango"],
  description: t("cmd_muestra_tu_rango_aura_44267a47"),
  category: "profile",
  async run(ctx: CommandContext) {
    const target = await profileTarget(ctx);
    const aura = Number(getProfile(target).aura ?? 0);
    return ctx.reply({
      text: t("cmd_aura_value0_nivel_aura_value1_53a1602d", { value0: aura, value1: Math.floor(aura / 100) + 1 }),
      mentions: [target],
    });
  },
};
