import { createEconomyActivity } from "../../core/economyActivities.ts";
import { t } from "../../src/langs/index.ts";


export default createEconomyActivity({
  names: ["adventure", "aventura", "explorar"],
  description: t("cmd_embarcate_en_una_mision_rpg_pa_b7dbcf5b"),
  title: "🗺️ 𝐌𝐈𝐒𝐈𝐎́𝐍 𝐃𝐄 𝐀𝐕𝐄𝐍𝐓𝐔𝐑𝐀",
  icon: "🗺️",
  cooldown: 2 * 60 * 60 * 1000,
  reward: [10000, 20000],
  xp: [40, 80],
  success: [
    "Completaste una misión en las Ruinas Olvidadas y ganaste",
    "Derrotaste a un grupo de duendes y saqueaste",
    "Protegiste una caravana y te pagaron",
  ],
  fail: [
    "Caíste en una trampa de la mazmorra y tuviste que retirarte.",
    "El jefe de la zona te obligó a realizar una retirada táctica.",
  ],
});
