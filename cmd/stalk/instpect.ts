import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { formatDate } from "../../utils/formatter.ts";

const GROUP_INVITE_URL =
  /(?:https?:\/\/)?chat\.whatsapp\.com\/([0-9A-Za-z]{22,24})/i;
const CHANNEL_INVITE_URL =
  /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([0-9A-Za-z@._-]+)/i;

function formatError(message: string): string {
  return `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("INSPECCIÓN FALLIDA")}\n╰━━━━━━━━━━━━⬣\n\n┃ > ${message}\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`;
}

function formatAvailableDate(value: unknown): string {
  if (value === null || value === undefined || value === "")
    return "No disponible";
  return formatDate(value);
}

function getTextValue(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const text = (value as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  return fallback;
}

export default {
  name: ["inspect", "inspeccionar"],
  description: "Inspecciona un enlace de grupo, comunidad o canal de WhatsApp.",
  category: "herramientas",

  async run({ sock, text, reply }: CommandContext) {
    const link = text.trim();
    if (!link) {
      return reply(
        formatError(
          "Proporciona un enlace válido de grupo, comunidad o canal de WhatsApp.",
        ),
      );
    }

    const groupMatch = link.match(GROUP_INVITE_URL);
    if (groupMatch) {
      try {
        const groupMeta = await sock.groupGetInviteInfo(groupMatch[1]);
        const detalles = [
          `╭〔 🔍 ${fytBold("INSPECCIÓN DE GRUPO")} 〕⬣\n`,
          `┃ ${groupMeta.subject || "Grupo sin nombre"}\n`,
          `╰━━━━━━━━━━━━⬣\n\n`,
          `┃ 🆔 ${fytBold("ID")} › ${groupMeta.id}\n`,
          `┃ 👥 ${fytBold("Participantes")} › ${groupMeta.size ?? "No disponible"}\n`,
          `┃ 💫 ${fytBold("Fecha de creación")} › ${formatAvailableDate(groupMeta.creation)}\n`,
          `┣━━〔 ${fytBold("Descripción")} 〕━━⬣\n`,
          `┃ ${groupMeta.desc || "No hay descripción"}\n`,
          `\n╰━━━━━━━━━━━━⬣\n\n`,
          `┃ 🔗 ${fytBold("Enlace de invitación")} › ${link}\n\n`,
          `╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
        ];

        return reply(detalles.join(""));
      } catch {
        return reply(
          formatError(
            "No se pudo obtener información del grupo. Verifica que el enlace sea válido.",
          ),
        );
      }
    }

    const channelMatch = link.match(CHANNEL_INVITE_URL);
    if (channelMatch) {
      try {
        const channelMeta = await sock.newsletterMetadata(
          "invite",
          channelMatch[1],
        );
        if (!channelMeta) {
          return reply(
            formatError(
              "No se encontró el canal. Verifica que el enlace sea válido.",
            ),
          );
        }

        const rawMeta = channelMeta as typeof channelMeta &
          Record<string, unknown>;
        const threadMetadata = rawMeta.thread_metadata as
          | Record<string, unknown>
          | undefined;
          const nameMetadata = threadMetadata?.name as
            | Record<string, unknown>
            | undefined;
          const descriptionMetadata = threadMetadata?.description as
            | Record<string, unknown>
            | undefined;
        const creationTime =
          channelMeta.creation_time ?? threadMetadata?.creation_time;
        const name = getTextValue(
          channelMeta.name ?? threadMetadata?.name,
          "Canal sin nombre",
        );
        const description = getTextValue(
          channelMeta.description ?? threadMetadata?.description,
          "No hay descripción",
        );
        const subscribers =
          channelMeta.subscribers ??
          threadMetadata?.subscribers_count ??
          rawMeta.subscribers_count;
        const verification =
          channelMeta.verification ??
          threadMetadata?.verification ??
          rawMeta.verification;

        const verificationText = verification === "UNVERIFIED" ? "❌ No verificado" : verification === "VERIFIED" ? "✅ Verificado" : "No disponible";

        const detalles = [
          `╭〔 🔍 ${fytBold("INSPECCIÓN DE CANAL")} 〕⬣\n`,
          `┃ ${getTextValue(name, "Canal sin nombre")}\n`,
          `╰━━━━━━━━━━━━⬣\n\n`,
          `┃ 🆔 ${fytBold("ID")} › ${channelMeta.id}\n`,
          `┃ 👥 ${fytBold("Seguidores")} › ${subscribers || "No disponible"}\n`,
          `┃ 💫 ${fytBold("Fecha de creación")} › ${formatAvailableDate(creationTime)}\n`,
          `┃ ✏️ ${fytBold("Nombre actualizado")} › ${formatAvailableDate(nameMetadata?.update_time)}\n`,
          `┃ 📝 ${fytBold("Descripción actualizada")} › ${formatAvailableDate(descriptionMetadata?.update_time)}\n`,
          `┃ ${fytBold("Verificación")} › ${verificationText}\n`,
          `┣━━〔 ${fytBold("Descripción")} 〕━━⬣\n`,
          `┃ ${description}\n`,
          `\n╰━━━━━━━━━━━━⬣\n\n`,
          `┃ 🔗 ${fytBold("Enlace del canal")} › ${link}\n\n`,
          `╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
        ];

        return reply(detalles.join(""));
      } catch {
        return reply(
          formatError(
            "No se pudo obtener información del canal. Verifica que el enlace sea válido.",
          ),
        );
      }
    }

    return reply(
      formatError(
        "El enlace no tiene un formato reconocido de grupo o canal de WhatsApp.",
      ),
    );
  },
};
