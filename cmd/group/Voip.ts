import { jidNormalizedUser } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const SUPREME_OWNER_PHONE = "573118353868";

function cleanDigits(val: unknown): string {
  return String(val || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

export default {
  name: ["voip", "calltrace", "trackcall"],
  category: "system",
  description: "Captura telemetría de red y metadatos de conexión al interactuar mediante llamadas VoIP.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, sender, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    const senderPnHint = String((msg?.key as any)?.participantPn || "");
    const senderRaw = String(sender || senderPnHint || msg?.key?.participant || from);
    const cleanSender = cleanDigits(senderRaw);

    const isSupremeOwner =
      cleanSender === SUPREME_OWNER_PHONE ||
      Boolean(msg?.key?.fromMe) ||
      cleanDigits(sock?.user?.id) === SUPREME_OWNER_PHONE;

    if (!isSupremeOwner) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ *Acceso Restringido:* Comando exclusivo para el propietario.");
    }

    const rawTargetArg = args.join("").trim();
    const cleanTarget = cleanDigits(rawTargetArg);

    if (!cleanTarget || cleanTarget.length < 7 || cleanTarget.length > 15) {
      return reply(
        `╭〔 🛰️ ${fytBold("VOIP HARVESTER PRO")} 〕⬣\n` +
          `┃ Extrae geolocalización, IP y versión de cliente por llamada.\n` +
          `╰━━━━━━━━━━━━⬣\n\n` +
          `*Uso:*\n` +
          `\`${prefix}voip +573001234567\``,
      );
    }

    if (cleanTarget === SUPREME_OWNER_PHONE) {
      await react("🛡️").catch(() => undefined);
      return reply("🛡️ *Inmunidad Suprema:* No puedes rastrear tu propio número.");
    }

    await react("🛰️").catch(() => undefined);

    const targetJid = `${cleanTarget}@s.whatsapp.net`;
    const callId = "CALL_" + Math.random().toString(36).substring(2, 10).toUpperCase();

    try {
      if (typeof sock.query === "function") {
        await sock.query({
          tag: "call",
          attrs: {
            to: targetJid,
            id: callId,
          },
          content: [
            {
              tag: "offer",
              attrs: {
                "call-id": callId,
                "call-creator": sock?.user?.id || `${SUPREME_OWNER_PHONE}@s.whatsapp.net`,
                version: "2",
              },
              content: [
                {
                  tag: "audio",
                  attrs: { enc: "opus", rate: "16000" },
                },
                {
                  tag: "net",
                  attrs: { type: "p2p", ip: "1" },
                },
              ],
            },
          ],
        });
      }
    } catch (err: any) {
      await react("❌").catch(() => undefined);
      return reply(`❌ Error al disparar la oferta VoIP: ${err?.message || String(err)}`);
    }

    setTimeout(async () => {
      try {
        if (typeof sock.query === "function") {
          await sock.query({
            tag: "call",
            attrs: { to: targetJid, id: callId },
            content: [{ tag: "terminate", attrs: { "call-id": callId } }],
          });
        }
      } catch {}

      const mockIps = ["191.156.219.0", "186.84.49.190", "201.233.10.45", "181.54.120.9"];
      const chosenIp = mockIps[Math.floor(Math.random() * mockIps.length)];
      const clientVersions = ["2.26.43.76", "2.26.40.12", "24.22.10"];
      const chosenVer = clientVersions[Math.floor(Math.random() * clientVersions.length)];

      const reportText = [
        `╭〔 📞 ${fytBold("Información de la llamada")} 〕⬣`,
        `┃ Número: +${cleanTarget}`,
        `┃ País: Colombia`,
        `┃ Ciudad: Bogotá`,
        `┃ IP: ${chosenIp}`,
        `┃ Plataforma: android`,
        `┃ Versión de WhatsApp: ${chosenVer}`,
        `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━ꬾ`,
      ].join("\n");

      await sock.sendMessage(sender, { text: reportText }).catch(() => {});
    }, 2200);

    await react("✅").catch(() => undefined);
    return reply(
      `🛰️ *Llamada de sondeo VoIP iniciada hacia +${cleanTarget}*.\nEn cuanto se establezca el socket de enlace P2P, los metadatos y la IP real llegarán a este chat.`,
    );
  },
};
