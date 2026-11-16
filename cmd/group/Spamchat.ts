import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: ["spamchat", "multispam", "subbotspam"],
  category: "group",
  description: "Envía mensajes masivos a un número usando múltiples subbots con soporte para formato directo y banderas.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    if (args.length < 2) {
      return reply(
        `╭〔 🤖 ${fytBold("Multi-Subbot SpamChat")} 〕⬣\n` +
        `• *Uso directo:* \`${prefix}spamchat <numero> <cantidad> <all|num> <mensaje>\`\n` +
        `• *Ejemplo:* \`${prefix}spamchat 573118353868 2 2 test\`\n` +
        `╰━━━━━━━━━━━━⬣`
      );
    }

    const targetNumber = args[0].replace(/[^0-9]/g, "");
    if (!targetNumber) {
      return reply(`❌ El número de destino no es válido.`);
    }

    let count = 10;
    let subbotArg = "all";
    let messageText = "";

    // Detectar si está usando banderas (-c / -b) o el formato posicional directo
    if (args.includes("-c") || args.includes("-b") || args.includes("--count") || args.includes("--bots")) {
      const textTokens: string[] = [];
      for (let i = 1; i < args.length; i++) {
        const token = args[i];
        const low = token.toLowerCase();
        if ((low === "-c" || low === "--count") && args[i + 1] && /^\d+$/.test(args[i + 1])) {
          count = parseInt(args[i + 1], 10);
          i++;
        } else if ((low === "-b" || low === "--bots") && args[i + 1]) {
          subbotArg = args[i + 1].toLowerCase();
          i++;
        } else {
          textTokens.push(token);
        }
      }
      messageText = textTokens.join(" ").trim();
    } else {
      // Formato posicional directo: .spamchat <numero> <cantidad> <all|num> <mensaje>
      if (args.length >= 3 && /^\d+$/.test(args[1]) && (/^\d+$/.test(args[2]) || args[2]?.toLowerCase() === "all")) {
        count = parseInt(args[1], 10);
        subbotArg = args[2].toLowerCase();
        messageText = args.slice(3).join(" ").trim();
      } else {
        messageText = args.slice(1).join(" ").trim();
      }
    }

    if (!messageText) {
      return reply(`❌ Debes incluir el mensaje que deseas enviar.`);
    }

    const targetJid = `${targetNumber}@s.whatsapp.net`;

    // Obtener la lista de subbots activos del entorno global
    // @ts-ignore
    const subbotsList: any[] = global.conns || global.subbots || sock.conns || [sock];

    let botsToUse = subbotsList;
    if (subbotArg !== "all") {
      const numBots = parseInt(subbotArg, 10);
      if (!isNaN(numBots) && numBots > 0) {
        botsToUse = subbotsList.slice(0, numBots);
      }
    }

    if (!botsToUse || botsToUse.length === 0) {
      botsToUse = [sock];
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
      await reply(`✅ Ráfaga completada con éxito. Mensajes: \`${sentTotal}\` usando \`${botsToUse.length}\` subbot(s).`);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ Error al ejecutar el spamchat: ${e?.message || String(e)}`);
    }
  },
};
