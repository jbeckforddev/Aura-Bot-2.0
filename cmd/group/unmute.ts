import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


function normalizeJid(jid: string): string {
  return String(jid || "").split("@")[0].split(":")[0];
}

function matchMutedUser(savedJid: string, targetJid: string): boolean {
  const left = new Set<string>();
  const right = new Set<string>();

  for (const value of [savedJid, targetJid]) {
    const raw = String(value || "").trim();
    if (!raw) continue;

    const variants = [
      raw,
      raw.split(":")[0],
      raw.split("@")[0],
      raw.replace(/@s\.whatsapp\.net$/i, ""),
      raw.replace(/@lid$/i, ""),
    ];

    for (const variant of variants) {
      if (!variant) continue;
      const cleaned = normalizeJid(variant);
      const normalized = cleaned.toLowerCase();
      if (normalized) {
        if (value === savedJid) left.add(normalized);
        if (value === targetJid) right.add(normalized);
      }
    }
  }

  return [...left].some((value) => right.has(value));
}

export default {
  name: ["unmute", "desilenciar"],
  category: "group",
  description: t("cmd_quita_el_silencio_a_un_usuario_c607447d"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const context = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const target = context?.mentionedJid?.[0] || context?.participant;
    if (!target)
      return ctx.reply({
        text: t("cmd_value0_value1_etiqueta_o_respo_540b6aad", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_usuario_2df40348")), value2: fytBold(t("cmd_system_alert_780bb6b6")) }),
      });
    const group = ctx.db.getGroup(ctx.from);
    const mutedUsers = Array.isArray(group.mutedUsers) ? group.mutedUsers : [];
    
    // Normalizar JIDs para comparación
    const normalizedTarget = normalizeJid(target);
    const isMuted = mutedUsers.some((jid: string) =>
      matchMutedUser(jid, normalizedTarget),
    );
    
    if (!isMuted)
      return ctx.reply({
        text: t("cmd_value0_el_usuario_value1_no_es_f95304c5", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: target.split("@")[0], value2: fytBold(t("cmd_system_info_1a78a0cb")) }),
        mentions: [target],
      });
    ctx.db.setGroup(ctx.from, {
      mutedUsers: mutedUsers.filter(
        (jid: string) => !matchMutedUser(jid, normalizedTarget),
      ),
    });
    return ctx.reply({
      text: t("cmd_value0_value1_el_usuario_value_794449e6", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_desilenciado_4f79476c")), value2: target.split("@")[0], value3: fytBold(t("cmd_system_info_1a78a0cb")) }),
      mentions: [target],
    });
  },
};
