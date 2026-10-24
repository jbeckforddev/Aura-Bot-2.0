import { requestSubBotLink } from "../../connection/subbotManager.ts";
import { IS_SUBBOT_ONLINE } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";
import type { CommandContext } from "../../types/index.d.ts";

export default {
  name: ["code", "pairingcode", "vincularcode"],
  description: t("socketDescriptionCode"),
  category: "socket",
  ownerOnly: false,

  async run({ args, sender, reply, copy, usedPrefix }: CommandContext) {
    const requiresManualPhone = sender.endsWith("@lid");
    const senderPhone = sender.split("@")[0].split(":")[0].replace(/\D/g, "");
    const phoneNumber = String(
      args[0] || (requiresManualPhone ? "" : senderPhone),
    ).replace(/\D/g, "");
    const commandPrefix = usedPrefix ?? ".";
    if (!/^[1-9]\d{7,14}$/.test(phoneNumber)) {
      await reply({
        text: requiresManualPhone
          ? t("socketCodeLidPhone", { example: `${commandPrefix}code 50612345678` })
          : t("socketCodePhoneMissing", { example: `${commandPrefix}code 50612345678` }),
      });
      return;
    }

    const paringCodeText = t("socketCodeInstructions");
    const tagUser = sender.includes("@") ? sender.split("@")[0] : sender;

    await reply({
      text: t("socketCodePreparing", { tagUser }),
      mentions: [sender],
    });
    await requestSubBotLink({
      requester: sender,
      method: "code",
      phoneNumber,
      onPairingCode: async (code) => {
        const messageText =
          paringCodeText +
          `\n${t("socketCodeYourCode", { code })}`;

        await copy(messageText, code, t("socketCodeCopy"));
      },
      onConnected: () =>
        void reply({ text: IS_SUBBOT_ONLINE({ prefix: commandPrefix }) }),
      onPairingError: (error) =>
        void reply({
          text: t("socketCodeRejected", { error: error.message }),
        }),
      onPairingExpired: () =>
        void reply({
          text: t("socketCodeExpired"),
        }),
    });
  },
};
