import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: ["spamchat", "multispam", "subbotspam"],
  category: "group",
  description: "Envía mensajes masivos a un número usando múltiples sub-bots de forma precisa.",
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
        `  \`${prefix}spamchat 573118353868 5 all Hola test\`\n` +
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

    // Recolectar sub-bots activos de cualquier variable global o instancia posible del bot
    // @ts-ignore
    const rawConns = global.conns || global.subbots || global.clients || sock?.conns || [];
    const subbotsList: any[] = Array.isArray(rawConns)
      ? rawConns.filter((s: any) => s && typeof s.sendMessage === "function")
      : Object.values(rawConns).filter((s: any) => s && typeof s.sendMessage === "function");

    if (subbotsList.length === 0 && sock && typeof sock.sendMessage === "function") {
      subbotsList.push(sock);
    }

    let botsToUse = subbotsList;
    if (subbotCountArg !== "all") {
      const requestedBots = parseInt(subbotCountArg, 10);
      if (!isNaN(requestedBots) && requestedBots > 0) {
        botsToUse = subbotsList.slice(0, requestedBots);
      }
    }

    if (botsToUse.length === 0) {
      return reply(`❌ No hay sub-bots conectados disponibles en el sistema.`);
    }

    await react("🚀").catch(() => undefined);
    await reply(
      `🚀 Enviando \`${count}\` mensaje(s) a \`${targetNumber}\` usando \`${botsToUse.length}\` sub-bot(s)...`
    );

    let sentTotal = 0;
    const delayMs = 250;

    try {
      for (let i = 0; i < count; i++) {
        // Rotar cíclicamente entre los sub-bots seleccionados
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
      await reply(
        `✅ Ráfaga completada con éxito.\n• Mensajes: \`${sentTotal}\`\n• Sub-bots usados: \`${botsToUse.length}\``
      );
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ Error al ejecutar el spamchat: ${e?.message || String(e)}`);
    }
  },
};
