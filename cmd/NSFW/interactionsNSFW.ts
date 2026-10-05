import fs from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { WAMessage } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { GIF_TO_VIDEO } from "../../utils/converter.ts";

interface ReactionEntry {
  react: string;
  self: string;
  target: string;
  videos: string[];
  description: string;
}

const DATA_PATH = path.resolve(process.cwd(), "database/reacctiones2.json");
const DATA = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as Record<
  string,
  ReactionEntry
>;

function cleanJid(jid = ""): string {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];
  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

function identityNumber(jid = ""): string {
  return cleanJid(jid).split("@")[0].replace(/\D/g, "");
}

function findParticipant(jid: string, groupMeta: CommandContext["groupMeta"]) {
  return groupMeta?.participants?.find((participant) => {
    const details = participant as typeof participant & {
      lid?: string;
      username?: string;
    };
    return [details.id, details.lid].some(
      (identity) => identity && cleanJid(identity) === cleanJid(jid),
    );
  });
}

async function resolveContactJid(
  jid: string,
  ctx: Pick<CommandContext, "groupMeta" | "resolveLid">,
): Promise<string> {
  const normalizedJid = cleanJid(jid);
  if (!normalizedJid.endsWith("@lid")) return normalizedJid;

  const participant = findParticipant(normalizedJid, ctx.groupMeta);
  const participantId = participant?.id;
  if (participantId && !cleanJid(participantId).endsWith("@lid")) {
    return cleanJid(participantId);
  }

  return cleanJid((await ctx.resolveLid(normalizedJid)) || normalizedJid);
}

function resolveDisplayName(
  jid: string,
  ctx: Pick<CommandContext, "db" | "groupMeta">,
): string {
  const user = ctx.db.getUser(jid);
  if (user.pushName || user.username) return String(user.pushName || user.username);

  const participant = findParticipant(jid, ctx.groupMeta) as
    | ({ username?: string } & NonNullable<CommandContext["groupMeta"]>["participants"][number])
    | undefined;
  return participant?.username || cleanJid(jid).split("@")[0];
}

export default {
  name: Object.keys(DATA),
  description: Object.values(DATA).map((entry) => entry.description),
  category: "nsfw",
  groupOnly: false,
  showAllNames: true,

  async run(ctx: CommandContext) {
    const { sock, from, msg, sender, groupMeta, reply, react, cmdName, text } = ctx;
    let videoPath = "";

    try {
      const category = String(cmdName || "").toLowerCase();
      const entry = DATA[category];
      if (!entry) return;
      await react(entry.react);

      if (!Array.isArray(entry.videos) || entry.videos.length === 0) {
        return reply({ text: "⚠️ Esta reacción no tiene GIFs disponibles." });
      }

      const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
      let targetJid = contextInfo?.mentionedJid?.[0] || contextInfo?.participant || sender;

      if (!contextInfo?.mentionedJid?.length && !contextInfo?.participant && text) {
        const mentionMatch = text.match(/@(\d+)/);
        if (mentionMatch) {
          const matchingParticipant = groupMeta?.participants?.find(
            (participant) => identityNumber(participant.id) === mentionMatch[1],
          );
          targetJid = matchingParticipant?.id || `${mentionMatch[1]}@s.whatsapp.net`;
        }
      }

      const authorJid = await resolveContactJid(sender, ctx);
      targetJid = await resolveContactJid(String(targetJid), ctx);
      const isSelf = targetJid === authorJid;
      const videoUrl = entry.videos[Math.floor(Math.random() * entry.videos.length)];
      const caption = isSelf
        ? `\`${resolveDisplayName(authorJid, ctx)}\` ${entry.self}`
        : `\`${resolveDisplayName(authorJid, ctx)}\` ${entry.target} \`${resolveDisplayName(targetJid, ctx)}\``;
      videoPath = await GIF_TO_VIDEO(videoUrl);

      await sock.sendMessage(
        from,
        {
          video: { url: videoPath },
          caption,
          mentions: isSelf ? [authorJid] : [authorJid, targetJid],
          mimetype: "video/mp4",
          gifPlayback: true,
        },
        { quoted: msg as WAMessage },
      );
    } catch (error: unknown) {
      console.error("[interacciónSFW]", error);
      await react("❌");
      await reply({
        text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      if (videoPath) await rm(videoPath, { force: true }).catch(() => undefined);
    }
  },
};
