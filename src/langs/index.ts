import { AsyncLocalStorage } from "node:async_hooks";
import en from "./en.lang.json" with { type: "json" };
import es from "./es.lang.json" with { type: "json" };

const LANGUAGES = {
  en,
  es,
} as const;

export type Language = keyof typeof LANGUAGES;
export type TranslationKey = keyof (typeof LANGUAGES)["es"];

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGES) as Language[];
export const DEFAULT_LANGUAGE: Language = "es";

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