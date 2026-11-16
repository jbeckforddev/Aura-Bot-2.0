import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: ["spamchat", "multispam", "subbotspam"],
  category: "group",
  description: "Envía mensajes masivos usando banderas estrictas -c (cantidad) y -b (subbots).",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    if (args.length < 2) {
      return reply(
        `╭〔 🤖 ${fytBold("Multi-Subbot SpamChat (Flags)")} 〕⬣\n` +
        `• *Uso correcto:*\n` +
        `  \`${prefix}spamchat <numero> -c <cantidad> -b <all|num> <mensaje>\`\n\n` +
        `• *Ejemplos:*\n` +
        `  \`${prefix}spamchat 573118353868 -c 2 -b 2 Hola test\`\n` +
        `  \`${prefix}spamchat 573118353868 -c 10 -b all Hola test\`\n` +
        `╰━━━━━━━━━━━━⬣`
      );
    }

    const targetNumber = args[0].replace(/[^0-9]/g, "");
    if (!targetNumber) {
      return reply(`❌ El número de destino no es válido.`);
    }

    let count = 2;
    let subbotArg = "all";
    const textTokens: string[] = [];

    // Parseo estricto por banderas para evitar confusiones de números
    for (let i = 1; i < args.length; i++) {
      const token = args[i];
      const low = token.toLowerCase();

      if (low === "-c" || low === "--count") {
        if (args[i + 1] && /^\d+$/.test(args[i + 1])) {
          count = parseInt(args[i + 1], 10);
          i++;
          continue;
        }
      } else if (low === "-b" || low === "--bots" || low === "--subbots") {
        if (args[i + 1]) {
          subbotArg = args[i + 1].toLowerCase();
          i++;
          continue;
        }
      } else {
        textTokens.push(token);
      }
    }

    const messageText = textTokens.join(" ").trim();
    if (!messageText) {
      return reply(`❌ Debes incluir el mensaje que deseas enviar.`);
    }

    const targetJid = `${targetNumber}@s.whatsapp.net`;

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
      await reply(`✅ Ráfaga completada con éxito. Mensajes enviados: \`${sentTotal}\` usando \`${botsToUse.length}\` subbot(s).`);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ Error al ejecutar el spamchat: ${e?.message || String(e)}`);
    }
  },
};
