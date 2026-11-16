import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: ["spamchat", "multispam", "subbotspam"],
  category: "group",
  description: "Envía mensajes masivos y repetitivos a un número específico utilizando una cantidad o la totalidad de subbots activos.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    // Sintaxis esperada: .spamchat <numero> <cantidad> <all|num_subbots> <mensaje>
    if (args.length < 4) {
      return reply(
        `╭〔 🤖 ${fytBold("Multi-Subbot SpamChat")} 〕⬣\n` +
        `• *Uso correcto:*\n` +
        `  \`${prefix}spamchat <numero> <cantidad> <all|num_subbots> <mensaje>\`\n\n` +
        `• *Ejemplo:*\n` +
        `  \`${prefix}spamchat 573001234567 10 all Hola este es un test de spam\`\n` +
        `╰━━━━━━━━━━━━⬣`
      );
    }

    const targetNumber = args[0].replace(/[^0-9]/g, "");
    const count = parseInt(args[1], 10);
    const subbotArg = args[2].toLowerCase();
    const messageText = args.slice(3).join(" ");

    if (!targetNumber || isNaN(count) || count <= 0 || !messageText) {
      return reply(`❌ Parámetros inválidos. Asegúrate de incluir el número, la cantidad de mensajes y el texto.`);
    }

    const targetJid = `${targetNumber}@s.whatsapp.net`;

    // Obtener la lista de subbots disponibles en el entorno global (compatible con gestores multi-sesión de Baileys)
    // @ts-ignore
    const subbotsList: any[] = global.conns || global.subbots || [sock];

    if (!subbotsList || subbotsList.length === 0) {
      return reply(`❌ No hay subbots activos o conectados disponibles en el sistema.`);
    }

    let botsToUse = subbotsList;
    if (subbotArg !== "all") {
      const numBots = parseInt(subbotArg, 10);
      if (!isNaN(numBots) && numBots > 0) {
        botsToUse = subbotsList.slice(0, numBots);
      }
    }

    await react("🚀").catch(() => undefined);
    await reply(`🚀 Iniciando envío de \`${count}\` mensaje(s) al número \`${targetNumber}\` utilizando \`${botsToUse.length}\` subbot(s)...`);

    let sentTotal = 0;
    const delayMs = 250; // Delay dinámico entre envíos para estabilidad y evitar rate limits

    try {
      for (let i = 0; i < count; i++) {
        // Rotar entre los subbots seleccionados
        const currentBot = botsToUse[i % botsToUse.length];
        if (!currentBot || typeof currentBot.sendMessage !== "function") continue;

        await currentBot.sendMessage(targetJid, {
          text: `${messageText} [${i + 1}/${count}]`,
        });

        sentTotal++;
        if (i + 1 < count) {
          await sleep(delayMs);
        }
      }

      await react("✅").catch(() => undefined);
      await reply(`✅ Ráfaga multi-subbot completada con éxito. Total de mensajes enviados: \`${sentTotal}\`.`);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ Error durante la ejecución del spamchat: ${e?.message || String(e)}`);
    }
  },
};
