'use strict';

import {
  TARGET_LANGS, INTERFACE_LANGS, REFERENCE_LANGS, LEVELS, LANG_META,
  assertLangPair, displayName, emptyLanguageProgress,
} from './registry.js';
import { loadState, saveState, exportBackup, importBackup, validateBackup } from './storage.js';
import { createSpeechController } from './speech.js';
import {
  loadAllContent, resolveTranslations, storyTitle, filterStories, coverageFor,
} from './content.js';
import {
  weekWords, allWords, dueWords, knownCount, reviewCard, wordKey,
  addStoryVocabAsCards, weekendMode, defaultCardStat,
} from './flashcards.js';
import {
  TEST_TYPES, QUESTION_SIZES, generateTest, scoreTest, filterAttempts,
  scoreSeries, mistakesToFlashcards, revisionAreas, estimateDiagnosticLevel,
  answersMatch,
} from './assessments.js';
import {
  generateStarterTest, packTitle, packDescription, summarizeStarterAttempt,
  computeStarterProgress,
} from './starter-pack.js';
import { t, weekDayNames, planFor } from './i18n.js';
import {
  filterFairytales, vocabularyByPos, generateFairyWordQuiz, fullTranslationText,
} from './fairytales.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

let state = loadState();
let content = { stories: {}, vocabulary: {}, fairytales: {}, validation: {}, packs: {} };
let tab = 'dashboard';
let openId = null;
let openFairyId = null;
let fairySearch = '';
let fairyKindFilter = 'all';
let fairyPosTab = 'noun';
let fairyShowFullTr = false;
let fairySentenceTr = null;
let fairyQuiz = null;
let levelFilter = 'A0';
let kindFilter = 'all';
let search = '';
let cardFilter = 'week';
let cardIndex = 0;
let showCardBack = false;
let activeTest = null;
let testAnswers = {};
let testStartedAt = 0;
let historyFilter = { lang: 'all', level: 'all', type: 'all' };
let openAttemptId = null;
let installEvent = null;
let toastTimer = null;
let importMode = 'merge';

const speech = createSpeechController({
  getRate: () => state.settings.rate,
  getVoiceName: (lang) => state.settings.voice?.[lang] || '',
  onStatus: (msg) => {
    if (msg === 'unsupported') toast(t(state.interfaceLang, 'speechUnsupported'));
    else if (msg.startsWith('missing-voice:')) {
      toast(t(state.interfaceLang, 'voiceMissing', { locale: msg.split(':')[1] }));
    } else if (msg.startsWith('error:')) {
      toast(t(state.interfaceLang, 'voiceMissing', { locale: msg.split(':')[1] }));
    } else if (msg === 'stopped') toast(t(state.interfaceLang, 'stop'));
  },
});

function tr(key, vars) { return t(state.interfaceLang, key, vars); }
function bucket(lang = state.targetLang) {
  if (!state.byLanguage[lang]) state.byLanguage[lang] = emptyLanguageProgress();
  return state.byLanguage[lang];
}
function stories() { return content.stories[state.targetLang] || []; }
function fairytales() { return content.fairytales[state.targetLang] || []; }
function persist() {
  const res = saveState(state);
  if (!res.ok) toast('Storage full — export a backup.');
}
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3400);
}
function autoWeek() {
  const origin = new Date(2026, 9, 19, 12);
  const now = new Date();
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12) - origin) / 86400000);
  const max = (content.vocabulary[state.targetLang] || []).length || 52;
  return Math.max(1, Math.min(max, Math.floor(days / 7) + 1));
}
function currentWeek() {
  if (state.settings.weekManual && state.settings.selectedWeek) return state.settings.selectedWeek;
  return autoWeek();
}
function mondayIndex() { return (new Date().getDay() + 6) % 7; }
function touchStudy() {
  const b = bucket();
  const today = new Date().toISOString().slice(0, 10);
  if (b.lastStudyDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    b.streak = b.lastStudyDate === yesterday ? (b.streak || 0) + 1 : 1;
    b.lastStudyDate = today;
  }
}

function langSelect(name, value, langs, disabledValue = null) {
  return `<select class="field small" data-setting="${name}" aria-label="${esc(name)}">${
    langs.map((l) => {
      const dis = disabledValue && l === disabledValue ? 'disabled' : '';
      return `<option value="${l}" ${value === l ? 'selected' : ''} ${dis}>${LANG_META[l].flag} ${esc(displayName(l, state.interfaceLang))}</option>`;
    }).join('')
  }</select>`;
}

function miniChart(series) {
  if (!series.length) return `<div class="empty">${esc(tr('noData'))}</div>`;
  const max = Math.max(100, ...series.map((s) => s.score));
  const bars = series.slice(-12).map((s) => {
    const h = Math.max(4, Math.round((s.score / max) * 64));
    return `<div class="chart-bar" title="${esc(s.at.slice(0, 10))}: ${s.score}%"><span style="height:${h}px"></span><small>${s.score}</small></div>`;
  }).join('');
  return `<div class="chart-row" role="img" aria-label="scores">${bars}</div>`;
}

function levelBars(lang) {
  const list = content.stories[lang] || [];
  const b = bucket(lang);
  return LEVELS.map((lv) => {
    const total = list.filter((s) => s.level === lv).length || 10;
    const done = list.filter((s) => s.level === lv && b.storiesDone[s.id]).length;
    const pct = Math.round((done / total) * 100);
    return `<div class="progress-row"><div class="row"><b>${lv}</b><small>${done}/${total}</small></div><div class="bar"><div style="width:${pct}%"></div></div></div>`;
  }).join('');
}

function statsFor(lang) {
  const list = content.stories[lang] || [];
  const b = bucket(lang);
  const done = list.filter((s) => b.storiesDone[s.id]).length;
  const attempts = filterAttempts(state.testAttempts, { lang });
  const latest = attempts[0];
  const avg = attempts.length
    ? Math.round(attempts.reduce((a, x) => a + x.scorePercent, 0) / attempts.length)
    : null;
  const due = dueWords(content.vocabulary, lang, b.customCards, b.cardStats, currentWeek()).length;
  return {
    done, total: list.length || 50, pct: Math.round((done / (list.length || 50)) * 100),
    known: knownCount(b.cardStats), due, tests: attempts.length,
    latest: latest?.scorePercent ?? null, avg, streak: b.streak || 0,
  };
}

function setHeader() {
  const ui = state.interfaceLang;
  document.documentElement.lang = ui;
  const brandSmall = $('.brand small');
  if (brandSmall) brandSmall.textContent = tr('brandSub');
  $('#lang-name').textContent = LANG_META[state.targetLang].native.toUpperCase();
  $('#welcome-title').innerHTML = tr('welcomeTitle');
  const lead = $('#welcome-lead');
  if (lead) lead.textContent = tr('welcomeLead');
  $('#language-meta').textContent = tr('metaLine');
  $$('.main-tab').forEach((btn) => {
    const key = btn.dataset.i18n;
    if (key) btn.innerHTML = `<span>${btn.dataset.icon || ''}</span> ${esc(tr(key))}`;
  });
}

function setActiveTabs() {
  $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

function render() {
  setHeader();
  const root = $('#app-content');
  if (!root) return;
  const map = {
    dashboard: renderDashboard,
    learn: renderLearn,
    reading: renderReading,
    fairytales: renderFairytales,
    vocab: renderVocab,
    tests: renderTests,
    history: renderHistory,
    progress: renderProgress,
    settings: renderSettings,
  };
  root.innerHTML = (map[tab] || renderDashboard)();
  setActiveTabs();
  updateVoiceUI();
}

function renderDashboard() {
  const cards = TARGET_LANGS.map((lang) => {
    const st = statsFor(lang);
    const active = lang === state.targetLang ? 'active' : '';
    return `<button type="button" class="lang-card ${active}" data-action="select-target" data-lang="${lang}">
      <div class="row"><span class="flag">${LANG_META[lang].flag}</span><span class="badge">${esc(displayName(lang, state.interfaceLang))}</span></div>
      <div class="statgrid tight"><div class="stat"><b>${st.done}/${st.total}</b><span>${esc(tr('stories'))}</span></div>
      <div class="stat"><b>${st.known}</b><span>${esc(tr('knownWords'))}</span></div>
      <div class="stat"><b>${st.tests}</b><span>${esc(tr('testsDone'))}</span></div></div>
      <div class="bar"><div style="width:${st.pct}%"></div></div>
      <small class="muted">${esc(tr('streak'))}: ${st.streak} · ${st.latest != null ? `${esc(tr('latestScore'))}: ${st.latest}%` : esc(tr('noData'))}</small>
    </button>`;
  }).join('');
  const st = statsFor(state.targetLang);
  return `<div class="layout"><section class="stack">
    <div class="card warm"><div class="micro">${esc(tr('navDashboard'))}</div>
      <h2 class="section-title" style="margin-top:10px">${esc(displayName(state.targetLang, state.interfaceLang))}</h2>
      <p class="muted">${esc(tr('progressDisclaimer'))}</p>
      <div class="statgrid" style="margin-top:12px">
        <div class="stat"><b>${st.pct}%</b><span>${esc(tr('stories'))}</span></div>
        <div class="stat"><b>${st.due}</b><span>${esc(tr('dueToday'))}</span></div>
        <div class="stat"><b>${st.avg ?? '—'}${st.avg != null ? '%' : ''}</b><span>${esc(tr('avgScore'))}</span></div>
      </div>
      <div class="actions">
        <button class="btn primary" data-action="go" data-tab="reading">${esc(tr('navReading'))} →</button>
        <button class="btn secondary" data-action="go" data-tab="tests">${esc(tr('navTests'))}</button>
        ${state.targetLang === 'en' && englishStarterPack() ? `<button class="btn secondary" data-action="start-starter" data-size="all">${esc(tr('starterShort'))}</button>` : ''}
      </div>
    </div>
    <div class="card"><h2 class="section-title">${esc(tr('byLevel'))}</h2>${levelBars(state.targetLang)}</div>
  </section>
  <aside class="stack"><div class="card"><h2 class="section-title">${esc(tr('iLearn'))}</h2>
    <div class="lang-card-grid">${cards}</div>
    <p class="hint" style="margin-top:12px">${esc(tr('localOnly'))}</p>
  </div></aside></div>`;
}

function renderLearn() {
  const d = mondayIndex();
  const week = currentWeek();
  const plan = planFor(state.interfaceLang);
  const days = weekDayNames(state.interfaceLang);
  const b = bucket();
  const last = stories().find((s) => s.id === b.lastStoryId) || stories()[0];
  const mode = weekendMode(d);
  return `<div class="layout"><section class="stack">
    <div class="card warm"><div class="card-header"><div>
      <div class="micro">${esc(tr('weekPlan'))} · ${esc(days[d])}</div>
      <h2 class="section-title" style="margin-top:10px">${esc(plan[d][0])}</h2>
    </div><span class="badge light">W${week}</span></div>
    <p class="muted">${esc(plan[d][1])}</p>
    <div class="actions">
      <button class="btn primary" data-action="${mode !== 'weekday' ? 'go' : 'open-recent'}" data-tab="vocab">${mode !== 'weekday' ? esc(tr('navVocab')) : esc(tr('continue'))}</button>
      <button class="btn secondary" data-action="toggle-day" data-day="${d}">${b.weekCompleted[`${week}|${d}`] ? '✓ ' + esc(tr('done')) : esc(tr('markDone'))}</button>
    </div></div>
    ${last ? `<div class="card"><div class="card-header"><h2 class="section-title">${esc(storyTitle(last, [state.targetLang, state.referenceLang, 'en']))}</h2><span class="badge">${esc(last.level)}</span></div>
      <p class="muted">${esc(last.sentences.slice(0, 2).join(' '))}</p>
      <div class="actions"><button class="btn primary" data-action="open-story" data-id="${last.id}">→</button></div></div>` : ''}
    <div class="card"><h2 class="section-title">${esc(tr('weekPlan'))}</h2>
      ${plan.map((x, i) => `<div class="task-row ${d === i ? 'today' : ''}"><div><strong>${esc(days[i])}</strong><small>${esc(x[0])}</small></div>
      <button class="btn square ${b.weekCompleted[`${week}|${i}`] ? 'active' : ''}" data-action="toggle-day" data-day="${i}">${b.weekCompleted[`${week}|${i}`] ? '✓' : '○'}</button></div>`).join('')}
    </div>
  </section>
  <aside class="stack"><div class="card"><div class="micro">W${week}</div>
    <table class="weektable"><tbody>${weekWords(content.vocabulary, state.targetLang, week).map((w) => `<tr><td>${esc(w.gloss?.[state.referenceLang] || w.gloss?.pl || w.gloss?.en || '')}</td><td><b>${esc(w.word)}</b></td></tr>`).join('')}</tbody></table>
    <div class="actions"><button class="btn primary" data-action="go" data-tab="vocab">${esc(tr('navVocab'))}</button></div>
  </div></aside></div>`;
}

function renderReading() {
  if (openId) return renderReader();
  const matches = filterStories(stories(), { level: levelFilter, kind: kindFilter, search });
  const b = bucket();
  return `<div class="card"><div class="card-header"><div>
    <div class="micro">${esc(tr('navReading'))} / ${state.targetLang.toUpperCase()}</div>
    <h2 class="section-title" style="margin-top:7px">${esc(displayName(state.targetLang, state.interfaceLang))}</h2>
    <p class="muted" style="font-size:13px;margin:0">${stories().length} · ${matches.length}</p>
  </div><span class="badge light">10 / level</span></div>
  <div class="toolrow">
    <select class="field small" id="level-filter">${['all', ...LEVELS].map((l) => `<option value="${l}" ${levelFilter === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <select class="field small" id="kind-filter">
      <option value="all" ${kindFilter === 'all' ? 'selected' : ''}>all</option>
      <option value="story" ${kindFilter === 'story' ? 'selected' : ''}>story</option>
      <option value="dialogue" ${kindFilter === 'dialogue' ? 'selected' : ''}>dialogue</option>
      <option value="read" ${kindFilter === 'read' ? 'selected' : ''}>read</option>
    </select>
    <input class="field" id="search-stories" type="search" value="${esc(search)}" placeholder="…">
  </div>
  <div class="story-grid">${matches.map((s) => `<button type="button" class="story-tile" data-action="open-story" data-id="${s.id}">
    <div class="row"><span class="badge">${esc(s.level)} · ${s.kind}</span>${b.storiesDone[s.id] ? `<span class="completion">✓</span>` : ''}</div>
    <div><h3>${esc(storyTitle(s, [state.targetLang, state.referenceLang, 'en']))}</h3>
    <p>${esc(storyTitle(s, [state.referenceLang, 'en', 'pl']))}</p></div>
    <div class="tile-end"><span class="muted" style="font-size:12px">${s.sentences.length} · ~${s.estimatedMinutes || 2}m</span><span>→</span></div>
  </button>`).join('')}</div></div>`;
}

function renderReader() {
  const s = stories().find((x) => x.id === openId) || stories()[0];
  if (!s) return `<div class="empty">—</div>`;
  const b = bucket();
  b.lastStoryId = s.id;
  b.storiesStarted[s.id] = true;
  touchStudy();
  persist();
  const resolved = resolveTranslations(s, state.referenceLang);
  const showTr = state.settings.showTranslations;
  const read = state.settings.readOnly;
  let notice = '';
  if (resolved.notice === 'fallback_en') notice = `<div class="notice">${esc(tr('fallbackEn'))}</div>`;
  else if (resolved.notice === 'fallback_pl') notice = `<div class="notice">${esc(tr('fallbackPl'))}</div>`;
  else if (resolved.missing) notice = `<div class="notice">${esc(tr('missingTr'))}</div>`;
  const cov = coverageFor(state.targetLang, state.referenceLang);

  return `<div class="layout"><section class="stack"><div class="card">
    <div class="story-header"><div>
      <button class="tiny-link" data-action="back-library">← ${esc(tr('back'))}</button>
      <div class="micro" style="margin-top:16px">${esc(s.level)} · ${esc(s.category || s.kind)} · ${s.sentences.length}</div>
      <h2>${esc(storyTitle(s, [state.targetLang]))}</h2>
      <p class="muted" style="margin:0;font-size:13px">${esc(storyTitle(s, [state.referenceLang, 'en', 'pl']))}</p>
    </div><span class="badge ${b.storiesDone[s.id] ? 'light' : ''}">${b.storiesDone[s.id] ? esc(tr('completed')) : esc(tr('unread'))}</span></div>
    <div class="thin-line"></div>
    ${notice}
    <p class="muted" style="font-size:12px">ref coverage: ${esc(cov)}</p>
    <div class="reading-options">
      <label><input class="check" id="show-translations" type="checkbox" ${showTr ? 'checked' : ''}> ${esc(tr('showTranslations'))}</label>
      <label><input class="check" id="read-only" type="checkbox" ${read ? 'checked' : ''}> ${esc(tr('readOnly'))}</label>
    </div>
    ${read ? '' : `<div class="actions">
      <button class="btn primary" data-action="speak-story">${esc(tr('listenStory'))}</button>
      <button class="btn secondary" data-action="stop-audio">${esc(tr('stop'))}</button>
      <select class="field small" id="speed">
        <option value="0.7" ${state.settings.rate === 0.7 ? 'selected' : ''}>0.7×</option>
        <option value="0.85" ${state.settings.rate === 0.85 ? 'selected' : ''}>0.85×</option>
        <option value="1" ${state.settings.rate === 1 ? 'selected' : ''}>1×</option>
      </select>
      <select class="field small" id="voice-select"><option value="">auto</option></select>
    </div><div class="voice-indicator" id="voice-status"></div>`}
    <div class="story-reader">${s.sentences.map((line, i) => `<div class="sentence-row" data-sentence="${i}">
      <div class="number">${i + 1}</div>
      <div class="sentence-text"><strong>${esc(line)}</strong>
        ${showTr && resolved.lines ? `<span class="translation">${esc(resolved.lines[i])}${resolved.fallback ? ` <em class="fallback-tag">[${esc(resolved.locale)}]</em>` : ''}</span>` : ''}
      </div>
      ${read ? '' : `<button class="btn secondary" type="button" data-action="speak-line" data-line="${i}" aria-label="play ${i + 1}">▶</button>`}
    </div>`).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-action="mark-story">${b.storiesDone[s.id] ? '✓' : esc(tr('markRead'))}</button>
      <button class="btn secondary" data-action="save-vocab">${esc(tr('saveVocab'))}</button>
      <button class="btn secondary" data-action="next-story">${esc(tr('next'))} →</button>
      <button class="btn secondary" data-action="lesson-test" data-id="${s.id}">${esc(tr('lessonTest'))}</button>
    </div>
  </div></section>
  <aside class="stack">
    <div class="card"><div class="micro">Q&A</div>
      ${(s.questions || []).map((q, i) => {
    const prompt = q.prompt?.[state.referenceLang] || q.prompt?.en || q.prompt?.pl || '';
    const ans = q.acceptedAnswers?.[state.referenceLang]?.[0] || q.acceptedAnswers?.en?.[0] || s.sentences[0];
    return `<div class="qa"><details><summary>${i + 1}. ${esc(prompt)}</summary><p class="qa-answer">${esc(ans)}</p></details></div>`;
  }).join('')}
    </div>
    <div class="card"><div class="micro">${esc(tr('notes'))}</div>
      <textarea class="field editor" id="writing" placeholder="…">${esc(b.writing[s.id] || '')}</textarea>
    </div>
  </aside></div>`;
}

function renderFairytales() {
  if (fairyQuiz?.active && openFairyId) return renderFairyQuiz();
  if (openFairyId) return renderFairyReader();
  const list = fairytales();
  const matches = filterFairytales(list, { level: 'A0', kind: fairyKindFilter, search: fairySearch });
  const b = bucket();
  if (!list.length) {
    return `<div class="card"><div class="micro">${esc(tr('navFairytales'))}</div>
      <h2 class="section-title" style="margin-top:8px">${esc(tr('navFairytales'))}</h2>
      <p class="muted">${esc(tr('fairytalesEmpty'))}</p></div>`;
  }
  return `<div class="card"><div class="card-header"><div>
    <div class="micro">${esc(tr('navFairytales'))} / ${state.targetLang.toUpperCase()} · A0</div>
    <h2 class="section-title" style="margin-top:7px">${esc(displayName(state.targetLang, state.interfaceLang))}</h2>
    <p class="muted fairy-lead">${esc(tr('fairytalesLead'))}</p>
    <p class="muted" style="font-size:13px;margin:0">${list.length} · ${matches.length}</p>
  </div><span class="badge light">A0</span></div>
  <div class="toolrow">
    <select class="field small" id="fairy-kind-filter">
      <option value="all" ${fairyKindFilter === 'all' ? 'selected' : ''}>all</option>
      <option value="story" ${fairyKindFilter === 'story' ? 'selected' : ''}>story</option>
      <option value="dialogue" ${fairyKindFilter === 'dialogue' ? 'selected' : ''}>dialogue</option>
    </select>
    <input class="field" id="search-fairy" type="search" value="${esc(fairySearch)}" placeholder="…">
  </div>
  <div class="story-grid">${matches.map((s) => `<button type="button" class="story-tile fairy-tile" data-action="open-fairy" data-id="${s.id}">
    <div class="row"><span class="badge">${esc(s.level)} · ${s.kind}</span>${b.fairytalesDone[s.id] ? `<span class="completion">✓</span>` : ''}</div>
    <div><h3>${esc(storyTitle(s, [state.targetLang, state.referenceLang, 'en']))}</h3>
    <p>${esc(storyTitle(s, [state.referenceLang, 'en', 'pl']))}</p></div>
    <div class="tile-end"><span class="muted" style="font-size:12px">${s.sentences.length} · ~${s.estimatedMinutes || 5}m</span><span>→</span></div>
  </button>`).join('')}</div></div>`;
}

function renderFairyWordList(tale) {
  const groups = vocabularyByPos(tale);
  const ref = state.referenceLang;
  const items = groups[fairyPosTab] || [];
  const tabs = [
    ['noun', tr('posNoun'), groups.noun.length],
    ['verb', tr('posVerb'), groups.verb.length],
    ['adjective', tr('posAdjective'), groups.adjective.length],
  ];
  return `<div class="card fairy-words-card"><div class="micro">${esc(tr('wordPreview'))}</div>
    <div class="fairy-pos-tabs" role="tablist">${tabs.map(([key, label, n]) => `<button type="button" class="fairy-pos-tab ${fairyPosTab === key ? 'active' : ''}" data-action="fairy-pos" data-pos="${key}" role="tab">${esc(label)} <small>${n}</small></button>`).join('')}</div>
    <div class="fairy-word-list">${items.length ? items.map((v) => {
    const gloss = v.gloss?.[ref] || v.gloss?.pl || v.gloss?.en || '';
    const reading = v.reading?.[ref] || v.reading?.pl || v.reading?.en || '';
    return `<div class="fairy-word-chip">
      <div class="fairy-word-main"><strong>${esc(v.word)}</strong><span class="muted">${esc(gloss)}</span></div>
      <div class="fairy-word-meta"><span class="badge light">${esc(tr('howToRead'))}: ${esc(reading)}</span>
      <button type="button" class="btn secondary fairy-speak-btn" data-action="speak-fairy-word" data-text="${esc(v.word)}">▶</button></div>
    </div>`;
  }).join('') : `<div class="empty" style="padding:20px">${esc(tr('noData'))}</div>`}
    </div>
    <div class="actions"><button class="btn primary" data-action="start-fairy-quiz">${esc(tr('fairyQuizStart'))}</button></div>
  </div>`;
}

function renderFairyReader() {
  const tale = fairytales().find((x) => x.id === openFairyId) || fairytales()[0];
  if (!tale) return `<div class="empty">—</div>`;
  const b = bucket();
  b.lastFairyId = tale.id;
  b.fairytalesStarted[tale.id] = true;
  touchStudy();
  persist();
  const resolved = resolveTranslations(tale, state.referenceLang);
  const showTr = state.settings.showTranslations || fairyShowFullTr;
  const read = state.settings.readOnly;
  let notice = '';
  if (resolved.notice === 'fallback_en') notice = `<div class="notice">${esc(tr('fallbackEn'))}</div>`;
  else if (resolved.notice === 'fallback_pl') notice = `<div class="notice">${esc(tr('fallbackPl'))}</div>`;
  else if (resolved.missing) notice = `<div class="notice">${esc(tr('missingTr'))}</div>`;
  const fullTr = fullTranslationText(tale, state.referenceLang);

  return `<div class="layout fairy-layout"><section class="stack"><div class="card fairy-read-card">
    <div class="story-header"><div>
      <button class="tiny-link" data-action="back-fairy-library">← ${esc(tr('back'))}</button>
      <div class="micro" style="margin-top:16px">${esc(tale.level)} · ${esc(tale.category || tale.kind)} · ${tale.sentences.length}</div>
      <h2>${esc(storyTitle(tale, [state.targetLang]))}</h2>
      <p class="muted" style="margin:0;font-size:13px">${esc(storyTitle(tale, [state.referenceLang, 'en', 'pl']))}</p>
    </div><span class="badge ${b.fairytalesDone[tale.id] ? 'light' : ''}">${b.fairytalesDone[tale.id] ? esc(tr('completed')) : esc(tr('unread'))}</span></div>
    <div class="thin-line"></div>
    ${notice}
    <div class="reading-options fairy-read-options">
      <label><input class="check" id="fairy-show-translations" type="checkbox" ${state.settings.showTranslations ? 'checked' : ''}> ${esc(tr('showTranslations'))}</label>
      <button type="button" class="btn secondary" data-action="toggle-fairy-full-tr">${fairyShowFullTr ? esc(tr('hideTranslation')) : esc(tr('translateAll'))}</button>
      <label><input class="check" id="fairy-read-only" type="checkbox" ${read ? 'checked' : ''}> ${esc(tr('readOnly'))}</label>
    </div>
    ${fairyShowFullTr && fullTr.text ? `<div class="fairy-full-translation read-mode"><div class="micro">${esc(tr('translateAll'))}${fullTr.fallback ? ` · [${esc(fullTr.locale)}]` : ''}</div><p class="writing-prompt">${esc(fullTr.text)}</p></div>` : ''}
    ${read ? '' : `<div class="actions">
      <button class="btn primary" data-action="speak-fairy-story">${esc(tr('listenStory'))}</button>
      <button class="btn secondary" data-action="stop-audio">${esc(tr('stop'))}</button>
    </div><div class="voice-indicator" id="voice-status"></div>`}
    <div class="story-reader fairy-reader">${tale.sentences.map((line, i) => {
    const trLine = resolved.lines?.[i];
    const showLineTr = showTr || fairySentenceTr === i;
    return `<div class="sentence-row fairy-sentence ${fairySentenceTr === i ? 'tr-open' : ''}" data-sentence="${i}">
      <div class="number">${i + 1}</div>
      <div class="sentence-text"><strong>${esc(line)}</strong>
        ${showLineTr && trLine ? `<span class="translation">${esc(trLine)}${resolved.fallback ? ` <em class="fallback-tag">[${esc(resolved.locale)}]</em>` : ''}</span>` : ''}
      </div>
      <div class="sentence-actions">
        <button class="btn secondary fairy-tr-btn" type="button" data-action="toggle-fairy-sentence-tr" data-line="${i}" title="${esc(tr('translateSentence'))}">⇄</button>
        ${read ? '' : `<button class="btn secondary" type="button" data-action="speak-fairy-line" data-line="${i}" aria-label="play ${i + 1}">▶</button>`}
      </div>
    </div>`;
  }).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-action="mark-fairy">${b.fairytalesDone[tale.id] ? '✓' : esc(tr('markRead'))}</button>
      <button class="btn secondary" data-action="save-fairy-vocab">${esc(tr('saveVocab'))}</button>
      <button class="btn secondary" data-action="next-fairy">${esc(tr('next'))} →</button>
    </div>
  </div></section>
  <aside class="stack">${renderFairyWordList(tale)}</aside></div>`;
}

function renderFairyQuiz() {
  const tale = fairytales().find((x) => x.id === openFairyId);
  if (!tale || !fairyQuiz?.questions?.length) return `<div class="empty">—</div>`;
  if (fairyQuiz.completed) {
    const pct = Math.round((fairyQuiz.correct / fairyQuiz.questions.length) * 100);
    return `<div class="card fairy-quiz-card"><button class="tiny-link" data-action="close-fairy-quiz">← ${esc(tr('back'))}</button>
      <div class="micro" style="margin-top:12px">${esc(tr('fairyWordQuiz'))}</div>
      <h2 class="section-title">${esc(tr('fairyQuizScore'))}: ${pct}%</h2>
      <p class="muted">${fairyQuiz.correct}/${fairyQuiz.questions.length}</p>
      <div class="actions">
        <button class="btn primary" data-action="start-fairy-quiz">${esc(tr('fairyQuizAgain'))}</button>
        <button class="btn secondary" data-action="close-fairy-quiz">${esc(tr('back'))}</button>
      </div></div>`;
  }
  const q = fairyQuiz.questions[fairyQuiz.index];
  const ix = fairyQuiz.index;
  return `<div class="card fairy-quiz-card"><button class="tiny-link" data-action="close-fairy-quiz">← ${esc(tr('back'))}</button>
    <div class="micro" style="margin-top:12px">${esc(tr('fairyWordQuiz'))} · ${ix + 1}/${fairyQuiz.questions.length}</div>
    <p class="muted">${esc(tr('fairyQuizPrompt'))}</p>
    <div class="fairy-quiz-prompt"><span class="badge">${esc(q.pos)}</span><strong>${esc(q.prompt)}</strong>
    ${q.reading ? `<small class="muted">${esc(tr('howToRead'))}: ${esc(q.reading)}</small>` : ''}</div>
    <div class="test-options">${q.options.map((opt) => `<button type="button" class="test-option fairy-quiz-opt" data-action="answer-fairy-quiz" data-answer="${esc(opt)}"><span>${esc(opt)}</span></button>`).join('')}</div>
  </div>`;
}

function renderVocab() {
  const b = bucket();
  const week = currentWeek();
  const words = cardFilter === 'all'
    ? allWords(content.vocabulary, state.targetLang, b.customCards)
    : cardFilter === 'due'
      ? dueWords(content.vocabulary, state.targetLang, b.customCards, b.cardStats, week)
      : weekWords(content.vocabulary, state.targetLang, week);
  cardIndex = words.length ? Math.min(cardIndex, words.length - 1) : 0;
  const w = words[cardIndex];
  const gloss = w ? (w.gloss?.[state.referenceLang] || w.gloss?.pl || w.gloss?.en || '') : '';
  return `<div class="layout"><section class="stack"><div class="card">
    <div class="micro">${esc(tr('navVocab'))} · ${state.targetLang.toUpperCase()}</div>
    <div class="toolrow" style="margin-top:12px">
      <select class="field small" id="week-select">${(content.vocabulary[state.targetLang] || []).map((entry, i) => `<option value="${i + 1}" ${week === i + 1 ? 'selected' : ''}>${i + 1}. ${esc(entry.title?.[state.interfaceLang] || entry.title?.en || entry.title?.pl || '')}</option>`).join('')}</select>
      <select class="field small" id="card-filter">
        <option value="week" ${cardFilter === 'week' ? 'selected' : ''}>week</option>
        <option value="due" ${cardFilter === 'due' ? 'selected' : ''}>due (${dueWords(content.vocabulary, state.targetLang, b.customCards, b.cardStats, week).length})</option>
        <option value="all" ${cardFilter === 'all' ? 'selected' : ''}>all</option>
      </select>
    </div>
    ${w ? `<div class="deck-card" data-action="flip-card"><span>${showCardBack ? state.targetLang.toUpperCase() : state.referenceLang.toUpperCase()}</span>
      <strong>${esc(showCardBack ? w.word : gloss)}</strong></div>
      <div class="toolrow" style="margin-top:18px"><input class="field" id="card-answer" autocomplete="off"><button class="btn primary" data-action="check-card">✓</button></div>
      <div id="card-status" class="answer-status"></div>
      <div class="actions">
        <button class="btn secondary" data-action="prev-card">←</button>
        <button class="btn secondary" data-action="speak-card">▶</button>
        <button class="btn secondary" data-action="next-card">→</button>
      </div>
      <div class="actions">
        <button class="btn secondary" data-action="score-card" data-q="0">again</button>
        <button class="btn secondary" data-action="score-card" data-q="1">hard</button>
        <button class="btn primary" data-action="score-card" data-q="2">good</button>
        <button class="btn primary" data-action="score-card" data-q="3">easy</button>
      </div>` : `<div class="empty">${esc(tr('noData'))}</div>`}
  </div></section>
  <aside class="stack"><div class="card"><h2 class="section-title">+ </h2>
    <form id="add-card" class="stack" style="gap:10px">
      <input name="gloss" class="field" placeholder="${esc(tr('iSpeak'))}" required>
      <input name="target" class="field" placeholder="${esc(tr('iLearn'))}" required>
      <button class="btn primary" type="submit">+</button>
    </form>
  </div></aside></div>`;
}

function englishStarterPack() {
  return content.packs?.['en-starter'] || null;
}

function renderStarterScoreChart(chart) {
  if (!chart.length) return `<div class="empty">${esc(tr('starterNoRuns'))}</div>`;
  const max = 100;
  const bars = chart.map((s) => {
    const h = Math.max(4, Math.round((s.score / max) * 72));
    return `<button type="button" class="chart-bar chart-bar-btn" data-action="open-attempt" data-id="${esc(s.id)}" title="${esc(tr('runLabel'))} ${s.run}: ${s.score}%">
      <span style="height:${h}px"></span>
      <small>${s.score}%</small>
    </button>`;
  }).join('');
  return `<div class="chart-row starter-chart" role="img" aria-label="${esc(tr('starterChart'))}">${bars}</div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">${esc(tr('tapBarHint'))}</p>`;
}

function renderStarterPackCard() {
  if (state.targetLang !== 'en') return '';
  const pack = englishStarterPack();
  if (!pack) return '';
  const title = packTitle(pack, state.interfaceLang, state.referenceLang);
  const desc = packDescription(pack, state.interfaceLang, state.referenceLang);
  const n = pack.questions?.length || 0;
  const progress = computeStarterProgress(
    state.testAttempts,
    pack,
    state.interfaceLang,
    state.referenceLang,
  );
  const pct = progress.maxPoints
    ? Math.round((100 * progress.points) / progress.maxPoints)
    : 0;
  const weakCount = progress.weakSourceIds.length;

  return `<div class="stack" style="margin-bottom:18px;gap:18px">
    <div class="card warm">
      <div class="micro">${esc(tr('starterBadge'))}</div>
      <h2 class="section-title" style="margin-top:10px">${esc(title)}</h2>
      <p class="muted">${esc(desc)}</p>
      <p class="muted" style="font-size:13px">${n} ${esc(tr('questions'))} · ${esc(tr('mcOnly'))}</p>
      <div class="actions">
        <button class="btn primary" data-action="start-starter" data-size="all">${esc(tr('startStarterAll'))}</button>
        <button class="btn secondary" data-action="start-starter" data-size="10">${esc(tr('startStarter10'))}</button>
        <button class="btn secondary" data-action="start-starter-weak" ${weakCount ? '' : 'disabled'}>${esc(tr('retryWeak'))}${weakCount ? ` (${weakCount})` : ''}</button>
      </div>
    </div>

    <div class="card">
      <div class="micro">${esc(tr('starterProgress'))}</div>
      <h2 class="section-title" style="margin-top:8px">${esc(tr('pointsVsMax'))}</h2>
      <div class="statgrid" style="margin-top:12px">
        <div class="stat"><b>${progress.points}/${progress.maxPoints}</b><span>${esc(tr('pointsLabel'))}</span></div>
        <div class="stat"><b>${pct}%</b><span>${esc(tr('masteryLabel'))}</span></div>
        <div class="stat"><b>${progress.runCount}</b><span>${esc(tr('runsLabel'))}</span></div>
      </div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <p class="muted" style="font-size:12px">${esc(tr('pointsExplain'))}${progress.bestScore != null ? ` · ${esc(tr('bestScore'))}: ${progress.bestScore}%` : ''}</p>
      <h3 class="subheading" style="margin-top:18px">${esc(tr('starterChart'))}</h3>
      ${renderStarterScoreChart(progress.chart)}
    </div>

    <div class="card">
      <h2 class="section-title">${esc(tr('problematicWords'))}</h2>
      ${progress.problematic.length
    ? `<ul class="weak-list">${progress.problematic.map((w) => `<li>
          <div><strong>${esc(w.answer)}</strong><br><span class="muted" style="font-size:12px">${esc(w.label)}</span></div>
          <span class="badge">${w.wrong}× ✗ · ${w.right}× ✓</span>
        </li>`).join('')}</ul>
        <div class="actions"><button class="btn primary" data-action="start-starter-weak" ${weakCount ? '' : 'disabled'}>${esc(tr('retryWeak'))}</button></div>`
    : `<div class="empty">${esc(tr('noWeakYet'))}</div>`}
    </div>

    <div class="card">
      <h2 class="section-title">${esc(tr('starterHistory'))}</h2>
      <p class="muted" style="font-size:13px">${esc(tr('starterHistoryHint'))}</p>
      ${progress.runs.length
    ? progress.runs.map((a) => `<button type="button" class="story-tile" data-action="open-attempt" data-id="${a.id}">
          <div class="row"><span class="badge">${esc(a.mode === 'weak' ? tr('weakRun') : tr('fullRun'))}</span><span>${a.scorePercent}%</span></div>
          <div><h3>${esc(a.createdAt.slice(0, 16).replace('T', ' '))}</h3>
          <p>${a.correctCount}/${a.questionCount} ${esc(tr('pointsLabel').toLowerCase())}</p></div>
        </button>`).join('')
    : `<div class="empty">${esc(tr('starterNoRuns'))}</div>`}
    </div>
  </div>`;
}

function renderTests() {
  if (activeTest && !activeTest.completed) return renderTestRunner();
  if (activeTest?.completed) return renderTestResult(activeTest.attempt);

  const b = bucket();
  const lastStory = b.lastStoryId || stories()[0]?.id || '';
  return `${renderStarterPackCard()}<div class="card"><div class="micro">${esc(tr('navTests'))}</div>
    <h2 class="section-title" style="margin-top:8px">${esc(displayName(state.targetLang, state.interfaceLang))}</h2>
    <p class="muted">${esc(tr('diagnosticNote'))}</p>
    <form id="test-config" class="stack" style="gap:12px;margin-top:16px">
      <label>${esc(tr('navTests'))}
        <select class="field" name="type">
          <option value="lesson">${esc(tr('lessonTest'))}</option>
          <option value="level">${esc(tr('levelTest'))}</option>
          <option value="practice">${esc(tr('practiceTest'))}</option>
          <option value="diagnostic">${esc(tr('diagnosticTest'))}</option>
        </select>
      </label>
      <label>Level
        <select class="field" name="level">${LEVELS.map((l) => `<option value="${l}">${l}</option>`).join('')}</select>
      </label>
      <label>Lesson
        <select class="field" name="lesson">${stories().map((s) => `<option value="${s.id}" ${s.id === lastStory ? 'selected' : ''}>${esc(s.level)} · ${esc(storyTitle(s, [state.targetLang]))}</option>`).join('')}</select>
      </label>
      <label>${esc(tr('questions'))}
        <select class="field" name="size">${QUESTION_SIZES.map((n) => `<option value="${n}" ${n === 10 ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label class="reading-options"><input type="checkbox" name="listening" ${state.settings.includeListeningInTests ? 'checked' : ''}> ${esc(tr('includeListening'))}</label>
      <button class="btn primary" type="submit">${esc(tr('startTest'))}</button>
    </form>
  </div>`;
}

function hasMcOptions(q) {
  return Array.isArray(q.options) && q.options.length > 0;
}

function renderTestRunner() {
  const test = activeTest.test;
  const mcOnly = !!test.multipleChoiceOnly || test.type === 'starter';
  return `<div class="card"><div class="micro">${esc(test.type)} · ${esc(test.targetLang)}${mcOnly ? ` · ${esc(tr('mcOnly'))}` : ''}</div>
    <h2 class="section-title">${esc(tr('questions'))}: ${test.questions.length}</h2>
    ${test.diagnosticNote ? `<div class="notice">${esc(tr('diagnosticNote'))}</div>` : ''}
    <form id="test-form" class="stack" style="gap:16px;margin-top:12px">
      ${test.questions.map((q, i) => {
    let body = '';
    if (hasMcOptions(q) || q.type === 'mc_vocab' || q.type === 'mc_choice' || q.type === 'listening') {
      body = `<div class="test-options">${(q.options || []).map((opt) => `<label class="test-option"><input type="radio" name="${q.id}" value="${esc(opt)}" required><span>${esc(opt)}</span></label>`).join('')}</div>`;
      if (q.type === 'listening' && q.meta?.listenText) {
        body = `<button type="button" class="btn secondary" data-action="speak-test" data-text="${esc(q.meta.listenText)}" data-lang="${esc(q.meta.targetLang)}">▶</button>${body}`;
      }
    } else if (mcOnly) {
      body = `<div class="notice">${esc(tr('mcOnly'))}</div>`;
    } else if (q.type === 'reorder') {
      body = `<p class="muted">${esc((q.prompt.tokens || []).join(' / '))}</p><input class="field" name="${q.id}" placeholder="…">`;
    } else {
      body = `<input class="field" name="${q.id}" placeholder="…">`;
    }
    const promptText = q.prompt?.text || '';
    const cat = q.meta?.category || q.type;
    return `<div class="card" style="padding:16px"><div class="micro">${i + 1}. ${esc(cat)}</div><p class="test-prompt"><strong>${esc(promptText).replace(/\n/g, '<br>')}</strong></p>${body}</div>`;
  }).join('')}
      <button class="btn primary" type="submit">${esc(tr('showSummary'))}</button>
    </form>
  </div>`;
}

function renderTestResult(attempt) {
  const areas = revisionAreas(attempt);
  const est = attempt.type === 'diagnostic' ? estimateDiagnosticLevel(attempt) : null;
  const pack = attempt.packId || attempt.lessonId === 'en-starter' ? englishStarterPack() : null;
  const summary = attempt.type === 'starter' && pack
    ? summarizeStarterAttempt(attempt, pack, state.interfaceLang)
    : null;
  return `<div class="card">
    <div class="micro">${esc(tr('testSummary'))}</div>
    <h2 class="section-title">${attempt.scorePercent}%</h2>
    ${summary ? `<p class="notice">${esc(summary.message)}</p>
      <div class="statgrid">
        <div class="stat"><b>${summary.correct}/${summary.total}</b><span>OK</span></div>
        <div class="stat"><b>${Math.round(attempt.durationMs / 1000)}s</b><span>${esc(tr('timeTaken'))}</span></div>
        <div class="stat"><b>${summary.mistakes}</b><span>✗</span></div>
      </div>
      <h3 class="subheading">${esc(tr('byCategory'))}</h3>
      ${summary.categories.map((c) => `<div class="progress-row"><div class="row"><b>${esc(c.label)}</b><small>${c.correct}/${c.total}</small></div><div class="bar"><div style="width:${c.percent}%"></div></div></div>`).join('')}
    ` : `<div class="statgrid">
      <div class="stat"><b>${attempt.correctCount}/${attempt.questionCount}</b><span>OK</span></div>
      <div class="stat"><b>${Math.round(attempt.durationMs / 1000)}s</b><span>${esc(tr('timeTaken'))}</span></div>
      <div class="stat"><b>${attempt.mistakes.length}</b><span>✗</span></div>
    </div>`}
    ${est ? `<div class="notice">${esc(tr('estimateNotCert'))}: ${est}</div>` : ''}
    <h3 class="subheading">${esc(tr('reviewMistakes'))}</h3>
    ${attempt.answers.map((a, i) => `<div class="qa"><strong>${i + 1}. ${a.correct ? '✓' : '✗'}</strong>
      <p class="test-prompt">${esc(a.prompt?.text || '').replace(/\n/g, '<br>')}</p>
      <p class="muted">${esc(tr('yourAnswer'))}: ${esc(a.userAnswer || '—')} · ${esc(tr('correctAnswer'))}: ${esc((a.expected || [])[0] || '')}</p>
      ${a.explanation ? `<p class="qa-answer">${esc(a.explanation)}</p>` : ''}
    </div>`).join('')}
    ${areas.length && !summary ? `<p class="muted">${areas.map((a) => `${a.type}: ${a.count}`).join(' · ')}</p>` : ''}
    <div class="actions">
      ${attempt.type === 'starter' ? `
        <button class="btn primary" data-action="start-starter" data-size="all">${esc(tr('retryStarter'))}</button>
        <button class="btn secondary" data-action="start-starter-weak">${esc(tr('retryWeak'))}</button>
        <button class="btn secondary" data-action="clear-test">${esc(tr('starterProgress'))}</button>
      ` : `<button class="btn primary" data-action="smart-review" data-attempt="${attempt.id}">${esc(tr('smartReview'))}</button>
      <button class="btn secondary" data-action="clear-test">${esc(tr('navTests'))}</button>`}
      <button class="btn secondary" data-action="go" data-tab="history">${esc(tr('navHistory'))}</button>
    </div>
  </div>`;
}

function renderHistory() {
  if (openAttemptId) {
    const attempt = state.testAttempts.find((a) => a.id === openAttemptId);
    if (attempt) return renderTestResult(attempt) + `<div class="actions"><button class="btn secondary" data-action="close-attempt">${esc(tr('back'))}</button></div>`;
  }
  const list = filterAttempts(state.testAttempts, historyFilter);
  const series = scoreSeries(state.testAttempts, historyFilter.lang === 'all' ? state.targetLang : historyFilter.lang);
  return `<div class="layout"><section class="stack"><div class="card">
    <h2 class="section-title">${esc(tr('navHistory'))}</h2>
    <div class="toolrow">
      <select class="field small" id="hist-lang"><option value="all">all</option>${TARGET_LANGS.map((l) => `<option value="${l}" ${historyFilter.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="field small" id="hist-level"><option value="all">all</option>${LEVELS.map((l) => `<option value="${l}" ${historyFilter.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="field small" id="hist-type"><option value="all">all</option>${Object.values(TEST_TYPES).map((x) => `<option value="${x}" ${historyFilter.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
    </div>
    ${list.map((a) => `<button type="button" class="story-tile" data-action="open-attempt" data-id="${a.id}">
      <div class="row"><span class="badge">${esc(a.targetLang)} · ${esc(a.type)}</span><span>${a.scorePercent}%</span></div>
      <div><h3>${esc(a.createdAt.slice(0, 16).replace('T', ' '))}</h3>
      <p>${a.correctCount}/${a.questionCount} · ref:${esc(a.referenceLang)}${a.level ? ` · ${esc(a.level)}` : ''}</p></div>
    </button>`).join('') || `<div class="empty">${esc(tr('noData'))}</div>`}
  </div></section>
  <aside class="stack"><div class="card"><h2 class="section-title">${esc(tr('score'))}</h2>${miniChart(series)}
    <p class="muted" style="font-size:12px">${esc(tr('progressDisclaimer'))}</p>
  </div></aside></div>`;
}

function renderProgress() {
  const st = statsFor(state.targetLang);
  return `<div class="layout"><section class="stack">
    <div class="card"><div class="micro">${esc(tr('navProgress'))} · ${state.targetLang.toUpperCase()}</div>
      <div class="statgrid" style="margin-top:12px">
        <div class="stat"><b>${st.done}/${st.total}</b><span>${esc(tr('stories'))}</span></div>
        <div class="stat"><b>${st.known}</b><span>${esc(tr('knownWords'))}</span></div>
        <div class="stat"><b>${st.streak}</b><span>${esc(tr('streak'))}</span></div>
      </div>
      <div class="bar"><div style="width:${st.pct}%"></div></div>
      <p class="muted">${esc(tr('progressDisclaimer'))}</p>
    </div>
    <div class="card"><h2 class="section-title">${esc(tr('byLevel'))}</h2>${levelBars(state.targetLang)}</div>
  </section>
  <aside class="stack">
    <div class="card"><h2 class="section-title">${esc(tr('export'))}</h2>
      <p class="muted" style="font-size:13px">${esc(tr('localOnly'))}</p>
      <div class="actions">
        <button class="btn primary" data-action="export">${esc(tr('export'))}</button>
        <label class="btn secondary" for="import-data">${esc(tr('import'))}</label>
        <input type="file" id="import-data" accept=".json,application/json">
      </div>
      <div class="toolrow" style="margin-top:12px">
        <label><input type="radio" name="import-mode" value="merge" ${importMode === 'merge' ? 'checked' : ''}> ${esc(tr('importMerge'))}</label>
        <label><input type="radio" name="import-mode" value="replace" ${importMode === 'replace' ? 'checked' : ''}> ${esc(tr('importReplace'))}</label>
      </div>
    </div>
  </aside></div>`;
}

function renderSettings() {
  const conflict = assertLangPair(state.referenceLang, state.targetLang);
  return `<div class="card"><h2 class="section-title">${esc(tr('navSettings'))}</h2>
    <div class="stack" style="gap:14px;margin-top:14px">
      <label>${esc(tr('appLang'))}${langSelect('interfaceLang', state.interfaceLang, INTERFACE_LANGS)}</label>
      <label>${esc(tr('iSpeak'))}${langSelect('referenceLang', state.referenceLang, REFERENCE_LANGS, state.targetLang)}</label>
      <label>${esc(tr('iLearn'))}${langSelect('targetLang', state.targetLang, TARGET_LANGS, state.referenceLang)}</label>
      ${conflict.ok ? '' : `<div class="notice">${esc(tr('langConflict'))}</div>`}
      <p class="muted">${esc(tr('localOnly'))}</p>
      <div class="actions"><button class="btn secondary" data-action="help-install">${esc(tr('installHelp'))}</button>
      <button class="btn secondary" data-action="current-week">week ${currentWeek()}</button></div>
    </div>
  </div>`;
}

function updateVoiceUI() {
  const target = $('#voice-status');
  const vs = $('#voice-select');
  if (vs) {
    const available = speech.voicesFor(state.targetLang);
    const selected = state.settings.voice?.[state.targetLang] || '';
    vs.innerHTML = `<option value="">auto</option>${available.map((v) => `<option value="${esc(v.name)}" ${selected === v.name ? 'selected' : ''}>${esc(v.name)}${v.localService ? ' (offline)' : ''}</option>`).join('')}`;
  }
  if (!target) return;
  if (!speech.supported()) {
    target.textContent = tr('speechUnsupported');
    return;
  }
  const voice = speech.pickVoice(state.targetLang);
  target.textContent = voice
    ? tr('voiceOk', { name: voice.name, lang: voice.lang })
    : tr('voiceAuto');
}

function selectTab(which) {
  speech.stop(true);
  tab = which;
  openId = null;
  openFairyId = null;
  fairyQuiz = null;
  fairySentenceTr = null;
  openAttemptId = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectTarget(lang) {
  if (!TARGET_LANGS.includes(lang)) return;
  if (lang === state.referenceLang) {
    toast(tr('langConflict'));
    tab = 'settings';
    render();
    return;
  }
  speech.stop(true);
  state.targetLang = lang;
  persist();
  openId = null;
  cardIndex = 0;
  activeTest = null;
  render();
}

function applySetting(name, value) {
  if (name === 'interfaceLang') {
    state.interfaceLang = value;
    persist();
    render();
    return;
  }
  if (name === 'referenceLang') {
    if (value === state.targetLang) {
      toast(tr('langConflict'));
      render();
      return;
    }
    state.referenceLang = value;
    persist();
    render();
    return;
  }
  if (name === 'targetLang') {
    selectTarget(value);
  }
}

function startConfiguredTest(cfg) {
  const result = generateTest({
    type: cfg.type,
    targetLang: state.targetLang,
    referenceLang: state.referenceLang,
    level: cfg.level,
    lessonId: cfg.lessonId,
    size: cfg.size,
    includeListening: cfg.listening,
    stories: stories(),
    vocabulary: content.vocabulary,
    progress: bucket(),
  });
  if (!result.ok) {
    toast(tr('notEnoughQuestions'));
    return;
  }
  activeTest = { test: result.test, completed: false };
  testAnswers = {};
  testStartedAt = Date.now();
  touchStudy();
  persist();
  render();
}

function startStarterPack(size = 'all', mode = 'full') {
  const pack = englishStarterPack();
  if (!pack) {
    toast(tr('noData'));
    return;
  }
  if (state.targetLang !== 'en') {
    state.targetLang = 'en';
    persist();
  }
  const progress = computeStarterProgress(
    state.testAttempts,
    pack,
    state.interfaceLang,
    state.referenceLang,
  );
  const result = generateStarterTest({
    pack,
    referenceLang: state.referenceLang,
    interfaceLang: state.interfaceLang,
    size: mode === 'weak' ? 'all' : size,
    mode,
    weakSourceIds: progress.weakSourceIds,
  });
  if (!result.ok) {
    toast(mode === 'weak' ? tr('noWeakYet') : tr('notEnoughQuestions'));
    return;
  }
  activeTest = { test: result.test, completed: false };
  testAnswers = {};
  testStartedAt = Date.now();
  openAttemptId = null;
  tab = 'tests';
  touchStudy();
  persist();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function finishTest(form) {
  const answers = {};
  for (const q of activeTest.test.questions) {
    const el = form.elements[q.id];
    answers[q.id] = el ? el.value : '';
  }
  const attempt = scoreTest(activeTest.test, answers, testStartedAt);
  state.testAttempts.push(attempt);
  openAttemptId = null;
  activeTest = { completed: true, attempt };
  persist();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindEvents() {
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (btn) {
      const action = btn.dataset.action;
      if (action === 'go') selectTab(btn.dataset.tab);
      else if (action === 'select-target') selectTarget(btn.dataset.lang);
      else if (action === 'open-story') {
        openId = btn.dataset.id;
        tab = 'reading';
        speech.stop(true);
        render();
      } else if (action === 'open-recent') {
        openId = bucket().lastStoryId || stories()[0]?.id;
        tab = 'reading';
        render();
      }       else if (action === 'back-library') {
        speech.stop(true);
        openId = null;
        render();
      } else if (action === 'open-fairy') {
        openFairyId = btn.dataset.id;
        tab = 'fairytales';
        fairyQuiz = null;
        fairySentenceTr = null;
        speech.stop(true);
        render();
      } else if (action === 'back-fairy-library') {
        speech.stop(true);
        openFairyId = null;
        fairyQuiz = null;
        fairySentenceTr = null;
        render();
      } else if (action === 'next-fairy') {
        const list = fairytales();
        const ix = list.findIndex((x) => x.id === openFairyId);
        openFairyId = list[(ix + 1) % list.length]?.id;
        fairyQuiz = null;
        speech.stop(true);
        render();
      } else if (action === 'mark-fairy') {
        const b = bucket();
        b.fairytalesDone[openFairyId] = !b.fairytalesDone[openFairyId];
        touchStudy();
        persist();
        render();
      } else if (action === 'save-fairy-vocab') {
        const tale = fairytales().find((x) => x.id === openFairyId);
        if (tale) {
          const n = addStoryVocabAsCards(bucket(), tale, state.referenceLang);
          persist();
          toast(`${tr('toastSaved')} (${n})`);
        }
      } else if (action === 'toggle-fairy-full-tr') {
        fairyShowFullTr = !fairyShowFullTr;
        render();
      } else if (action === 'toggle-fairy-sentence-tr') {
        const line = Number(btn.dataset.line);
        fairySentenceTr = fairySentenceTr === line ? null : line;
        render();
      } else if (action === 'speak-fairy-line') {
        const tale = fairytales().find((x) => x.id === openFairyId);
        const line = tale?.sentences[Number(btn.dataset.line)];
        if (line) speech.speakText(line, state.targetLang, Number(btn.dataset.line));
      } else if (action === 'speak-fairy-story') {
        const tale = fairytales().find((x) => x.id === openFairyId);
        if (tale) speech.speakSequence(tale.sentences, state.targetLang);
      } else if (action === 'speak-fairy-word') {
        speech.speakText(btn.dataset.text, state.targetLang);
      } else if (action === 'fairy-pos') {
        fairyPosTab = btn.dataset.pos || 'noun';
        render();
      } else if (action === 'start-fairy-quiz') {
        const tale = fairytales().find((x) => x.id === openFairyId);
        if (!tale) return;
        const res = generateFairyWordQuiz(tale, state.referenceLang, 8);
        if (!res.ok) {
          toast(tr('notEnoughQuestions'));
          return;
        }
        fairyQuiz = { active: true, questions: res.questions, index: 0, correct: 0, completed: false };
        touchStudy();
        render();
      } else if (action === 'close-fairy-quiz') {
        fairyQuiz = null;
        render();
      } else if (action === 'answer-fairy-quiz') {
        if (!fairyQuiz || fairyQuiz.completed) return;
        const q = fairyQuiz.questions[fairyQuiz.index];
        const ok = answersMatch(btn.dataset.answer, q.expected, { lang: state.targetLang });
        if (ok) fairyQuiz.correct += 1;
        if (fairyQuiz.index + 1 >= fairyQuiz.questions.length) {
          fairyQuiz.completed = true;
        } else {
          fairyQuiz.index += 1;
        }
        touchStudy();
        persist();
        render();
      } else if (action === 'next-story') {
        const list = stories();
        const ix = list.findIndex((x) => x.id === openId);
        openId = list[(ix + 1) % list.length]?.id;
        speech.stop(true);
        render();
      } else if (action === 'mark-story') {
        const b = bucket();
        b.storiesDone[openId] = !b.storiesDone[openId];
        touchStudy();
        persist();
        render();
      } else if (action === 'save-vocab') {
        const s = stories().find((x) => x.id === openId);
        if (s) {
          const n = addStoryVocabAsCards(bucket(), s, state.referenceLang);
          persist();
          toast(`${tr('toastSaved')} (${n})`);
        }
      } else if (action === 'speak-line') {
        const s = stories().find((x) => x.id === openId);
        const line = s?.sentences[Number(btn.dataset.line)];
        if (line) speech.speakText(line, state.targetLang, Number(btn.dataset.line));
      } else if (action === 'speak-story') {
        const s = stories().find((x) => x.id === openId);
        if (s) speech.speakSequence(s.sentences, state.targetLang);
      } else if (action === 'stop-audio') speech.stop();
      else if (action === 'toggle-day') {
        const week = currentWeek();
        const key = `${week}|${btn.dataset.day}`;
        const b = bucket();
        b.weekCompleted[key] = !b.weekCompleted[key];
        touchStudy();
        persist();
        render();
      } else if (action === 'flip-card') {
        showCardBack = !showCardBack;
        render();
      } else if (action === 'prev-card' || action === 'next-card') {
        const delta = action === 'next-card' ? 1 : -1;
        const b = bucket();
        const week = currentWeek();
        const words = cardFilter === 'all'
          ? allWords(content.vocabulary, state.targetLang, b.customCards)
          : cardFilter === 'due'
            ? dueWords(content.vocabulary, state.targetLang, b.customCards, b.cardStats, week)
            : weekWords(content.vocabulary, state.targetLang, week);
        cardIndex = words.length ? (cardIndex + delta + words.length) % words.length : 0;
        showCardBack = false;
        render();
      } else if (action === 'check-card') {
        const b = bucket();
        const week = currentWeek();
        const words = cardFilter === 'due'
          ? dueWords(content.vocabulary, state.targetLang, b.customCards, b.cardStats, week)
          : cardFilter === 'all'
            ? allWords(content.vocabulary, state.targetLang, b.customCards)
            : weekWords(content.vocabulary, state.targetLang, week);
        const w = words[cardIndex];
        const inp = $('#card-answer');
        const status = $('#card-status');
        if (!w || !status) return;
        // Accept "doll" for "the doll", "Katze" for "die Katze", etc.
        const ok = answersMatch(inp.value, [w.word], { lang: state.targetLang });
        status.textContent = ok ? '✓' : w.word;
        status.className = 'answer-status ' + (ok ? 'ok' : 'bad');
      } else if (action === 'score-card') {
        const b = bucket();
        const week = currentWeek();
        const words = cardFilter === 'due'
          ? dueWords(content.vocabulary, state.targetLang, b.customCards, b.cardStats, week)
          : cardFilter === 'all'
            ? allWords(content.vocabulary, state.targetLang, b.customCards)
            : weekWords(content.vocabulary, state.targetLang, week);
        const w = words[cardIndex];
        if (!w) return;
        const key = wordKey(w.word, w.gloss?.pl || '');
        b.cardStats[key] = reviewCard(b.cardStats[key] || defaultCardStat(), Number(btn.dataset.q));
        touchStudy();
        persist();
        cardIndex = (cardIndex + 1) % Math.max(1, words.length);
        showCardBack = false;
        render();
      } else if (action === 'speak-card') {
        const b = bucket();
        const week = currentWeek();
        const words = weekWords(content.vocabulary, state.targetLang, week);
        const pool = cardFilter === 'all' ? allWords(content.vocabulary, state.targetLang, b.customCards)
          : cardFilter === 'due' ? dueWords(content.vocabulary, state.targetLang, b.customCards, b.cardStats, week) : words;
        const w = pool[cardIndex];
        if (w) speech.speakText(w.word, state.targetLang);
      } else if (action === 'export') {
        const blob = new Blob([JSON.stringify(exportBackup(state), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `langlab-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast(tr('toastExported'));
      } else if (action === 'help-install') {
        $('#modal-content').innerHTML = `<h2>${esc(tr('installHelp'))}</h2><p>${esc(tr('localOnly'))}</p><p>GitHub Pages → HTTPS → Chrome → Install. Speech depends on OS voices.</p>`;
        $('#modal').showModal();
      } else if (action === 'current-week') {
        state.settings.weekManual = false;
        state.settings.selectedWeek = autoWeek();
        persist();
        render();
      }       else if (action === 'lesson-test') {
        startConfiguredTest({
          type: TEST_TYPES.lesson,
          level: null,
          lessonId: btn.dataset.id,
          size: 5,
          listening: state.settings.includeListeningInTests,
        });
        tab = 'tests';
        render();
      } else if (action === 'start-starter') {
        startStarterPack(btn.dataset.size || 'all', 'full');
      } else if (action === 'start-starter-weak') {
        startStarterPack('all', 'weak');
      } else if (action === 'clear-test') {
        activeTest = null;
        openAttemptId = null;
        render();
      } else if (action === 'open-attempt') {
        openAttemptId = btn.dataset.id;
        const attempt = state.testAttempts.find((a) => a.id === openAttemptId);
        if (attempt?.type === 'starter') {
          // Review starter run on the Tests screen (with pack progress nearby after close)
          activeTest = { completed: true, attempt };
          tab = 'tests';
        } else {
          activeTest = null;
          tab = 'history';
        }
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (action === 'close-attempt') {
        openAttemptId = null;
        activeTest = null;
        render();
      } else if (action === 'smart-review') {
        const attempt = state.testAttempts.find((a) => a.id === btn.dataset.attempt);
        if (!attempt) return;
        const cards = mistakesToFlashcards(attempt);
        const b = bucket(attempt.targetLang);
        for (const c of cards) {
          const key = wordKey(c.word, c.gloss?.[attempt.referenceLang] || '');
          if (!b.customCards.some((x) => wordKey(x.word, x.gloss?.pl || '') === key)) {
            b.customCards.push(c);
          }
          b.cardStats[key] = { ...defaultCardStat(), status: 'needs_review', next: Date.now() };
        }
        persist();
        state.targetLang = attempt.targetLang;
        cardFilter = 'due';
        selectTab('vocab');
        toast(tr('toastSaved'));
      } else if (action === 'speak-test') {
        speech.speakText(btn.dataset.text, btn.dataset.lang);
      }
      return;
    }
    const tabBtn = ev.target.closest('[data-tab]');
    if (tabBtn && tabBtn.classList.contains('main-tab')) selectTab(tabBtn.dataset.tab);
  });

  document.addEventListener('change', async (ev) => {
    const id = ev.target.id;
    if (ev.target.matches('[data-setting]')) {
      applySetting(ev.target.dataset.setting, ev.target.value);
      return;
    }
    if (id === 'level-filter') { levelFilter = ev.target.value; render(); }
    else if (id === 'kind-filter') { kindFilter = ev.target.value; render(); }
    else if (id === 'show-translations') { state.settings.showTranslations = ev.target.checked; persist(); render(); }
    else if (id === 'fairy-show-translations') { state.settings.showTranslations = ev.target.checked; persist(); render(); }
    else if (id === 'fairy-read-only') { state.settings.readOnly = ev.target.checked; speech.stop(true); persist(); render(); }
    else if (id === 'read-only') { state.settings.readOnly = ev.target.checked; speech.stop(true); persist(); render(); }
    else if (id === 'fairy-kind-filter') { fairyKindFilter = ev.target.value; render(); }
    else if (id === 'speed') { state.settings.rate = Number(ev.target.value); persist(); }
    else if (id === 'voice-select') {
      state.settings.voice[state.targetLang] = ev.target.value;
      persist();
      updateVoiceUI();
    } else if (id === 'week-select') {
      state.settings.selectedWeek = Number(ev.target.value);
      state.settings.weekManual = true;
      cardIndex = 0;
      persist();
      render();
    } else if (id === 'card-filter') { cardFilter = ev.target.value; cardIndex = 0; render(); }
    else if (id === 'hist-lang') { historyFilter.lang = ev.target.value; render(); }
    else if (id === 'hist-level') { historyFilter.level = ev.target.value; render(); }
    else if (id === 'hist-type') { historyFilter.type = ev.target.value; render(); }
    else if (id === 'import-data') {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const check = validateBackup(data);
        if (!check.ok) throw new Error('bad');
        if (importMode === 'replace' && !window.confirm(tr('replaceWarn'))) return;
        state = importBackup(state, data, importMode);
        persist();
        render();
        toast(tr('toastImported'));
      } catch {
        toast('Import failed');
      }
    } else if (ev.target.name === 'import-mode') importMode = ev.target.value;
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'writing') {
      bucket().writing[openId] = ev.target.value;
      persist();
    } else if (ev.target.id === 'search-stories') {
      search = ev.target.value;
      const pos = ev.target.selectionStart;
      render();
      const inp = $('#search-stories');
      if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    } else if (ev.target.id === 'search-fairy') {
      fairySearch = ev.target.value;
      const pos = ev.target.selectionStart;
      render();
      const inp = $('#search-fairy');
      if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    }
  });

  document.addEventListener('submit', (ev) => {
    if (ev.target.id === 'add-card') {
      ev.preventDefault();
      const gloss = ev.target.elements.gloss.value.trim();
      const word = ev.target.elements.target.value.trim();
      if (!gloss || !word) return;
      const b = bucket();
      b.customCards.push({
        id: `custom-${Date.now()}`,
        word,
        gloss: { [state.referenceLang]: gloss, pl: gloss, en: gloss },
        pos: 'noun',
        source: 'user',
      });
      persist();
      cardFilter = 'all';
      render();
      toast(tr('toastSaved'));
    } else if (ev.target.id === 'test-config') {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      startConfiguredTest({
        type: fd.get('type'),
        level: fd.get('level'),
        lessonId: fd.get('lesson'),
        size: Number(fd.get('size')),
        listening: fd.get('listening') === 'on',
      });
    } else if (ev.target.id === 'test-form') {
      ev.preventDefault();
      finishTest(ev.target);
    }
  });

  $('#privacy-open')?.addEventListener('click', () => {
    $('#modal-content').innerHTML = `<h2>LangLab 3.0</h2><p>${esc(tr('localOnly'))}</p>`;
    $('#modal').showModal();
  });
  $('#modal-close')?.addEventListener('click', () => $('#modal').close());
  $('#install-btn')?.addEventListener('click', async () => {
    if (installEvent) {
      installEvent.prompt();
      await installEvent.userChoice;
      installEvent = null;
      $('#install-btn').hidden = true;
    } else {
      $('#modal-content').innerHTML = `<p>${esc(tr('installHelp'))}</p>`;
      $('#modal').showModal();
    }
  });
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    installEvent = ev;
    $('#install-btn').hidden = false;
  });
}

async function start() {
  try {
    content = await loadAllContent();
    const invalid = TARGET_LANGS.filter((l) => !content.validation[l]?.stories?.ok);
    if (invalid.length) console.warn('Content validation issues', invalid.map((l) => content.validation[l]));
    if (!state.settings.selectedWeek) state.settings.selectedWeek = autoWeek();
    // Resolve reference/target conflict from bad imports
    if (state.referenceLang === state.targetLang) {
      state.referenceLang = state.targetLang === 'en' ? 'pl' : 'en';
    }
    speech.bindVoiceEvents();
    bindEvents();
    render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  } catch (err) {
    console.error(err);
    $('#app-content').innerHTML = '<div class="empty">Failed to load content. Serve over HTTPS or localhost.</div>';
  }
}

// Expose for tests
export const __test__ = {
  get state() { return state; },
  set state(v) { state = v; },
  get content() { return content; },
  set content(v) { content = v; },
  statsFor,
  selectTarget,
  persist,
  bucket,
  speech,
  render,
  startConfiguredTest,
  finishTest,
};

start();
