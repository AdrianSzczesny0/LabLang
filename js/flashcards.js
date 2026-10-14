/**
 * Per-language flashcards with a simple documented SM-2-inspired scheduler.
 *
 * Algorithm (LangLab-SR-1):
 * - quality 0 (again): interval=1 day, status=needs_review, level=max(0, level-1)
 * - quality 1 (hard): interval = max(1, round(interval * 1.2)), status=learning
 * - quality 2 (good): interval = schedule[level] days (1,2,4,7,14,30,60), level++
 * - quality 3 (easy): interval = schedule[level]*1.5, level+=2 (capped)
 * Viewing a card alone never marks it known.
 */
export const SR_SCHEDULE_DAYS = [1, 2, 4, 7, 14, 30, 60];
export const SR_VERSION = 'LangLab-SR-1';

export function wordKey(word, glossPl = '') {
  return `${String(word || '').trim()}|${String(glossPl || '').trim()}`.toLowerCase();
}

export function defaultCardStat() {
  return {
    status: 'new', // new | learning | known | needs_review
    level: 0,
    interval: 0,
    next: 0,
    reviews: 0,
    lapses: 0,
    lastQuality: null,
    updatedAt: Date.now(),
  };
}

export function reviewCard(stat, quality) {
  const now = Date.now();
  const prev = { ...defaultCardStat(), ...stat };
  let level = prev.level || 0;
  let interval = prev.interval || 0;
  let status = prev.status || 'learning';
  let lapses = prev.lapses || 0;

  if (quality <= 0) {
    lapses += 1;
    level = Math.max(0, level - 1);
    interval = 1;
    status = 'needs_review';
  } else if (quality === 1) {
    interval = Math.max(1, Math.round((interval || 1) * 1.2));
    status = 'learning';
  } else if (quality === 2) {
    level = Math.min(6, level + 1);
    interval = SR_SCHEDULE_DAYS[level];
    status = level >= 5 ? 'known' : 'learning';
  } else {
    level = Math.min(6, level + 2);
    interval = Math.max(1, Math.round(SR_SCHEDULE_DAYS[Math.min(6, level)] * 1.5));
    status = level >= 5 ? 'known' : 'learning';
  }

  return {
    status,
    level,
    interval,
    next: now + interval * 86400000,
    reviews: (prev.reviews || 0) + 1,
    lapses,
    lastQuality: quality,
    updatedAt: now,
  };
}

export function weekWords(vocabulary, lang, week) {
  const weeks = vocabulary[lang] || [];
  const entry = weeks[Math.max(0, week - 1)];
  return entry?.words || [];
}

export function allWords(vocabulary, lang, customCards = []) {
  const weeks = vocabulary[lang] || [];
  return [...weeks.flatMap((w) => w.words), ...customCards];
}

export function dueWords(vocabulary, lang, customCards, cardStats, upToWeek) {
  const now = Date.now();
  const weeks = (vocabulary[lang] || []).slice(0, upToWeek);
  const pool = [...weeks.flatMap((w) => w.words), ...customCards];
  return pool.filter((w) => {
    const key = wordKey(w.word, w.gloss?.pl || w.gloss?.en || '');
    const st = cardStats[key];
    if (!st) return true;
    return !st.next || st.next <= now || st.status === 'needs_review';
  });
}

export function knownCount(cardStats) {
  return Object.values(cardStats || {}).filter((s) => s.status === 'known' || (s.level || 0) >= 5).length;
}

export function learningCount(cardStats) {
  return Object.values(cardStats || {}).filter((s) => s.status === 'learning' || ((s.level || 0) > 0 && (s.level || 0) < 5)).length;
}

export function addStoryVocabAsCards(bucket, story, referenceLang = 'pl') {
  const existing = new Set(bucket.customCards.map((c) => wordKey(c.word, c.gloss?.pl || '')));
  let added = 0;
  for (const v of story.vocabulary || []) {
    const glossPl = v.gloss?.pl || v.gloss?.[referenceLang] || '';
    const key = wordKey(v.word, glossPl);
    if (existing.has(key)) continue;
    bucket.customCards.push({
      id: `${story.id}-vocab-${added + 1}-${Date.now()}`,
      word: v.word,
      article: v.article || null,
      example: v.example || '',
      gloss: { ...(v.gloss || {}), pl: glossPl },
      pos: v.pos || 'word',
      source: 'story',
      storyId: story.id,
    });
    existing.add(key);
    added += 1;
  }
  return added;
}

/**
 * Weekend workflow helpers:
 * Saturday → introduce current week's 5 nouns
 * Sunday → review those + due cards; do not auto-advance to a new set
 */
export function weekendMode(dayIndex) {
  // Monday=0 ... Sunday=6
  if (dayIndex === 5) return 'introduce';
  if (dayIndex === 6) return 'review';
  return 'weekday';
}
