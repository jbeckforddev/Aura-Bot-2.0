import type { CommandContext } from "../../types/index.d.ts";
import type { DatabaseBot } from "../../types/database.d.ts";
import { fytBold } from "../../core/socketText.ts";
import {
  resolveAccountBotType,
  type BotType,
} from "../../core/botType.ts";
import { t } from "../../src/langs/index.ts";

type BotParticipant = {
  id?: string;
  lid?: string;
  jid?: string;
  phoneNumber?: string;
};

function normalizeNumber(value: unknown): string {
  return String(value || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function normalizeGroup(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/:.+@/, "@");
}

function cleanJid(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/:\d+(?=@)/, "");
}

function isPhoneJid(value: unknown): boolean {
  return /^\d+@s\.whatsapp\.net$/.test(cleanJid(value));
}

function getBotNumber(bot: DatabaseBot, fallback?: string): string {
  const jid = [
    bot.jid,
    bot.phone_number,
    bot.data?.jid,
    fallback,
    bot.bot_id,
  ].find((value) => isPhoneJid(value));
  return normalizeNumber(jid);
}

function matchesIdentity(value: unknown, identities: unknown[]): boolean {
  const normalized = cleanJid(value);
  if (!normalized) return false;
  return identities.some((identity) => {
    const candidate = cleanJid(identity);
    return candidate && candidate === normalized;
  });
}

async function resolveBotJid(
  bot: DatabaseBot,
  participants: BotParticipant[],
  resolveLid?: (jid: string) => Promise<string>,
): Promise<string> {
  const identities = [bot.bot_id, bot.lid, bot.jid, bot.phone_number].filter(
    Boolean,
  );
  const participant = participants.find(
    (entry: BotParticipant) =>
      matchesIdentity(entry?.id, identities) ||
      matchesIdentity(entry?.lid, identities) ||
      matchesIdentity(entry?.jid, identities) ||
      matchesIdentity(entry?.phoneNumber, identities),
  );

  const participantJid = [
    participant?.phoneNumber,
    participant?.jid,
    participant?.id,
  ].find((value) => isPhoneJid(value));
  if (participantJid) return cleanJid(participantJid);

  const directJid = [bot.jid, bot.phone_number, bot.data?.jid].find((value) =>
    isPhoneJid(value),
  );
  if (directJid) return cleanJid(directJid);

  const lid = [bot.lid, bot.bot_id].find((value) =>
    String(value || "").endsWith("@lid"),
  );
  if (lid && resolveLid) {
    const resolved = await resolveLid(cleanJid(lid));
    if (isPhoneJid(resolved)) return cleanJid(resolved);
  }

  return "";
}

function getEffectiveBotType(bot: DatabaseBot): BotType {
  return resolveAccountBotType({
    botType: bot.bot_type,
    isMain: bot.isMain,
    isSubBot: Number(bot.isMain) !== 1,
    premiumToken: bot.data?.premiumToken,
    jid: bot.jid,
  });
}

function getBotType(bot: DatabaseBot): string {
  const botType = getEffectiveBotType(bot);
  if (botType === "Principal") return t("socketBotsMainType");
  return t(botType === "Prem-Bot" ? "socketBotsPremiumType" : "socketBotsSubType");
}

export default {
  name: ["bots", "btos", "subbots", "lista-bots"],
  category: "socket",
  description: t("socketDescriptionBots"),
  ownerOnly: false,

  async run({
    from,
    db,
    groupMeta,
    resolveLid,
    usedPrefix,
    reply,
  }: CommandContext) {
    const bots = (db.getActiveBots?.() ?? db.getAllBots?.() ?? []).filter(
      (bot: DatabaseBot) =>
        String(bot.status || "offline").toLowerCase() === "active" &&
        (getBotNumber(bot) || bot.bot_id || bot.lid),
    );
    const isGroup = String(from || "").endsWith("@g.us");
    const currentGroup = normalizeGroup(from);
    const participants: BotParticipant[] = isGroup
      ? groupMeta?.participants || []
      : [];
    const mentions: string[] = [];

    let visibleBots = bots;
    if (isGroup) {
      visibleBots = bots.filter((bot: DatabaseBot) =>
        (Array.isArray(bot.groups) ? bot.groups : []).some(
          (group: string) => normalizeGroup(group) === currentGroup,
        ),
      );
    }

    let text = t("socketBotsHeader", {
        title: fytBold(
          t(isGroup ? "socketBotsTitleGroup" : "socketBotsTitle"),
        ),
      }) + t("cmd_text_adc83b19");
    const subCount = bots.filter(
      (bot: DatabaseBot) => getEffectiveBotType(bot) === "Sub-Bot",
    ).length;
    const premiumCount = bots.filter(
      (bot: DatabaseBot) => getEffectiveBotType(bot) === "Prem-Bot",
    ).length;
    text += t("socketBotsTypeCounts", {
      subCount,
      premiumCount,
      activeCount: bots.length,
    });
    if (isGroup) {
      text += `\n${t("socketBotsGroupCount", { count: visibleBots.length })}`;
    } else {
      text += t("cmd_text_adc83b19");
    }

    if (!visibleBots.length) {
      text += isGroup
        ? t("socketBotsNoGroup")
        : t("socketBotsNone");
    } else {
      for (const bot of visibleBots) {
        const jid = await resolveBotJid(bot, participants, resolveLid);
        const number = getBotNumber(bot, jid);
        const name = String(bot.bot_name || t("socketBotsSubType")).trim();

        text += t("socketBotsEntry", {
          type: fytBold(getBotType(bot)),
          number,
          name: fytBold(name),
        });
        if (jid) {
          mentions.push(jid);
        }
      }
    }

    text += t("socketBotsFooter", { prefix: usedPrefix || "." });

    return reply({ text, mentions });
  },
};
