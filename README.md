# LangLab 3.0 — Multilingual Learning PWA

Static progressive web app for learning **German, Spanish, English, French, and Italian**. No Node build step, no backend, no paid services. Deployable on GitHub Pages.

Progress is stored **locally** in the browser (`localStorage`). There is no cross-device sync without a backend.

## Quick start

```bash
cd LabLang
python3 -m http.server 8000
```

Open `http://localhost:8000`.

### Tests

```bash
node tests/run-tests.mjs
```

### GitHub Pages

1. Publish the **contents** of this folder as the site root (so `index.html` is at `/`).
2. Settings → Pages → Deploy from branch → `/ (root)`.
3. Open the HTTPS URL in Chrome on Android → Install / Add to Home Screen.
4. Load once online; lessons and UI then work offline. Speech still depends on OS voices.

---

## Architecture overview

```
index.html          UI shell + module entry
styles.css          Mobile-first styles
sw.js               Offline cache (v3.0) — does not touch localStorage
manifest.webmanifest
js/
  app.js            UI controller / navigation
  registry.js       Language registry & defaults
  i18n.js           Interface strings (pl/en/de/es/fr/it)
  storage.js        Schema v3 + migrations + import/export
  content.js        Content load & translation resolution
  speech.js         SpeechSynthesis (Android-safe cancel→speak)
  flashcards.js     Per-language SR scheduler (LangLab-SR-1)
  assessments.js    Test generation, grading, history records
content/
  stories/{de,es,en,fr,it}.json    50 readings each
  vocabulary/{de,es,en,fr,it}.json 52×5 weekend nouns each
stories.json / legacy-words.json   Legacy v2 sources (migration)
scripts/migrate_legacy_content.py  Rebuild DE/ES from legacy
tests/run-tests.mjs
```

### Three independent language settings

| Setting | Purpose | Codes |
|--------|---------|--------|
| **App language** (`interfaceLang`) | Menus, buttons, labels | pl, en, de, es, fr, it |
| **I speak** (`referenceLang`) | Translations & glosses | pl, en, de, es, fr, it |
| **I want to learn** (`targetLang`) | Study library & progress | de, es, en, fr, it |

Reference and target cannot be identical (conflict explained in Settings).

Changing the interface language never changes learning records. Changing the reference language does not erase completions or tests; each test attempt stores the reference language used at the time.

---

## Content counts

| Target | A0 | A1 | A2 | B1 | B2 | Total |
|--------|----|----|----|----|----|-------|
| German (de) | 10 | 10 | 10 | 10 | 10 | **50** |
| Spanish (es) | 10 | 10 | 10 | 10 | 10 | **50** |
| English (en) | 10 | 10 | 10 | 10 | 10 | **50** |
| French (fr) | 10 | 10 | 10 | 10 | 10 | **50** |
| Italian (it) | 10 | 10 | 10 | 10 | 10 | **50** |
| **Sum** | | | | | | **250** |

Weekend vocabulary: **52 weeks × 5 nouns = 260** cards per target language.

A0 is an app-specific starter level, not an official CEFR band. Reading completion is **not** treated as certified proficiency.

### Translation coverage (reference)

| Target ↓ / Reference → | pl | en | de | es | fr | it |
|------------------------|----|----|----|----|----|----|
| de | full | full | native | titles only | titles only | titles only |
| es | full | full | titles only | native | titles only | titles only |
| en | full | native | titles only | titles only | titles only | titles only |
| fr | full | full | titles only | titles only | native | titles only |
| it | full | full | titles only | titles only | titles only | native |

Missing sentence translations fall back to **English** with an explicit notice (never silently labeled as another language). If English is also missing, Polish may be offered as a second documented fallback when present.

---

## Features

### Reading & listening

- Filter by level / kind / search
- Per-sentence translations (with fallback notices)
- Whole-story and per-sentence audio via Web Speech API
- Speed + voice picker; stop on navigation
- Mark complete, writing notes, save story vocab to flashcards

**Speech root-cause fix:** Android Chrome often drops utterances if `cancel()` is followed immediately by `speak()`. Playback is serialized and delayed after cancel; voices load via `voiceschanged`. Speech is **not** guaranteed on every device — OS voice packs required. Automated tests use a mock synthesizer only.

### Progress (per target language)

Completed/started readings, vocabulary & SR state, writing, weekly plan ticks, streak, study date, test attempts. Global dashboard + per-language cards.

### Assessments

| Mode | Description |
|------|-------------|
| Lesson test | From one lesson’s vocab/content |
| Level review | From studied material at a level |
| General practice | From all studied material |
| Diagnostic | Cross-level estimate (labeled as estimate, not a certificate) |

Question types: MC vocab, match, translate, fill-blank, reorder, comprehension, listening (when enabled).

Sizes: 5 / 10 / 20 / 30 when enough questions exist.

### Test history

Immutable attempts with id, languages, type, level, scores, duration, question snapshot, answers, mistakes, bank version. Filter/sort, open details, score-over-time chart, smart review → flashcards from mistakes.

### Flashcards (LangLab-SR-1)

Per-language pools; Saturday = 5 new nouns; Sunday = review only; weekdays = story words optional. Statuses: new / learning / known / needs_review. Quality 0–3 updates interval; **viewing alone does not mark mastery**.

---

## Storage & migration

- Key: `langlab_v3_progress` (schema version **3**)
- On first launch, migrates `langlab_v2_progress` / `langlab_v1_progress` without deleting data
- Legacy story keys `de|a0-01` → `de-a0-01`; writing `de|1` → `de-a0-01`
- Export/import JSON with schema version; **merge** (default) or **replace** (warned); duplicate attempt IDs skipped on merge

---

## Manual Android TTS check

1. Open a reading → tap ▶ on one sentence.
2. If silent: media volume, voice picker, Android **Text-to-speech** voices for `de-DE` / `es-ES` / `en-GB` / `fr-FR` / `it-IT`.
3. Mocked unit tests do **not** prove physical-device voices.

---

## Known limitations

- Interface strings for de/es/fr/it reuse English for many secondary labels (core nav/settings localized).
- Reference translations beyond **pl** and **en** are not full sentence coverage — fallback is documented.
- Open-ended writing is not auto-graded (notes + optional external correction).
- Diagnostic results are estimates only.
- No cloud sync.
- Speech depends on OS/browser voices.
- Legacy `app.v2.legacy.js` is kept for reference only; the live app is `js/app.js`.

---

## Deliverables checklist

- [x] Five target languages selectable with independent progress
- [x] Separate app / reference / target settings
- [x] Translation fallback with notices
- [x] 250 readings (50×5) + weekend vocab packs
- [x] Existing DE/ES content preserved via migration
- [x] Sentence + story audio controller fix
- [x] Assessment modes + persistent history
- [x] Flashcards SR + weekend workflow
- [x] Export/import with merge/replace
- [x] PWA / GitHub Pages relative paths + SW v3.0
- [x] Automated tests (`node tests/run-tests.mjs`)
