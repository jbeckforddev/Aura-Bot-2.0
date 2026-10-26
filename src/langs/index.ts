import { AsyncLocalStorage } from "node:async_hooks";
import en from "./en.lang.json" with { type: "json" };
import es from "./es.lang.json" with { type: "json" };
import br from "./br.lang.json" with { type: "json" };
import cn from "./cn.lang.json" with { type: "json" };
import cz from "./cz.lang.json" with { type: "json" };
import de from "./de.lang.json" with { type: "json" };
import fr from "./fr.lang.json" with { type: "json" };
import gr from "./gr.lang.json" with { type: "json" };
import hi from "./hi.lang.json" with { type: "json" };
import hu from "./hu.lang.json" with { type: "json" };
import id from "./id.lang.json" with { type: "json" };
import it from "./it.lang.json" with { type: "json" };
import jp from "./jp.lang.json" with { type: "json" };
import kr from "./kr.lang.json" with { type: "json" };
import nl from "./nl.lang.json" with { type: "json" };
import ph from "./ph.lang.json" with { type: "json" };
import pl from "./pl.lang.json" with { type: "json" };
import ro from "./ro.lang.json" with { type: "json" };
import ru from "./ru.lang.json" with { type: "json" };
import sv from "./sv.lang.json" with { type: "json" };
import th from "./th.lang.json" with { type: "json" };
import uk from "./uk.lang.json" with { type: "json" };
import vn from "./vn.lang.json" with { type: "json" };

const LANGUAGES = {
  en,
  es,
  br,
  cn,
  cz,
  de,
  fr,
  gr,
  hi,
  hu,
  id,
  it,
  jp,
  kr,
  nl,
  ph,
  pl,
  ro,
  ru,
  sv,
  th,
  uk,
  vn,
} as const;

export type Language = keyof typeof LANGUAGES;
type GachaTranslationKey =
  | "gacha_rw_description"
  | "gacha_claim_description"
  | "gacha_catalog_unavailable"
  | "gacha_no_unclaimed_cards"
  | "gacha_rarity_label"
  | "gacha_type_label"
  | "gacha_value_label"
  | "gacha_status_label"
  | "gacha_status_free"
  | "gacha_status_claimed_by"
  | "gacha_rw_claim_instruction"
  | "gacha_rw_save_failed"
  | "gacha_claim_reply_required"
  | "gacha_claim_not_found"
  | "gacha_claim_only_drawer"
  | "gacha_claim_expired"
  | "gacha_claim_already_owned"
  | "gacha_claim_already_resolved_owner"
  | "gacha_claim_already_resolved"
  | "gacha_claim_success"
  | "gacha_rarity_special"
  | "gacha_rarity_super_special"
  | "gacha_rarity_epic"
  | "gacha_rarity_mythic"
  | "gacha_rarity_legendary"
  | "gacha_source_label"
  | "gacha_id_label"
  | "gacha_type_support"
  | "gacha_harem_description"
  | "gacha_harem_empty"
  | "gacha_harem_title"
  | "gacha_harem_page"
  | "gacha_harem_item"
  | "gacha_harem_value"
  | "gacha_harem_total"
  | "gacha_harem_page_invalid"
  | "gacha_harem_page_out_of_range";
export type TranslationKey =
  | keyof (typeof LANGUAGES)["es"]
  | GachaTranslationKey;

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGES) as Language[];
export const DEFAULT_LANGUAGE: Language = "es";
export const LANGUAGE_METADATA = {
  en: { label: "English", flag: "🇺🇸" },
  es: { label: "Español", flag: "🇪🇸" },
  br: { label: "Português (Brasil)", flag: "🇧🇷" },
  cn: { label: "中文 (简体)", flag: "🇨🇳" },
  cz: { label: "Čeština", flag: "🇨🇿" },
  de: { label: "Deutsch", flag: "🇩🇪" },
  fr: { label: "Français", flag: "🇫🇷" },
  gr: { label: "Ελληνικά", flag: "🇬🇷" },
  hi: { label: "हिन्दी", flag: "🇮🇳" },
  hu: { label: "Magyar", flag: "🇭🇺" },
  id: { label: "Bahasa Indonesia", flag: "🇮🇩" },
  it: { label: "Italiano", flag: "🇮🇹" },
  jp: { label: "日本語", flag: "🇯🇵" },
  kr: { label: "한국어", flag: "🇰🇷" },
  nl: { label: "Nederlands", flag: "🇳🇱" },
  ph: { label: "Filipino", flag: "🇵🇭" },
  pl: { label: "Polski", flag: "🇵🇱" },
  ro: { label: "Română", flag: "🇷🇴" },
  ru: { label: "Русский", flag: "🇷🇺" },
  sv: { label: "Svenska", flag: "🇸🇪" },
  th: { label: "ไทย", flag: "🇹🇭" },
  uk: { label: "Українська", flag: "🇺🇦" },
  vn: { label: "Tiếng Việt", flag: "🇻🇳" },
} satisfies Record<Language, { label: string; flag: string }>;

export function getLanguageMetadata(language: unknown) {
  const normalized =
    typeof language === "string" && language in LANGUAGE_METADATA
      ? (language as Language)
      : DEFAULT_LANGUAGE;
  return { normalized, ...LANGUAGE_METADATA[normalized] };
}

type TranslationValues = Record<string, unknown>;
const localeStorage = new AsyncLocalStorage<Language>();

function isValidLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as string[]).includes(value);
}

function resolveTranslations(lang: Language): Record<string, string> {
  return LANGUAGES[lang] as Record<string, string>;
}

export function withLocale<T>(language: unknown, callback: () => T): T {
  const resolved: Language = isValidLanguage(language) ? language : DEFAULT_LANGUAGE;
  return localeStorage.run(resolved, callback);
}

export function translateText(value: unknown): string {
  const source = String(value ?? "");
  const fallback = resolveTranslations(DEFAULT_LANGUAGE);
  const key = Object.keys(fallback).find(
    (entry) => fallback[entry] === source,
  ) as TranslationKey | undefined;
  return key ? t(key) : source;
}

/**
 * Returns the translated string for `key` under the current locale.
 * Interpolates `{{name}}` placeholders using `values`.
 * Falls back to `DEFAULT_LANGUAGE` if the key is missing in the active locale.
 */
export function t(key: TranslationKey, values: TranslationValues = {}): string {
  const active = localeStorage.getStore() ?? DEFAULT_LANGUAGE;
  const translations = resolveTranslations(active);
  const fallbackTranslations = resolveTranslations(DEFAULT_LANGUAGE);

  const template = (translations[key as string] ?? fallbackTranslations[key as string]) as string | undefined;
  if (!template) return key as string;

  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
    values[name] === undefined ? placeholder : String(values[name]),
  );
}