/**
 * Versioned localStorage persistence, migrations, import/export.
 * Never deletes existing progress; migrates legacy v1/v2 keys into schema v3.
 */
import {
  SCHEMA_VERSION,
  TARGET_LANGS,
  createDefaultState,
  emptyLanguageProgress,
} from './registry.js';

export const STORAGE_KEY = 'langlab_v3_progress';
export const LEGACY_V2 = 'langlab_v2_progress';
export const LEGACY_V1 = 'langlab_v1_progress';

function safeParse(raw) {
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function ensureLangBucket(state, lang) {
  if (!state.byLanguage[lang]) state.byLanguage[lang] = emptyLanguageProgress();
  const bucket = state.byLanguage[lang];
  bucket.storiesDone ||= {};
  bucket.storiesStarted ||= {};
  bucket.writing ||= {};
  bucket.customCards ||= [];
  bucket.cardStats ||= {};
  bucket.weekCompleted ||= {};
  bucket.levelProgress ||= emptyLanguageProgress().levelProgress;
  return bucket;
}

/** Map legacy story keys `de|a0-01` → `de-a0-01` and writing keys. */
function migrateLegacyStoryKey(key) {
  if (!key || typeof key !== 'string') return null;
  const m = key.match(/^(de|es)\|([a-z0-9-]+)$/i);
  if (!m) return null;
  const lang = m[1].toLowerCase();
  let id = m[2];
  if (id === '1') id = 'a0-01';
  // Already new-style id inside key? de|de-a0-01
  if (id.startsWith(`${lang}-`)) return { lang, storyId: id, key: `${lang}|${id}` };
  return { lang, storyId: `${lang}-${id}`, legacyId: id, key: `${lang}|${lang}-${id}` };
}

function migrateV2ToV3(previous) {
  const state = createDefaultState();
  state.interfaceLang = 'pl';
  state.referenceLang = 'pl';
  state.targetLang = previous.lang === 'es' ? 'es' : 'de';

  // Settings
  const ps = previous.settings || {};
  state.settings.showTranslations = ps.showPL !== false;
  state.settings.readOnly = !!ps.readOnly;
  state.settings.rate = typeof ps.rate === 'number' ? ps.rate : 0.85;
  state.settings.voice = { ...state.settings.voice, ...(ps.voice || {}) };
  state.settings.selectedWeek = previous.selectedWeek ?? null;
  state.settings.weekManual = !!previous.weekManual;

  // Stories done / writing / last story
  for (const [rawKey, val] of Object.entries(previous.storiesDone || {})) {
    const mapped = migrateLegacyStoryKey(rawKey);
    if (!mapped || !val) continue;
    const bucket = ensureLangBucket(state, mapped.lang);
    bucket.storiesDone[mapped.storyId] = true;
  }
  for (const [rawKey, val] of Object.entries(previous.writing || {})) {
    const mapped = migrateLegacyStoryKey(rawKey);
    if (!mapped) continue;
    const bucket = ensureLangBucket(state, mapped.lang);
    bucket.writing[mapped.storyId] = val;
  }
  for (const [lang, last] of Object.entries(previous.lastStory || {})) {
    if (!TARGET_LANGS.includes(lang)) continue;
    const bucket = ensureLangBucket(state, lang);
    if (typeof last === 'string') {
      bucket.lastStoryId = last.startsWith(`${lang}-`) ? last : `${lang}-${last === '1' ? 'a0-01' : last}`;
    }
  }

  // Weekly day completion: `de|3|0` → weekCompleted
  for (const [rawKey, val] of Object.entries(previous.completed || {})) {
    const parts = String(rawKey).split('|');
    if (parts.length !== 3) continue;
    const [lang, week, day] = parts;
    if (!TARGET_LANGS.includes(lang) || !val) continue;
    const bucket = ensureLangBucket(state, lang);
    bucket.weekCompleted[`${week}|${day}`] = true;
  }

  // Flashcard stats + custom cards
  for (const lang of ['de', 'es']) {
    const bucket = ensureLangBucket(state, lang);
    const stats = (previous.cardstats && previous.cardstats[lang]) || {};
    for (const [k, v] of Object.entries(stats)) {
      bucket.cardStats[k] = {
        status: (v?.level || 0) > 0 ? 'learning' : 'new',
        level: v?.level || 0,
        interval: v?.level ? [1, 2, 4, 7, 14, 30, 60][Math.min(6, v.level)] : 0,
        next: v?.next || Date.now(),
        reviews: v?.level || 0,
        lapses: 0,
        lastQuality: null,
        updatedAt: Date.now(),
      };
      if ((v?.level || 0) >= 5) bucket.cardStats[k].status = 'known';
      else if ((v?.level || 0) === 0) bucket.cardStats[k].status = 'needs_review';
    }
    const custom = (previous.custom && previous.custom[lang]) || [];
    bucket.customCards = custom.map((c, i) => ({
      id: `${lang}-custom-${i + 1}`,
      word: c.word,
      gloss: { pl: c.pl, en: c.pl },
      pos: 'noun',
      source: 'user',
    }));
  }

  // Legacy quiz object → historical attempts when possible
  if (previous.quiz && typeof previous.quiz === 'object') {
    for (const [k, v] of Object.entries(previous.quiz)) {
      if (!v || typeof v !== 'object') continue;
      const lang = (k.split('|')[0] || state.targetLang);
      if (!TARGET_LANGS.includes(lang)) continue;
      state.testAttempts.push({
        id: `legacy-${lang}-${k}-${v.at || 'unknown'}`,
        targetLang: lang,
        referenceLang: 'pl',
        createdAt: v.at || new Date().toISOString(),
        type: 'legacy',
        level: v.level || null,
        questionCount: v.total || 0,
        correctCount: v.correct || 0,
        scorePercent: v.total ? Math.round((100 * (v.correct || 0)) / v.total) : 0,
        durationMs: v.durationMs || 0,
        questions: [],
        answers: [],
        mistakes: [],
        questionBankVersion: 'legacy',
        legacy: true,
      });
    }
  }

  state.migratedFrom = previous.schemaVersion ? `v${previous.schemaVersion}` : 'v2';
  state.migratedAt = new Date().toISOString();
  return state;
}

function normalizeV3(raw) {
  const base = createDefaultState();
  const state = {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    byLanguage: { ...base.byLanguage },
    testAttempts: Array.isArray(raw.testAttempts) ? raw.testAttempts : [],
  };
  for (const lang of TARGET_LANGS) {
    state.byLanguage[lang] = {
      ...emptyLanguageProgress(),
      ...(raw.byLanguage?.[lang] || {}),
    };
    ensureLangBucket(state, lang);
  }
  state.schemaVersion = SCHEMA_VERSION;
  if (!TARGET_LANGS.includes(state.targetLang)) state.targetLang = 'de';
  return state;
}

export function loadState() {
  const v3 = safeParse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (v3 && (v3.schemaVersion === 3 || v3.byLanguage)) {
    return normalizeV3(v3);
  }
  for (const key of [LEGACY_V2, LEGACY_V1]) {
    const legacy = safeParse(localStorage.getItem(key) || 'null');
    if (legacy) {
      const migrated = migrateV2ToV3(legacy);
      saveState(migrated);
      return migrated;
    }
  }
  return createDefaultState();
}

export function saveState(state) {
  try {
    const payload = { ...state, schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export function exportBackup(state) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'LangLab',
    ...state,
  };
}

export function validateBackup(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'not_object' };
  if (data.byLanguage && typeof data.byLanguage === 'object') return { ok: true, kind: 'v3' };
  if (data.completed && data.cardstats && data.writing) return { ok: true, kind: 'v2' };
  return { ok: false, error: 'unrecognized' };
}

/**
 * Import backup.
 * mode: 'replace' | 'merge'
 * Merge never drops existing test attempt IDs; replace warns via caller.
 */
export function importBackup(current, data, mode = 'merge') {
  const check = validateBackup(data);
  if (!check.ok) throw new Error(check.error);

  let incoming = check.kind === 'v2' ? migrateV2ToV3(data) : normalizeV3(data);

  if (mode === 'replace') {
    incoming.interfaceLang = current.interfaceLang;
    // Keep current UI prefs for interface language continuity
    return incoming;
  }

  // Merge
  const merged = normalizeV3(current);
  merged.referenceLang = incoming.referenceLang || merged.referenceLang;
  merged.targetLang = incoming.targetLang || merged.targetLang;
  merged.settings = { ...merged.settings, ...incoming.settings, voice: { ...merged.settings.voice, ...incoming.settings.voice } };

  for (const lang of TARGET_LANGS) {
    const a = ensureLangBucket(merged, lang);
    const b = ensureLangBucket(incoming, lang);
    a.storiesDone = { ...a.storiesDone, ...b.storiesDone };
    a.storiesStarted = { ...a.storiesStarted, ...b.storiesStarted };
    a.writing = { ...a.writing, ...b.writing };
    a.weekCompleted = { ...a.weekCompleted, ...b.weekCompleted };
    a.cardStats = { ...a.cardStats, ...b.cardStats };
    const existingKeys = new Set(a.customCards.map((c) => `${c.word}|${c.gloss?.pl || ''}`.toLowerCase()));
    for (const card of b.customCards) {
      const k = `${card.word}|${card.gloss?.pl || ''}`.toLowerCase();
      if (!existingKeys.has(k)) {
        a.customCards.push(card);
        existingKeys.add(k);
      }
    }
    if (b.lastStoryId) a.lastStoryId = b.lastStoryId;
    a.studyMinutes = Math.max(a.studyMinutes || 0, b.studyMinutes || 0);
    a.streak = Math.max(a.streak || 0, b.streak || 0);
    if (b.lastStudyDate && (!a.lastStudyDate || b.lastStudyDate > a.lastStudyDate)) {
      a.lastStudyDate = b.lastStudyDate;
    }
  }

  const seen = new Set(merged.testAttempts.map((t) => t.id));
  for (const attempt of incoming.testAttempts || []) {
    if (!attempt?.id || seen.has(attempt.id)) continue;
    merged.testAttempts.push(attempt);
    seen.add(attempt.id);
  }
  merged.testAttempts.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return merged;
}

export { migrateV2ToV3, normalizeV3, migrateLegacyStoryKey };
