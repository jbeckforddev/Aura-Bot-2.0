import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_CONFIG } from "../../config.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["ssweb", "ss", "webss"],
  category: "utils",
  description: t("cmd_toma_una_captura_de_una_pagina_df6bd826"),
  async run({ args, reply, react }: CommandContext) {
    let url = args[0];
    if (!url)
      return reply({
        text: t("cmd_ingresa_una_url_valida_ejemplo_9daeccba"),
      });
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    await react("🌐");
    try {
      const apiUrl = `${DL_CONFIG.alya.BASE_URL}tools/ssweb?url=${encodeURIComponent(url)}&device=pc&key=${DL_CONFIG.alya.API_KEY}`;
      const response = await fetch(apiUrl, {
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const image = Buffer.from(await response.arrayBuffer());
      const caption = t("cmd_value0_value1_value2_value3_e61ca70b", { value0: fytBold(t("cmd_screenshot_web_03bbad0a")), value1: fytBold(t("cmd_url_0e2d9b07")), value2: url, value3: fytBold(t("cmd_system_active_e403484a")) });
      await react("✅");
      return reply({ image, caption });
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: t("cmd_no_se_pudo_obtener_la_captura__ea302a07", { value0: error instanceof Error ? error.message : String(error) || "error desconocido" }),
      });
    }
  },
};
