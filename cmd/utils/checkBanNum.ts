import undici from "undici";
import type { IDatabase } from "../../types/index.d.ts";
import { DL_CONFIG } from "../../config.ts";
import { logInfo } from "../../core/logger.ts";
import { fytBold } from "../../core/socketText.ts";
import { getLanguageMetadata, t, withLocale } from "../../src/langs/index.ts";
import chalk from "chalk";

const API_URL = DL_CONFIG.evogbApi.BASE_URL.replace(/\/+$/, "");
const API_KEY = DL_CONFIG.evogbApi.API_KEY;

interface BanCheckResult {
  number_formatted?: string;
  isBanned: boolean;
  isBanned_text?: string;
  isPermanent?: boolean;
  isPermanent_text?: string;
  violation_type_text?: string;
  status_message_text?: string;
  in_app_ban_appeal_text?: string;
  ban_appeal_token?: string;
  info?: {
    description_text?: string;
    duration_text?: string;
    risk_text?: string;
  };
  raw?: {
    appeal_token?: string;
  };
}

interface BanCheckResponse {
  resultado: BanCheckResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseBanCheckResponse(value: unknown): BanCheckResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.resultado) ||
    typeof value.resultado.isBanned !== "boolean"
  ) {
    throw new Error("La API devolvió una respuesta inválida.");
  }

  const result = value.resultado;
  const raw = value.raw;
  const isBanned = result.isBanned;
  if (typeof isBanned !== "boolean") {
    throw new Error("La API devolvió una respuesta inválida.");
  }
  const info = isRecord(result.info) ? result.info : undefined;
  const rawInfo = isRecord(raw) ? raw : undefined;

  return {
    resultado: {
      number_formatted: optionalString(result.number_formatted),
      isBanned,
      isBanned_text: optionalString(result.isBanned_text),
      isPermanent:
        typeof result.isPermanent === "boolean" ? result.isPermanent : undefined,
      isPermanent_text: optionalString(result.isPermanent_text),
      violation_type_text: optionalString(result.violation_type_text),
      status_message_text: optionalString(result.status_message_text),
      in_app_ban_appeal_text: optionalString(result.in_app_ban_appeal_text),
      ban_appeal_token: optionalString(result.ban_appeal_token),
      raw: rawInfo
        ? {
            appeal_token: optionalString(rawInfo.appeal_token),
          }
        : undefined,
      info: info
        ? {
            description_text: optionalString(info.description_text),
            duration_text: optionalString(info.duration_text),
            risk_text: optionalString(info.risk_text),
          }
        : undefined,
    },
  };
}

async function getUserLanguage(jid: string, db: IDatabase) {
  const user = db.getUser(jid);
  return getLanguageMetadata(user?.UserLang ?? user?.userLang).normalized;
}

function formatPhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, "");
}

function isValidPhoneNumber(phoneNumber: string): boolean {
  return /^\d{7,15}$/.test(phoneNumber);
}

async function checkerNumber(
  phoneNumber: string,
  lang: string,
): Promise<BanCheckResponse> {
  const params = new URLSearchParams({
    key: API_KEY,
    number: phoneNumber,
    lang,
  });
  const url = `${API_URL}/tools/whatsapp/check-number?${params}`;
  const res = await undici.request(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const body = await res.body.text();

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`);
  }

  return parseBanCheckResponse(JSON.parse(body) as unknown);
}

function formatResult(number: string, result: BanCheckResult): string {
  const info = result.info;
  const raw = result.raw;

  const lines = [
    `╭〔 ${result.isBanned ? "🔴" : "🟢"} ${fytBold(t("cmd_check_ban_c73aa001"))} 〕⬣`,
    `┃ 📱 ${fytBold(t("cmd_numero_1d91f4b8").toUpperCase())} › ${result.number_formatted ?? number}`,
    `╰━━━━━━━━━━━━⬣`,
    ``,
    `╭〔 ${fytBold(t("cmd_informacion_a853a589").toUpperCase())} 〕⬣`,
    `┃ 📌 ${fytBold(t("cmd_estado_87cf2a84"))}: ${result.isBanned_text ?? result.status_message_text ?? "-"}`,
    `┃ ⏱️ ${fytBold(t("cmd_ban_permanent_label"))}: ${result.isPermanent_text ?? "-"}`,
    `┃ ⚠️ ${fytBold(t("cmd_motivo_cbeec536"))}: ${result.violation_type_text ?? "-"}`,
    `┃ ⌛ ${fytBold(t("cmd_duracion_63ce53f4"))}: ${info?.duration_text ?? "-"}`,
    `┃ 📊 ${fytBold(t("cmd_riesgo_f2026263"))}: ${info?.risk_text ?? "-"}`,
    `┃ 💬 ${fytBold(t("cmd_ban_appealable_label"))}: ${result.in_app_ban_appeal_text ?? "-"}`,
    `╰━━━━━━━━━━━━⬣`,
    ``,
    `╭〔 💬 ${fytBold(t("cmd_detalles_b1bb8ea5").toUpperCase())} 〕⬣`,
    `┃ ${info?.description_text ?? result.status_message_text ?? "-"}`,
    `╰━━━━━━━━━━━━⬣`,
    ``,
    `╭〔 ${fytBold(t("cmd_ban_appeal_token_label").toUpperCase())} 〕⬣`,
    `┃ ${raw?.appeal_token ?? result.ban_appeal_token ?? "-"}`,
    `╰━━━━━━━━━━━━⬣`,
  ];

  return lines.join("\n");
}

export default {
  name: ["checkban", "checkbannum", "bancheck", "banchecker", "banwa"],
  description: "Verifica si un número de WhatsApp está baneado o no.",
  category: "utils",
  usage: "checkban <número de teléfono>",

  async run({ text, reply, db, sender, react }) {
    const number = formatPhoneNumber(text.trim());
    if (!isValidPhoneNumber(number)) {
      return reply(
        withLocale(getLanguageMetadata(db.getUser(sender)?.UserLang ?? db.getUser(sender)?.userLang).normalized, () =>
          t("cmd_value0_value1_usa_un_numero_co_5e415640", {
            value0: fytBold(t("cmd_check_ban_c73aa001")),
            value1: fytBold(t("cmd_numero_invalido_74d933c2")),
            value2: ".",
          }),
        ),
      );
    }

    let lang = "en";
    await react("🔎");
    try {
      lang = await getUserLanguage(sender, db);
      const { resultado } = await checkerNumber(number, lang);
      await react(resultado.isBanned ? "🔴" : "✅");
      return reply(withLocale(lang, () => formatResult(number, resultado)));
    } catch (error) {
      logInfo(
        `${chalk.green("[Ban WA Checker]")} ${error instanceof Error ? error.message : String(error)}`,
        "httpError",
      );
      await react("❌");
      return reply(
        withLocale(lang, () =>
          t("cmd_no_se_pudo_consultar_el_estado_1bb2f2bc", {
            value0: number,
          }),
        ),
      );
    }
  },
};
