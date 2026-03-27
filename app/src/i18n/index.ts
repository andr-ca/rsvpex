/**
 * i18n barrel export.
 *
 * @req I18N-01 — event locale en/fr/es on public form
 */

import { translations, type SupportedLocale, SUPPORTED_LOCALES } from './translations'
export { resolveLocale } from './resolve'
export type { SupportedLocale }
export { SUPPORTED_LOCALES }

/**
 * Translate a key for the given locale.
 * Falls back to English, then returns the key itself if not found.
 */
export function t(key: string, locale: SupportedLocale): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key
}
