/**
 * Content loading, translation resolution, and runtime schema validation.
 */
import { FALLBACK_REFERENCE, LEVELS, TARGET_LANGS, TRANSLATION_COVERAGE } from './registry.js';

export function validateStory(story, lang) {
  const errors = [];
  if (!story || typeof story !== 'object') return ['not_object'];
  if (!story.id) errors.push('missing_id');
  if (story.targetLang && story.targetLang !== lang) errors.push('targetLang_mismatch');
  if (!LEVELS.includes(story.level)) errors.push('bad_level');
  if (!Array.isArray(story.sentences) || !story.sentences.length) errors.push('no_sentences');
  const tr = story.translations || {};
  for (const ref of ['pl', 'en']) {
    if (!Array.isArray(tr[ref])) errors.push(`missing_translation_${ref}`);
    else if (tr[ref].length !== story.sentences.length) errors.push(`align_${ref}`);
  }
  if (!story.titles || !story.titles[lang]) errors.push('missing_title');
  return errors;
}

export function validateStoryBank(stories, lang) {
  const errors = [];
  if (!Array.isArray(stories)) return { ok: false, errors: ['not_array'], counts: {} };
  if (stories.length !== 50) errors.push(`count_${stories.length}`);
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  const ids = new Set();
  stories.forEach((s) => {
    validateStory(s, lang).forEach((e) => errors.push(`${s?.id || '?'}:${e}`));
    if (s?.level && byLevel[s.level] != null) byLevel[s.level] += 1;
    if (s?.id) {
      if (ids.has(s.id)) errors.push(`dup_${s.id}`);
      ids.add(s.id);
    }
  });
  for (const l of LEVELS) {
    if (byLevel[l] !== 10) errors.push(`level_${l}_${byLevel[l]}`);
  }
  return { ok: errors.length === 0, errors, counts: byLevel };
}

export function validateVocabBank(weeks, lang) {
  const errors = [];
  if (!Array.isArray(weeks)) return { ok: false, errors: ['not_array'] };
  if (weeks.length !== 52) errors.push(`weeks_${weeks.length}`);
  weeks.forEach((w, i) => {
    if (!Array.isArray(w.words) || w.words.length !== 5) errors.push(`week_${i + 1}_words`);
  });
  return { ok: errors.length === 0, errors };
}

/**
 * Resolve sentence translations for a reference language.
 * Never silently labels fallback text as another language.
 */
export function resolveTranslations(story, referenceLang) {
  const tr = story.translations || {};
  const native = story.sentences;

  if (referenceLang === story.targetLang) {
    return {
      lines: native,
      locale: referenceLang,
      fallback: false,
      missing: false,
      notice: null,
    };
  }

  if (Array.isArray(tr[referenceLang]) && tr[referenceLang].length === native.length) {
    return {
      lines: tr[referenceLang],
      locale: referenceLang,
      fallback: false,
      missing: false,
      notice: null,
    };
  }

  // Prefer English fallback when available
  if (referenceLang !== FALLBACK_REFERENCE
    && Array.isArray(tr[FALLBACK_REFERENCE])
    && tr[FALLBACK_REFERENCE].length === native.length) {
    return {
      lines: tr[FALLBACK_REFERENCE],
      locale: FALLBACK_REFERENCE,
      fallback: true,
      missing: false,
      notice: 'fallback_en',
    };
  }

  if (Array.isArray(tr.pl) && tr.pl.length === native.length) {
    return {
      lines: tr.pl,
      locale: 'pl',
      fallback: true,
      missing: false,
      notice: 'fallback_pl',
    };
  }

  return {
    lines: null,
    locale: null,
    fallback: false,
    missing: true,
    notice: 'missing',
  };
}

export function storyTitle(story, preferredLangs = []) {
  const titles = story.titles || {};
  for (const lang of preferredLangs) {
    if (titles[lang]) return titles[lang];
  }
  return titles[story.targetLang] || story.id;
}

export function coverageFor(targetLang, referenceLang) {
  return TRANSLATION_COVERAGE[targetLang]?.[referenceLang] || 'none';
}

export async function loadAllContent(fetchImpl = fetch) {
  const stories = {};
  const vocabulary = {};
  const fairytales = {};
  const validation = {};
  const packs = {};

  await Promise.all(TARGET_LANGS.map(async (lang) => {
    const [sRes, vRes, fRes] = await Promise.all([
      fetchImpl(`./content/stories/${lang}.json`),
      fetchImpl(`./content/vocabulary/${lang}.json`),
      fetchImpl(`./content/fairytales/${lang}.json`),
    ]);
    if (!sRes.ok || !vRes.ok) throw new Error(`Failed loading content for ${lang}`);
    const sJson = await sRes.json();
    const vJson = await vRes.json();
    stories[lang] = sJson;
    vocabulary[lang] = vJson;
    let fJson = [];
    if (fRes.ok) {
      fJson = await fRes.json();
    }
    fairytales[lang] = Array.isArray(fJson) ? fJson : [];
    validation[lang] = {
      stories: validateStoryBank(sJson, lang),
      vocabulary: validateVocabBank(vJson, lang),
    };
  }));

  // Optional language starter packs (MC-only). Missing file is OK.
  const packFiles = [
    'en-starter.json',
    'en-pronouns.json',
    'de-starter.json',
    'de-pronouns.json',
    'de-has.json',
  ];
  // Cache-bust so old service-worker entries cannot keep stale questions.
  const packVersion = 'v4.2';
  await Promise.all(packFiles.map(async (file) => {
    try {
      const packRes = await fetchImpl(`./content/packs/${file}?v=${packVersion}`);
      if (packRes.ok) {
        const pack = await packRes.json();
        packs[pack.id || file.replace(/\.json$/, '')] = pack;
      }
    } catch {
      /* offline / missing pack */
    }
  }));

  return { stories, vocabulary, fairytales, validation, packs };
}

export function storiesForLang(stories, lang) {
  return stories[lang] || [];
}

export function filterStories(list, { level = 'all', kind = 'all', search = '', targetLang, referenceLang } = {}) {
  const q = search.trim().toLowerCase();
  return list.filter((s) => {
    if (level !== 'all' && s.level !== level) return false;
    if (kind === 'dialogue' && s.kind !== 'dialogue') return false;
    if (kind === 'story' && s.kind !== 'story') return false;
    if (kind === 'read' && s.audioRecommended) return false;
    if (!q) return true;
    const title = Object.values(s.titles || {}).join(' ');
    const hay = `${title} ${s.sentences.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}
