import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const FUENTE_ESTILIZADA: Record<string, string> = {
  a: "🅐", b: "🅑", c: "🅒", d: "🅓", e: "🅔", f: "🅕", g: "🅖",
  h: "🅗", i: "🅘", j: "🅙", k: "🅚", l: "🅛", m: "🅜", n: "🅝",
  o: "🅞", p: "🅟", q: "🅠", r: "🅡", s: "🅢", t: "🅣", u: "🅤",
  v: "🅥", w: "🅦", x: "🅧", y: "🅨", z: "🅩",
  "0": "⓿", "1": "➊", "2": "➋", "3": "➌", "4": "➍",
  "5": "➎", "6": "➏", "7": "➐", "8": "➑", "9": "➒",
};

function convertirTextoEstilizado(input: string): string {
  const normalizado = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalizado
    .split("")
    .map((c) => {
      if (c === " ") return "␣";
      return FUENTE_ESTILIZADA[c] || c;
    })
    .join("");
}

function extraerDatosEnlace(rawUrl: string): { idCanal: string; idMensaje: string } | null {
  const limpio = rawUrl.trim().split("?")[0].replace(/\/+$/, "");
  const match = limpio.match(/^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)\/(\d+)$/i);
  if (!match) return null;
  return {
    idCanal: match[1],
    idMensaje: match[2],
  };
}

export default {
  name: ["reactch", "react", "chreact", "reaccioncanal"],
  category: "group",
  description: "Envía una reacción con texto estilizado a una publicación de un canal de WhatsApp.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    if (args.length < 2) {
      return reply(
        `╭〔 📢 ${fytBold("Reacción a Canal")} 〕⬣\n` +
          `• *Ejemplo de uso:*\n` +
          `  \`${prefix}reactch https://whatsapp.com/channel/xxx/123 texto\`\n` +
          `╰━━━━━━━━━━━━⬣`,
      );
    }

    const parsedLink = extraerDatosEnlace(args[0]);
    if (!parsedLink) {
      return reply(
        `❌ Enlace inválido. Asegúrate de copiar el enlace directo a la publicación del canal:\n\`https://whatsapp.com/channel/ID_CANAL/ID_MENSAJE\``,
      );
    }

    const textoPlano = args.slice(1).join(" ").trim();
    if (!textoPlano) {
      return reply(`⚠️ Escribe el texto con el que deseas reaccionar.`);
    }

    const textoConvertido = convertirTextoEstilizado(textoPlano);

    await react("⏳").catch(() => undefined);

    try {
      const anySock = sock as any;
      if (
        typeof anySock.newsletterMetadata !== "function" ||
        typeof anySock.newsletterReactMessage !== "function"
      ) {
        return reply(`❌ Tu versión actual de Baileys no incluye soporte para métodos de canales (newsletter).`);
      }

      const datosCanal = await anySock.newsletterMetadata("invite", parsedLink.idCanal);
      const jidCanal = datosCanal?.id || `${parsedLink.idCanal}@newsletter`;
      const nombreCanal =
        datosCanal?.name ||
        datosCanal?.thread_metadata?.name?.text ||
        parsedLink.idCanal;

      await anySock.newsletterReactMessage(jidCanal, parsedLink.idMensaje, textoConvertido);

      await react("✅").catch(() => undefined);
      return reply(
        `✅ Reacción enviada con *${textoConvertido}* al mensaje \`#${parsedLink.idMensaje}\` del canal *${nombreCanal}*.`,
      );
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      return reply(`❌ ${fytBold("ReactChannel:")} ${e?.message || "No se pudo enviar la reacción al canal."}`);
    }
  },
};
