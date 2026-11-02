import qr from "qr-image";
import { requestPremBotLink } from "../../connection/premBotManager.ts";
import { t } from "../../src/langs/index.ts";
import type { CommandContext } from "../../types/index.d.ts";

export default {
  name: ["qrpremium", "premqr"],
  description: t("socketDescriptionQrPremium"),
  category: "socket",
  cooldown: 60000,
  ownerOnly: false,
  privateOnly: false,

  async run({ args, sender, reply }: CommandContext) {
    const token = String(args[0] ?? "").trim();
    if (!token) {
      return reply({
        text: t("premiumTokenQrUsage", { example: ".qrpremium <token>" }),
      });
    }

    await reply({ text: t("socketQrPreparing") });
    try {
      await requestPremBotLink({
        requester: sender,
        method: "qr",
        token,
        onQr: async (value) => {
          await reply({
            image: qr.imageSync(value, { type: "png" }),
            caption: t("socketQrCaption"),
          } as Parameters<typeof reply>[0]);
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
            text: t("premiumTokenLinkError", { error: error.message }),
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
