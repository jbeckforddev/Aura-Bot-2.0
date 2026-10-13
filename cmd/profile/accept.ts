import type { CommandContext } from "../../types/index.d.ts";
import {
  clearPendingProfileAction,
  getPendingProfileAction,
  getProfile,
  updateProfile,
} from "../../core/profileConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["accept", "aceptar", "acepto"],
  description: t("cmd_acepta_una_propuesta_de_matrim_55ba4f0c"),
  category: "profile",
  async run(ctx: CommandContext) {
    const action =
      getPendingProfileAction("marry", ctx.sender) ??
      getPendingProfileAction("divorce", ctx.sender);
    if (!action)
      return ctx.reply(t("cmd_no_tienes_una_propuesta_pendie_b184f5ea"));

    if (action.kind === "marry") {
      if (
        getProfile(action.from).marriedTo ||
        getProfile(action.to).marriedTo
      ) {
        clearPendingProfileAction(action);
        return ctx.reply(
          t("cmd_la_propuesta_ya_no_puede_acept_8e4f2a5f"),
        );
      }
      updateProfile(action.from, { marriedTo: action.to });
      updateProfile(action.to, { marriedTo: action.from });
      clearPendingProfileAction(action);
      return ctx.reply({
        text: t("cmd_ahora_estan_casados_value0_y_v_bdf5b52c", { value0: action.from.split("@")[0], value1: action.to.split("@")[0] }),
        mentions: [action.from, action.to],
      });
    }

    const currentSpouse = getProfile(action.from).marriedTo;
    if (currentSpouse !== action.to && currentSpouse !== action.from) {
      clearPendingProfileAction(action);
      return ctx.reply(t("cmd_el_matrimonio_ya_no_coincide_c_7a5b6f68"));
    }

    updateProfile(action.from, { marriedTo: null });
    updateProfile(action.to, { marriedTo: null });
    clearPendingProfileAction(action);
    return ctx.reply(t("cmd_el_matrimonio_ha_terminado_por_ea7db165"));
  },
};
