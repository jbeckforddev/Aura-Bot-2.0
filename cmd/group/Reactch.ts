import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const MAPA: Record<string, string> = {
  a: "🅐", b: "🅑", c: "🅒", d: "🅓", e: "🅔", f: "🅕", g: "🅖",
  h: "🅗", i: "🅘", j: "🅙", k: "🅚", l: "🅛", m: "🅜", n: "🅝",
  o: "🅞", p: "🅟", q: "🅠", r: "🅡", s: "🅢", t: "🅣", u: "🅤",
  v: "🅥", w: "🅦", x: "🅧", y: "🅨", z: "🅩",
  "0": "⓿", "1": "➊", "2": "➋", "3": "➌", "4": "➍",
  "5": "➎", "6": "➏", "7": "➐", "8": "➑", "9": "➒",
};

function estilizar(texto: string): string {
  return texto
    .toLowerCase()
    .split("")
    .map((c) => (c === " " ? "␣" : MAPA[c] || c))
    .join("");
}

export default {
  name: ["reactch", "reactcanal"],
  category: "system",
  description: "Reacciona a un mensaje de canal con texto estilizado. `.reactch <enlace> <texto>`.",
  async run(ctx: CommandContext) {
    const { sock, args, reply, react } = ctx;

    if (!args[0]) {
      await reply(`Ejemplo de uso:\n\`.reactch https://whatsapp.com/channel/xxx/xxx texto\``).catch(() => undefined);
      return;
    }

    if (!args[0].startsWith("https://whatsapp.com/channel/")) {
      await reply(`❌ Enlace inválido. Debe empezar con \`https://whatsapp.com/channel/\``).catch(() => undefined);
      return;
    }

    const textoPlano = args.slice(1).join(" ").trim();
    if (!textoPlano) {
      await reply("Falta el texto de la reacción.").catch(() => undefined);
      return;
    }

    const convertido = estilizar(textoPlano);
    if (!convertido) {
      await reply("Nada que convertir.").catch(() => undefined);
      return;
    }

    await react("💠").catch(() => undefined);

    try {
      const partes = args[0].split("/");
      const idCanal = partes[4];
      const idMensaje = partes[5];

      if (!idCanal || !idMensaje) {
        await reply("❌ Al enlace le falta el id del canal o del mensaje.").catch(() => undefined);
        return;
      }

      const datos = await sock.newsletterMetadata("invite", idCanal);
      if (!datos?.id) {
        await reply("❌ Canal no encontrado o sin acceso.").catch(() => undefined);
        return;
      }

      await sock.newsletterReactMessage(datos.id, idMensaje, convertido);

      await react("✅").catch(() => undefined);
      await reply(`Reacción enviada con *${convertido}* al mensaje del canal *${datos.name}*.`).catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ ${fytBold("Error")}: ${e?.message || e}`).catch(() => undefined);
    }
  },
};
