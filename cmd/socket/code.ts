import { requestSubBotLink } from "../../core/subbotManager.ts";
import { IS_SUBBOT_ONLINE, fytBold } from "../../core/socketText.ts";
import type { CommandContext } from "../../types/index.d.ts";

export default {
  name: ["code", "pairingcode", "vincularcode"],
  description: "Vincula un subbot mediante código.",
  category: "socket",
  ownerOnly: false,

  async run({ args, sender, reply, copy }: CommandContext) {
    let paringCodeText = `╭〔 📲 𝐈𝐍𝐒𝐓𝐑𝐔𝐂𝐂𝐈𝐎𝐍𝐄𝐒 〕⬣\n┃ 1. Sal a tu menú de chats\n┃ 2. Toca el botón \`⋮\`\n┃ 3. Ve a \`dispositivos\`\n┃ 4. Toca \`vincular dispositivo\`\n┃ 5. Toca \`vincular con código\`\n┃ 6. Espera y confirma conexión\n╰━━━━━━━━━━━━⬣
    `;
    const tagUser = sender.includes("@") ? sender.split("@")[0] : sender;

    await reply({
      text: `╭〔 ⚡ 𝐏𝐑𝐄𝐏𝐀𝐑𝐀𝐂𝐈𝐎́𝐍 〕⬣\n┃ Hola @${tagUser}\n┃ ya casi recibes el\n┃ código de vinculación\n╰━━━━━━━━━━━━⬣`,
      mentions: [sender],
    });
    await requestSubBotLink({
      requester: sender,
      method: "code",
      phoneNumber: args[0],
      onPairingCode: async (code) => {
        const messageText =
          paringCodeText +
          `\n╭〔 🔑 ${fytBold("TU CODIGO")} 〕⬣\n┃ ${code}\n╰━━━━━━━━━━━━⬣`;

        await copy(messageText, code, "📋 Copiar código");
      },
      onConnected: () =>
        void reply({ text: IS_SUBBOT_ONLINE({ prefix: "." }) }),
      onPairingError: (error) =>
        void reply({
          text: `❌ WhatsApp rechazó la solicitud del código: ${error.message}`,
        }),
      onPairingExpired: () =>
        void reply({
          text: "⌛ El código expiró después de 1 minuto. El subbot quedó offline; solicita otro código para volver a intentarlo.",
        }),
    });
  },
};
