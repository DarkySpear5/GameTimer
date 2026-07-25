import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { LANGUAGE_ORDER } from '@shared/constants'

import enCommon from '../locales/en/common.json'
import enGenres from '../locales/en/genres.json'
import frCommon from '../locales/fr/common.json'
import frGenres from '../locales/fr/genres.json'
import esCommon from '../locales/es/common.json'
import esGenres from '../locales/es/genres.json'
import ruCommon from '../locales/ru/common.json'
import ruGenres from '../locales/ru/genres.json'
import jaCommon from '../locales/ja/common.json'
import jaGenres from '../locales/ja/genres.json'
import koCommon from '../locales/ko/common.json'
import koGenres from '../locales/ko/genres.json'
import itCommon from '../locales/it/common.json'
import itGenres from '../locales/it/genres.json'
import deCommon from '../locales/de/common.json'
import deGenres from '../locales/de/genres.json'
import ptCommon from '../locales/pt/common.json'
import ptGenres from '../locales/pt/genres.json'
import zhCommon from '../locales/zh/common.json'
import zhGenres from '../locales/zh/genres.json'

// All 10 languages are bundled app resources (not user data), so they're
// static imports rather than something fetched over IPC. LANGUAGE_ORDER
// (shared/constants.ts) stays the single source of truth for which
// languages exist; this map just has to have an entry for each of them.
const resources = {
  en: { common: enCommon, genres: enGenres },
  fr: { common: frCommon, genres: frGenres },
  es: { common: esCommon, genres: esGenres },
  ru: { common: ruCommon, genres: ruGenres },
  ja: { common: jaCommon, genres: jaGenres },
  ko: { common: koCommon, genres: koGenres },
  it: { common: itCommon, genres: itGenres },
  de: { common: deCommon, genres: deGenres },
  pt: { common: ptCommon, genres: ptGenres },
  zh: { common: zhCommon, genres: zhGenres }
} satisfies Record<(typeof LANGUAGE_ORDER)[number], { common: object; genres: object }>

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en', // mirrors v1's lang -> en -> raw key fallback chain
  defaultNS: 'common',
  ns: ['common', 'genres'],
  interpolation: { escapeValue: false }, // React already escapes; i18next's own escaping would double-escape
  returnNull: false
})

export default i18n
