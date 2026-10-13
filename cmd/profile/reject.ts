import type { CommandContext } from "../../types/index.d.ts";
import {
  clearPendingProfileAction,
  getPendingProfileAction,
} from "../../core/profileConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["reject", "rechazar", "decline", "no"],
  description: t("cmd_rechaza_una_propuesta_pendient_d78b0959"),
  category: "profile",
  async run(ctx: CommandContext) {
    const action =
      getPendingProfileAction("marry", ctx.sender) ??
      getPendingProfileAction("divorce", ctx.sender);
    if (!action)
      return ctx.reply(t("cmd_no_tienes_una_propuesta_pendie_b184f5ea"));

    clearPendingProfileAction(action);
    return ctx.reply(
      action.kind === "marry"
        ? t("cmd_la_propuesta_de_matrimonio_fue_a9320675")
        : t("cmd_la_solicitud_de_divorcio_fue_c_07bb4f3c"),
    );
  },
};
