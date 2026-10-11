import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const activeTrials = new Set<string>();

export default {
  name: ["demandar", "juicio", "tribunal"],
  category: "games",
  description: "Inicia un juicio público contra un miembro del grupo.",
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;
    const isGroup = from.endsWith("@g.us");

    if (!isGroup) return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("SOLO GRUPOS")}\n╰━━━━━━━━━━━━⬣`);

    const groupMetadata = await sock.groupMetadata(from).catch(() => null);
    if (!groupMetadata) return;

    const botNumber = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
    const botParticipant = groupMetadata.participants.find((p) => p.id === botNumber);
    const isBotAdmin = botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin";

    if (!isBotAdmin) return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("NECESITO SER ADMIN")}\n╰━━━━━━━━━━━━⬣`);

    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (!target) return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("MENCIONA AL ACUSADO")}\n╰━━━━━━━━━━━━⬣`);

    const targetParticipant = groupMetadata.participants.find((p) => p.id === target);
    const isTargetAdmin = targetParticipant?.admin === "admin" || targetParticipant?.admin === "superadmin";

    if (isTargetAdmin || target === botNumber) return reply(`╭〔 🛡️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("OBJETIVO INVÁLIDO")}\n╰━━━━━━━━━━━━⬣`);

    const trialKey = `${from}-${target}`;
    if (activeTrials.has(trialKey)) return reply(`╭〔 ⚖️ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("JUICIO EN CURSO")}\n╰━━━━━━━━━━━━⬣`);

    activeTrials.add(trialKey);
    await react("⚖️").catch(() => undefined);

    const targetName = target.split("@")[0];
    let votesCulpable = 0;
    let votesInocente = 0;
    const votedUsers = new Set<string>();

    const trialMsg = await sock.sendMessage(from, {
      text: `╭〔 ⚖️ ${fytBold("TRIBUNAL AURA")} 〕━⬣\n┃ 👨‍⚖️ Acusado: @${targetName}\n┃ ⏱️ Tiempo: 60 segundos\n┃\n┃ > Respondan a este mensaje con:\n┃ > *culpable* o *inocente*\n╰━━━━━━━━━━━━⬣`,
      mentions: [target]
    }, { quoted: msg as any }).catch(() => null);

    const listener = (update: any) => {
      for (const m of update.messages || []) {
        if (!m.message || m.key.remoteJid !== from || m.key.fromMe) continue;
        
        const contextInfo = m.message.extendedTextMessage?.contextInfo;
        if (contextInfo?.stanzaId !== trialMsg?.key.id) continue;

        const sender = m.key.participant || m.key.remoteJid;
        if (votedUsers.has(sender)) continue;

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").toLowerCase().trim();
        
        if (text === "culpable") {
          votesCulpable++;
          votedUsers.add(sender);
        } else if (text === "inocente") {
          votesInocente++;
          votedUsers.add(sender);
        }
      }
    };

    sock.ev.on("messages.upsert", listener);

    await new Promise((resolve) => setTimeout(resolve, 60000));

    sock.ev.off("messages.upsert", listener);
    activeTrials.delete(trialKey);

    if (votesCulpable === 0 && votesInocente === 0) {
      return sock.sendMessage(from, { text: `╭〔 ⚖️ ${fytBold("TRIBUNAL AURA")} 〕━⬣\n┃ 👨‍⚖️ Caso desestimado.\n┃ 📉 Nadie votó.\n╰━━━━━━━━━━━━⬣` }).catch(() => undefined);
    }

    if (votesCulpable > votesInocente) {
      await sock.sendMessage(from, {
        text: `╭〔 ⚖️ ${fytBold("VEREDICTO")} 〕━⬣\n┃ 💀 Culpable: ${votesCulpable}\n┃ 😇 Inocente: ${votesInocente}\n┃\n┃ 💥 @${targetName} ha sido sentenciado.\n╰━━━━━━━━━━━━⬣`,
        mentions: [target]
      }).catch(() => undefined);
      await sock.groupParticipantsUpdate(from, [target], "remove").catch(() => undefined);
    } else {
      await sock.sendMessage(from, {
        text: `╭〔 ⚖️ ${fytBold("VEREDICTO")} 〕━⬣\n┃ 💀 Culpable: ${votesCulpable}\n┃ 😇 Inocente: ${votesInocente}\n┃\n┃ ✨ @${targetName} ha sido absuelto.\n╰━━━━━━━━━━━━⬣`,
        mentions: [target]
      }).catch(() => undefined);
    }
  }
};
