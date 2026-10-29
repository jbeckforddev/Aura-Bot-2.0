import type { CommandContext } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";


const ON = ["on", "1", "true", "activar", "enable"];
const OFF = ["off", "0", "false", "desactivar", "disable"];

export default {
  name: ["antispam", "antispammsg", "antispammsg"],
  category: "group",
  description: t("groupAntiSpamDescription"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,

  async run(ctx: CommandContext) {
    const value = String(ctx.args?.[0] || "").toLowerCase();
    const group = ctx.db.getGroup(ctx.from);

    const isActive = group.antiSpam
      ? t("core_activado_2e624c72")
      : t("core_desactivado_7cc5cccc");
    if (!ON.includes(value) && !OFF.includes(value)) {
      return ctx.reply({
        text: t("groupAntiSpamStatusText", {
          status: isActive,
          prefix: ctx.usedPrefix || ".",
        }),
      });
    }

    const Enabled = ON.includes(value);
    ctx.db.setGroup(ctx.from, { antiSpam: Enabled ? 1 : 0 });

    const status = (Enabled
      ? t("core_activado_2e624c72")
      : t("core_desactivado_7cc5cccc")
    ).replace(/^[✅❌]\s*/u, "");
    return ctx.reply({
      text: t("groupAntiSpamSuccessText", {
        emoji: Enabled ? "✅️" : "❌️",
        status,
      }),
    });
  },
};