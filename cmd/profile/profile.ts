import type { CommandContext } from "../../types/index.d.ts";
import { profileTarget, sendProfilePreview } from "../../core/profileConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["profile", "perfil", "me"],
  description: t("cmd_muestra_el_perfil_global_d567848e"),
  category: "profile",
  async run(ctx: CommandContext) {
    const target = await profileTarget(ctx);
    return sendProfilePreview(ctx, target);
  },
};
