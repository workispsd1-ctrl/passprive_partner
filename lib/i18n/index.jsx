"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { messages } from "./messages";

const STORAGE_KEY = "partner_lang";
const TZ = "Indian/Mauritius";
export const LANGUAGES = [
  { code: "en", label: "EN", name: "English", locale: "en-US" },
  { code: "fr", label: "FR", name: "Français", locale: "fr-FR" },
];

function build(lang) {
  const dict = messages[lang] || messages.en;
  const locale = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).locale;
  const plurals = new Intl.PluralRules(locale);

  const t = (key, vars) => {
    let template;
    if (vars && typeof vars.count === "number") {
      const form = plurals.select(vars.count);
      template = dict[`${key}_${form}`] ?? messages.en[`${key}_${form}`] ?? dict[`${key}_other`] ?? messages.en[`${key}_other`];
    }
    template = template ?? dict[key] ?? messages.en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] === undefined || vars[name] === null ? "" : String(vars[name])));
  };

  const time = (value) =>
    new Date(value).toLocaleTimeString(locale, { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: lang === "en" });

  const slot = (hhmm) => {
    const [h, m] = String(hhmm || "").slice(0, 5).split(":").map(Number);
    if (!Number.isFinite(h)) return "—";
    if (lang === "en") return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
    return `${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
  };

  const hour = (h) => (lang === "en" ? `${h % 12 || 12}${h < 12 ? "a" : "p"}` : `${h}h`);

  const day = (ymd) =>
    new Date(`${ymd}T00:00:00+04:00`).toLocaleDateString(locale, { timeZone: TZ, day: "numeric", month: "short" });

  const longDate = (value) =>
    new Date(value).toLocaleDateString(locale, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

  const dateLong = (value) =>
    new Date(value).toLocaleDateString(locale, { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });

  const dateTime = (value) =>
    new Date(value).toLocaleString(locale, {
      timeZone: TZ,
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: lang === "en",
    });

  return { lang, locale, t, fmt: { time, slot, hour, day, longDate, dateLong, dateTime } };
}

const I18nContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    let saved = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (!saved || !messages[saved]) return undefined;
    const rafId = window.requestAnimationFrame(() => setLangState(saved));
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!messages[next]) return;
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const value = useMemo(() => ({ ...build(lang), setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const fallback = { ...build("en"), setLang: () => {} };

export function useI18n() {
  return useContext(I18nContext) || fallback;
}

export function LanguageSwitcher({ className = "" }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t("common.language")} className={`inline-flex h-10 items-center rounded-xl border border-gray-200 bg-white p-1 ${className}`}>
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          title={l.name}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition ${
            lang === l.code ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
