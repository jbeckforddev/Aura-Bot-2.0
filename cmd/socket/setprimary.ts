import type { CommandContext } from "../../types/index.d.ts";
import type { DatabaseBot } from "../../types/database.d.ts";
import type { proto } from "baileys";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";
import { invalidateGroupCache } from "../../handler.ts";

type BotParticipant = {
  id?: string;
  lid?: string;
  jid?: string;
  phoneNumber?: string;
};

function normalize(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/:.*(?=@)/, "");
}

function isPhoneJid(value: unknown): boolean {
  return /^\d+@s\.whatsapp\.net$/.test(normalize(value));
}

async function getBotMention(
  bot: DatabaseBot,
  participants: BotParticipant[],
  resolveLid?: (jid: string) => Promise<string>,
): Promise<string> {
  const directJid = [bot.jid, bot.data?.jid, bot.phone_number].find(isPhoneJid);
  if (directJid) return normalize(directJid);

  const identities = [bot.bot_id, bot.lid, bot.jid].map(normalize);
  const participant = participants.find((entry: BotParticipant) =>
    [entry?.id, entry?.lid, entry?.jid, entry?.phoneNumber]
      .map(normalize)
      .some((jid: string) => jid && identities.includes(jid)),
  );
  const participantJid = [
    participant?.phoneNumber,
    participant?.jid,
    participant?.id,
  ].find(isPhoneJid);
  if (participantJid) return normalize(participantJid);

  const lid = [bot.lid, bot.bot_id].find((jid) =>
    String(jid || "").endsWith("@lid"),
  );
  if (lid && resolveLid) {
    const resolved = await resolveLid(normalize(lid));
    if (isPhoneJid(resolved)) return normalize(resolved);
  }

  return "";
}

function getTargetFromMessage(message: proto.IWebMessageInfo): string | null {
  const contextInfos = Object.values(message?.message ?? {})
    .map(
      (value) =>
        (
          value as {
            contextInfo?: {
              mentionedJid?: string[];
              quotedMessage?: unknown;
              participant?: string;
            };
          } | null
        )?.contextInfo,
    )
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const mentioned = contextInfos.flatMap(
    (context) => context.mentionedJid ?? [],
  );
  const quotedParticipant = contextInfos.find(
    (context) => context.quotedMessage,
  )?.participant;

  return mentioned[0] || quotedParticipant || null;
}

export default {
  name: ["setprimary", "delprimary"],
  description: t("socketDescriptionSetPrimary"),
  category: "socket",
  groupOnly: true,
  adminOnly: true,

  async run({
    args,
    cmdName,
    db,
    from,
    msg,
    reply,
    sock,
    botJid,
    groupMeta,
    resolveLid,
  }: CommandContext) {
    const requestedBot = normalize(getTargetFromMessage(msg) || args[0] || "");

    if (cmdName === "delprimary") {
      if (requestedBot) {
        const targetBot = db.getBotById?.(requestedBot);
        if (!targetBot)
          return reply({
            text: t("socketPrimaryNotFoundMentioned"),
          });
        const currentPrimary = normalize(db.getPrimary(from));
        if (currentPrimary && normalize(targetBot.bot_id) !== currentPrimary) {
          return reply({
            text: t("socketPrimaryNotCurrent"),
          });
        }
      }

      db.setPrimary(from, "");
      invalidateGroupCache(from);
      return reply({
        text: t("socketPrimaryDeleted", {
          label: fytBold(t("socketPrimaryLabel")),
        }),
      });
    }

    const currentBot = normalize(
      sock.subBotId || db.getBot(botJid)?.bot_id || botJid,
    );
    const selectedBot = requestedBot
      ? db.getBotById?.(requestedBot)
      : db.getBot(botJid);
    if (requestedBot && !selectedBot) {
      return reply({
        text: t("socketPrimaryNotFound"),
      });
    }
    if (selectedBot?.status !== "active") {
      return reply({
        text: t("socketPrimaryInactive"),
      });
    }
    const targetBot = selectedBot?.bot_id || currentBot;
    if (!targetBot) {
      return reply({
        text: t("socketPrimaryNotFound"),
      });
    }

    db.setPrimary(from, targetBot);
    invalidateGroupCache(from);
    const mentionJid = await getBotMention(
      selectedBot || db.getBotById?.(targetBot),
      groupMeta?.participants || [],
      resolveLid,
    );
    const targetName = String(
      selectedBot?.bot_name || t("socketPrimaryDefaultName"),
    ).trim();
    return reply({
      text: mentionJid
        ? t("socketPrimaryConfiguredMention", {
            label: fytBold(t("socketPrimaryConfiguredLabel")),
            number: mentionJid.split("@")[0],
          })
        : t("socketPrimaryConfiguredName", {
            label: fytBold(t("socketPrimaryConfiguredLabel")),
            name: targetName,
          }),
      mentions: mentionJid ? [mentionJid] : [],
    });
  },
};
