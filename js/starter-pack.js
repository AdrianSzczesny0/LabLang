/**
 * English starter pack — multiple-choice only practice (no typing).
 * Tracks per-run history, progress chart, points vs max, and weak-item retry.
 */
import { QUESTION_BANK_VERSION } from './registry.js';

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

function pickText(obj, langs) {
  if (!obj || typeof obj !== 'object') return String(obj || '');
  for (const lang of langs) {
    if (obj[lang]) return obj[lang];
  }
  return obj.en || obj.pl || Object.values(obj)[0] || '';
}

export function packTitle(pack, interfaceLang, referenceLang) {
  return pickText(pack.title, [interfaceLang, referenceLang, 'en', 'pl']);
}

export function packDescription(pack, interfaceLang, referenceLang) {
  return pickText(pack.description, [interfaceLang, referenceLang, 'en', 'pl']);
}

export function filterStarterAttempts(attempts, packId = 'en-starter') {
  return (attempts || [])
    .filter((a) => a.type === 'starter' && (a.packId === packId || a.lessonId === packId))
    .slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function questionBySource(pack, sourceId) {
  return (pack?.questions || []).find((q) => q.id === sourceId) || null;
}

function labelForSource(pack, sourceId, interfaceLang, referenceLang) {
  const q = questionBySource(pack, sourceId);
  if (!q) return sourceId;
  const prompt = pickText(q.prompt, [interfaceLang, referenceLang, 'en', 'pl']);
  return `${prompt} → ${q.answer}`;
}

/**
 * Build an all-MC test from a starter pack.
 * size: number | 'all'
 * mode: 'full' | 'weak' — weak uses only sourceIds from weakSourceIds
 */
export function generateStarterTest({
  pack,
  referenceLang = 'pl',
  interfaceLang = 'pl',
  size = 'all',
  mode = 'full',
  weakSourceIds = [],
  rng = Math.random,
}) {
  if (!pack?.questions?.length) {
    return { ok: false, reason: 'empty_pack', questions: [] };
  }

  let sourceQuestions = pack.questions;
  if (mode === 'weak') {
    const set = new Set(weakSourceIds);
    sourceQuestions = pack.questions.filter((q) => set.has(q.id));
    if (!sourceQuestions.length) {
      return { ok: false, reason: 'no_weak_items', questions: [] };
    }
  }

  const bank = sourceQuestions.map((q) => {
    const prompt = pickText(q.prompt, [interfaceLang, referenceLang, 'en', 'pl']);
    const explanation = pickText(q.explanation, [interfaceLang, referenceLang, 'en', 'pl']);
    const options = shuffle(q.options.slice(), rng);
    return {
      id: uid(q.id || 'st'),
      sourceId: q.id,
      type: 'mc_choice',
      category: q.category || 'starter',
      prompt: { text: prompt, kind: 'mc_choice' },
      options,
      acceptedAnswers: [q.answer],
      explanation,
      meta: {
        targetLang: pack.targetLang || 'en',
        referenceLang,
        packId: pack.id,
        category: q.category || 'starter',
        sourceId: q.id,
        word: q.answer,
      },
    };
  });

  let questions = shuffle(bank, rng);
  if (size !== 'all' && mode !== 'weak') {
    const n = Number(size);
    if (Number.isFinite(n) && n > 0) questions = questions.slice(0, Math.min(n, questions.length));
  }

  return {
    ok: true,
    bankSize: bank.length,
    availableSizes: [5, 10, 20, bank.length].filter((n, i, a) => n <= bank.length && a.indexOf(n) === i),
    test: {
      id: uid('starter-draft'),
      type: 'starter',
      targetLang: pack.targetLang || 'en',
      referenceLang,
      level: pack.level || 'A0',
      lessonId: pack.id,
      packId: pack.id,
      mode: mode === 'weak' ? 'weak' : 'full',
      questionBankVersion: QUESTION_BANK_VERSION,
      diagnosticNote: null,
      multipleChoiceOnly: true,
      questions,
      createdAt: new Date().toISOString(),
    },
  };
}

export function summarizeStarterAttempt(attempt, pack, interfaceLang = 'pl') {
  const byCat = {};
  for (const a of attempt.answers || []) {
    const q = (attempt.questions || []).find((x) => x.id === a.questionId);
    const cat = q?.meta?.category || q?.category || a.type || 'other';
    if (!byCat[cat]) byCat[cat] = { correct: 0, total: 0 };
    byCat[cat].total += 1;
    if (a.correct) byCat[cat].correct += 1;
  }

  const labels = {
    pl: {
      vocab: 'Słówka',
      country: 'Kraje',
      question: 'Pytania',
      sentence: 'Zdania',
      yesno: 'Tak / Nie',
      be: 'Er/Sie ist · He/She is',
      have: 'Er/Sie hat · has',
      possessive: 'Sein/ihr · His/her',
      negative: "ist/hat nicht · isn't",
      other: 'Inne',
      great: 'Świetnie! Opanowałeś ten zestaw.',
      good: 'Dobrze! Przejrzyj błędy i spróbuj jeszcze raz.',
      ok: 'Nieźle — warto powtórzyć słówka i odpowiedzi Yes/No.',
      low: 'Na początek OK. Powtórz pakiet jeszcze raz — same wybory odpowiedzi.',
    },
    en: {
      vocab: 'Vocabulary',
      country: 'Countries',
      question: 'Questions',
      sentence: 'Sentences',
      yesno: 'Yes / No',
      be: 'Er/Sie ist · He/She is',
      have: 'Er/Sie hat · has',
      possessive: 'Sein/ihr · His/her',
      negative: "ist/hat nicht · isn't",
      other: 'Other',
      great: 'Great job! You know this set well.',
      good: 'Good! Review mistakes and try again.',
      ok: 'Not bad — review words and Yes/No answers.',
      low: 'A solid start. Repeat the pack — multiple choice only.',
    },
  };
  const L = labels[interfaceLang] || labels.en;
  const score = attempt.scorePercent || 0;
  const message = score >= 90 ? L.great : score >= 70 ? L.good : score >= 50 ? L.ok : L.low;

  const categories = Object.entries(byCat).map(([key, v]) => ({
    key,
    label: L[key] || key,
    correct: v.correct,
    total: v.total,
    percent: v.total ? Math.round((100 * v.correct) / v.total) : 0,
  }));

  return {
    title: pack ? packTitle(pack, interfaceLang, attempt.referenceLang) : 'Starter',
    message,
    categories,
    score,
    correct: attempt.correctCount,
    total: attempt.questionCount,
    mistakes: attempt.mistakes?.length || 0,
  };
}

/**
 * Aggregate progress across all starter runs for a pack.
 */
export function computeStarterProgress(attempts, pack, interfaceLang = 'pl', referenceLang = 'pl') {
  const packId = pack?.id || 'en-starter';
  const runs = filterStarterAttempts(attempts, packId);
  const maxPoints = pack?.questions?.length || 0;
  const stats = Object.create(null);

  for (const q of pack?.questions || []) {
    stats[q.id] = {
      sourceId: q.id,
      wrong: 0,
      right: 0,
      lastCorrect: null,
      label: labelForSource(pack, q.id, interfaceLang, referenceLang),
      answer: q.answer,
      category: q.category || 'other',
    };
  }

  for (const attempt of runs) {
    for (const detail of attempt.answers || []) {
      const q = (attempt.questions || []).find((x) => x.id === detail.questionId);
      const sourceId = q?.sourceId || q?.meta?.sourceId || detail.sourceId;
      if (!sourceId || !stats[sourceId]) continue;
      if (detail.correct) {
        stats[sourceId].right += 1;
        stats[sourceId].lastCorrect = true;
      } else {
        stats[sourceId].wrong += 1;
        stats[sourceId].lastCorrect = false;
      }
    }
  }

  const items = Object.values(stats);
  // Points = questions whose last answer was correct (mastered currently)
  const points = items.filter((s) => s.lastCorrect === true).length;
  const seen = items.filter((s) => s.right + s.wrong > 0).length;

  const problematic = items
    .filter((s) => s.wrong > 0)
    .map((s) => ({
      ...s,
      missRate: s.wrong / Math.max(1, s.wrong + s.right),
      weakness: s.wrong - s.right,
    }))
    .sort((a, b) => b.wrong - a.wrong || b.missRate - a.missRate)
    .slice(0, 8);

  const weakSourceIds = items
    .filter((s) => s.wrong > 0 && (s.lastCorrect === false || s.wrong >= s.right))
    .map((s) => s.sourceId);

  const chart = runs.map((a, i) => ({
    at: a.createdAt,
    score: a.scorePercent,
    correct: a.correctCount,
    total: a.questionCount,
    run: i + 1,
    id: a.id,
    mode: a.mode || 'full',
  }));

  const bestScore = chart.length ? Math.max(...chart.map((c) => c.score)) : null;
  const latest = runs.length ? runs[runs.length - 1] : null;

  return {
    packId,
    maxPoints,
    points,
    seen,
    runs: runs.slice().reverse(), // newest first for list UI
    chart,
    problematic,
    weakSourceIds,
    bestScore,
    latest,
    runCount: runs.length,
  };
}
