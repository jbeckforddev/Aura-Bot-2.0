
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["testwelcome", "testbienvenida"],
  category: "group",
  description: "Muestra una prueba del mensaje de bienvenida configurado.",
  groupOnly: true,
  adminOnly: false,

  async run(ctx: CommandContext) {
    const group = await ctx.db.getGroup(ctx.from);
    const message = group?.welcomeMessage?.trim();

    if (!message) {
      return ctx.reply({
        text: `${fytBold(t("cmd_sistema_de_bienvenida_6d917fae"))}\n\nNo hay una bienvenida personalizada configurada. Se utilizará el mensaje predeterminado.`,
      });
    }

    return ctx.reply({ text: message });
  },
};
