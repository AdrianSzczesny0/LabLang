/**
 * Long-form fairy tales / stories — separate from short readings.
 */
import { LEVELS } from './registry.js';
import { resolveTranslations, storyTitle } from './content.js';

export const FAIRY_POS_GROUPS = ['noun', 'verb', 'adjective'];

export function validateFairyTale(tale, lang) {
  const errors = [];
  if (!tale || typeof tale !== 'object') return ['not_object'];
  if (!tale.id) errors.push('missing_id');
  if (tale.targetLang && tale.targetLang !== lang) errors.push('targetLang_mismatch');
  if (!LEVELS.includes(tale.level)) errors.push('bad_level');
  if (!Array.isArray(tale.sentences) || tale.sentences.length < 8) errors.push('too_short');
  const tr = tale.translations || {};
  for (const ref of ['pl', 'en']) {
    if (!Array.isArray(tr[ref])) errors.push(`missing_translation_${ref}`);
    else if (tr[ref].length !== tale.sentences.length) errors.push(`align_${ref}`);
  }
  if (!tale.titles || !tale.titles[lang]) errors.push('missing_title');
  if (!Array.isArray(tale.vocabulary) || !tale.vocabulary.length) errors.push('no_vocabulary');
  return errors;
}

export function validateFairyTaleBank(tales, lang) {
  const errors = [];
  if (!Array.isArray(tales)) return { ok: false, errors: ['not_array'], count: 0 };
  const ids = new Set();
  tales.forEach((t) => {
    validateFairyTale(t, lang).forEach((e) => errors.push(`${t?.id || '?'}:${e}`));
    if (t?.id) {
      if (ids.has(t.id)) errors.push(`dup_${t.id}`);
      ids.add(t.id);
    }
  });
  return { ok: errors.length === 0, errors, count: tales.length };
}

export function fairytalesForLang(bank, lang) {
  return bank[lang] || [];
}

export function filterFairytales(list, { level = 'all', kind = 'all', search = '' } = {}) {
  const q = search.trim().toLowerCase();
  return list.filter((t) => {
    if (level !== 'all' && t.level !== level) return false;
    if (kind === 'dialogue' && t.kind !== 'dialogue') return false;
    if (kind === 'story' && t.kind !== 'story') return false;
    if (!q) return true;
    const title = Object.values(t.titles || {}).join(' ');
    const hay = `${title} ${t.sentences.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}

export function vocabularyByPos(tale) {
  const groups = Object.fromEntries(FAIRY_POS_GROUPS.map((p) => [p, []]));
  const seen = new Set();
  for (const v of tale.vocabulary || []) {
    const pos = FAIRY_POS_GROUPS.includes(v.pos) ? v.pos : null;
    if (!pos) continue;
    const key = `${pos}|${String(v.word || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups[pos].push(v);
  }
  for (const p of FAIRY_POS_GROUPS) {
    groups[p].sort((a, b) => String(a.word).localeCompare(String(b.word), 'de'));
  }
  return groups;
}

function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateFairyWordQuiz(tale, referenceLang, size = 8, rand = Math.random) {
  const pool = (tale.vocabulary || []).filter((v) => FAIRY_POS_GROUPS.includes(v.pos));
  if (pool.length < 3) return { ok: false, questions: [] };
  const n = Math.min(size, pool.length);
  const picked = shuffle(pool, rand).slice(0, n);
  const questions = picked.map((item, i) => {
    const correct = item.word;
    const distractors = shuffle(
      pool.filter((x) => x.word !== correct),
      rand,
    ).slice(0, 3).map((x) => x.word);
    const options = shuffle([correct, ...distractors], rand);
    const gloss = item.gloss?.[referenceLang] || item.gloss?.pl || item.gloss?.en || '';
    const reading = item.reading?.[referenceLang] || item.reading?.pl || item.reading?.en || '';
    return {
      id: `${tale.id}-wq-${i + 1}`,
      type: 'fairy_vocab',
      prompt: gloss,
      reading,
      pos: item.pos,
      options,
      expected: [correct],
    };
  });
  return { ok: true, questions };
}

export function fullTranslationText(tale, referenceLang) {
  const resolved = resolveTranslations(tale, referenceLang);
  if (!resolved.lines) return { text: '', notice: resolved.notice };
  return { text: resolved.lines.join('\n'), locale: resolved.locale, fallback: resolved.fallback, notice: resolved.notice };
}

export { storyTitle };
