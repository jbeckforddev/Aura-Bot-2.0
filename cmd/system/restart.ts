import type { CommandContext } from "../../types/index.d.ts";
import { checkpointDb } from "../../database/AuraDB.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["restart", "reiniciar"],
  category: "system",
  description: "Reinicia el bot de forma segura guardando la base de datos.",
  ownerOnly: true,

  async run({ reply, react }: CommandContext) {
    await react("🔄").catch(() => undefined);

    await reply({
      text: `╭〔 🔄 ${fytBold("AURA REED")} 〕⬣\n┃ ⚙️ ${fytBold("SISTEMA RESTART")}\n╰━━━━━━━━━━━━⬣\n\n┃ > El bot se está reiniciando\n┃ > guardando base de datos...\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
    });

    // 1. Forzar el guardado de la memoria RAM al disco duro
    checkpointDb();

    // 2. Matar el proceso (Pterodactyl detectará el código 1 y reiniciará el contenedor)
    setTimeout(() => {
      process.exit(1);
    }, 1500);
  },
};
