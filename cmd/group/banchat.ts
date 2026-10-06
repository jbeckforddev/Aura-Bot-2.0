import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["banchat", "banearchat", "mutechat"],
  category: "group",
  description: "Desactiva las funciones del bot en el chat actual.",
  groupOnly: true,
  botUserOnly: true,
  async run(ctx: CommandContext) {
    ctx.db.setGroup(ctx.from, { chatBanned: 1 });
    return ctx.reply({
      text: `╭〔 🚫 ${fytBold("AURA REED")} 〕⬣\n┃ ${fytBold("CHAT BANEADO")}\n╰━━━━━━━━━━━━⬣\n\n┃ 🛑 El bot ha sido desactivado en este chat.\n┃ > No responderá hasta usar *${ctx.usedPrefix || "."}unbanchat*.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
    });
  },
};
