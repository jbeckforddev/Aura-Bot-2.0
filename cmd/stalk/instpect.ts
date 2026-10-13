import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { formatDate } from "../../utils/formatter.ts";
import { t } from "../../src/langs/index.ts";


const GROUP_INVITE_URL =
  /(?:https?:\/\/)?chat\.whatsapp\.com\/([0-9A-Za-z]{22,24})/i;
const CHANNEL_INVITE_URL =
  /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([0-9A-Za-z@._-]+)/i;

function formatError(message: string): string {
  return `╭〔 ⚠️ ${fytBold(t("cmd_aura_reed_95dcfb15"))} 〕⬣\n┃ ❌ ${fytBold(t("cmd_inspeccion_fallida_2474e763"))}\n╰━━━━━━━━━━━━⬣\n\n┃ > ${message}\n\n╰〔 ⚡ ${fytBold(t("cmd_system_29d43743"))} 〕⬣`;
}

function formatAvailableDate(value: unknown): string {
  if (value === null || value === undefined || value === "")
    return t("cmd_no_disponible_9def5fe2");
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
  description: t("cmd_inspecciona_un_enlace_de_grupo_7ad2570a"),
  category: "herramientas",

  async run({ sock, text, reply }: CommandContext) {
    const link = text.trim();
    if (!link) {
      return reply(
        formatError(
          t("cmd_proporciona_un_enlace_valido_d_e30fc425"),
        ),
      );
    }

    const groupMatch = link.match(GROUP_INVITE_URL);
    if (groupMatch) {
      try {
        const groupMeta = await sock.groupGetInviteInfo(groupMatch[1]);
        const detalles = [
          `╭〔 🔍 ${fytBold(t("cmd_inspeccion_de_grupo_6b4d6361"))} 〕⬣\n`,
          `┃ ${groupMeta.subject || "Grupo sin nombre"}\n`,
          `╰━━━━━━━━━━━━⬣\n\n`,
          `┃ 🆔 ${fytBold(t("cmd_id_89f89c02"))} › ${groupMeta.id}\n`,
          `┃ 👥 ${fytBold(t("cmd_participantes_5bb68ad1"))} › ${groupMeta.size ?? "No disponible"}\n`,
          `┃ 💫 ${fytBold(t("cmd_fecha_de_creacion_2a3a94e6"))} › ${formatAvailableDate(groupMeta.creation)}\n`,
          `┣━━〔 ${fytBold(t("cmd_descripcion_7fda3970"))} 〕━━⬣\n`,
          `┃ ${groupMeta.desc || "No hay descripción"}\n`,
          `\n╰━━━━━━━━━━━━⬣\n\n`,
          `┃ 🔗 ${fytBold(t("cmd_enlace_de_invitacion_1b1a1130"))} › ${link}\n\n`,
          `╰〔 ⚡ ${fytBold(t("cmd_system_29d43743"))} 〕⬣`,
        ];

        return reply(detalles.join(""));
      } catch {
        return reply(
          formatError(
            t("cmd_no_se_pudo_obtener_informacion_d30694f0"),
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
              t("cmd_no_se_encontro_el_canal_verifi_a2f6a0f6"),
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
          t("cmd_canal_sin_nombre_d25edaef"),
        );
        const description = getTextValue(
          channelMeta.description ?? threadMetadata?.description,
          t("cmd_no_hay_descripcion_dd6a8dcd"),
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
          `╭〔 🔍 ${fytBold(t("cmd_inspeccion_de_canal_25034a32"))} 〕⬣\n`,
          `┃ ${getTextValue(name, t("cmd_canal_sin_nombre_d25edaef"))}\n`,
          `╰━━━━━━━━━━━━⬣\n\n`,
          `┃ 🆔 ${fytBold(t("cmd_id_89f89c02"))} › ${channelMeta.id}\n`,
          `┃ 👥 ${fytBold(t("cmd_seguidores_3010b39a"))} › ${subscribers || "No disponible"}\n`,
          `┃ 💫 ${fytBold(t("cmd_fecha_de_creacion_2a3a94e6"))} › ${formatAvailableDate(creationTime)}\n`,
          `┃ ✏️ ${fytBold(t("cmd_nombre_actualizado_f165521a"))} › ${formatAvailableDate(nameMetadata?.update_time)}\n`,
          `┃ 📝 ${fytBold(t("cmd_descripcion_actualizada_88f0f2ec"))} › ${formatAvailableDate(descriptionMetadata?.update_time)}\n`,
          `┃ ${fytBold(t("cmd_verificacion_0780e1eb"))} › ${verificationText}\n`,
          `┣━━〔 ${fytBold(t("cmd_descripcion_7fda3970"))} 〕━━⬣\n`,
          `┃ ${description}\n`,
          `\n╰━━━━━━━━━━━━⬣\n\n`,
          `┃ 🔗 ${fytBold(t("cmd_enlace_del_canal_012c5573"))} › ${link}\n\n`,
          `╰〔 ⚡ ${fytBold(t("cmd_system_29d43743"))} 〕⬣`,
        ];

        return reply(detalles.join(""));
      } catch {
        return reply(
          formatError(
            t("cmd_no_se_pudo_obtener_informacion_afecbffa"),
          ),
        );
      }
    }

    return reply(
      formatError(
        t("cmd_el_enlace_no_tiene_un_formato__89d71bf8"),
      ),
    );
  },
};
