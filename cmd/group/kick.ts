import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["kick", "sacar", "quitar", "expulsar", "limpiar"],
  category: "group",
  description: t("cmd_expulsa_integrantes_del_grupo_e8f33eb5"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const targets = context?.mentionedJid?.length
      ? context.mentionedJid
      : context?.participant
        ? [context.participant]
        : [];
    if (!targets.length)
      return ctx.reply({
        text: t("cmd_value0_value1_menciona_a_algui_7c0aca6b", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_accion_invalida_a2487ad8")), value2: ctx.usedPrefix || ".", value3: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });

    const metadata = await ctx.sock.groupMetadata(ctx.from);
    const adminIds = new Set(
      (metadata?.participants ?? [])
        .filter((participant) => participant.admin === "admin" || participant.admin === "superadmin")
        .map((participant) => participant.id.replace(/:\d+@/, "@"))
        .filter(Boolean),
    );

    const includesAdmin = targets.some((target) =>
      adminIds.has(target.replace(/:\d+@/, "@")),
    );
    if (includesAdmin) {
      return ctx.reply({
        text: t("cmd_kick_admin_prohibited"),
      });
    }

    await ctx.sock.groupParticipantsUpdate(ctx.from, targets, "remove");
    return ctx.reply({
      text: t("cmd_value0_value1_se_expulsaron_va_1b828d4b", { value0: fytBold(t("cmd_admin_system_19c2cc22")), value1: fytBold(t("cmd_limpieza_completada_a10b786c")), value2: targets.length, value3: fytBold(t("cmd_system_info_1a78a0cb")) }),
      mentions: targets,
    });
  },
};
