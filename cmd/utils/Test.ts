import type { CommandContext } from "../../types/index.d.ts";

interface PrivateRelayOptions {
  mode: "include" | "exclude";
  target: string[];
  deviceMode: "all" | "primary";
  targetMe: boolean;
  hideDecryptFail: boolean;
}

export async function sendTargetedDeviceMessage(
  sock: any,
  chatJid: string,
  targetPhone: string,
  text?: string
): Promise<string> {
  const cleanPhone = targetPhone.replace(/\D/g, "");
  const targetJid = `${cleanPhone}@s.whatsapp.net`;
  const content = text || `🔒 Este mensaje solo se ve en el dispositivo vinculado a +${cleanPhone}`;

  const messageId = await sock.sendPrivateRelay(
    chatJid,
    { conversation: content },
    {
      mode: "include",
      target: [targetJid],
      deviceMode: "primary",
      targetMe: false,
      hideDecryptFail: true,
    } as PrivateRelayOptions
  );

  return messageId;
}

export default {
  name: ["privatetest", "solodevice", "relaytest"],
  category: "system",
  description: "Envía un mensaje segmentado visible únicamente en el dispositivo del destinatario",
  groupOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, args, reply, msg } = ctx;

    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const targetRaw =
      args[0] ||
      context?.mentionedJid?.[0] ||
      context?.participant;

    if (!targetRaw) {
      return reply("Debes indicar o citar a un usuario. Ejemplo: .solodevice 573118353868");
    }

    const cleanTarget = targetRaw.split("@")[0].split(":")[0].replace(/\D/g, "");
    const customText = args.slice(1).join(" ").trim();

    try {
      const messageId = await sendTargetedDeviceMessage(
        sock,
        from,
        cleanTarget,
        customText
      );

      await reply(`⚡ Mensaje privado enviado (ID: ${messageId}). Solo podrá leerlo el dispositivo de +${cleanTarget}.`);
    } catch (error) {
      await reply(`Error al enviar Private Relay: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
