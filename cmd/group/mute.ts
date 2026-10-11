import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["mute", "unmute", "silenciar", "desilenciar"],
  category: "group",
  description: "Silencia o desilencia a un usuario en el grupo.",
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const { reply, react, db, from, msg, args, cmdName, groupMeta, botJid } = ctx;

    const isUnmute = cmdName === "unmute" || cmdName === "desilenciar";

    if (isUnmute && args[0] && args[0].toLowerCase() === "all") {
      db.setGroup(from, { mutedUsers: [] });
      await react("🔊").catch(() => undefined);
      return reply(`╭〔 🔊 ${fytBold("AMNISTÍA GENERAL")} 〕━⬣\n┃ 🔓 Todos los usuarios silenciados\n┃ han sido perdonados.\n╰━━━━━━━━━━━━⬣`);
    }

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    let target = contextInfo?.mentionedJid?.[0] || contextInfo?.participant;

    if (!target && args[0] && !args[0].toLowerCase().includes("all")) {
      target = args[0].replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    }

    if (!target) {
      return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA OBJETIVO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Etiqueta o responde al usuario\n┃ > que quieres silenciar/desilenciar.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
    }

    const groupData = db.getGroup(from) || {};
    let mutedUsers: string[] = Array.isArray(groupData.mutedUsers) ? [...groupData.mutedUsers] : [];

    if (!isUnmute) {
      const targetParticipant = groupMeta?.participants.find((p) => p.id === target);
      const isTargetAdmin = targetParticipant?.admin === "admin" || targetParticipant?.admin === "superadmin";
      const isTargetOwner = target.startsWith("573118353868") || db.hasRole?.(target, "owner");

      if (isTargetAdmin || isTargetOwner || target === botJid) {
        return reply(`╭〔 🛡️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("OBJETIVO PROTEGIDO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > No puedo silenciar a creadores,\n┃ > administradores ni a mí mismo.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
      }

      const joinedArgs = args.join(" ").toLowerCase();
      const timeMatch = joinedArgs.match(/\b([0-9]+)\s*(m|min|minuto|minutos|h|hora|horas|d|dia|dias|día|días)\b/);
      
      let durationMs = 60 * 60 * 1000;
      let timeMsg = "1 hora";
      
      if (timeMatch) {
        const amount = parseInt(timeMatch[1]);
        const unit = timeMatch[2];
        if (unit.startsWith("m")) {
          durationMs = amount * 60 * 1000;
          timeMsg = `${amount} minuto(s)`;
        } else if (unit.startsWith("h")) {
          durationMs = amount * 60 * 60 * 1000;
          timeMsg = `${amount} hora(s)`;
        } else if (unit.startsWith("d")) {
          durationMs = amount * 24 * 60 * 60 * 1000;
          timeMsg = `${amount} día(s)`;
        }
      }

      if (!mutedUsers.includes(target)) {
        mutedUsers.push(target);
        db.setGroup(from, { mutedUsers });
      }

      setTimeout(() => {
        const currentGroupData = db.getGroup(from) || {};
        let currentMuted = Array.isArray(currentGroupData.mutedUsers) ? [...currentGroupData.mutedUsers] : [];
        if (currentMuted.includes(target!)) {
          currentMuted = currentMuted.filter(jid => jid !== target);
          db.setGroup(from, { mutedUsers: currentMuted });
        }
      }, durationMs);

      await react("🤐").catch(() => undefined);
      return reply({
        text: `╭〔 🤐 ${fytBold("USUARIO SILENCIADO")} 〕━⬣\n┃ 👤 Objetivo: @${target.split("@")[0]}\n┃ ⏱️ Duración: ${timeMsg}\n┃\n┃ > Cualquier mensaje que envíe será\n┃ > eliminado automáticamente.\n╰━━━━━━━━━━━━⬣`,
        mentions: [target]
      });

    } else {
      if (mutedUsers.includes(target)) {
        mutedUsers = mutedUsers.filter(jid => jid !== target);
        db.setGroup(from, { mutedUsers });
        
        await react("🔊").catch(() => undefined);
        return reply({
          text: `╭〔 🔊 ${fytBold("USUARIO DESILENCIADO")} 〕━⬣\n┃ 👤 Objetivo: @${target.split("@")[0]}\n┃ 🔓 Ya puede hablar de nuevo.\n╰━━━━━━━━━━━━⬣`,
          mentions: [target]
        });
      } else {
        return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("NO ESTÁ SILENCIADO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Este usuario no se encuentra en\n┃ > la lista de silenciados.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`);
      }
    }
  }
};
