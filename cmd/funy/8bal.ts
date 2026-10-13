import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["8bal", "8ball", "8bola"],
  category: "funy",
  description: t("cmd_responde_una_pregunta_estilo_b_816006c3"),

  async run(ctx: CommandContext) {
    const question = ctx.args.join(" ").trim();
    if (!question) {
      const usage = `${ctx.usedPrefix || "."}8bal <pregunta>`;
      let text = t("cmd_value0_fb3dce32", { value0: fytBold(t("cmd_falta_pregunta_5d37e685")) });
      text +=
        t("cmd_debes_escribir_una_pregunta_pa_9774d9b1");
      text += t("cmd_uso_value0_e2d9a99e", { value0: usage });
      text += t("cmd_value0_92601e2c", { value0: fytBold(t("cmd_system_info_1a78a0cb")) });
      return ctx.reply({ text });
    }

    const answers = [
      t("cmd_8ball_definitivamente_si_4f0f8c10"),
      t("cmd_8ball_sin_duda_4f0f8c11"),
      t("cmd_8ball_puedes_confiar_en_ello_4f0f8c12"),
      t("cmd_8ball_es_probable_4f0f8c13"),
      t("cmd_8ball_pregunta_de_nuevo_mas_tarde_4f0f8c14"),
      t("cmd_8ball_mejor_no_decirte_ahora_4f0f8c15"),
      t("cmd_8ball_no_puedo_predecirlo_ahora_4f0f8c16"),
      t("cmd_8ball_concentrate_y_pregunta_otra_vez_4f0f8c17"),
      t("cmd_8ball_no_cuentas_con_ello_4f0f8c18"),
      t("cmd_8ball_mi_respuesta_es_no_4f0f8c19"),
      t("cmd_8ball_muy_dudoso_4f0f8c1a"),
      t("cmd_8ball_las_senales_apuntan_a_que_si_4f0f8c1b"),
      t("cmd_8ball_las_probabilidades_son_buenas_4f0f8c1c"),
      t("cmd_8ball_respuesta_confusa_intentalo_otra_vez_4f0f8c1d"),
      t("cmd_8ball_por_supuesto_4f0f8c1e"),
    ];
    const answer = answers[Math.floor(Math.random() * answers.length)];

    let text = t("cmd_value0_70aca9f1", { value0: fytBold(t("cmd_bola_8_d35b8726")) });
    text += t("cmd_value0_value1_d90b5f4f", { value0: fytBold(t("cmd_pregunta_4966b707")), value1: question });
    text += t("cmd_value0_value1_238b4d87", { value0: fytBold(t("cmd_respuesta_7b8a8f58")), value1: answer });
    text += t("cmd_value0_92601e2c", { value0: fytBold(t("cmd_fun_2beb23b3")) });
    return ctx.reply({ text });
  },
};
