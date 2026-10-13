import { createEconomyActivity } from "../../core/economyActivities.ts";
import { t } from "../../src/langs/index.ts";


export default createEconomyActivity({
  names: ["work", "trabajar", "w", "job", "empleo"],
  description: t("cmd_trabaja_para_ganar_monedas_y_e_9aca0690"),
  title: "💼 𝐉𝐎𝐑𝐍𝐀𝐃𝐀 𝐋𝐀𝐁𝐎𝐑𝐀𝐋",
  icon: "💼",
  cooldown: 3 * 60 * 1000,
  reward: [5000, 7000],
  xp: [10, 30],
  success: [
    "Trabajaste como programador y ganaste",
    "Vendiste limonada y ganaste",
    "Hiciste trabajos freelance y cobraste",
  ],
  fail: [
    "Tu jornada fue agotadora, pero no encontraste clientes.",
    "El turno terminó sin propinas.",
  ],
});
