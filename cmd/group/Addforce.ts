import { jidNormalizedUser } from "baileys";
import type { CommandContext } from "../../types/commands.d.ts";
import { fytBold } from "../../core/socketText.ts";

function cleanDigits(val: unknown): string {
  return String(val || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function normalizeTargetJid(rawInput: string, groupParticipants: any[] = []): string | null {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower.endsWith("@lid")) {
    const digits = cleanDigits(lower);
    if (!digits) return null;
    const matched = groupParticipants.find((p: any) => {
      const pId = String(p?.id || "").toLowerCase();
      const pLid = String(p?.lid || "").toLowerCase();
      return pId === `${digits}@lid` || pLid === `${digits}@lid`;
    });
    if (matched?.id && String(matched.id).endsWith("@s.whatsapp.net")) {
      return jidNormalizedUser(String(matched.id));
    }
    return `${digits}@lid`;
  }

  if (lower.endsWith("@s.whatsapp.net")) {
    return jidNormalizedUser(lower);
  }

  const digits = cleanDigits(trimmed);
  if (digits.length >= 7 && digits.length <= 15) {
    return `${digits}@s.whatsapp.net`;
  }

  return null;
}

const COMMAND_NAMES = ["addforce", "forceadd", "reingresar", "meter"];

export default {
  name: COMMAND_NAMES,
  command: COMMAND_NAMES,
  alias: COMMAND_NAMES,
  aliases: COMMAND_NAMES,
  category: "group",
  description: "Agrega por la fuerza o envía invitación a un número, JID o LID en el grupo.",
  groupOnly: true,
  adminOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react, groupMeta } = ctx;
    const prefix = usedPrefix || ".";

    if (!from.endsWith("@g.us")) {
      return reply("⚠️ Este comando solo funciona dentro de un grupo.");
    }

    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const mentioned = context?.mentionedJid?.[0];
    const quotedParticipant = context?.participant;
    const rawArg = args.join(" ").trim() || mentioned || quotedParticipant || "";

    if (!rawArg) {
      return reply(
        `╭〔 ⚡ ${fytBold("AGREGAR FORZADO")} 〕⬣\n` +
          `┃ • *Por número:* \`${prefix}addforce 573001234567\`\n` +
          `┃ • *Por JID:* \`${prefix}addforce 573001234567@s.whatsapp.net\`\n` +
          `┃ • *Por LID:* \`${prefix}addforce 123456789012345@lid\`\n` +
          `┃ • *Citando/Mencionando:* \`${prefix}addforce @usuario\`\n` +
          `╰━━━━━━━━━━━━⬣`,
      );
    }

    await react("⏳").catch(() => undefined);

    let participants: any[] = groupMeta?.participants || [];
    let groupSubject = groupMeta?.subject || "Grupo";

    try {
      const freshMeta = await sock.groupMetadata(from);
      if (freshMeta?.participants) {
        participants = freshMeta.participants;
      }
      if (freshMeta?.subject) {
        groupSubject = freshMeta.subject;
      }
    } catch {}

    const targetJid = normalizeTargetJid(rawArg, participants);
    if (!targetJid) {
      await react("❌").catch(() => undefined);
      return reply(`⚠️ No pude reconocer un número, JID o LID válido en: \`${rawArg}\`.`);
    }

    try {
      const res = await sock.groupParticipantsUpdate(from, [targetJid], "add");
      const entry = Array.isArray(res) ? res[0] : res;
      const status = String(entry?.status || "");

      if (!status || status === "200") {
        await react("✅").catch(() => undefined);
        return reply(
          `✅ *Ingreso ejecutado*\n` +
            `• *Objetivo:* \`${targetJid}\`\n` +
            `• *Grupo:* ${groupSubject}`,
        );
      }

      let inviteLink = "";
      try {
        const code = await sock.groupInviteCode(from);
        if (code) {
          inviteLink = `https://chat.whatsapp.com/${code}`;
        }
      } catch {}

      if (inviteLink) {
        await sock
          .sendMessage(targetJid, {
            text:
              `╭〔 🔗 ${fytBold("INVITACIÓN DIRECTA DE GRUPO")} 〕⬣\n` +
              `┃ *Grupo:* ${groupSubject}\n` +
              `┃ *Enlace:* ${inviteLink}\n` +
              `╰━━━━━━━━━━━━⬣`,
          })
          .catch(() => undefined);
      }

      await react("⚠️").catch(() => undefined);
      return reply(
        `⚠️ WhatsApp devolvió estado \`${status}\` al intentar agregar a \`${targetJid}\` directamente` +
          (inviteLink ? `, pero ya le envié la invitación al privado:\n${inviteLink}` : `.`),
      );
    } catch (error: unknown) {
      let inviteLink = "";
      try {
        const code = await sock.groupInviteCode(from);
        if (code) {
          inviteLink = `https://chat.whatsapp.com/${code}`;
        }
      } catch {}

      if (inviteLink) {
        await sock
          .sendMessage(targetJid, {
            text:
              `╭〔 🔗 ${fytBold("INVITACIÓN DIRECTA DE GRUPO")} 〕⬣\n` +
              `┃ *Grupo:* ${groupSubject}\n` +
              `┃ *Enlace:* ${inviteLink}\n` +
              `╰━━━━━━━━━━━━⬣`,
          })
          .catch(() => undefined);
      }

      const errMsg = error instanceof Error ? error.message : String(error);
      await react("❌").catch(() => undefined);
      return reply(
        `⚠️ Error al agregar \`${targetJid}\`: \`${errMsg}\`` +
          (inviteLink ? `\n🔗 *Enlace de respaldo enviado:* ${inviteLink}` : ""),
      );
    }
  },
};
