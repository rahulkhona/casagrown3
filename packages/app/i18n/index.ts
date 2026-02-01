import 'intl-pluralrules'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { Platform } from 'react-native'
import * as Localization from 'expo-localization'

import en from './locales/en.json'
import es from './locales/es.json'
import vi from './locales/vi.json'

const getLanguage = (): string => {
  if (Platform.OS !== 'web') {
    try {
      const locales = Localization.getLocales()
      if (locales && locales.length > 0) {
        return locales[0].languageCode?.split('-')[0] || 'en'
      }
    } catch (e) {
      console.warn('Localization native module not found, falling back to English.')
    }
  }
  return 'en'
}

const resources = {
  en: { translation: en },
  es: { translation: es },
  vi: { translation: vi },
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    compatibilityJSON: 'v3',
  })

export default i18n
