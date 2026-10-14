/**
 * Assessment generation, answer validation, scoring, and immutable history records.
 */
import { QUESTION_BANK_VERSION, LEVELS } from './registry.js';
import { wordKey } from './flashcards.js';

export const TEST_TYPES = {
  lesson: 'lesson',
  level: 'level',
  practice: 'practice',
  diagnostic: 'diagnostic',
};

export const QUESTION_SIZES = [5, 10, 20, 30];

function uid(prefix = 't') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Normalize for comparison without blindly stripping meaning-bearing accents
 * for languages where accents distinguish answers. We compare both accent-aware
 * and a carefully lowercased form; accents are preserved in the primary check.
 */
export function normalizeAnswer(text, { stripAccents = false } = {}) {
  let s = String(text ?? '').trim().toLocaleLowerCase();
  s = s.replace(/[“”«»„]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/\s+/g, ' ');
  // Strip surrounding punctuation but keep internal apostrophes/hyphens.
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (stripAccents) {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return s;
}

export function answersMatch(user, acceptedList, { lang } = {}) {
  const accepted = (acceptedList || []).filter(Boolean);
  if (!accepted.length) return false;
  // German nouns: capitalization matters for common nouns in accepted forms —
  // we still allow case-insensitive match but do NOT strip umlauts.
  const stripAccents = false;
  const u = normalizeAnswer(user, { stripAccents });
  const uLoose = normalizeAnswer(user, { stripAccents: true });
  for (const a of accepted) {
    const n = normalizeAnswer(a, { stripAccents });
    if (u === n) return true;
    // Secondary loose match only when accent-stripped forms are identical AND
    // the original accepted answer has no accented characters that distinguish meaning
    // for Spanish-like langs we require accent match first; loose is fallback for typed ASCII.
    if (lang === 'es' || lang === 'fr' || lang === 'it') {
      const accented = /[áéíóúàèìòùâêîôûäëïöüãõñç]/i.test(a);
      if (!accented && uLoose === normalizeAnswer(a, { stripAccents: true })) return true;
    } else if (uLoose === normalizeAnswer(a, { stripAccents: true })) {
      return true;
    }
  }
  return false;
}

function gloss(item, referenceLang) {
  return item?.gloss?.[referenceLang] || item?.gloss?.en || item?.gloss?.pl || '';
}

function buildVocabMC(word, distractors, referenceLang, targetLang) {
  const correct = gloss(word, referenceLang);
  const options = shuffle([
    correct,
    ...distractors.map((d) => gloss(d, referenceLang)).filter((g) => g && g !== correct),
  ]).slice(0, 4);
  while (options.length < 4) options.push(correct);
  return {
    id: uid('q'),
    type: 'mc_vocab',
    prompt: { text: word.word, kind: 'meaning_of' },
    options: shuffle(options),
    acceptedAnswers: [correct],
    explanation: `${word.word} → ${correct}`,
    meta: { word: word.word, targetLang, referenceLang },
  };
}

function buildMatch(word, referenceLang, targetLang) {
  return {
    id: uid('q'),
    type: 'match',
    prompt: { text: gloss(word, referenceLang), kind: 'word_for' },
    acceptedAnswers: [word.word, word.word.replace(/^(der|die|das|el|la|le|la|il|lo)\s+/i, '').trim()].filter(Boolean),
    explanation: `${gloss(word, referenceLang)} → ${word.word}`,
    meta: { word: word.word, targetLang, referenceLang },
  };
}

function buildTranslate(word, referenceLang, targetLang) {
  return {
    id: uid('q'),
    type: 'translate',
    prompt: { text: gloss(word, referenceLang), kind: 'translate_to_target' },
    acceptedAnswers: [word.word],
    explanation: `${gloss(word, referenceLang)} = ${word.word}`,
    meta: { word: word.word, targetLang, referenceLang, caseSensitiveHint: targetLang === 'de' },
  };
}

function buildFillBlank(story, referenceLang) {
  const idx = Math.min(1, story.sentences.length - 1);
  const sentence = story.sentences[idx];
  const parts = sentence.replace(/[„“«»"']/g, '').split(/\s+/);
  if (parts.length < 3) return null;
  const blankAt = Math.min(parts.length - 1, Math.max(1, Math.floor(parts.length / 2)));
  const answer = parts[blankAt].replace(/[.,!?;:]+$/g, '');
  const display = parts.map((p, i) => (i === blankAt ? '______' : p)).join(' ');
  return {
    id: uid('q'),
    type: 'fill_blank',
    prompt: { text: display, kind: 'fill' },
    acceptedAnswers: [answer, answer.toLocaleLowerCase()],
    explanation: sentence,
    meta: { storyId: story.id, referenceLang },
  };
}

function buildReorder(story) {
  const sentence = story.sentences[0];
  const tokens = sentence.replace(/[„“«»]/g, '').split(/\s+/).filter(Boolean);
  if (tokens.length < 3 || tokens.length > 8) return null;
  return {
    id: uid('q'),
    type: 'reorder',
    prompt: { tokens: shuffle(tokens), kind: 'reorder' },
    acceptedAnswers: [tokens.join(' '), sentence.replace(/[„“«»]/g, '').trim()],
    explanation: sentence,
    meta: { storyId: story.id },
  };
}

function buildComprehension(story, referenceLang) {
  const q = (story.questions || [])[0];
  if (!q) return null;
  const prompt = q.prompt?.[referenceLang] || q.prompt?.en || q.prompt?.pl || 'Comprehension';
  const accepted = q.acceptedAnswers?.[referenceLang]
    || q.acceptedAnswers?.en
    || q.acceptedAnswers?.pl
    || story.sentences.slice(0, 1);
  return {
    id: uid('q'),
    type: 'comprehension',
    prompt: { text: prompt, kind: 'comprehension' },
    acceptedAnswers: accepted,
    explanation: q.explanation?.[referenceLang] || q.explanation?.en || accepted[0],
    meta: { storyId: story.id },
  };
}

function buildListening(story, targetLang) {
  const idx = 0;
  const sentence = story.sentences[idx];
  const options = shuffle([
    sentence,
    ...story.sentences.slice(1, 4),
  ]).slice(0, 4);
  return {
    id: uid('q'),
    type: 'listening',
    prompt: { text: sentence, kind: 'listening', lang: targetLang },
    options,
    acceptedAnswers: [sentence],
    explanation: sentence,
    meta: { storyId: story.id, targetLang, listenText: sentence },
  };
}

function vocabPoolFromStories(stories, vocabulary, lang, customCards = []) {
  const fromStories = stories.flatMap((s) => (s.vocabulary || []).map((v) => ({
    word: v.word,
    gloss: v.gloss || {},
    pos: v.pos,
  })));
  const fromWeeks = (vocabulary[lang] || []).flatMap((w) => w.words);
  return [...fromStories, ...fromWeeks, ...customCards];
}

/**
 * Build a question bank for the given mode, then sample `size` unique questions.
 */
export function generateTest({
  type,
  targetLang,
  referenceLang,
  level = null,
  lessonId = null,
  size = 10,
  includeListening = false,
  stories = [],
  vocabulary = {},
  progress = null,
  rng = Math.random,
}) {
  let poolStories = stories.filter((s) => s.targetLang === targetLang || !s.targetLang);
  if (type === TEST_TYPES.lesson) {
    poolStories = poolStories.filter((s) => s.id === lessonId);
  } else if (type === TEST_TYPES.level) {
    poolStories = poolStories.filter((s) => s.level === level);
    if (progress) {
      const done = progress.storiesDone || {};
      const studied = poolStories.filter((s) => done[s.id]);
      if (studied.length) poolStories = studied;
    }
  } else if (type === TEST_TYPES.practice) {
    if (progress) {
      const done = progress.storiesDone || {};
      const studied = poolStories.filter((s) => done[s.id]);
      poolStories = studied.length ? studied : poolStories.slice(0, 15);
    }
  } else if (type === TEST_TYPES.diagnostic) {
    // Sample across levels
    poolStories = LEVELS.flatMap((lv) => poolStories.filter((s) => s.level === lv).slice(0, 2));
  }

  const custom = progress?.customCards || [];
  const words = vocabPoolFromStories(poolStories, vocabulary, targetLang, custom)
    .filter((w) => w.word && gloss(w, referenceLang));

  const bank = [];
  const used = new Set();

  const pushUnique = (q) => {
    if (!q) return;
    const sig = `${q.type}|${q.prompt?.text || q.prompt?.tokens?.join(' ')}|${(q.acceptedAnswers || [])[0]}`;
    if (used.has(sig)) return;
    used.add(sig);
    bank.push(q);
  };

  const distractorSource = shuffle(words, rng);
  words.slice(0, 80).forEach((w, i) => {
    const distractors = distractorSource.filter((d) => d.word !== w.word).slice(i % 7, i % 7 + 6);
    pushUnique(buildVocabMC(w, distractors, referenceLang, targetLang));
    pushUnique(buildMatch(w, referenceLang, targetLang));
    pushUnique(buildTranslate(w, referenceLang, targetLang));
  });

  poolStories.forEach((s) => {
    pushUnique(buildFillBlank(s, referenceLang));
    pushUnique(buildReorder(s));
    pushUnique(buildComprehension(s, referenceLang));
    if (includeListening) pushUnique(buildListening(s, targetLang));
  });

  const availableSizes = QUESTION_SIZES.filter((n) => n <= bank.length);
  const chosenSize = availableSizes.includes(size) ? size : (availableSizes[availableSizes.length - 1] || 0);
  if (!chosenSize) {
    return { ok: false, reason: 'insufficient_questions', bankSize: bank.length, questions: [] };
  }

  const questions = shuffle(bank, rng).slice(0, chosenSize);
  return {
    ok: true,
    bankSize: bank.length,
    availableSizes,
    test: {
      id: uid('attempt-draft'),
      type,
      targetLang,
      referenceLang,
      level: level || (type === TEST_TYPES.lesson ? poolStories[0]?.level : null),
      lessonId,
      questionBankVersion: QUESTION_BANK_VERSION,
      diagnosticNote: type === TEST_TYPES.diagnostic
        ? 'estimate_only'
        : null,
      questions,
      createdAt: new Date().toISOString(),
    },
  };
}

export function gradeAnswer(question, userAnswer) {
  const lang = question.meta?.targetLang;
  let correct = false;
  if (question.type === 'mc_vocab' || question.type === 'listening') {
    correct = answersMatch(userAnswer, question.acceptedAnswers, { lang });
  } else if (question.type === 'reorder') {
    const normalizedUser = normalizeAnswer(userAnswer, { stripAccents: false });
    correct = (question.acceptedAnswers || []).some((a) => normalizeAnswer(a) === normalizedUser);
  } else {
    correct = answersMatch(userAnswer, question.acceptedAnswers, { lang });
  }
  return {
    correct,
    userAnswer,
    expected: question.acceptedAnswers,
    explanation: question.explanation || null,
  };
}

export function scoreTest(test, answersById, startedAt, finishedAt = Date.now()) {
  const details = [];
  let correctCount = 0;
  const mistakes = [];
  for (const q of test.questions) {
    const user = answersById[q.id] ?? '';
    const graded = gradeAnswer(q, user);
    if (graded.correct) correctCount += 1;
    else {
      mistakes.push({
        questionId: q.id,
        type: q.type,
        prompt: q.prompt,
        userAnswer: user,
        expected: q.acceptedAnswers,
        word: q.meta?.word || null,
      });
    }
    details.push({ questionId: q.id, ...graded, type: q.type, prompt: q.prompt });
  }
  const total = test.questions.length;
  const scorePercent = total ? Math.round((100 * correctCount) / total) : 0;
  const attempt = {
    id: uid('attempt'),
    targetLang: test.targetLang,
    referenceLang: test.referenceLang,
    createdAt: new Date(finishedAt).toISOString(),
    type: test.type,
    level: test.level,
    lessonId: test.lessonId || null,
    questionCount: total,
    correctCount,
    scorePercent,
    durationMs: Math.max(0, finishedAt - startedAt),
    questions: test.questions, // immutable snapshot
    answers: details,
    mistakes,
    questionBankVersion: test.questionBankVersion || QUESTION_BANK_VERSION,
    diagnosticNote: test.diagnosticNote || null,
  };
  return attempt;
}

export function revisionAreas(attempt) {
  const byType = {};
  for (const m of attempt.mistakes || []) {
    byType[m.type] = (byType[m.type] || 0) + 1;
  }
  return Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));
}

export function filterAttempts(attempts, { lang = 'all', level = 'all', type = 'all' } = {}) {
  return (attempts || []).filter((a) => {
    if (lang !== 'all' && a.targetLang !== lang) return false;
    if (level !== 'all' && a.level !== level) return false;
    if (type !== 'all' && a.type !== type) return false;
    return true;
  }).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function scoreSeries(attempts, lang) {
  return filterAttempts(attempts, { lang })
    .slice()
    .reverse()
    .map((a) => ({ at: a.createdAt, score: a.scorePercent, type: a.type }));
}

export function mistakesToFlashcards(attempt) {
  const cards = [];
  for (const m of attempt.mistakes || []) {
    if (!m.word) continue;
    cards.push({
      id: `review-${attempt.id}-${m.questionId}`,
      word: m.word,
      gloss: { [attempt.referenceLang]: String(m.prompt?.text || m.expected?.[0] || '') },
      pos: 'review',
      source: 'test_mistake',
      attemptId: attempt.id,
    });
  }
  return cards;
}

export function estimateDiagnosticLevel(attempt) {
  // Rough estimate only — never presented as certification.
  const score = attempt.scorePercent || 0;
  if (score < 35) return 'A0';
  if (score < 50) return 'A1';
  if (score < 65) return 'A2';
  if (score < 80) return 'B1';
  return 'B2';
}

export { wordKey, uid, shuffle };
