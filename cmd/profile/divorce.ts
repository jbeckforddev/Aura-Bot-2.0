import type { CommandContext } from "../../types/index.d.ts";
import {
  getProfile,
  setPendingProfileAction,
} from "../../core/profileConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["divorce", "divorcio"],
  description: t("cmd_termina_tu_matrimonio_276134cd"),
  category: "profile",
  async run(ctx: CommandContext) {
    const spouse = getProfile(ctx.sender).marriedTo;
    if (!spouse) return ctx.reply(t("cmd_no_tienes_pareja_registrada_5f617f7b"));
    setPendingProfileAction({ kind: "divorce", from: ctx.sender, to: spouse });
    return ctx.reply({
      text: t("cmd_value0_solicita_el_divorcio_re_55d7d1ab", { value0: ctx.sender.split("@")[0], value1: ctx.usedPrefix ?? ".", value2: ctx.usedPrefix ?? "." }),
      mentions: [ctx.sender, spouse],
    });
  },
};
