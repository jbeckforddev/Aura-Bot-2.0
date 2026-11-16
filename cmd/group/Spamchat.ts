import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getActiveSockets(mainSock: any): any[] {
  const sockets: any[] = [];
  
  if (mainSock && typeof mainSock.sendMessage === "function") {
    sockets.push(mainSock);
  }

  const possibleArrays = [
    // @ts-ignore
    global.conns, global.subbots, global.clients, global.jadibot,
    mainSock?.conns, mainSock?.subbots, mainSock?.clients
  ];

  for (const arr of possibleArrays) {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item.sendMessage === "function" && !sockets.includes(item)) {
          sockets.push(item);
        }
      }
    } else if (arr && typeof arr === "object") {
      const vals = Object.values(arr);
      for (const item of vals) {
        if (item && typeof (item as any).sendMessage === "function" && !sockets.includes(item)) {
          sockets.push(item);
        }
      }
    }
  }
  return sockets;
}

export default {
  name: ["spamchat", "multispam", "subbotspam"],
  category: "group",
  description: "Envía mensajes masivos a un número extrayendo dinámicamente todos los sub-bots activos.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    if (args.length < 4) {
      return reply(
        `╭〔 🤖 ${fytBold("Multi-Subbot SpamChat")} 〕⬣\n` +
        `• *Uso correcto:*\n` +
        `  \`${prefix}spamchat <numero> <cantidad> <subbots> <mensaje>\`\n\n` +
        `• *Ejemplo:*\n` +
        `  \`${prefix}spamchat 573118353868 2 2 Hola test\`\n` +
        `  \`${prefix}spamchat 573118353868 10 all Hola test\`\n` +
        `╰━━━━━━━━━━━━⬣`
      );
    }

    const targetNumber = args[0].replace(/[^0-9]/g, "");
    const count = parseInt(args[1], 10);
    const subbotCountArg = args[2].toLowerCase();
    const messageText = args.slice(3).join(" ").trim();

    if (!targetNumber || isNaN(count) || count <= 0 || !messageText) {
      return reply(`❌ Parámetros inválidos. Verifica el número, la cantidad y el mensaje.`);
    }

    const targetJid = `${targetNumber}@s.whatsapp.net`;

    const subbotsList = getActiveSockets(sock);

    let botsToUse = subbotsList;
    if (subbotCountArg !== "all") {
      const requestedBots = parseInt(subbotCountArg, 10);
      if (!isNaN(requestedBots) && requestedBots > 0) {
        botsToUse = subbotsList.slice(0, requestedBots);
      }
    }

    if (botsToUse.length === 0) {
      return reply(`❌ Error crítico: No se encontró ningún socket para enviar mensajes.`);
    }

    await react("🚀").catch(() => undefined);
    
    let infoMsg = `🚀 Enviando \`${count}\` mensaje(s) a \`${targetNumber}\` usando \`${botsToUse.length}\` sub-bot(s)...`;
    if (botsToUse.length === 1 && subbotCountArg !== "1") {
       infoMsg += `\n_⚠️ Nota: Se detectó 1 solo socket válido en la memoria global._`;
    }
    await reply(infoMsg);

    let sentTotal = 0;
    const delayMs = 300; 

    try {
      for (let i = 0; i < count; i++) {
        const currentBot = botsToUse[i % botsToUse.length];
        
        await currentBot.sendMessage(targetJid, {
          text: `${messageText} [${i + 1}/${count}]`,
        });

        sentTotal++;
        if (i + 1 < count) {
          await sleep(delayMs);
        }
      }

      await react("✅").catch(() => undefined);
      await reply(
        `✅ Ráfaga completada con éxito.\n• Mensajes: \`${sentTotal}\`\n• Sub-bots usados: \`${botsToUse.length}\``
      );
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ Error al ejecutar el spamchat: ${e?.message || String(e)}`);
    }
  },
};
