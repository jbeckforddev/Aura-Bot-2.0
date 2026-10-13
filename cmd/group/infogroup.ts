import type { GroupMetadata, GroupParticipant } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["infogroup", "infogp", "ingp", "gp"],
  category: "group",
  description: t("cmd_muestra_la_informacion_detalla_50855395"),
  groupOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.groupMeta) {
      return ctx.reply(t("cmd_no_se_pudo_obtener_la_informac_3121a681"));
    }
    const metadata = ctx.groupMeta;
    const participants = Array.isArray(metadata.participants)
      ? metadata.participants
      : [];
    const admins = participants
      .filter((participant: GroupParticipant) => Boolean(participant.admin))
      .map((participant: GroupParticipant) => participant.id)
      .filter(Boolean);
    const description = metadata.desc || "Sin descripción.";
    const date = metadata.creation
      ? new Date(metadata.creation * 1000).toLocaleString("es-ES")
      : "Desconocida";
    let text = t("cmd_value0_value1_ced76f78", { value0: fytBold(t("cmd_group_info_b599221d")), value1: fytBold(t("cmd_detalles_del_grupo_fb6c4f2a")) });
    text += t("cmd_value0_value1_value2_value3_va_4e9642bb", { value0: fytBold(t("cmd_nombre_e68491e9")), value1: metadata.subject || ctx.groupName || "Grupo", value2: fytBold(t("cmd_id_89f89c02")), value3: ctx.from.split("@")[0], value4: fytBold(t("cmd_creacion_4e62d930")), value5: date, value6: fytBold(t("cmd_creador_12da1ded")), value7: String(metadata.owner || "").split("@")[0] });
    text += t("cmd_value0_value1_value2_value3_va_843bde42", { value0: fytBold(t("cmd_estadisticas_c367bc15")), value1: fytBold(t("cmd_miembros_e9ff2e67")), value2: participants.length, value3: fytBold(t("cmd_admins_ed6b5243")), value4: admins.length });
    text += t("cmd_value0_value1_80c859ae", { value0: fytBold(t("cmd_descripcion_ed10605e")), value1: description });
    text += t("cmd_value0_value1_value2_a63745fe", { value0: fytBold(t("cmd_administradores_511f49d2")), value1: admins.map((jid: string) => `┃ ➪ @${jid.split("@")[0]}`).join("\n"), value2: fytBold(t("cmd_aura_reed_95dcfb15")) });
    return ctx.reply({
      text,
      mentions: [metadata.owner, ...admins].filter(Boolean) as string[],
    });
  },
};
