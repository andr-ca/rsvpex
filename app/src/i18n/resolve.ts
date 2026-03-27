/**
 * Locale resolution for public-facing pages.
 *
 * @req I18N-01 — event locale with Accept-Language fallback
 */

import { SUPPORTED_LOCALES, type SupportedLocale } from './translations'

/**
 * Resolve the effective locale for a public page.
 *
 * Priority:
 * 1. Event's configured locale (if supported)
 * 2. Browser Accept-Language header (first supported match)
 * 3. English fallback
 */
export function resolveLocale(
  eventLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): SupportedLocale {
  // 1. Event locale takes priority
  if (eventLocale && SUPPORTED_LOCALES.includes(eventLocale as SupportedLocale)) {
    return eventLocale as SupportedLocale
  }

  // 2. Parse Accept-Language header
  if (acceptLanguage) {
    const parsed = acceptLanguage
      .split(',')
      .map((part) => {
        const [lang, q] = part.trim().split(';q=')
        return { lang: lang.trim().split('-')[0].toLowerCase(), q: q ? parseFloat(q) : 1.0 }
      })
      .sort((a, b) => b.q - a.q)

    for (const { lang } of parsed) {
      if (SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
        return lang as SupportedLocale
      }
    }
  }

  // 3. Default to English
  return 'en'
}
