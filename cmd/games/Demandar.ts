import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const activeTrials = new Set<string>();

export default {
  name: ["demandar", "juicio", "tribunal"],
  category: "games",
  description: t("cmd_inicia_un_juicio_publico_contr_7622ab83"),
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;
    const isGroup = from.endsWith("@g.us");

    if (!isGroup) return reply(t("cmd_value0_value1_abc43fce", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_solo_grupos_89f57a2b")) }));

    const groupMetadata = await sock.groupMetadata(from).catch(() => null);
    if (!groupMetadata) return;

    const botNumber = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
    const botParticipant = groupMetadata.participants.find((p) => p.id === botNumber);
    const isBotAdmin = botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin";

    if (!isBotAdmin) return reply(t("cmd_value0_value1_abc43fce", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_necesito_ser_admin_964598c4")) }));

    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (!target) return reply(t("cmd_value0_value1_abc43fce", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_menciona_al_acusado_fef7b0f8")) }));

    const targetParticipant = groupMetadata.participants.find((p) => p.id === target);
    const isTargetAdmin = targetParticipant?.admin === "admin" || targetParticipant?.admin === "superadmin";

    if (isTargetAdmin || target === botNumber) return reply(t("cmd_value0_value1_5f1c8b4a", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_objetivo_invalido_bf51621c")) }));

    const trialKey = `${from}-${target}`;
    if (activeTrials.has(trialKey)) return reply(t("cmd_value0_value1_a5bb1617", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_juicio_en_curso_2780fff1")) }));

    activeTrials.add(trialKey);
    await react("⚖️").catch(() => undefined);

    const targetName = target.split("@")[0];
    let votesCulpable = 0;
    let votesInocente = 0;
    const votedUsers = new Set<string>();

    const trialMsg = await sock.sendMessage(from, {
      text: t("cmd_value0_acusado_value1_tiempo_6_2acd686b", { value0: fytBold(t("cmd_tribunal_aura_a9e5269e")), value1: targetName }),
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
      return sock.sendMessage(from, { text: t("cmd_value0_caso_desestimado_nadie__c8926ede", { value0: fytBold(t("cmd_tribunal_aura_a9e5269e")) }) }).catch(() => undefined);
    }

    if (votesCulpable > votesInocente) {
      await sock.sendMessage(from, {
        text: t("cmd_value0_culpable_value1_inocent_067dbbff", { value0: fytBold(t("cmd_veredicto_4817a769")), value1: votesCulpable, value2: votesInocente, value3: targetName }),
        mentions: [target]
      }).catch(() => undefined);
      await sock.groupParticipantsUpdate(from, [target], "remove").catch(() => undefined);
    } else {
      await sock.sendMessage(from, {
        text: t("cmd_value0_culpable_value1_inocent_aec7992f", { value0: fytBold(t("cmd_veredicto_4817a769")), value1: votesCulpable, value2: votesInocente, value3: targetName }),
        mentions: [target]
      }).catch(() => undefined);
    }
  }
};
