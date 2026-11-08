import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

const VALID_DURATIONS = {
  "1m": 60,
  "1h": 3600,
  "1d": 86400,
  "1": 86400,
  "24h": 86400,
  "24": 86400,
  "7d": 604800,
  "7": 604800,
  "90d": 7776000,
  "90": 7776000,
  off: false,
  disable: false,
  desactivar: false,
} as const;

const formatDuration = (seconds?: number | null): string =>
  seconds === 86400
    ? t("tempMsgDurationOne")
    : seconds
      ? t("tempMsgDurationMany", { days: seconds / 86400 })
      : t("tempMsgDisabled");

export default {
  name: ["tempmsg", "tempmessage", "ephemeral", "ephemeralmsg", "ephemeralmessage", "temporalyMessage", "temporalyMsg", "temporalyMessage"],
  category: "group",
  description: t("tempMsgDescription"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,

  async run(ctx: CommandContext) {
    const { sock, args, groupMeta, from } = ctx;
    const prefix = ctx.usedPrefix || ctx.prefix || ".";
    const currentDuration = formatDuration(groupMeta?.ephemeralDuration);

    const text = t("tempMsgHelp", {
      current: fytBold(currentDuration),
      prefix,
      system: fytBold(t("cmd_system_info_1a78a0cb")),
    });

    if (!args.length) {
      return ctx.reply(text);
    }

    const duration = args[0].toLowerCase();

    if (!(duration in VALID_DURATIONS)) {
      return ctx.reply(
        t("tempMsgInvalid", {
          system: fytBold(t("cmd_system_info_1a78a0cb")),
        }),
      );
    }

    const ephemeralDuration =
      VALID_DURATIONS[duration as keyof typeof VALID_DURATIONS];
    await sock.sendMessage(from, {
      disappearingMessagesInChat: ephemeralDuration,
    });

    const updatedDuration = formatDuration(
      typeof ephemeralDuration === "number" ? ephemeralDuration : null,
    );
    return ctx.reply(
      t("tempMsgUpdated", {
        duration: fytBold(updatedDuration),
      }),
    );
  },
};
