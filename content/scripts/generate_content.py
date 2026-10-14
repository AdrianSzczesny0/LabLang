#!/usr/bin/env python3
"""Generate LangLab 3.0 content JSON for en, fr, it."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from vocab_translations import VOCAB_BY_PL, WEEK_TITLES

ROOT = Path(__file__).resolve().parents[1]
STORIES_DIR = ROOT / "stories"
VOCAB_DIR = ROOT / "vocabulary"
LEGACY = Path(__file__).resolve().parents[2] / "legacy-words.json"

LEVELS = ["A0", "A1", "A2", "B1", "B2"]


def split_pipe(s: str) -> list[str]:
    return [x.strip() for x in s.split("|") if x.strip()]


def q(prompt_en, prompt_pl, ans_en, ans_pl, expl_en, expl_pl):
    return {
        "id": "q1",
        "type": "comprehension",
        "prompt": {"en": prompt_en, "pl": prompt_pl},
        "acceptedAnswers": {"en": ans_en if isinstance(ans_en, list) else [ans_en], "pl": ans_pl if isinstance(ans_pl, list) else [ans_pl]},
        "explanation": {"en": expl_en, "pl": expl_pl},
    }


def q2(prompt_en, prompt_pl, ans_en, ans_pl, expl_en, expl_pl):
    d = q(prompt_en, prompt_pl, ans_en, ans_pl, expl_en, expl_pl)
    d["id"] = "q2"
    return d


def vocab(*items):
    out = []
    for word, pl, en, pos in items:
        out.append({"word": word, "gloss": {"pl": pl, "en": en}, "pos": pos})
    return out


def titles(en, pl, fr=None, it=None, de=None, es=None):
    t = {"en": en, "pl": pl}
    if fr:
        t["fr"] = fr
    if it:
        t["it"] = it
    if de:
        t["de"] = de
    if es:
        t["es"] = es
    return t


def make_story(lang, level, num, category, kind, em, tit, sentences, pl, en_tr, voc, qs):
    sid = f"{lang}-{level.lower()}-{num:02d}"
    story = {
        "id": sid,
        "targetLang": lang,
        "level": level,
        "kind": kind,
        "category": category,
        "estimatedMinutes": em,
        "titles": tit,
        "sentences": sentences,
        "translations": {"pl": pl, "en": en_tr},
        "vocabulary": voc,
        "questions": qs,
        "audioRecommended": kind == "dialogue" or level in ("A0", "A1"),
    }
    return story


def load_story_packs():
    from story_packs import EN_PACK, FR_PACK, IT_PACK  # noqa: WPS433

    return EN_PACK, FR_PACK, IT_PACK


def build_stories(lang, pack):
    stories = []
    for level in LEVELS:
        for i, raw in enumerate(pack[level], start=1):
            cat, kind, em, tit, s, pl, en_tr, voc, q1, q2 = raw
            stories.append(
                make_story(
                    lang,
                    level,
                    i,
                    cat,
                    kind,
                    em,
                    tit,
                    s,
                    pl,
                    en_tr,
                    voc,
                    [q1, q2],
                )
            )
    return stories


def build_vocabulary(lang):
    legacy = json.loads(LEGACY.read_text(encoding="utf-8"))
    weeks_de = legacy["de"]
    out = []
    for wi, week in enumerate(weeks_de):
        wnum = wi + 1
        en_title, pl_title = WEEK_TITLES[wi]
        words = []
        for j, w in enumerate(week["words"], start=1):
            pl_key = w["pl"]
            if pl_key not in VOCAB_BY_PL:
                raise KeyError(f"Missing vocab mapping for {pl_key!r} week {wnum}")
            row = VOCAB_BY_PL[pl_key]
            en_w, fr_w, fr_a, it_w, it_a, ex_en, ex_fr, ex_it = row
            if lang == "en":
                word = en_w
                article = None
                example = ex_en
                gloss_en = en_w.replace("the ", "").replace("The ", "")
            elif lang == "fr":
                word = fr_w
                article = fr_a
                example = ex_fr
                gloss_en = en_w.replace("the ", "").replace("The ", "")
            else:
                word = it_w
                article = it_a
                example = ex_it
                gloss_en = en_w.replace("the ", "").replace("The ", "")
            words.append(
                {
                    "id": f"{lang}-w{wnum:02d}-{j:02d}",
                    "word": word,
                    "article": article,
                    "example": example,
                    "gloss": {"pl": pl_key, "en": gloss_en},
                    "pos": "noun",
                }
            )
        out.append({"week": wnum, "title": {"en": en_title, "pl": pl_title}, "words": words})
    return out


def validate():
    errors = []
    for lang in ("en", "fr", "it"):
        sp = STORIES_DIR / f"{lang}.json"
        vp = VOCAB_DIR / f"{lang}.json"
        stories = json.loads(sp.read_text(encoding="utf-8"))
        voc = json.loads(vp.read_text(encoding="utf-8"))
        if len(stories) != 50:
            errors.append(f"{lang} stories: expected 50, got {len(stories)}")
        for lv in LEVELS:
            c = sum(1 for s in stories if s["level"] == lv)
            if c != 10:
                errors.append(f"{lang} level {lv}: expected 10, got {c}")
        for s in stories:
            n = len(s["sentences"])
            if len(s["translations"]["pl"]) != n or len(s["translations"]["en"]) != n:
                errors.append(f"{s['id']}: translation length mismatch")
        if len(voc) != 52:
            errors.append(f"{lang} vocab weeks: expected 52, got {len(voc)}")
        for w in voc:
            if len(w["words"]) != 5:
                errors.append(f"{lang} week {w['week']}: expected 5 words")
    return errors


def main():
    en_pack, fr_pack, it_pack = load_story_packs()
    STORIES_DIR.mkdir(parents=True, exist_ok=True)
    VOCAB_DIR.mkdir(parents=True, exist_ok=True)
    for lang, pack in (("en", en_pack), ("fr", fr_pack), ("it", it_pack)):
        (STORIES_DIR / f"{lang}.json").write_text(
            json.dumps(build_stories(lang, pack), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        (VOCAB_DIR / f"{lang}.json").write_text(
            json.dumps(build_vocabulary(lang), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    errs = validate()
    if errs:
        print("VALIDATION FAILED:")
        for e in errs:
            print(" -", e)
        sys.exit(1)
    print("=== LangLab content summary ===")
    for lang in ("en", "fr", "it"):
        stories = json.loads((STORIES_DIR / f"{lang}.json").read_text())
        voc = json.loads((VOCAB_DIR / f"{lang}.json").read_text())
        words = sum(len(w["words"]) for w in voc)
        print(f"{lang}: {len(stories)} stories, {len(voc)} weeks, {words} vocabulary nouns")
    print("All checks passed.")


if __name__ == "__main__":
    main()
