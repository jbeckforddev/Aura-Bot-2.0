import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["mute", "unmute", "silenciar", "desilenciar"],
  category: "group",
  description: t("cmd_silencia_o_desilencia_a_un_usu_ffa68009"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const { reply, react, db, from, msg, args, cmdName, groupMeta, botJid } = ctx;

    const isUnmute = cmdName === "unmute" || cmdName === "desilenciar";

    if (isUnmute && args[0] && args[0].toLowerCase() === "all") {
      db.setGroup(from, { mutedUsers: [] });
      await react("🔊").catch(() => undefined);
      return reply(t("cmd_value0_todos_los_usuarios_sile_169f03c8", { value0: fytBold(t("cmd_amnistia_general_b5b8e406")) }));
    }

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    let target = contextInfo?.mentionedJid?.[0] || contextInfo?.participant;

    if (!target && args[0] && !args[0].toLowerCase().includes("all")) {
      target = args[0].replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    }

    if (!target) {
      return reply(t("cmd_value0_value1_etiqueta_o_respo_fae115d4", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_objetivo_d2546e73")), value2: fytBold(t("cmd_system_29d43743")) }));
    }

    const groupData = db.getGroup(from);
    let mutedUsers: string[] = Array.isArray(groupData.mutedUsers) ? [...groupData.mutedUsers] : [];

    const targetParticipant = groupMeta?.participants.find(
      (p) => p.id === target || p.lid === target,
    );
    const targetIds = new Set<string>([target]);
    if (targetParticipant?.id) targetIds.add(targetParticipant.id);
    if (targetParticipant?.lid) targetIds.add(targetParticipant.lid);

    if (!isUnmute) {
      const isTargetAdmin =
        targetParticipant?.admin === "admin" ||
        targetParticipant?.admin === "superadmin";
      const isTargetOwner = Array.from(targetIds).some(
        (id) => id.startsWith("573118353868") || db.hasRole?.(id, "owner"),
      );
      const isTargetBot = Array.from(targetIds).some((id) => id === botJid);

      if (isTargetAdmin || isTargetOwner || isTargetBot) {
        return reply(t("cmd_value0_value1_no_puedo_silenci_875da1ae", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_objetivo_protegido_4969efc2")), value2: fytBold(t("cmd_system_29d43743")) }));
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

      for (const id of targetIds) {
        if (!mutedUsers.includes(id)) {
          mutedUsers.push(id);
        }
      }
      db.setGroup(from, { mutedUsers });

      setTimeout(() => {
        const currentGroupData = db.getGroup(from);
        let currentMuted = Array.isArray(currentGroupData.mutedUsers) ? [...currentGroupData.mutedUsers] : [];
        currentMuted = currentMuted.filter((jid) => !targetIds.has(jid));
        db.setGroup(from, { mutedUsers: currentMuted });
      }, durationMs);

      await react("🤐").catch(() => undefined);
      return reply({
        text: t("cmd_value0_objetivo_value1_duracio_35e87b68", {
          value0: fytBold(t("cmd_usuario_silenciado_9fe70e68")),
          value1: target.split("@")[0],
          value2: `${timeMsg}\n> 💡 Sus mensajes se eliminarán automáticamente a partir de este momento.`,
        }),
        mentions: [target]
      });

    } else {
      const hasTarget = Array.from(targetIds).some((id) => mutedUsers.includes(id));
      if (hasTarget) {
        mutedUsers = mutedUsers.filter((jid) => !targetIds.has(jid));
        db.setGroup(from, { mutedUsers });
        
        await react("🔊").catch(() => undefined);
        return reply({
          text: t("cmd_value0_objetivo_value1_ya_pued_e2109284", { value0: fytBold(t("cmd_usuario_desilenciado_7065ce48")), value1: target.split("@")[0] }),
          mentions: [target]
        });
      } else {
        return reply(t("cmd_value0_value1_este_usuario_no__5489eca0", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_no_esta_silenciado_9259df08")), value2: fytBold(t("cmd_system_29d43743")) }));
      }
    }
  }
};
