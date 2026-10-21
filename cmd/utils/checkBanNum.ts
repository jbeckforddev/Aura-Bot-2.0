import type {
  CommandContext,
  WaBanCheckResponse,
} from "../../types/index.d.ts";
import type { proto } from "baileys";
import { fytBold } from "../../core/socketText.ts";
import { DL_CONFIG } from "../../config.ts";
import { t } from "../../src/langs/index.ts";


function normalizeNumber(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function validNumber(value: string): boolean {
  return /^\d{7,15}$/.test(value);
}

function getNumber(msg: proto.IWebMessageInfo, args: string[]): string {
  const mentioned =
    msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  return (
    normalizeNumber(args.join("")) || normalizeNumber(mentioned?.split("@")[0])
  );
}

function formatResult(number: string, response: WaBanCheckResponse): string {
  const result = response?.resultado?.data;
  if (!result || typeof result.isBanned !== "boolean") {
    throw new Error("La API devolvió una respuesta inválida.");
  }

  const status = result.isBanned ? "BANEADO" : "NO BANEADO";
  const icon = result.isBanned ? "🔴" : "🟢";
  const violation = result.violation_info?.description || "No especificada";
  const duration = result.violation_info?.duration || "No especificada";
  const risk = result.violation_info?.risk || "No especificado";
  const details = result.status_message || "Sin detalles adicionales";

  return [
    `╭〔 ${icon} ${fytBold(t("cmd_check_ban_c73aa001"))} 〕⬣`,
    `┃ 📱 ${fytBold(t("cmd_numero_1d91f4b8"))} › ${number}`,
    `┃ 📌 ${fytBold(t("cmd_estado_87cf2a84"))} › ${status}`,
    `┃ ⏱️ ${fytBold(t("cmd_tipo_6cc6198d"))} › ${result.isPermanent ? "Permanente" : "Temporal o no confirmado"}`,
    `┃ ⚠️ ${fytBold(t("cmd_motivo_cbeec536"))} › ${violation}`,
    `┃ ⌛ ${fytBold(t("cmd_duracion_63ce53f4"))} › ${duration}`,
    `┃ 📊 ${fytBold(t("cmd_riesgo_f2026263"))} › ${risk}`,
    `┃ 💬 ${fytBold(t("cmd_detalles_b1bb8ea5"))} › ${details}`,
    `╰〔 ⚡ ${fytBold(t("cmd_aura_reed_95dcfb15"))} 〕⬣`,
  ].join("\n");
}

export default {
  name: ["checkban", "checknum"],
  category: "utils",
  description: t("cmd_verifica_si_un_numero_de_whats_3c4ecd4b"),
  async run({ msg, args, usedPrefix, reply, react }: CommandContext) {
    const number = getNumber(msg, args);
    if (!validNumber(number)) {
      return reply({
        text: t("cmd_value0_value1_usa_un_numero_co_5e415640", { value0: fytBold(t("cmd_check_ban_c73aa001")), value1: fytBold(t("cmd_numero_invalido_74d933c2")), value2: usedPrefix || "." }),
      });
    }

    await react("🔎");
    try {
      const base = DL_CONFIG.lempi.BASE_URL.replace(/\/+$/, "");
      const url = `${base}/tools/wabancheck?lang=es&apikey=${encodeURIComponent(DL_CONFIG.lempi.API_KEY || "")}&number=${number}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as WaBanCheckResponse;
      await react(data?.resultado?.data?.isBanned ? "🔴" : "✅");
      return reply({ text: formatResult(number, data) });
    } catch (error: unknown) {
      console.error(
        "[checkban] Error:",
        error instanceof Error ? error.message : String(error) || error,
      );
      await react("❌");
      return reply({
        text: t("cmd_no_se_pudo_consultar_el_estado_1bb2f2bc", { value0: number }),
      });
    }
  },
};
