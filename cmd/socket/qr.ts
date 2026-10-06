import type { CommandContext } from "../../types/index.d.ts";
import qr from "qr-image";
import { requestSubBotLink } from "../../core/subbotManager.ts";
import { IS_SUBBOT_ONLINE } from "../../core/socketText.ts";

export default {
  name: ["qr", "vincularqr"],
  description: "Vincula un subbot mediante código QR.",
  category: "socket",
  ownerOnly: false,

  async run({ sender, reply }: CommandContext) {
    await reply({ text: "⏳ Preparando el código QR de vinculación..." });
    await requestSubBotLink({
      requester: sender,
      method: "qr",
      onQr: async (value) => {
        void reply({
          image: qr.imageSync(value, { type: "png" }),
          caption: "📱 Escanea este QR para vincular el subbot.",
        } as Parameters<typeof reply>[0]);
      },
      onConnected: async () => {
        void reply({ text: IS_SUBBOT_ONLINE({ prefix: "." }) });
      },
    });
  },
};
