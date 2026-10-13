import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { deletedMessages } from "../../core/SnipeStore.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["snipe", "recuperar", "fantasmas"],
  category: "system",
  description: t("cmd_recupera_el_ultimo_mensaje_eli_ed1a219c"),
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;

    const groupDeleted = deletedMessages.get(from) || [];
    
    if (groupDeleted.length === 0) {
      return reply(t("cmd_value0_value1_no_se_han_detect_546a93cf", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_nada_que_mostrar_db7c3fa6")), value2: fytBold(t("cmd_system_29d43743")) }));
    }

    await react("👁️").catch(() => undefined);

    const snipedMsg = groupDeleted[groupDeleted.length - 1];
    const sender = snipedMsg.key.participant || snipedMsg.key.remoteJid || "Desconocido";

    await sock.sendMessage(
      from,
      { forward: snipedMsg },
      { quoted: msg as any }
    ).catch(() => undefined);

    await reply(t("cmd_value0_mensaje_recuperado_de_v_9a101027", { value0: fytBold(t("cmd_snipe_system_cb3f705a")), value1: sender.split("@")[0] }));
  }
};
