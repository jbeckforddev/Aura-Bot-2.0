import type { CommandContext } from "../../types/index.d.ts";
import { getProfile } from "../../core/profileConfig.ts";
import { db } from "../../database/AuraDB.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["eboard", "auratop"],
  description: t("cmd_clasificacion_global_de_aura_8b3706fe"),
  category: "profile",
  ownerOnly: true,
  async run(ctx: CommandContext) {
    const pageSize = 10;
    const requestedPage = Number.parseInt(String(ctx.args?.[0] || "1"), 10);
    if (!Number.isInteger(requestedPage) || requestedPage < 1) {
      return ctx.reply(t("cmd_indica_una_pagina_valida_ejemp_aa6d2f75"));
    }

    const botJid = String(ctx.sock?.user?.id || "").split(":")[0];
    const botNumber = botJid.split("@")[0];
    const botId = String(ctx.sock?.subBotId || "").split("@")[0];
    const rows = db
      .getAllUsers()
      .filter((user) => {
        const jid = String(user.jid || "").trim();
        if (!jid || jid.endsWith("@lid")) return false;
        const number = jid.split("@")[0].split(":")[0];
        return number !== botNumber && number !== botId;
      })
      .map((user) => ({
        jid: user.jid,
        username:
          user.username ||
          (user as { pushName?: string }).pushName ||
          "Usuario",
        profile: getProfile(user.jid),
      }))
      .sort(
        (a, b) => Number(b.profile.aura ?? 0) - Number(a.profile.aura ?? 0),
      );

    if (!rows.length)
      return ctx.reply(t("cmd_no_hay_usuarios_registrados_pa_669ca8c6"));

    const totalPages = Math.ceil(rows.length / pageSize);
    if (requestedPage > totalPages) {
      return ctx.reply(
        t("cmd_esa_pagina_no_existe_hay_value_26d57c06", { value0: totalPages, value1: totalPages === 1 ? "" : "s" }),
      );
    }

    const page = requestedPage;
    const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

    let text = `╭〔 ✨ 𝐀𝐔𝐑𝐀 𝐓𝐎𝐏 ✨ 〕⬣\n┃ 🏆 𝐑𝐀𝐍𝐊𝐈𝐍𝐆 𝐃𝐄 𝐀𝐔𝐑𝐀\n┃ 📄 Página ${page}/${totalPages}\n╰━━━━━━━━━━━⬣\n\n`;
    pageRows.forEach((row, index) => {
      const position = (page - 1) * pageSize + index;
      const medal = position < 3 ? ["🥇", "🥈", "🥉"][position] : "🎖️";
      text += `┃ ${medal} ${row.username}\n┃ ✨ ${Number(row.profile.aura ?? 0)} Aura\n\n`;
    });
    text += "╰〔 ⚡ 𝐀𝐔𝐑𝐀 𝐏𝐑𝐎𝐅𝐈𝐋𝐄 ⚡ 〕⬣";
    return ctx.reply(text);
  },
};
