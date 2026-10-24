import type { CommandContext, CommandPlugin } from "../../types/index.d.ts";
import { t } from "../../src/langs/index.ts";

export default {
  name: ["logout", "cerrar", "cerrarsesion", "desconectar"],
  description: t("socketDescriptionLogout"),
  category: "socket",
  botUserOnly: true,
  privateOnly: true,

  async run({ reply, sock, db }: CommandContext) {
    await reply({ text: t("socketLogoutClosing") });
    sock.manualLogout = true;

    try {
      await sock.logout();
    } catch (error: unknown) {
      sock.manualLogout = false;
      db.setBot(String(sock.user?.id || sock.sessionName || ""), {
        status: "offline",
      });
      const message =
        error instanceof Error ? error.message : t("socketUnknownError");
      await reply({
        text: t("socketLogoutError", { error: message }),
      });
    }
  },
} satisfies CommandPlugin;
