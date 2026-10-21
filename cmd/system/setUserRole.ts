import type { proto } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { jidNormalizedUser } from "baileys";
import { db } from "../../database/AuraDB.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const roles = ["user", "mod", "coowner", "owner"];

function getTarget(ctx: CommandContext): string | null {
  const message = ctx.msg?.message ?? {};
  const infos = Object.values(message)
    .map(
      (value) => (value as { contextInfo?: proto.IContextInfo })?.contextInfo,
    )
    .filter((info): info is proto.IContextInfo => Boolean(info));
  const target =
    infos.flatMap((info) => info.mentionedJid ?? [])[0] ??
    infos.find((info) => info.quotedMessage)?.participant;
  return target ? jidNormalizedUser(target) : null;
}

export default {
  name: ["setuserrole", "setrole", "userrole", "rol"],
  category: "system",
  description: t("cmd_asigna_un_rol_persistente_a_un_e93f423e"),
  ownerOnly: true,

  async run(ctx: CommandContext) {
    const role = String(ctx.args?.[0] ?? "").toLowerCase();
    const target = getTarget(ctx);

    if (!roles.includes(role) || !target) {
      return ctx.reply(
        t("cmd_uso_value0_setrole_user_mod_co_7fee5a44", { value0: ctx.usedPrefix ?? "." }),
      );
    }

    db.setRole(target, role);
    const targetUser = db.getUser(target);
    const roleName = role === "coowner" ? "co-owner" : role;
    let text = t("cmd_value0_6d3379fd", { value0: fytBold(t("cmd_gestion_de_roles_c49fbdeb")) });
    text += t("cmd_value0_d3d0980d", { value0: fytBold(t("cmd_rol_actualizado_00d559ac")) });
    text += t("cmd_text_bdfd7fa0");
    text += t("cmd_usuario_value0_7461d5bc", { value0: target.split("@")[0] });
    text += t("cmd_rol_value0_0e8d4454", { value0: roleName });
    text += t("cmd_persistencia_value0_c9fdfc3f", { value0: targetUser.role === role ? "guardado en DB" : "pendiente" });
    text += t("cmd_system_96040c03");
    return ctx.reply({ text, mentions: [target] });
  },
};
