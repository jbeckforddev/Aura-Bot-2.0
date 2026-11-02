import type { CommandContext } from "../../types/index.d.ts";
import { deletePremiumToken } from "../../core/premiumTokens.ts";
import { syncPremiumBotTypes } from "../../connection/premBotManager.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["deletetoken", "deltoken"],
  category: "system",
  description: t("premiumTokenDeleteDescription"),
  modOnly: true,
  privateOnly: false,
  hideCmd: true,

  async run({ args, reply, usedPrefix }: CommandContext) {
    const tokenId = String(args[0] ?? "").trim();
    if (!tokenId) {
      return reply({
        text: t("premiumTokenDeleteUsage", {
          example: `${usedPrefix ?? "."}deletetoken auratest`,
        }),
      });
    }

    try {
      const token = deletePremiumToken(tokenId);
      if (!token) {
        return reply({
          text: t("premiumTokenNotFound"),
        });
      }
      await syncPremiumBotTypes();
      return reply({
        text: t("premiumTokenDeleted", { token: token.id }),
      });
    } catch (error) {
      return reply({
        text: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
