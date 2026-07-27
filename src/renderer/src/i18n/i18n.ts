import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from '../locales/en/common.json'
import enGenres from '../locales/en/genres.json'

/**
 * Only English loads eagerly (it's both the default `lng` and the
 * `fallbackLng`, so it has to be available synchronously at init — before
 * settings have even loaded from main, the UI needs something to render).
 * The other 9 languages are loaded on demand via loadLanguage() instead of
 * being bundled as static imports: at any given moment only one language is
 * ever active, so eagerly importing all 10 meant carrying 9 languages'
 * worth of translation data in memory (and in the JS bundle) for zero
 * benefit. LANGUAGE_ORDER (shared/constants.ts) stays the single source of
 * truth for which languages exist.
 */
void i18n.use(initReactI18next).init({
  resources: { en: { common: enCommon, genres: enGenres } },
  lng: 'en',
  fallbackLng: 'en', // mirrors v1's lang -> en -> raw key fallback chain
  defaultNS: 'common',
  ns: ['common', 'genres'],
  interpolation: { escapeValue: false }, // React already escapes; i18next's own escaping would double-escape
  returnNull: false
})

/**
 * Dynamically imports and registers a language's translation bundle if it
 * isn't already loaded. Safe to call every time before changeLanguage() —
 * a no-op (single synchronous check, no import) once a language has been
 * loaded for this session, including 'en' which is already in resources.
 * Takes a plain string (matching Settings.language's own type) rather than
 * a narrower union — LANGUAGE_ORDER stays the actual source of truth for
 * which codes are valid; an unrecognized code just fails the dynamic
 * import, which the caller already has to handle regardless.
 */
export async function loadLanguage(lang: string): Promise<void> {
  if (i18n.hasResourceBundle(lang, 'common')) return
  const [common, genres] = await Promise.all([
    import(`../locales/${lang}/common.json`),
    import(`../locales/${lang}/genres.json`)
  ])
  i18n.addResourceBundle(lang, 'common', common.default)
  i18n.addResourceBundle(lang, 'genres', genres.default)
}

export default i18n
