import { AsyncLocalStorage } from "node:async_hooks";
import en from "./en.lang.json" with { type: "json" };
import es from "./es.lang.json" with { type: "json" };

export type TranslationKey = keyof typeof es;
export type Language = "en" | "es";

type TranslationValues = Record<string, unknown>;
const localeStorage = new AsyncLocalStorage<Language>();

export function withLocale<T>(language: unknown, callback: () => T): T {
  return localeStorage.run(language === "en" ? "en" : "es", callback);
}

export function translateText(value: unknown): string {
  const source = String(value ?? "");
  const key = Object.keys(es).find((entry) => es[entry as TranslationKey] === source);
  return key ? t(key as TranslationKey) : source;
}

export function t(
  key: TranslationKey,
  values: TranslationValues = {},
): string {
  const translations = localeStorage.getStore() === "en" ? en : es;
  const template = translations[key] ?? es[key];
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
    values[name] === undefined ? placeholder : String(values[name]),
  );
}