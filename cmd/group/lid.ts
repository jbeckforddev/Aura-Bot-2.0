
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  tz: string;
}

const COUNTRY_PREFIXES: CountryInfo[] = [
  { code: "1809", name: "República Dominicana", flag: "🇩🇴", tz: "America/Santo_Domingo" },
  { code: "1829", name: "República Dominicana", flag: "🇩🇴", tz: "America/Santo_Domingo" },
  { code: "1849", name: "República Dominicana", flag: "🇩🇴", tz: "America/Santo_Domingo" },
  { code: "1787", name: "Puerto Rico", flag: "🇵🇷", tz: "America/Puerto_Rico" },
  { code: "1939", name: "Puerto Rico", flag: "🇵🇷", tz: "America/Puerto_Rico" },
  { code: "502", name: "Guatemala", flag: "🇬🇹", tz: "America/Guatemala" },
  { code: "503", name: "El Salvador", flag: "🇸🇻", tz: "America/El_Salvador" },
  { code: "504", name: "Honduras", flag: "🇭🇳", tz: "America/Tegucigalpa" },
  { code: "505", name: "Nicaragua", flag: "🇳🇮", tz: "America/Managua" },
  { code: "506", name: "Costa Rica", flag: "🇨🇷", tz: "America/Costa_Rica" },
  { code: "507", name: "Panamá", flag: "🇵🇦", tz: "America/Panama" },
  { code: "509", name: "Haití", flag: "🇭🇹", tz: "America/Port-au-Prince" },
  { code: "591", name: "Bolivia", flag: "🇧🇴", tz: "America/La_Paz" },
  { code: "593", name: "Ecuador", flag: "🇪🇨", tz: "America/Guayaquil" },
  { code: "595", name: "Paraguay", flag: "🇵🇾", tz: "America/Asuncion" },
  { code: "598", name: "Uruguay", flag: "🇺🇾", tz: "America/Montevideo" },
  { code: "51", name: "Perú", flag: "🇵🇪", tz: "America/Lima" },
  { code: "52", name: "México", flag: "🇲🇽", tz: "America/Mexico_City" },
  { code: "53", name: "Cuba", flag: "🇨🇺", tz: "America/Havana" },
  { code: "54", name: "Argentina", flag: "🇦🇷", tz: "America/Argentina/Buenos_Aires" },
  { code: "55", name: "Brasil", flag: "🇧🇷", tz: "America/Sao_Paulo" },
  { code: "56", name: "Chile", flag: "🇨🇱", tz: "America/Santiago" },
  { code: "57", name: "Colombia", flag: "🇨🇴", tz: "America/Bogota" },
  { code: "58", name: "Venezuela", flag: "🇻🇪", tz: "America/Caracas" },
  { code: "34", name: "España", flag: "🇪🇸", tz: "Europe/Madrid" },
  { code: "39", name: "Italia", flag: "🇮🇹", tz: "Europe/Rome" },
  { code: "33", name: "Francia", flag: "🇫🇷", tz: "Europe/Paris" },
  { code: "49", name: "Alemania", flag: "🇩🇪", tz: "Europe/Berlin" },
  { code: "44", name: "Reino Unido", flag: "🇬🇧", tz: "Europe/London" },
  { code: "351", name: "Portugal", flag: "🇵🇹", tz: "Europe/Lisbon" },
  { code: "1", name: "Estados Unidos / Canadá", flag: "🇺🇸", tz: "America/New_York" },
];

function detectCountry(phoneNumber: string): { info: CountryInfo | null; localNumber: string; localTime: string } {
  const clean = phoneNumber.replace(/\D/g, "");
  for (const item of COUNTRY_PREFIXES) {
    if (clean.startsWith(item.code)) {
      let localTime = "Desconocida";
      try {
        localTime = new Intl.DateTimeFormat("es-CO", {
          timeZone: item.tz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }).format(new Date());
      } catch {}
      return {
        info: item,
        localNumber: clean.slice(item.code.length),
        localTime,
      };
    }
  }
  return { info: null, localNumber: clean, localTime: "Desconocida" };
}

function formatInternationalPhone(phone: string, code?: string): string {
  if (!code) return `+${phone}`;
  const rest = phone.slice(code.length);
  if (rest.length === 10) {
    return `+${code} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
  }
  if (rest.length === 8) {
    return `+${code} ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  if (rest.length === 9) {
    return `+${code} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
  }
  return `+${code} ${rest}`;
}

export default {
  name: ["lid", "resolver", "realnum", "whois", "doxlid"],
  category: "group",
  description: "Escanea y resuelve el JID real, LID, metadatos de red y perfil de un usuario.",
  groupOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, db, msg, args, groupMeta, sock, from } = ctx;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    let rawInput = "";
    let origin = "argumento";

    if (contextInfo?.mentionedJid?.length) {
      rawInput = contextInfo.mentionedJid[0];
      origin = "mención";
    } else if (contextInfo?.participant) {
      rawInput = contextInfo.participant;
      origin = "respuesta";
    } else if (args.length > 0) {
      const joined = args.join("").replace(/[^0-9a-zA-Z@._-]/g, "");
      if (joined.includes("@")) {
        rawInput = joined;
      } else if (joined.length >= 14) {
        rawInput = `${joined}@lid`;
      } else {
        rawInput = `${joined}@s.whatsapp.net`;
      }
      origin = "texto manual";
    }

    if (!rawInput) {
      return reply("⚠️ Etiqueta a un usuario, responde a un mensaje o escribe el código LID / número.");
    }

    await react("🔎").catch(() => undefined);

    const server = rawInput.split("@")[1] || "desconocido";
    const cleanInputId = rawInput.split("@")[0].split(":")[0].replace(/\D/g, "");

    let resolvedJid: string | null = null;
    let resolvedLid: string | null = null;
    let resolutionMethod = "Directo";
    let groupParticipantData: any = null;

    if (server === "s.whatsapp.net") {
      resolvedJid = `${cleanInputId}@s.whatsapp.net`;
    } else if (server === "lid") {
      resolvedLid = `${cleanInputId}@lid`;
    }

    if (groupMeta?.participants) {
      const foundInGroup = groupMeta.participants.find((p: any) => {
        const pLid = String(p.lid || "").split("@")[0].split(":")[0];
        const pId = String(p.id || "").split("@")[0].split(":")[0];
        const pPhone = String(p.phoneNumber || "").replace(/\D/g, "");
        return pLid === cleanInputId || pId === cleanInputId || (pPhone && pPhone === cleanInputId);
      }) as any;

      if (foundInGroup) {
        groupParticipantData = foundInGroup;
        if (!resolvedJid) {
          if (foundInGroup.id?.endsWith("@s.whatsapp.net")) {
            resolvedJid = foundInGroup.id;
            resolutionMethod = "Caché de Grupo (ID)";
          } else if (foundInGroup.phoneNumber) {
            const num = String(foundInGroup.phoneNumber).replace(/\D/g, "");
            if (num) {
              resolvedJid = `${num}@s.whatsapp.net`;
              resolutionMethod = "Caché de Grupo (PhoneNumber)";
            }
          }
        }
        if (!resolvedLid) {
          if (foundInGroup.lid?.endsWith("@lid")) {
            resolvedLid = foundInGroup.lid;
          } else if (foundInGroup.id?.endsWith("@lid")) {
            resolvedLid = foundInGroup.id;
          }
        }
      }
    }

    const lidRepo = (sock as any).signalRepository?.lidMapping;
    if (lidRepo) {
      try {
        if (!resolvedJid && resolvedLid && typeof lidRepo.getPNForLID === "function") {
          const pn = await lidRepo.getPNForLID(resolvedLid);
          if (pn) {
            const cleanPn = String(pn).split("@")[0].split(":")[0].replace(/\D/g, "");
            if (cleanPn) {
              resolvedJid = `${cleanPn}@s.whatsapp.net`;
              resolutionMethod = "Signal Repository (getPNForLID)";
            }
          }
        }
        if (!resolvedLid && resolvedJid && typeof lidRepo.getLIDForPN === "function") {
          const lid = await lidRepo.getLIDForPN(resolvedJid);
          if (lid) {
            const cleanL = String(lid).split("@")[0].split(":")[0].replace(/\D/g, "");
            if (cleanL) resolvedLid = `${cleanL}@lid`;
          }
        }
      } catch {}
    }

    let dbUserRecord: any = null;
    const dbAny = db as any;
    if (dbAny) {
      try {
        if (typeof dbAny.getUser === "function") {
          dbUserRecord =
            (resolvedJid && dbAny.getUser(resolvedJid)) ||
            (resolvedLid && dbAny.getUser(resolvedLid)) ||
            dbAny.getUser(rawInput);

          if (dbUserRecord) {
            if (!resolvedJid && dbUserRecord.phone_number) {
              resolvedJid = `${String(dbUserRecord.phone_number).replace(/\D/g, "")}@s.whatsapp.net`;
              resolutionMethod = "Base de Datos (AuraDB)";
            } else if (!resolvedJid && dbUserRecord.jid?.endsWith("@s.whatsapp.net")) {
              resolvedJid = dbUserRecord.jid;
              resolutionMethod = "Base de Datos (AuraDB)";
            }
            if (!resolvedLid && dbUserRecord.lid) {
              const cleanDbLid = String(dbUserRecord.lid).split("@")[0].split(":")[0].replace(/\D/g, "");
              if (cleanDbLid) resolvedLid = `${cleanDbLid}@lid`;
            }
          }
        }
      } catch {}
    }

    let existsOnWa = false;
    if (typeof sock.onWhatsApp === "function") {
      try {
        const queryTarget = resolvedJid || rawInput;
        const waCheck = await sock.onWhatsApp(queryTarget);
        if (Array.isArray(waCheck) && waCheck[0]) {
          existsOnWa = Boolean(waCheck[0].exists);
          if (!resolvedJid && waCheck[0].jid?.endsWith("@s.whatsapp.net")) {
            resolvedJid = waCheck[0].jid;
            resolutionMethod = "Consulta directa onWhatsApp";
          }
          if (!resolvedLid && (waCheck[0] as any).lid) {
            const cleanWaLid = String((waCheck[0] as any).lid).split("@")[0].split(":")[0].replace(/\D/g, "");
            if (cleanWaLid) resolvedLid = `${cleanWaLid}@lid`;
          }
        }
      } catch {}
    }

    if (!resolvedJid && !resolvedLid) {
      await react("❌").catch(() => undefined);
      return reply(
        `🔎 *${fytBold("RESOLUCIÓN @usuario / LID")}*\n\n` +
        `📥 *Entrada:* \`${rawInput}\`\n` +
        `🧩 *Servidor:* \`${server}\`\n` +
        `🛰️ *Origen:* ${origin}\n\n` +
        `❌ *No se encontró el número real ni coincidencia en la caché del grupo, almacén Signal ni AuraDB.*`
      );
    }

    if (resolvedJid && !dbUserRecord && typeof dbAny?.getUser === "function") {
      try {
        dbUserRecord = dbAny.getUser(resolvedJid);
      } catch {}
    }

    const targetQueryJid = resolvedJid || resolvedLid || rawInput;

    const [statusResult, ppUrl, bizProfile] = await Promise.all([
      typeof sock.fetchStatus === "function"
        ? (sock.fetchStatus(targetQueryJid) as unknown as Promise<any>).catch(() => null)
        : Promise.resolve(null),
      typeof sock.profilePictureUrl === "function"
        ? sock.profilePictureUrl(targetQueryJid, "image").catch(() => null)
        : Promise.resolve(null),
      typeof sock.getBusinessProfile === "function" && resolvedJid
        ? sock.getBusinessProfile(resolvedJid).catch(() => null)
        : Promise.resolve(null),
    ]);

    let bioText = "Sin info / Privado";
    let bioDate = "No disponible";
    if (statusResult) {
      const statusObj = Array.isArray(statusResult) ? statusResult[0]?.status : statusResult;
      const rawStatus = typeof statusObj?.status === "string" ? statusObj.status : typeof statusObj === "string" ? statusObj : "";
      const rawSetAt = statusObj?.setAt || (Array.isArray(statusResult) ? statusResult[0]?.setAt : null);
      if (rawStatus.trim()) bioText = rawStatus.trim();
      if (rawSetAt) {
        const parsedDate = new Date(rawSetAt);
        if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1970) {
          bioDate = parsedDate.toLocaleString("es-CO");
        }
      }
    }

    const realNumber = resolvedJid ? resolvedJid.split("@")[0].split(":")[0] : null;
    const cleanLidNumber = resolvedLid ? resolvedLid.split("@")[0].split(":")[0] : null;

    const countryData = realNumber ? detectCountry(realNumber) : { info: null, localNumber: "", localTime: "Desconocida" };
    const formattedPhone = realNumber ? formatInternationalPhone(realNumber, countryData.info?.code) : "No resuelto";

    let groupRole = "Fuera del grupo / Chat privado";
    if (groupParticipantData) {
      if (groupParticipantData.admin === "superadmin") groupRole = "👑 Creador del Grupo (SuperAdmin)";
      else if (groupParticipantData.admin === "admin") groupRole = "🛡️ Administrador";
      else groupRole = "👤 Miembro";
    }

    let isMutedInGroup = false;
    if (from.endsWith("@g.us") && typeof dbAny?.getGroup === "function") {
      try {
        const gData = dbAny.getGroup(from);
        if (Array.isArray(gData?.mutedUsers)) {
          isMutedInGroup = Boolean(
            (resolvedJid && gData.mutedUsers.includes(resolvedJid)) ||
            (resolvedLid && gData.mutedUsers.includes(resolvedLid))
          );
        }
      } catch {}
    }

    let botRecord: any = null;
    if (typeof dbAny?.getBot === "function" && resolvedJid) {
      try {
        botRecord = dbAny.getBot(resolvedJid);
      } catch {}
    }

    const pushName =
      dbUserRecord?.pushName ||
      dbUserRecord?.username ||
      groupParticipantData?.name ||
      groupParticipantData?.notify ||
      (contextInfo?.participant === rawInput ? msg.pushName : null) ||
      "No registrado";

    const lines: string[] = [
      `🔎 *${fytBold("INSPECCIÓN AVANZADA @usuario / LID")}*`,
      ``,
      `╭─〔 🛰️ *DATOS DE RASTREO* 〕`,
      `┃ 📥 *Entrada:* \`${rawInput}\``,
      `┃ 🧩 *Servidor origen:* \`${server}\``,
      `┃ 🎯 *Vía de captura:* ${origin}`,
      `┃ 🔓 *Motor de resolución:* ${resolutionMethod}`,
      `╰─────────────────────`,
      ``,
      `╭─〔 📱 *IDENTIDAD DE RED* 〕`,
      `┃ 👤 *Nombre (PushName):* ${pushName}`,
      `┃ 📱 *Número real:* \`${realNumber || "Oculto por Meta"}\``,
      `┃ ☎️ *Formato:* \`${formattedPhone}\``,
      `┃ 🔢 *JID completo:* \`${resolvedJid || "No resuelto"}\``,
      `┃ 🆔 *LID asignado:* \`${resolvedLid || "No detectado"}\``,
      `┃ 🔑 *ID numérico LID:* \`${cleanLidNumber || "N/A"}\``,
      `┃ 🌐 *Activo en WhatsApp:* ${existsOnWa || resolvedJid ? "✅ Sí" : "⚠️ Sin confirmar"}`,
      ...(realNumber ? [`┃ 🔗 *Enlace directo:* https://wa.me/${realNumber}`] : []),
      `╰─────────────────────`,
    ];

    if (realNumber) {
      lines.push(
        ``,
        `╭─〔 🌍 *GEOLOCALIZACIÓN TELEFÓNICA* 〕`,
        `┃ 🏳️ *País:* ${countryData.info ? `${countryData.info.flag} ${countryData.info.name}` : "🏳️ Desconocido"}`,
        `┃ 📡 *Prefijo ITU-T:* ${countryData.info ? `+${countryData.info.code}` : "N/A"}`,
        `┃ 🕒 *Zona horaria:* \`${countryData.info?.tz || "N/A"}\``,
        `┃ ⌚ *Hora local estimada:* ${countryData.localTime}`,
        `╰─────────────────────`
      );
    }

    lines.push(
      ``,
      `╭─〔 📝 *PERFIL Y METADATOS* 〕`,
      `┃ 💬 *Info / Bio:* ${bioText}`,
      `┃ 📅 *Fecha de Bio:* ${bioDate}`,
      `┃ 🖼️ *Foto de perfil:* ${ppUrl ? "Pública (Adjunta)" : "Privada / Sin foto"}`,
      `┃ 🏰 *Rol en este chat:* ${groupRole}`,
      ...(from.endsWith("@g.us") ? [`┃ 🤐 *Silenciado aquí:* ${isMutedInGroup ? "Sí 🔇" : "No 🔊"}`] : []),
      `╰─────────────────────`
    );

    if (bizProfile) {
      lines.push(
        ``,
        `╭─〔 🏢 *WHATSAPP BUSINESS* 〕`,
        `┃ 🏷️ *Categoría:* ${(bizProfile as any).category || "Comercio"}`,
        `┃ 📄 *Descripción:* ${((bizProfile as any).description || "Sin descripción").slice(0, 120)}`,
        ...((bizProfile as any).email ? [`┃ 📧 *Email:* ${(bizProfile as any).email}`] : []),
        ...((bizProfile as any).website?.[0] ? [`┃ 🌐 *Web:* ${(bizProfile as any).website[0]}`] : []),
        ...((bizProfile as any).address ? [`┃ 📍 *Dirección:* ${(bizProfile as any).address}`] : []),
        `╰─────────────────────`
      );
    }

    if (dbUserRecord || botRecord) {
      const isUserOwner =
        realNumber === "573118353868" ||
        (resolvedJid && dbAny?.hasRole?.(resolvedJid, "owner"));
      const isUserMod = resolvedJid && dbAny?.hasRole?.(resolvedJid, "mod");

      lines.push(
        ``,
        `╭─〔 🗄️ *REGISTRO EN AURADB* 〕`,
        `┃ 🎖️ *Rango Global:* ${isUserOwner ? "👑 Owner" : isUserMod ? "⚡ Moderador" : "👤 Usuario Estándar"}`,
        `┃ 🤖 *Es Instancia Bot:* ${botRecord ? `✅ Sí (${botRecord.bot_type || "Sub-Bot"} - ${botRecord.status})` : "No"}`,
        ...(dbUserRecord?.coins !== undefined ? [`┃ 🪙 *Monedas:* ${dbUserRecord.coins}`] : []),
        ...(dbUserRecord?.bank !== undefined ? [`┃ 🏦 *Banco:* ${dbUserRecord.bank}`] : []),
        ...(dbUserRecord?.level !== undefined ? [`┃ 📈 *Nivel:* ${dbUserRecord.level}`] : []),
        `╰─────────────────────`
      );
    }

    const reportCaption = lines.join("\n");
    const mentionList = [resolvedJid, resolvedLid].filter((x): x is string => Boolean(x));

    await react("✅").catch(() => undefined);

    if (ppUrl) {
      try {
        return await sock.sendMessage(
          from,
          {
            image: { url: ppUrl },
            caption: reportCaption,
            mentions: mentionList,
          },
          { quoted: msg as any }
        );
      } catch {}
    }

    return reply({
      text: reportCaption,
      mentions: mentionList,
    });
  },
};
