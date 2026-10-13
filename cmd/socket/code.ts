import { requestSubBotLink } from "../../core/subbotManager.ts";
import { IS_SUBBOT_ONLINE, fytBold } from "../../core/socketText.ts";
import type { CommandContext } from "../../types/index.d.ts";

export default {
  name: ["code", "pairingcode", "vincularcode"],
  description: "Vincula un subbot mediante código de 8 dígitos.",
  category: "socket",
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { args, sender, reply, copy, react } = ctx;

    // Extracción inteligente: Si no pasa args, usa su propio número JID
    const inputNumber = args.join("");
    const phoneNumber = inputNumber ? inputNumber.replace(/\D/g, "") : sender.split("@")[0];

    await react("⏳").catch(() => undefined);

    const paringCodeText = `╭〔 📲 ${fytBold("INSTRUCCIONES")} 〕⬣
┃ 1. Abre WhatsApp en el celular a vincular
┃ 2. Toca los 3 puntos \`⋮\` (Arriba a la derecha)
┃ 3. Ve a \`Dispositivos vinculados\`
┃ 4. Toca \`Vincular un dispositivo\`
┃ 5. Toca \`Vincular con el número de teléfono\`
┃ 6. Ingresa el siguiente código:
╰━━━━━━━━━━━━⬣`;

    await reply({
      text: `╭〔 ⚡ ${fytBold("PREPARACIÓN")} 〕⬣\n┃ 🚀 Solicitando código para:\n┃ 📱 +${phoneNumber}\n╰━━━━━━━━━━━━⬣`,
    });

    await requestSubBotLink({
      requester: sender,
      method: "code",
      phoneNumber: phoneNumber,
      onPairingCode: async (code) => {
        await react("✅").catch(() => undefined);
        const messageText = paringCodeText + `\n\n╭〔 🔑 ${fytBold("CÓDIGO SECRETO")} 〕⬣\n┃ ${code}\n╰━━━━━━━━━━━━⬣`;
        await copy(messageText, code, "📋 Copiar código");
      },
      onConnected: async () => {
        await reply({ text: IS_SUBBOT_ONLINE({ prefix: "." }) });
      },
      onPairingError: async (error) => {
        await react("❌").catch(() => undefined);
        await reply({
          text: `╭〔 ❌ ${fytBold("ERROR DE RED")} 〕⬣\n┃ ⚠️ Meta rechazó la solicitud.\n┃ 📝 Motivo: ${error.message}\n╰━━━━━━━━━━━━⬣`,
        });
      },
      onPairingExpired: async () => {
        await reply({
          text: `╭〔 ⌛ ${fytBold("TIEMPO AGOTADO")} 〕⬣\n┃ ⚠️ El código de 8 dígitos expiró.\n┃ 🔄 Vuelve a usar el comando para generar\n┃ uno nuevo.\n╰━━━━━━━━━━━━⬣`,
        });
      },
    });
  },
};
