import 'intl-pluralrules'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { Platform } from 'react-native'
import * as Localization from 'expo-localization'

import en from './locales/en.json'
import es from './locales/es.json'
import vi from './locales/vi.json'

const SUPPORTED_LANGUAGES = ['en', 'es', 'vi']

const getLanguage = (): string => {
  // Web: Detect from browser settings
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.language) {
      const browserLang = navigator.language.split('-')[0]
      return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : 'en'
    }
    return 'en'
  }
  
  // Native (iOS/Android): Detect from device settings
  try {
    const locales = Localization.getLocales()
    if (locales && locales.length > 0) {
      const deviceLang = locales[0].languageCode?.split('-')[0] || 'en'
      return SUPPORTED_LANGUAGES.includes(deviceLang) ? deviceLang : 'en'
    }
  } catch (e) {
    console.warn('Localization native module not found, falling back to English.')
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
    compatibilityJSON: 'v4',
  })

export default i18n
