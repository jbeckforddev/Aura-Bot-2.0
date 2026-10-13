import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["restrictcmd", "cmdrestrict", "blockcmd"],
  category: "group",
  description: t("cmd_bloquea_o_desbloquea_un_comand_ab560ed1"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.isAdmin && !ctx.isMod && !ctx.isOwner)
      return ctx.reply({
        text: t("cmd_value0_value1_solo_los_adminis_ea920f8c", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_permiso_denegado_a479cad0")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    const group = ctx.db.getGroup(ctx.from);
    const args = ctx.args || [];
    const action = [
      "on",
      "off",
      "add",
      "remove",
      "list",
      "ls",
      "show",
    ].includes(String(args[0]).toLowerCase())
      ? String(args[0]).toLowerCase()
      : "toggle";
    const target = (action === "toggle" ? args[0] : args[1] || "")
      .replace(/^\./, "")
      .toLowerCase();
    const current = Array.isArray(group.restrictedCommands)
      ? group.restrictedCommands
      : [];
    if (["list", "ls", "show"].includes(action))
      return ctx.reply({
        text: t("cmd_value0_value1_value2_value3_7f66a43e", { value0: fytBold(t("cmd_restrictcmd_1de91c7d")), value1: fytBold(t("cmd_comandos_bloqueados_5778af3d")), value2: current.join("\n") || "┃ > Ningún comando restringido", value3: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    if (!target)
      return ctx.reply({
        text: t("cmd_value0_value1_uso_value2_restr_fc563950", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_comando_invalido_438fd1c0")), value2: ctx.usedPrefix || ".", value3: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    const enabled =
      ["on", "add"].includes(action) ||
      (action === "toggle" && !current.includes(target));
    ctx.db.setGroup(ctx.from, {
      restrictedCommands: enabled
        ? [...new Set([...current, target])]
        : current.filter((item: string) => item !== target),
    });
    return ctx.reply({
      text: t("cmd_value0_value1_value2_el_comand_c9c0f549", { value0: enabled ? "🔒" : "🔓", value1: fytBold(t("cmd_aura_reed_95dcfb15")), value2: fytBold(enabled ? "COMANDO BLOQUEADO" : "COMANDO HABILITADO"), value3: target, value4: enabled ? "restringido" : "habilitado", value5: fytBold(t("cmd_system_29d43743")) }),
    });
  },
};
