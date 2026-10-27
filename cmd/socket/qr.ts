import type { CommandContext } from "../../types/index.d.ts";
import qr from "qr-image";
import { requestSubBotLink } from "../../connection/subbotManager.ts";
import { IS_SUBBOT_ONLINE } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["qr", "vincularqr"],
  description: t("socketDescriptionQr"),
  category: "socket",
  ownerOnly: false,

  async run({ sender, reply, usedPrefix }: CommandContext) {
    await reply({ text: t("socketQrPreparing") });
    await requestSubBotLink({
      requester: sender,
      method: "qr",
      onQr: async (value) => {
        void reply({
          image: qr.imageSync(value, { type: "png" }),
          caption: t("socketQrCaption"),
        } as Parameters<typeof reply>[0]);
      },
      onConnected: async () => {
        void reply({ text: IS_SUBBOT_ONLINE({ prefix: usedPrefix ?? "." }) });
      },
      onSessionClosed: (reason) => {
        if (reason === "loggedOut") {
          void reply({ text: t("socketSubBotLoggedOut") });
        } else {
          void reply({ text: t("socketSubBotDisconnected", { reason }) });
        }
      },
    });
  },
};
