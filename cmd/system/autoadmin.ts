import type { GroupParticipant } from "@whiskeysockets/baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["autoadmin", "seradmin", "dameadmin"],
  description: t("cmd_el_bot_te_da_admin_del_grupo_s_8d46524e"),
  category: "system",
  ownerOnly: true, // 🔒 Solo owners (lo valida tu handler.ts)
  groupOnly: true, // Solo funciona en grupos
  botAdmin: true, // El bot necesita ser admin para poder dar admin

  async run({
    sock,
    from,
    sender,
    reply,
    react,
    msg,
    db,
    groupMeta,
    clearGroupCache,
  }: CommandContext) {
    await react("👑");

    try {
      // Verificar si ya es admin
      const participant = groupMeta?.participants?.find(
        (p: GroupParticipant) =>
          p.id === sender || (p as { lid?: string }).lid === sender,
      );

      if (
        participant?.admin === "admin" ||
        participant?.admin === "superadmin"
      ) {
        return reply({
          text: t("cmd_ya_eres_admin_de_este_grupo_no_0f522e23"),
        });
      }

      // El bot promueve a admin al que ejecutó el comando
      await sock.groupParticipantsUpdate(from, [sender], "promote");
      clearGroupCache?.(); // Limpia la caché de grupos del handler

      // Nombre desde la DB
      const senderUser = db.getUser(sender);
      const senderName =
        senderUser?.pushName ||
        senderUser?.username ||
        msg.pushName ||
        sender.split("@")[0];

      await reply({
        text: t("cmd_value0_value1_del_grupo_3ea299d8", { value0: senderName, value1: fytBold(t("cmd_ahora_es_admin_dc733258")) }),
        mentions: [sender],
      });
    } catch (error: unknown) {
      await react("❌");
      await reply({
        text: t("cmd_error_al_darte_admin_value0_dc44a79a", { value0: error instanceof Error ? error.message : String(error) }),
      });
    }
  },
};
