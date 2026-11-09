import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const FALLBACK_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

interface CountryTzInfo {
  code: string;
  country: string;
  flag: string;
  tz: string;
}

const COUNTRY_PREFIXES: CountryTzInfo[] = [
  { code: "1809", country: "República Dominicana", flag: "🇩🇴", tz: "America/Santo_Domingo" },
  { code: "1829", country: "República Dominicana", flag: "🇩🇴", tz: "America/Santo_Domingo" },
  { code: "1849", country: "República Dominicana", flag: "🇩🇴", tz: "America/Santo_Domingo" },
  { code: "1787", country: "Puerto Rico", flag: "🇵🇷", tz: "America/Puerto_Rico" },
  { code: "1939", country: "Puerto Rico", flag: "🇵🇷", tz: "America/Puerto_Rico" },
  { code: "593", country: "Ecuador", flag: "🇪🇨", tz: "America/Guayaquil" },
  { code: "591", country: "Bolivia", flag: "🇧🇴", tz: "America/La_Paz" },
  { code: "595", country: "Paraguay", flag: "🇵🇾", tz: "America/Asuncion" },
  { code: "598", country: "Uruguay", flag: "🇺🇾", tz: "America/Montevideo" },
  { code: "502", country: "Guatemala", flag: "🇬🇹", tz: "America/Guatemala" },
  { code: "503", country: "El Salvador", flag: "🇸🇻", tz: "America/El_Salvador" },
  { code: "504", country: "Honduras", flag: "🇭🇳", tz: "America/Tegucigalpa" },
  { code: "505", country: "Nicaragua", flag: "🇳🇮", tz: "America/Managua" },
  { code: "506", country: "Costa Rica", flag: "🇨🇷", tz: "America/Costa_Rica" },
  { code: "507", country: "Panamá", flag: "🇵🇦", tz: "America/Panama" },
  { code: "57", country: "Colombia", flag: "🇨🇴", tz: "America/Bogota" },
  { code: "52", country: "México", flag: "🇲🇽", tz: "America/Mexico_City" },
  { code: "54", country: "Argentina", flag: "🇦🇷", tz: "America/Argentina/Buenos_Aires" },
  { code: "51", country: "Perú", flag: "🇵🇪", tz: "America/Lima" },
  { code: "56", country: "Chile", flag: "🇨🇱", tz: "America/Santiago" },
  { code: "58", country: "Venezuela", flag: "🇻🇪", tz: "America/Caracas" },
  { code: "53", country: "Cuba", flag: "🇨🇺", tz: "America/Havana" },
  { code: "55", country: "Brasil", flag: "🇧🇷", tz: "America/Sao_Paulo" },
  { code: "34", country: "España", flag: "🇪🇸", tz: "Europe/Madrid" },
  { code: "39", country: "Italia", flag: "🇮🇹", tz: "Europe/Rome" },
  { code: "33", country: "Francia", flag: "🇫🇷", tz: "Europe/Paris" },
  { code: "49", country: "Alemania", flag: "🇩🇪", tz: "Europe/Berlin" },
  { code: "44", country: "Reino Unido", flag: "🇬🇧", tz: "Europe/London" },
  { code: "1", country: "Estados Unidos / Canadá", flag: "🇺🇸", tz: "America/New_York" },
];

function cleanDigits(val: unknown): string {
  return String(val || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

async function resolveSenderPhone(
  sock: any,
  db: any,
  from: string,
  sender: string,
  msg: any,
  groupMeta?: any,
): Promise<string> {
  const candidates = [
    sender,
    msg?.key?.participantPn,
    msg?.key?.participant,
    (msg as any)?.participant,
  ].filter(Boolean);

  for (const c of candidates) {
    const str = String(c);
    if (str.endsWith("@s.whatsapp.net")) {
      const d = cleanDigits(str);
      if (d.length >= 7 && d.length <= 15) return d;
    }
  }

  const lidCandidate = candidates.find((c) => String(c).endsWith("@lid"));
  if (lidCandidate) {
    const lidDigits = cleanDigits(lidCandidate);

    try {
      const mapped = await sock.signalRepository?.lidMapping?.getPNForLID?.(String(lidCandidate));
      if (mapped) {
        const d = cleanDigits(mapped);
        if (d.length >= 7 && d.length <= 15) return d;
      }
    } catch {}

    try {
      const meta = groupMeta || (from.endsWith("@g.us") ? await sock.groupMetadata(from) : null);
      const participants: any[] = meta?.participants || [];
      for (const p of participants) {
        const pId = String(p?.id || "");
        const pLid = String(p?.lid || "");
        if (cleanDigits(pId) === lidDigits || cleanDigits(pLid) === lidDigits) {
          const pn = cleanDigits(p?.phoneNumber || (pId.endsWith("@s.whatsapp.net") ? pId : ""));
          if (pn.length >= 7 && pn.length <= 15) return pn;
        }
      }
    } catch {}

    try {
      const activeDb = db || (globalThis as any).db;
      const uRec = activeDb?.getUser?.(String(lidCandidate));
      if (uRec?.phone_number || uRec?.jid) {
        const d = cleanDigits(uRec.phone_number || uRec.jid);
        if (d.length >= 7 && d.length <= 15) return d;
      }
    } catch {}
  }

  const fallbackDigits = cleanDigits(sender);
  return fallbackDigits.length >= 7 && fallbackDigits.length <= 15 ? fallbackDigits : "57";
}

function detectCountryFromPhone(phoneDigits: string): CountryTzInfo {
  const clean = phoneDigits.replace(/\D/g, "");
  for (const item of COUNTRY_PREFIXES) {
    if (clean.startsWith(item.code)) {
      return item;
    }
  }
  return { code: "57", country: "Colombia", flag: "🇨🇴", tz: "America/Bogota" };
}

function getZoneParts(utcMs: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const hour = map.hour === 24 ? 0 : map.hour;
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour,
    minute: map.minute,
    second: map.second || 0,
  };
}

function zonedDateTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const approxUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const zoned = getZoneParts(approxUtc, timeZone);
  const asUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );
  const offsetMs = asUtc - approxUtc;
  return approxUtc - offsetMs;
}

function parseEventDateTimeInUserZone(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): { utcMs: number; finalTimeStr: string } | null {
  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr.trim());
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());

  if (!dateMatch || !timeMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2026) {
    return null;
  }

  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return null;
  }

  let targetUtcMs = zonedDateTimeToUtcMs(year, month, day, hour, minute, timeZone);
  const nowUtcMs = Date.now();

  if (targetUtcMs <= nowUtcMs && hour >= 1 && hour <= 11) {
    const pmUtcMs = zonedDateTimeToUtcMs(year, month, day, hour + 12, minute, timeZone);
    if (pmUtcMs > nowUtcMs - 60_000) {
      hour += 12;
      targetUtcMs = pmUtcMs;
    }
  }

  const finalTimeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { utcMs: targetUtcMs, finalTimeStr };
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
  description: "Crea un evento oficial en el grupo detectando automáticamente el país y hora local del administrador.",
  groupOnly: true,
  adminOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, sender, msg, args = [], usedPrefix, reply, react, isAdmin, isOwner, db, groupMeta } = ctx;
    const prefix = usedPrefix || ".";

    if (!isAdmin && !isOwner && !msg?.key?.fromMe) {
      return reply(
        `⛔ *${fytBold("Acceso Denegado")}*\nSolo los administradores del grupo pueden crear eventos.`,
      );
    }

    const senderPhone = await resolveSenderPhone(sock, db, from, sender, msg, groupMeta);
    const countryInfo = detectCountryFromPhone(senderPhone);
    const userNow = getZoneParts(Date.now(), countryInfo.tz);
    const userNowFormatted =
      `${String(userNow.day).padStart(2, "0")}/${String(userNow.month).padStart(2, "0")}/${userNow.year} ` +
      `${String(userNow.hour).padStart(2, "0")}:${String(userNow.minute).padStart(2, "0")}`;

    if (args.length < 3) {
      return reply(
        `╭〔 📅 ${fytBold("CREADOR DE EVENTOS")} 〕⬣\n` +
          `┃ 🌍 *Ubicación:* ${countryInfo.flag} ${countryInfo.country}\n` +
          `┃ 🕒 *Tu hora actual (24h):* \`${userNowFormatted}\`\n` +
          `┃ 📋 *Formato:* \`${prefix}event DD/MM/YYYY HH:MM <título>\`\n` +
          `╰━━━━━━━━━━━━⬣\n\n` +
          `*Ejemplo de uso:*\n` +
          `\`${prefix}event 19/11/2026 13:09 paja grupal\``,
      );
    }

    const dateInput = String(args[0] || "");
    const timeInput = String(args[1] || "");
    const rawContent = args.slice(2).join(" ").trim();

    const parsedEvent = parseEventDateTimeInUserZone(dateInput, timeInput, countryInfo.tz);
    if (!parsedEvent) {
      return reply(
        `❌ *${fytBold("Fecha u hora inválida")}*\n\n` +
          `Debes usar estrictamente el formato *DD/MM/YYYY* y reloj de *24 HORAS (HH:MM)*.\n` +
          `• *Tu hora local (${countryInfo.flag}):* \`${userNowFormatted}\`\n\n` +
          `✅ *Ejemplo:* \`${prefix}event 19/11/2026 22:30 ${rawContent || "Reunión"}\``,
      );
    }

    const startTimeSec = Math.floor(parsedEvent.utcMs / 1000);
    const nowSec = Math.floor(Date.now() / 1000);

    if (startTimeSec <= nowSec - 60) {
      return reply(
        `⏳ *${fytBold("Tiempo inválido")}*\n` +
          `La fecha y hora indicada (\`${dateInput} ${parsedEvent.finalTimeStr}\`) ya pasó en tu zona horaria.\n\n` +
          `🌍 *País detectado:* ${countryInfo.flag} ${countryInfo.country}\n` +
          `🕒 *Tu hora actual (24h):* \`${userNowFormatted}\``,
      );
    }

    const effectiveStartSec = Math.max(startTimeSec, nowSec + 30);

    await react("📅").catch(() => undefined);

    const [titlePart, descPart] = rawContent.split("|").map((s) => s.trim());
    const eventTitle = titlePart || "Evento del Grupo";
    const endTimeSec = effectiveStartSec + 3600;
    const creatorName = msg?.pushName || "Administrador";

    const captionText =
      descPart ||
      `📅 *Evento:* ${eventTitle}\n` +
        `🗓️ *Fecha:* ${dateInput}\n` +
        `🕒 *Hora (24h):* ${parsedEvent.finalTimeStr} (${countryInfo.flag} ${countryInfo.country})\n` +
        `👮 *Organiza:* ${creatorName}`;

    let mentionedJid: string[] = [];
    try {
      const meta = groupMeta || (await sock.groupMetadata(from));
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
            startTime: effectiveStartSec,
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
