import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const FALLBACK_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

function parseStrictEventDateTime(dateStr: string, timeStr: string): Date | null {
  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr.trim());
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());

  if (!dateMatch || !timeMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2026) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    return null;
  }

  return parsed;
}

async function fetchEventThumbnail(sock: any, jid: string): Promise<Buffer> {
  try {
    const ppUrl = await Promise.race([
      sock.profilePictureUrl(jid, "image"),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000),
      ),
    ]);
    if (ppUrl && typeof ppUrl === "string") {
      const res = await fetch(ppUrl);
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
    }
  } catch {}
  return Buffer.from(FALLBACK_JPEG_BASE64, "base64");
}

export default {
  name: ["event", "evento", "crearevento"],
  category: "group",
  description: "Crea una invitación de evento oficial en el grupo usando formato de 24 horas.",
  groupOnly: true,
  adminOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, sender, msg, args = [], usedPrefix, reply, react, isAdmin, isOwner } = ctx;
    const prefix = usedPrefix || ".";

    if (!isAdmin && !isOwner && !msg?.key?.fromMe) {
      return reply(
        `⛔ *${fytBold("Acceso Denegado")}*\nSolo los administradores del grupo pueden crear eventos.`,
      );
    }

    if (args.length < 3) {
      return reply(
        `╭〔 📅 ${fytBold("CREADOR DE EVENTOS")} 〕⬣\n` +
          `┃ ⚠️ *Formato requerido (24 HORAS):*\n` +
          `┃ \`${prefix}event DD/MM/YYYY HH:MM <título>\`\n` +
          `╰━━━━━━━━━━━━⬣\n\n` +
          `*Ejemplo de uso:*\n` +
          `\`${prefix}event 19/11/2026 13:09 paja grupal\`\n\n` +
          `*Nota:* La hora debe estar obligatoriamente en formato 24h (\`00:00\` a \`23:59\`).`,
      );
    }

    const dateInput = String(args[0] || "");
    const timeInput = String(args[1] || "");
    const rawContent = args.slice(2).join(" ").trim();

    const targetDate = parseStrictEventDateTime(dateInput, timeInput);
    if (!targetDate) {
      return reply(
        `❌ *${fytBold("Fecha u hora inválida")}*\n\n` +
          `Debes usar estrictamente el formato *DD/MM/YYYY* y reloj de *24 HORAS (HH:MM)*.\n\n` +
          `✅ *Correcto:* \`${prefix}event 19/11/2026 13:09 ${rawContent || "Reunión"}\`\n` +
          `❌ *Incorrecto:* \`19-11-26 1:09pm\``,
      );
    }

    const startTimeSec = Math.floor(targetDate.getTime() / 1000);
    const nowSec = Math.floor(Date.now() / 1000);

    if (startTimeSec <= nowSec) {
      return reply(
        `⏳ *${fytBold("Tiempo inválido")}*\nLa fecha y hora del evento (\`${dateInput} ${timeInput}\`) debe ser posterior a la hora actual.`,
      );
    }

    await react("📅").catch(() => undefined);

    const [titlePart, descPart] = rawContent.split("|").map((s) => s.trim());
    const eventTitle = titlePart || "Evento del Grupo";
    const endTimeSec = startTimeSec + 3600;
    const creatorName = msg?.pushName || "Administrador";

    const captionText =
      descPart ||
      `📅 *Evento:* ${eventTitle}\n` +
        `🗓️ *Fecha:* ${dateInput}\n` +
        `🕒 *Hora (24h):* ${timeInput}\n` +
        `👮 *Organiza:* ${creatorName}`;

    let mentionedJid: string[] = [];
    try {
      const meta = await sock.groupMetadata(from);
      mentionedJid = (meta?.participants || [])
        .map((p: any) => p?.id || p?.lid)
        .filter(Boolean);
    } catch {
      if (sender) mentionedJid = [sender];
    }

    const thumbnail = await fetchEventThumbnail(sock, from);

    try {
      await sock.relayMessage(
        from,
        {
          eventInviteMessage: {
            contextInfo: {
              mentionedJid,
              forwardingScore: 0,
              isForwarded: false,
            },
            eventId: randomUUID(),
            eventTitle,
            jpegThumbnail: thumbnail,
            caption: captionText,
            startTime: startTimeSec,
            endTime: endTimeSec,
            isCanceled: false,
            lastUpdatedTsUsec: Date.now() * 1000,
            status: 1,
          },
        } as any,
        {
          messageId: randomUUID(),
        },
      );

      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      await reply(
        `❌ Error al emitir el evento: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
