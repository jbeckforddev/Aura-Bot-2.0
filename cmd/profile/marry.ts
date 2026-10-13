import type { CommandContext } from "../../types/index.d.ts";
import {
  profileTarget,
  getProfile,
  setPendingProfileAction,
} from "../../core/profileConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["marry", "casarse", "matrimonio"],
  description: t("cmd_propone_matrimonio_a_un_usuari_e1eecfcf"),
  category: "profile",
  async run(ctx: CommandContext) {
    const target = await profileTarget(ctx);
    if (target === ctx.sender)
      return ctx.reply(t("cmd_debes_mencionar_a_otra_persona_8ed54372"));
    if (getProfile(ctx.sender).marriedTo || getProfile(target).marriedTo)
      return ctx.reply(t("cmd_uno_de_los_dos_ya_tiene_pareja_61edc02f"));
    setPendingProfileAction({ kind: "marry", from: ctx.sender, to: target });
    return ctx.reply({
      text: t("cmd_value0_te_propone_matrimonio_r_6992445e", { value0: ctx.sender.split("@")[0], value1: ctx.usedPrefix ?? ".", value2: ctx.usedPrefix ?? "." }),
      mentions: [ctx.sender, target],
    });
  },
};
