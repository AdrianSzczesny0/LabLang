/**
 * Language registry — interface, reference, and target languages.
 * Adding a new target later should mainly mean new content files + registry entry.
 */
export const SCHEMA_VERSION = 3;
export const QUESTION_BANK_VERSION = '3.0.0';
export const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2'];

export const INTERFACE_LANGS = ['pl', 'en', 'de', 'es', 'fr', 'it'];
export const REFERENCE_LANGS = ['pl', 'en', 'de', 'es', 'fr', 'it'];
export const TARGET_LANGS = ['de', 'es', 'en', 'fr', 'it'];

export const LANG_META = {
  pl: { name: { pl: 'Polski', en: 'Polish', de: 'Polnisch', es: 'Polaco', fr: 'Polonais', it: 'Polacco' }, native: 'Polski', flag: '🇵🇱', speech: 'pl-PL', dir: 'ltr' },
  en: { name: { pl: 'Angielski', en: 'English', de: 'Englisch', es: 'Inglés', fr: 'Anglais', it: 'Inglese' }, native: 'English', flag: '🇬🇧', speech: 'en-GB', dir: 'ltr' },
  de: { name: { pl: 'Niemiecki', en: 'German', de: 'Deutsch', es: 'Alemán', fr: 'Allemand', it: 'Tedesco' }, native: 'Deutsch', flag: '🇩🇪', speech: 'de-DE', dir: 'ltr' },
  es: { name: { pl: 'Hiszpański', en: 'Spanish', de: 'Spanisch', es: 'Español', fr: 'Espagnol', it: 'Spagnolo' }, native: 'Español', flag: '🇪🇸', speech: 'es-ES', dir: 'ltr' },
  fr: { name: { pl: 'Francuski', en: 'French', de: 'Französisch', es: 'Francés', fr: 'Français', it: 'Francese' }, native: 'Français', flag: '🇫🇷', speech: 'fr-FR', dir: 'ltr' },
  it: { name: { pl: 'Włoski', en: 'Italian', de: 'Italienisch', es: 'Italiano', fr: 'Italien', it: 'Italiano' }, native: 'Italiano', flag: '🇮🇹', speech: 'it-IT', dir: 'ltr' },
};

export const FALLBACK_REFERENCE = 'en';

export const TRANSLATION_COVERAGE = {
  // Documented verified reference coverage for reading content.
  // "full" = pl+en translations present for all stories of that target.
  // Other reference locales may fall back to English with an explicit notice.
  de: { pl: 'full', en: 'full', de: 'native', es: 'partial-titles', fr: 'partial-titles', it: 'partial-titles' },
  es: { pl: 'full', en: 'full', es: 'native', de: 'partial-titles', fr: 'partial-titles', it: 'partial-titles' },
  en: { pl: 'full', en: 'native', de: 'partial-titles', es: 'partial-titles', fr: 'partial-titles', it: 'partial-titles' },
  fr: { pl: 'full', en: 'full', fr: 'native', de: 'partial-titles', es: 'partial-titles', it: 'partial-titles' },
  it: { pl: 'full', en: 'full', it: 'native', de: 'partial-titles', es: 'partial-titles', fr: 'partial-titles' },
};

export function speechLocale(lang) {
  return LANG_META[lang]?.speech || 'en-GB';
}

export function displayName(lang, interfaceLang = 'en') {
  const meta = LANG_META[lang];
  if (!meta) return lang;
  return meta.name[interfaceLang] || meta.native || lang;
}

export function assertLangPair(referenceLang, targetLang) {
  if (referenceLang === targetLang) {
    return {
      ok: false,
      messageKey: 'langConflict',
    };
  }
  return { ok: true };
}

export function emptyLanguageProgress() {
  return {
    storiesDone: {},
    storiesStarted: {},
    writing: {},
    customCards: [],
    cardStats: {},
    weekCompleted: {},
    lastStoryId: null,
    studyMinutes: 0,
    streak: 0,
    lastStudyDate: null,
    currentLevel: 'A0',
    levelProgress: Object.fromEntries(LEVELS.map((l) => [l, { done: 0, total: 10 }])),
  };
}

export function createDefaultState() {
  const byLanguage = Object.fromEntries(TARGET_LANGS.map((l) => [l, emptyLanguageProgress()]));
  return {
    schemaVersion: SCHEMA_VERSION,
    interfaceLang: 'pl',
    referenceLang: 'pl',
    targetLang: 'de',
    byLanguage,
    testAttempts: [],
    settings: {
      showTranslations: true,
      readOnly: false,
      rate: 0.85,
      voice: Object.fromEntries(TARGET_LANGS.map((l) => [l, ''])),
      includeListeningInTests: true,
      selectedWeek: null,
      weekManual: false,
    },
  };
}
