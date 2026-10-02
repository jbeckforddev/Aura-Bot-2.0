import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const GROUP_INVITE_URL =
	/(?:https?:\/\/)?chat\.whatsapp\.com\/([0-9A-Za-z]{22,24})/i;
const CHANNEL_INVITE_URL =
	/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([0-9A-Za-z@._-]+)/i;

function formatInspect(title: string, details: string[]): string {
	return `╭〔 🔍 ${fytBold("AURA REED")} 〕⬣\n┃ ${fytBold(title)}\n╰━━━━━━━━━━━━⬣\n\n${details.map((detail) => `┃ ${detail}`).join("\n")}\n\n╰〔 ⚡ ${fytBold("SYSTEM ACTIVE")} 〕⬣`;
}

function formatError(message: string): string {
	return `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("INSPECCIÓN FALLIDA")}\n╰━━━━━━━━━━━━⬣\n\n┃ > ${message}\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`;
}

export default {
	name: ["inspect", "inspeccionar"],
	description: "Inspecciona un enlace de grupo, comunidad o canal de WhatsApp.",
	category: "herramientas",

	async run({ sock, text, reply }: CommandContext) {
		const input = text.trim();
		if (!input) {
			return reply(
				formatError("Ingresa un enlace de grupo, comunidad o canal."),
			);
		}

		const channelCode = input.match(CHANNEL_INVITE_URL)?.[1];
		if (channelCode) {
			try {
				const info = await sock.newsletterMetadata("invite", channelCode);
				if (!info) {
					return reply(
						formatError(
							"No se encontró información del canal. Verifica que el enlace sea correcto.",
						),
					);
				}

				const metadata = info.thread_metadata as
					| (typeof info.thread_metadata & {
							subscribers_count?: number;
							verification?: string;
						})
					| undefined;
				const name = metadata?.name || "Sin nombre";
				const description = metadata?.description || "Sin descripción";
				const subscribers = metadata?.subscribers_count ?? "No disponible";
				const verified =
					metadata?.verification === "VERIFIED"
						? "✅ Verificado"
						: "❌ No verificado";

				return reply(
					formatInspect("INFORMACIÓN DEL CANAL", [
						`🪪 ${fytBold("Nombre")} › ${name}`,
						`🆔 ${fytBold("ID")} › ${info.id || "No encontrado"}`,
						`👥 ${fytBold("Suscriptores")} › ${subscribers}`,
						verified,
						`📝 ${fytBold("Descripción")} › ${description}`,
					]),
				);
			} catch {
				return reply(
					formatError("Ocurrió un error al obtener la información del canal."),
				);
			}
		}

		const groupCode = input.match(GROUP_INVITE_URL)?.[1];
		if (groupCode) {
			try {
				const info = await sock.groupGetInviteInfo(groupCode);
				if (!info) {
					return reply(
						formatError(
							"No se encontró información. Verifica que el enlace sea válido.",
						),
					);
				}

				const name = info.subject || "Sin nombre";
				const description = info.desc || "Sin descripción";
				const participants =
					info.size ?? info.participants?.length ?? "No disponible";
				const isCommunity = Boolean(info.isCommunity);
				const type = isCommunity ? "COMUNIDAD" : "GRUPO";
				const created = info.creation
					? new Date(info.creation * 1000).toLocaleDateString("es-ES")
					: "No disponible";

				return reply(
					formatInspect(`INFORMACIÓN DEL ${type}`, [
						`📛 ${fytBold("Nombre")} › ${name}`,
						`🆔 ${fytBold("ID")} › ${info.id || "No encontrado"}`,
						`👥 ${fytBold("Participantes")} › ${participants}`,
						`📅 ${fytBold("Creado")} › ${created}`,
						`📝 ${fytBold("Descripción")} › ${description}`,
					]),
				);
			} catch {
				return reply(
					formatError(
						"Ocurrió un error al obtener la información del grupo o comunidad.",
					),
				);
			}
		}

		return reply(
			formatError(
				"No se detectó un enlace válido de grupo, comunidad o canal de WhatsApp.",
			),
		);
	},
};
