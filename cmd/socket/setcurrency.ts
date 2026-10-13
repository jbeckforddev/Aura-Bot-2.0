import type { CommandContext } from "../../types/index.d.ts";
import {
  DEFAULT_BOT_CURRENCY,
  formatMoney,
  getBotCurrency,
  setBotCurrency,
} from "../../core/economyConfig.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["setcurrency", "setmoneda", "currency", "setbotcurrency"],
  category: "socket",
  description: t("socketDescriptionSetCurrency"),
  botUserOnly: true,
  async run(ctx: CommandContext) {
    const prefix = ctx.usedPrefix ?? ".";
    const raw = ctx.args.join(" ").trim();
    const current = getBotCurrency(ctx);

    if (!raw) {
      return ctx.reply(t("socketCurrencyHelp", {
        name: current.name,
        symbol: current.symbol,
        example: formatMoney(1500, current),
        prefix,
      }));
    }

    if (["reset", "default", "aura", "auracoins"].includes(raw.toLowerCase())) {
      const restored = setBotCurrency(
        ctx.botJid,
        DEFAULT_BOT_CURRENCY.name,
        DEFAULT_BOT_CURRENCY.symbol,
      );
      return ctx.reply(t("socketCurrencyReset", {
        name: restored.name,
        symbol: restored.symbol,
        example: formatMoney(1500, restored),
      }));
    }

    const parts = raw.split(/\s+/);
    const maybeSymbol = parts.length > 1 ? parts[parts.length - 1] : "";
    const looksLikeSymbol =
      maybeSymbol.length > 0 &&
      maybeSymbol.length <= 4 &&
      !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]{5,}$/.test(maybeSymbol) &&
      (parts.length > 1 || /[^\p{L}\p{N}]/u.test(maybeSymbol));
    const symbol = looksLikeSymbol ? maybeSymbol : current.symbol;
    const name = looksLikeSymbol ? parts.slice(0, -1).join(" ") : raw;

    if (name.length < 2 || name.length > 24) {
      return ctx.reply(t("socketCurrencyInvalidName"));
    }
    if (/[\r\n]/.test(name) || /[\r\n]/.test(symbol)) {
      return ctx.reply(t("socketCurrencyNewline"));
    }
    if (symbol.length < 1 || symbol.length > 4) {
      return ctx.reply(t("socketCurrencyInvalidSymbol"));
    }

    const next = setBotCurrency(ctx.botJid, name, symbol);
    return ctx.reply(t("socketCurrencyUpdated", {
      name: next.name,
      symbol: next.symbol,
      example: formatMoney(1500, next),
    }));
  },
};

