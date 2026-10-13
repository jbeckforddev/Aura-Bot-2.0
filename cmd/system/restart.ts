import type { CommandContext } from "../../types/index.d.ts";
import { checkpointDb } from "../../database/AuraDB.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["restart", "reiniciar"],
  category: "system",
  description: t("cmd_reinicia_el_bot_de_forma_segur_8b8cdd80"),
  modOnly: true,

  async run({ reply, react }: CommandContext) {
    await react("🔄").catch(() => undefined);

    await reply({
      text: t("cmd_value0_value1_el_bot_se_esta_r_414ac357", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sistema_restart_41ddd314")), value2: fytBold(t("cmd_system_29d43743")) }),
    });

    // 1. Forzar el guardado de la memoria RAM al disco duro
    checkpointDb();

    // 2. Matar el proceso (Pterodactyl detectará el código 1 y reiniciará el contenedor)
    setTimeout(() => {
      process.exit(1);
    }, 1500);
  },
};
