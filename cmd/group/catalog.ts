import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


function getCategories(ctx: CommandContext): string[] {
  return [
    ...new Set<string>(
      (ctx.getPluginCategories?.() ?? []).map((category: string) =>
        category.toLowerCase(),
      ),
    ),
  ].sort();
}

export default {
  name: ["disable", "enable"],
  category: "group",
  description: t("cmd_activa_o_desactiva_un_catalogo_0b9501df"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    const action = String(ctx.cmdName || "").toLowerCase();
    const target = String(ctx.args?.[0] ?? "")
      .trim()
      .toLowerCase();
    const categories = getCategories(ctx);
    const group = ctx.db.getGroup(ctx.from);
    const disabled = Array.isArray(group.catBlocked)
      ? group.catBlocked.map((category: string) => category.toLowerCase())
      : [];
    if (!target) {
      return ctx.reply({
        text: t("cmd_value0_value1_value2_disable_c_190c0510", { value0: fytBold(t("cmd_cmd_manager_bd7eaeb8")), value1: fytBold(t("cmd_gestion_de_categorias_07c9e02f")), value2: ctx.usedPrefix || ".", value3: ctx.usedPrefix || ".", value4: categories.map((category) => `┃ > ${disabled.includes(category) ? "❌" : "✅"} ${category}`).join("\n"), value5: fytBold(t("cmd_system_29d43743")) }),
      });
    }

    if (!categories.includes(target)) {
      return ctx.reply({
        text: t("cmd_el_catalogo_value0_no_existe_u_afd3ba42", { value0: target, value1: ctx.usedPrefix || "." }),
      });
    }

    const shouldDisable = action === "disable";
    const nextDisabled = shouldDisable
      ? [...new Set([...disabled, target])]
      : disabled.filter((category: string) => category !== target);

    ctx.db.setGroup(ctx.from, { catBlocked: nextDisabled });
    let textCmd = t("cmd_value0_9db54f9b", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) })
    textCmd += t("cmd_value0_17cf0eab", { value0: shouldDisable ? "❌ CAT BLOQUEADO" : "✅ DESBLOQEADO" })
    textCmd += t("cmd_text_246f3d0d")
    textCmd += t("cmd_el_catalogo_value0_ha_sido_est_7aa710f2", { value0: target })
    textCmd += t("cmd_value0_para_este_grupo_3e1045da", { value0: shouldDisable ? "desactivado" : "activado" })
    textCmd += t("cmd_value0_f638ace7", { value0: fytBold(t("cmd_admin_system_19c2cc22")) })
    return ctx.reply({text: textCmd});
  },
};
