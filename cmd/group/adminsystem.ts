import type { GroupMetadata, GroupParticipant } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { formatDuration } from "../../utils/formatter.ts";

const status = (value: unknown): string =>
  value ? "✅ Activado" : "❌ Desactivado";
const onlyAdmin = (value: unknown): string =>
  value ? "🔒 Solo Admins" : "🔓 Todos";
const onlyAdminMembers = (value: unknown): string =>
  value ? "🔓 Todos" : "🔒 Solo Admins";

export default {
  name: ["adminsystem", "adminsys", "configgrupo", "groupconfig"],
  category: "group",
  description: "Muestra las configuraciones actuales del grupo.",
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.groupMeta) {
      return ctx.reply("❌ No se pudo obtener la información del grupo.");
    }
    const metadata = ctx.groupMeta;
    const participants = Array.isArray(metadata.participants)
      ? metadata.participants
      : [];
    const admins = participants.filter((participant: GroupParticipant) =>
      Boolean(participant.admin),
    );
    const group = ctx.db.getGroup(ctx.from);

    let text = `╭〔 ⚙️ ${fytBold("ADMIN SYSTEM")} 〕⬣\n`;
    text += `┃ 🏷️ ${fytBold(metadata.subject || ctx.groupName || "Grupo")}\n`;
    text += `╰━━━━━━━━━━━━⬣\n\n`;
    text += `┣━━〔 🛡️ ${fytBold("CONFIGURACIÓN")} 〕━⬣\n\n`;
    text += `┃ 🔒 ${fytBold("Edición del grupo")} › ${onlyAdmin(metadata.restrict)}\n`;
    text += `┃ 📢 ${fytBold("Grupo Cerrado")} › ${status(metadata.announce)}\n`;
    text += `┃ ✅ ${fytBold("Aprobación para unirse")} › ${status(metadata.joinApprovalMode)}\n`;
    text += `┃ ➕ ${fytBold("Añadir miembros")} › ${onlyAdminMembers(metadata.memberAddMode)}\n`;
    text += `┃ ⏳ ${fytBold("Mensajes temporales")} › ${metadata.ephemeralDuration ? formatDuration(Number(metadata.ephemeralDuration)) : "Desactivados"}\n\n`;
    text += `┣━━〔 🛡️ ${fytBold("FILTROS")} 〕━⬣\n\n`;
    text += `┃ 🔗 ${fytBold("Antilink")} › ${status(group.antilink)}\n`;
    text += `┃ 🟢 ${fytBold("Antiestado")} › ${status(group.antiStatus)}\n`;
    text += `┃ 🗑️ ${fytBold("Antitóxico")} › ${status(group.antiToxic)}\n`;
    text += `┃ 📞 ${fytBold("Antillamadas")} › ${status(group.antiCalls)}\n\n`;
    text += `┣━━〔 🌐 ${fytBold("TIPO DE GRUPO")} 〕━⬣\n\n`;
    text += `┃ 👥 ${fytBold("Miembros")} › ${participants.length}\n`;
    text += `┃ 🛡️ ${fytBold("Administradores")} › ${admins.length}\n`;
    text += `┃ 🏘️ ${fytBold("Comunidad")} › ${status(metadata.isCommunity)}\n`;
    text += `┃ 📣 ${fytBold("Anuncio de comunidad")} › ${status(metadata.isCommunityAnnounce)}\n\n`;
    text += `╰〔 ⚡ ${fytBold("SYSTEM INFO")} 〕⬣`;
    return ctx.reply({ text });
  },
};
