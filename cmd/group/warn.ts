import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["warn", "advertir", "aviso"],
  category: "group",
  description: t("cmd_anade_una_advertencia_a_un_usu_f31f2e81"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const target = context?.mentionedJid?.[0] || context?.participant;
    if (!target)
      return ctx.reply({
        text: t("cmd_value0_value1_etiqueta_o_respo_5baa97ba", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_objetivo_d2546e73")), value2: ctx.usedPrefix || ".", value3: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    const reason = (ctx.args || [])
      .filter((arg: string) => !arg.includes("@"))
      .join(" ")
      .trim();
    if (!reason)
      return ctx.reply({
        text: t("cmd_value0_value1_debes_especifica_913f6360", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_motivo_aca64357")), value2: ctx.usedPrefix || ".", value3: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    const group = ctx.db.getGroup(ctx.from);
    const warns =
      group.warns && typeof group.warns === "object" ? group.warns : {};
    const history = Array.isArray(warns[target]) ? [...warns[target]] : [];
    const date = new Date().toLocaleDateString("es-CR", {
      timeZone: "America/Costa_Rica",
    });
    history.push({ reason, date });
    ctx.db.setGroup(ctx.from, { warns: { ...warns, [target]: history } });
    const limit = group.warnLimit || 3;
    if (history.length >= limit) {
      await ctx.sock
        .groupParticipantsUpdate(ctx.from, [target], "remove")
        .catch(() => undefined);
      ctx.db.setGroup(ctx.from, { warns: { ...warns, [target]: [] } });
      return ctx.reply({
        text: t("cmd_value0_usuario_value1_warns_va_79acb3ee", { value0: fytBold(t("cmd_limite_de_advertencias_alcanza_5120cd2b")), value1: target.split("@")[0], value2: history.length, value3: limit, value4: date, value5: fytBold(t("cmd_warn_system_820d59db")) }),
        mentions: [target],
      });
    }
    return ctx.reply({
      text: t("cmd_value0_usuario_value1_admin_va_8058646f", { value0: fytBold(t("cmd_advertencia_7b976a81")), value1: target.split("@")[0], value2: ctx.sender.split("@")[0], value3: history.length, value4: limit, value5: reason, value6: date, value7: fytBold(t("cmd_warn_system_820d59db")) }),
      mentions: [target, ctx.sender],
    });
  },
};
