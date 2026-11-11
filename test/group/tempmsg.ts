
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2592000,
};

const DISABLE_VALUES = new Set([
  "off",
  "disable",
  "desactivar",
]);

function parseDuration(value: string): number | false | null {
  const input = value.trim().toLowerCase();

  if (DISABLE_VALUES.has(input)) {
    return false;
  }

  const match = input.match(/^(\d+(?:[.,]\d+)?)\s*(mo|s|m|h|d|w)$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(",", "."));
  const multiplier = UNIT_SECONDS[match[2]];

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const seconds = amount * multiplier;

  return Number.isSafeInteger(seconds) ? seconds : null;
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) {
    return t("tempMsgDisabled");
  }

  const units = [
    { label: "mes", plural: "meses", seconds: UNIT_SECONDS.mo },
    { label: "semana", plural: "semanas", seconds: UNIT_SECONDS.w },
    { label: "día", plural: "días", seconds: UNIT_SECONDS.d },
    { label: "hora", plural: "horas", seconds: UNIT_SECONDS.h },
    { label: "minuto", plural: "minutos", seconds: UNIT_SECONDS.m },
    { label: "segundo", plural: "segundos", seconds: UNIT_SECONDS.s },
  ];

  const parts: string[] = [];
  let remaining = seconds;

  for (const unit of units) {
    const amount = Math.floor(remaining / unit.seconds);

    if (amount > 0) {
      parts.push(`${amount} ${amount === 1 ? unit.label : unit.plural}`);
      remaining %= unit.seconds;
    }

    if (remaining === 0) break;
  }

  return parts.join(" ");
}

export default {
  name: [
    "tempmsg",
    "tempmessage",
    "ephemeral",
    "ephemeralmsg",
    "ephemeralmessage",
    "temporalyMessage",
    "temporalyMsg",
  ],
  category: "group",
  description: t("tempMsgDescription"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,

  async run(ctx: CommandContext) {
    const { sock, args, groupMeta, from } = ctx;
    const prefix = ctx.usedPrefix || ctx.prefix || ".";

    const currentDuration = formatDuration(groupMeta?.ephemeralDuration);

    const text = [
      "╭〔 ⏳ MENSAJES TEMPORALES 〕⬣",
      "┃ ⚙️ CONFIGURACIÓN",
      "╰━━━━━━━━━━━━⬣",
      "",
      "┣━━〔 📊 ESTADO ACTUAL 〕━⬣",
      "",
      `┃ ⏱️ Duración › ${fytBold(currentDuration)}`,
      "",
      "┣━━〔 🕒 DURACIONES 〕━⬣",
      "",
      "┃ ✦ `1m` › 1 minuto",
      "┃ ✦ `1h` › 1 hora",
      "┃ ✦ `1d` › 1 día",
      "┃ ✦ `7d` › 7 dias",
      "┃ ✦ `90d` › 90 dias",
      "┃ ✦ `off` › Desactivar",
      "",
      `┃ > Ejemplo: \`${prefix}tempmsg 7d\``,
      `┃ > Desactivar: \`${prefix}tempmsg off\``,
      "",
      `╰━━〔 ${fytBold(t("cmd_system_info_1a78a0cb"))} 〕━━⬣`,
    ].join("\n");

    if (!args.length) {
      return ctx.reply(text);
    }

    const input = args.join("").toLowerCase();
    const ephemeralDuration = parseDuration(input);

    if (ephemeralDuration === null) {
      return ctx.reply(
        t("tempMsgInvalid", {
          system: fytBold(t("cmd_system_info_1a78a0cb")),
        }),
      );
    }

    try {
      await sock.sendMessage(from, {
        disappearingMessagesInChat: ephemeralDuration,
      });
    } catch {
      return ctx.reply(
        "✖ No se pudo actualizar la duración de los mensajes temporales.",
      );
    }

    const updatedDuration = formatDuration(
      typeof ephemeralDuration === "number"
        ? ephemeralDuration
        : null,
    );

    return ctx.reply(
      t("tempMsgUpdated", {
        duration: fytBold(updatedDuration),
      }),
    );
  },
};
