import { createEconomyActivity } from "../../core/economyActivities.ts";
import { t } from "../../src/langs/index.ts";


export default createEconomyActivity({
  names: ["slut", "putear", "prost"],
  description: t("cmd_realiza_un_trabajo_nocturno_co_27d1306c"),
  title: "💃 𝐓𝐑𝐀𝐁𝐀𝐉𝐎 𝐍𝐎𝐂𝐓𝐔𝐑𝐍𝐎",
  icon: "💃",
  cooldown: 60 * 60 * 1000,
  reward: [1000, 6000],
  xp: [15, 40],
  success: [
    "Bailaste en un club VIP y ganaste",
    "Trabajaste en un evento privado y cobraste",
    "Vendiste fotos y conseguiste",
  ],
  fail: [
    "El cliente huyó sin pagar.",
    "La policía hizo una redada y tuviste que escapar.",
  ],
});
