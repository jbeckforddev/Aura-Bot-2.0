import type { CommandContext } from "../../types/index.d.ts";
import { getProfile } from "../../core/profileConfig.ts";
import { db } from "../../database/AuraDB.ts";

export default {
  name: ["eboard", "auratop"],
  description: "Clasificación global de Aura.",
  category: "profile",
  async run(ctx: CommandContext) {
    const pageSize = 10;
    const requestedPage = Number.parseInt(String(ctx.args?.[0] || "1"), 10);
    if (!Number.isInteger(requestedPage) || requestedPage < 1) {
      return ctx.reply("⚠️ Indica una página válida. Ejemplo: `.eboard 1`");
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
      return ctx.reply("⚠️ No hay usuarios registrados para mostrar.");

    const totalPages = Math.ceil(rows.length / pageSize);
    if (requestedPage > totalPages) {
      return ctx.reply(
        `⚠️ Esa página no existe. Hay ${totalPages} página${totalPages === 1 ? "" : "s"}.`,
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
