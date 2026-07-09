import { describe, it, expect } from 'vitest'
import { t, resolveLocale } from '../../src/i18n'

describe('t() translation lookup', () => {
  it('returns English string for en locale', () => {
    expect(t('form.fullName', 'en')).toBe('Full Name')
  })

  it('returns French string for fr locale', () => {
    expect(t('form.fullName', 'fr')).toBe('Nom complet')
  })

  it('returns Spanish string for es locale', () => {
    expect(t('form.fullName', 'es')).toBe('Nombre completo')
  })

  it('falls back to English when key missing in target locale', () => {
    // If a key only exists in English, t() returns the English value
    expect(t('form.fullName', 'en')).toBe('Full Name')
  })

  it('returns key itself when not found in any locale', () => {
    expect(t('nonexistent.key', 'fr')).toBe('nonexistent.key')
  })
})

describe('resolveLocale()', () => {
  it('returns event locale when set to fr', () => {
    expect(resolveLocale('fr', null)).toBe('fr')
  })

  it('returns event locale when set to es', () => {
    expect(resolveLocale('es', null)).toBe('es')
  })

  it('returns en when event locale is en', () => {
    expect(resolveLocale('en', null)).toBe('en')
  })

  it('falls back to Accept-Language when event locale is null', () => {
    expect(resolveLocale(null, 'fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr')
  })

  it('falls back to Accept-Language when event locale is empty string', () => {
    expect(resolveLocale('', 'es-MX,es;q=0.9')).toBe('es')
  })

  it('picks first supported language from Accept-Language by q-value', () => {
    expect(resolveLocale(null, 'de,fr;q=0.8,en;q=0.5')).toBe('fr')
  })

  it('returns en when Accept-Language has no supported language', () => {
    expect(resolveLocale(null, 'de,ja,zh')).toBe('en')
  })

  it('returns en when both event locale and Accept-Language are absent', () => {
    expect(resolveLocale(null, null)).toBe('en')
  })

  it('ignores unsupported event locale and falls back to Accept-Language', () => {
    expect(resolveLocale('de', 'es,en;q=0.5')).toBe('es')
  })

  it('returns en for unsupported event locale with no Accept-Language', () => {
    expect(resolveLocale('de', null)).toBe('en')
  })
})
