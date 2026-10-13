import type { CommandContext } from "../../types/index.d.ts";
import {
  getEconomyUser,
  formatMoney,
} from "../../core/economyConfig.ts";
import { db } from "../../database/AuraDB.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["baltop", "topbal", "topcoins"],
  category: "economy",
  description: t("cmd_muestra_el_ranking_de_usuarios_8412052c"),
  groupOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.groupMeta) {
      return ctx.reply(t("cmd_este_comando_solo_funciona_en__9de14eee"));
    }
    const pageSize = 10;
    const requestedPage = Number.parseInt(String(ctx.args?.[0] || "1"), 10);
    if (!Number.isInteger(requestedPage) || requestedPage < 1) {
      return ctx.reply(t("cmd_indica_una_pagina_valida_ejemp_6093925c"));
    }

    const botJid = String(ctx.sock?.user?.id || "").split(":")[0];
    const botNumber = botJid.split("@")[0];
    const botId = String(ctx.sock?.subBotId || "").split("@")[0];
    const users = db.getAllUsers();
    const normalizeIdentity = (value: unknown) =>
      String(value || "")
        .trim()
        .split("@")[0]
        .split(":")[0]
        .replace(/\D/g, "");
    const participants = Array.isArray(ctx.groupMeta.participants)
      ? ctx.groupMeta.participants.filter((participant) => Boolean(participant?.id))
      : [];
    const rows = participants
      .flatMap((participant) => {
        const participantId = String(participant.id).trim();
        const number = normalizeIdentity(participantId);
        const storedUser =
          users.find(
            (user) =>
              String(user.jid || "").trim() === participantId ||
              String(user.lid || "").trim() === participantId,
          ) ||
          users.find(
            (user) => normalizeIdentity(user.phone_number) === number,
          ) ||
          users.find((user) =>
            [user.jid, user.lid].some(
              (identity) => normalizeIdentity(identity) === number,
            ),
          );
        const jid = String(storedUser?.jid || storedUser?.lid || "").trim();
        const storedNumber = normalizeIdentity(jid);
        if (
          !storedUser ||
          !jid ||
          number === botNumber ||
          number === botId ||
          storedNumber === botNumber ||
          storedNumber === botId
        ) {
          return [];
        }
        const user = getEconomyUser(ctx.from, jid);
        const total = Number(user.bolsillo ?? 0) + Number(user.banco ?? 0);
        return total > 0
          ? [{
              jid,
              username:
                storedUser.username ||
                (storedUser as { pushName?: string }).pushName ||
                "Usuario",
              number,
              total,
            }]
          : [];
      })
      .sort((a, b) => b.total - a.total);
    if (!rows.length)
      return ctx.reply(t("cmd_no_hay_usuarios_con_saldo_para_ff21b0ee"));

    const totalPages = Math.ceil(rows.length / pageSize);
    if (requestedPage > totalPages) {
      return ctx.reply(
        t("cmd_esa_pagina_no_existe_hay_value_26d57c06", { value0: totalPages, value1: totalPages === 1 ? "" : "s" }),
      );
    }

    const page = requestedPage;
    const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
    let text = `╭〔 💎 𝐁𝐀𝐋𝐀𝐍𝐂𝐄 𝐓𝐎𝐏 💎 〕⬣\n┃ 🏆 𝐑𝐀𝐍𝐊𝐈𝐍𝐆 𝐃𝐄 𝐌𝐎𝐍𝐄𝐃𝐀𝐒\n┃ 📄 Página ${page}/${totalPages}\n╰━━━━━━━━━━━━⬣\n\n`;
    pageRows.forEach((row, index) => {
      const position = (page - 1) * pageSize + index;
      text += `┃ ${position < 3 ? ["🥇", "🥈", "🥉"][position] : "🎖️"} ${row.username}\n┃ ${formatMoney(row.total, ctx)}\n\n`;
    });
    text += `╰〔 ⚡ 𝐀𝐔𝐑𝐀 𝐄𝐂𝐎𝐍𝐎𝐌𝐘 ⚡ 〕⬣`;
    return ctx.reply(text);
  },
};
