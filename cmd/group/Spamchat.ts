import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: ["spamchat", "multispam", "subbotspam"],
  category: "group",
  description: "Envía mensajes masivos a un número usando subbots con un analizador de argumentos flexible.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    if (args.length < 2) {
      return reply(
        `╭〔 🤖 ${fytBold("Multi-Subbot SpamChat")} 〕⬣\n` +
        `• *Uso correcto:* \`${prefix}spamchat <numero> [cantidad] [all|subbots] <mensaje>\`\n\n` +
        `• *Ejemplos válidos:*\n` +
        `  \`${prefix}spamchat 573138523021 10 all Hola prueba\`\n` +
        `  \`${prefix}spamchat 573138523021 all 10 Hola prueba\`\n` +
        `  \`${prefix}spamchat 573138523021 Hola prueba\` (Usa 10 por defecto y todos los bots)\n` +
        `╰━━━━━━━━━━━━⬣`
      );
    }

    const targetNumber = args[0].replace(/[^0-9]/g, "");
    if (!targetNumber) {
      return reply(`❌ El número de destino no es válido.`);
    }

    let count = 10;
    let subbotArg = "all";
    let textStartIndex = 1;

    // Analizador inteligente de argumentos flexibles
    for (let i = 1; i < args.length; i++) {
      const token = args[i];
      const low = token.toLowerCase();

      if (low === "all" || /^\d+$/.test(token)) {
        if (/^\d+$/.test(token) && i === 1 && args.length > 2 && !/^\d+$/.test(args[2]) && args[2].toLowerCase() !== "all") {
          // Es claramente la cantidad numérica
          count = parseInt(token, 10);
          textStartIndex = i + 1;
        } else if (low === "all" || (/^\d+$/.test(token) && parseInt(token, 10) <= 20)) {
          // Es el selector de subbots
          subbotArg = low;
          textStartIndex = i + 1;
        } else if (/^\d+$/.test(token) && count === 10) {
          count = parseInt(token, 10);
          textStartIndex = i + 1;
        }
      } else {
        // Encontramos el inicio del mensaje de texto
        textStartIndex = i;
        break;
      }
    }

    const messageText = args.slice(textStartIndex).join(" ");
    if (!messageText) {
      return reply(`❌ Debes incluir el mensaje que deseas enviar.`);
    }

    const targetJid = `${targetNumber}@s.whatsapp.net`;

    // Obtener subbots activos del entorno global
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
    await reply(`🚀 Enviando \`${count}\` mensaje(s) a \`${targetNumber}\` usando \`${botsToUse.length}\` subbot(s)...`);

    let sentTotal = 0;
    const delayMs = 200;

    try {
      for (let i = 0; i < count; i++) {
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
      await reply(`✅ Ráfaga completada con éxito. Mensajes enviados: \`${sentTotal}\`.`);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ Error al ejecutar el spamchat: ${e?.message || String(e)}`);
    }
  },
};
