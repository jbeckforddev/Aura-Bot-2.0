import type { proto } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { jidNormalizedUser } from "baileys";
import { db } from "../../database/AuraDB.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

const validRoles = ["user", "premium", "vip", "mod", "coowner", "owner"];

function getTarget(ctx: CommandContext, candidateArgs: string[]): string | null {
  const message = ctx.msg?.message ?? {};
  const infos = Object.values(message)
    .map(
      (value) => (value as { contextInfo?: proto.IContextInfo })?.contextInfo,
    )
    .filter((info): info is proto.IContextInfo => Boolean(info));
  const target =
    infos.flatMap((info) => info.mentionedJid ?? [])[0] ??
    infos.find((info) => info.quotedMessage)?.participant;
  if (target) return jidNormalizedUser(target);

  for (const arg of candidateArgs) {
    const digits = String(arg || "").replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return `${digits}@s.whatsapp.net`;
    }
  }
  return null;
}

export default {
  name: [
    "setuserrole",
    "setrole",
    "userrole",
    "rol",
    "addvip",
    "delvip",
    "addprem",
    "delprem",
  ],
  category: "system",
  description: t("cmd_asigna_un_rol_persistente_a_un_e93f423e"),
  ownerOnly: true,

  async run(ctx: CommandContext) {
    const invokedName = String(ctx.cmdName || "").toLowerCase();
    let role: string;
    let targetCandidateArgs: string[];

    if (["addvip", "addprem"].includes(invokedName)) {
      role = "premium";
      targetCandidateArgs = ctx.args ?? [];
    } else if (["delvip", "delprem"].includes(invokedName)) {
      role = "user";
      targetCandidateArgs = ctx.args ?? [];
    } else {
      const rawRole = String(ctx.args?.[0] ?? "").toLowerCase();
      role = rawRole === "vip" ? "premium" : rawRole;
      targetCandidateArgs = ctx.args?.slice(1) ?? [];
    }

    const target = getTarget(ctx, targetCandidateArgs);

    if (!validRoles.includes(role) || !target) {
      return ctx.reply(
        `Uso: ${ctx.usedPrefix ?? "."}setrole <user|premium|vip|mod|coowner|owner> @usuario/número\nO también: ${ctx.usedPrefix ?? "."}addvip @usuario / ${ctx.usedPrefix ?? "."}delvip @usuario`,
      );
    }

    db.setRole(target, role);
    const targetUser = db.getUser(target);
    const roleName = role === "coowner" ? "co-owner" : role === "premium" ? "VIP / Premium" : role;
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
