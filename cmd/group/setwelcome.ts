import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

const RESET_VALUES = new Set(["reset", "default"]);

function savedWelcome(group: unknown): string | null {
  if (!group || typeof group !== "object") return null;
  const record = group as Record<string, unknown>;
  const value = record.welcomeMessage ??
    (record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>).welcomeMessage
      : null);
  return typeof value === "string" && value.trim() ? value : null;
}

export default {
  name: ["setwelcome", "setbienvenida"],
  category: "group",
  description: t("cmd_personaliza_el_mensaje_de_bien_d3c0d38e"),
  groupOnly: true,
  adminOnly: false,

  async run(ctx: CommandContext) {
    const prefix = ctx.usedPrefix || ctx.prefix || ".";
    const value = typeof ctx.rawText === "string"
      ? ctx.rawText
      : (ctx.args || []).join(" ");
    const trimmed = value.trim();

    try {
      if (!trimmed) {
        const current = savedWelcome(await ctx.db.getGroup(ctx.from)) ||
          t("groupWelcomeDefaultLabel");
        return ctx.reply({
          text: t("cmd_value0_value1_value2_value3_va_4beb2be5", {
            value0: fytBold(t("cmd_setwelcome_aura_reed_938d86a1")),
            value1: fytBold(t("cmd_mensaje_personalizado_actual_57035f24")),
            value2: current,
            value3: fytBold(t("cmd_uso_del_comando_d40d70b4")),
            value4: prefix,
            value5: prefix,
            value6: fytBold(t("cmd_etiquetas_disponibles_1f89a800")),
            value7: fytBold(t("cmd_system_info_1a78a0cb")),
          }),
        });
      }

      if (RESET_VALUES.has(trimmed.toLowerCase())) {
        await ctx.db.setGroup(ctx.from, { welcomeMessage: null });
        if (savedWelcome(await ctx.db.getGroup(ctx.from))) {
          return ctx.reply(t("groupWelcomeResetError"));
        }
        return ctx.reply({
          text: t("cmd_value0_value1_se_usara_la_bien_5c63847b", {
            value0: fytBold(t("cmd_aura_reed_95dcfb15")),
            value1: fytBold(t("cmd_mensaje_restablecido_a207be7d")),
            value2: fytBold(t("cmd_system_info_1a78a0cb")),
          }),
        });
      }

      await ctx.db.setGroup(ctx.from, { welcomeMessage: value });
      const stored = savedWelcome(await ctx.db.getGroup(ctx.from));
      if (stored !== value) {
        return ctx.reply(t("groupWelcomeVerifyError"));
      }

      return ctx.reply({
        text: t("cmd_value0_value1_value2_value3_va_5467ec34", {
          value0: fytBold(t("cmd_aura_reed_95dcfb15")),
          value1: fytBold(t("cmd_bienvenida_personalizada_78949c22")),
          value2: fytBold(t("cmd_nueva_plantilla_9e11a7a6")),
          value3: value,
          value4: fytBold(t("cmd_system_info_1a78a0cb")),
        }),
      });
    } catch (error) {
      return ctx.reply(t("groupWelcomeSaveError", {
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  },
};
