import type { CommandContext } from "../../types/index.d.ts";
import { createPremiumToken } from "../../core/premiumTokens.ts";
import { syncPremiumBotTypes } from "../../connection/premBotManager.ts";
import { t } from "../../src/langs/index.ts";
import { parsePremiumDuration } from "../../core/premiumTokens.ts";

export default {
  name: ["createtoken", "newtoken", "generatetoken", "creartoken"],
  category: "system",
  description: t("premiumTokenCreateDescription"),
  modOnly: true,
  privateOnly: false,
  hideCmd: true,

  async run({ args, reply, usedPrefix }: CommandContext) {
    const [first, second] = args;
    let tokenId: string | null;
    let duration: string;

    if (!first) {
      return reply({
        text: t("premiumTokenCreateUsage", {
          example: `${usedPrefix ?? "."}createtoken [token|auto] <duración>`,
        }),
      });
    }

    try {
      if (first.toLowerCase() === "auto") {
        tokenId = null;
        duration = second ?? "";
      } else {
        try {
          parsePremiumDuration(first);
          tokenId = null;
          duration = first;
        } catch {
          tokenId = first;
          duration = second ?? "";
        }
      }

      if (!duration) {
        return reply({
          text: t("premiumTokenCreateUsage", {
            example: `${usedPrefix ?? "."}createtoken [token|auto] <duración>`,
          }),
        });
      }

      const token = createPremiumToken(tokenId, duration);
      await syncPremiumBotTypes();
      return reply({
        text: t("premiumTokenCreated", {
          token: token.id,
          expiration: token.expiresAt
            ? t("premiumTokenExpiryDate", {
                date: new Date(token.expiresAt).toLocaleString("es-CR"),
              })
            : t("premiumTokenPending"),
        }),
      });
    } catch (error) {
      return reply({
        text: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
