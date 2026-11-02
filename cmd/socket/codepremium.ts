import { requestPremBotLink } from "../../connection/premBotManager.ts";
import { t } from "../../src/langs/index.ts";
import type { CommandContext } from "../../types/index.d.ts";

export default {
  name: ["codepremium", "premcode"],
  description: t("socketDescriptionCodePremium"),
  category: "socket",
  cooldown: 60000,
  ownerOnly: false,
  privateOnly: false,

  async run({ args, sender, reply, copy, usedPrefix }: CommandContext) {
    const commandPrefix = usedPrefix ?? ".";
    const providedPhone = /^\d{8,15}$/.test(String(args[0] ?? ""));
    const phoneNumber = providedPhone
      ? String(args[0])
      : sender.endsWith("@lid")
        ? ""
        : sender.split("@")[0].split(":")[0].replace(/\D/g, "");
    const token = String(args[providedPhone ? 1 : 0] ?? "").trim();

    if (!token) {
      return reply({
        text: t("premiumTokenCodeUsage", {
          prefix: commandPrefix,
          example: sender.endsWith("@lid")
            ? `${commandPrefix}codepremium 50612345678 <token>`
            : `${commandPrefix}codepremium <token>`,
        }),
      });
    }

    if (!/^[1-9]\d{7,14}$/.test(phoneNumber)) {
      return reply({
        text: t("socketCodeLidPhone", {
          example: `${commandPrefix}codepremium 50612345678 ${token}`,
        }),
      });
    }

    await reply({
      text: t("socketCodePreparing", { tagUser: sender.split("@")[0] }),
    });
    try {
      await requestPremBotLink({
        requester: sender,
        method: "code",
        phoneNumber,
        token,
        onPairingCode: async (code) => {
          await copy(
            `${t("socketCodeInstructions")}\n${t("socketCodeYourCode", { code })}`,
            code,
            t("socketCodeCopy"),
          );
        },
        onConnected: (botType) =>
          void reply({
            text: t(
              botType === "Prem-Bot"
                ? "premiumTokenConnected"
                : "premiumTokenLinkDowngraded",
              { type: botType ?? "Sub-Bot" },
            ),
          }),
        onPairingError: (error) =>
          void reply({
            text: t("socketCodeRejected", { error: error.message }),
          }),
        onPairingExpired: () =>
          void reply({
            text: t("socketCodeExpired"),
          }),
      });
    } catch (error) {
      await reply({
        text: t("premiumTokenLinkError", {
          error: error instanceof Error ? error.message : String(error),
        }),
      });
    }
  },
};
