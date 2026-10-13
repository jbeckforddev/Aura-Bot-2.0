import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { aiError, askAlya, getPrompt } from "./aiUtils.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["chatgpt", "ia", "gpt"],
  category: "AI",
  description: t("cmd_habla_con_chatgpt_db96214b"),

  async run({ args, reply, react }: CommandContext) {
    const prompt = getPrompt(args);
    if (!prompt) {
      return reply({
        text: t("cmd_value0_value1_debes_escribir_u_8abd32e0", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_falta_mensaje_dba5d803")), value2: fytBold(t("cmd_system_info_1a78a0cb")) }),
      });
    }

    await react("🤖");
    try {
      const response = await askAlya("/ai/chatgpt", prompt);
      await reply({
        text: t("cmd_value0_value1_value2_7769dc65", { value0: fytBold(t("cmd_chatgpt_ai_b2c2b3b0")), value1: response, value2: fytBold(t("cmd_system_ai_8c7b0f70")) }),
      });
      await react("✅");
    } catch (error) {
      await react("❌");
      return reply({
        text: t("cmd_value0_value1_5109efcd", { value0: fytBold(t("cmd_error_al_obtener_respuesta_36b0a55f")), value1: aiError(error) }),
      });
    }
  },
};
