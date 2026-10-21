import type { WAMessage } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import {
  getProfilePictureUrl,
  profileTarget,
} from "../../core/profileConfig.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["pfp", "foto"],
  description: t("cmd_muestra_la_foto_y_el_perfil_gl_06a6dc47"),
  category: "profile",
  async run(ctx: CommandContext) {
    const target = await profileTarget(ctx);
    const profileUrl = await getProfilePictureUrl(ctx.sock, target);
    return ctx.sock.sendMessage(
      ctx.from,
      { image: { url: profileUrl }, mentions: [target] },
      { quoted: ctx.msg as unknown as WAMessage },
    );
  },
};
