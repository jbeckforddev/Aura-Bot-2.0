import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["setprefix", "prefix", "delprefix", "deleteprefix"],
  description: "Cambia el prefijo de este grupo.",
  category: "group",
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    if (["delprefix", "deleteprefix"].includes(ctx.cmdName)) {
      ctx.db.setGroup(ctx.from, { prefix: "" });
      return ctx.reply({
        text: `╭〔 ✅ ${fytBold("AURA REED")} 〕⬣\n┃ ${fytBold("PREFIJO ELIMINADO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Se usarán los prefijos de fábrica.\n\n╰〔 ⚡ ${fytBold("SYSTEM INFO")} 〕⬣`,
      });
    }

    const value = String(ctx.args?.[0] ?? "").trim();
    if (value && (value.length > 1 || /\s/.test(value))) {
      return ctx.reply({
        text: `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ${fytBold("PREFIJO INVÁLIDO")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Por favor proporciona\n┃ > un prefijo valido.\n╰〔 ⚡ ${fytBold("SYSTEM ALERT")} 〕⬣`,
      });
    }

    ctx.db.setGroup(ctx.from, { prefix: value || "" });
    return ctx.reply(
      value
        ? `✅ Prefijo del grupo actualizado a: ${value}`
        : "✅ El grupo volverá a usar los prefijos de fábrica.",
    );
  },
};
