#!/usr/bin/env python3
"""Write story_packs_{en,fr,it}.py from embedded seed data."""
from pathlib import Path

OUT = Path(__file__).resolve().parent


def sp(s):
    return [x.strip() for x in s.split("|") if x.strip()]


def tit(en, pl, **kw):
    d = {"en": en, "pl": pl}
    d.update(kw)
    return d


def voc(*rows):
    return [{"word": w, "gloss": {"pl": p, "en": e}, "pos": pos} for w, p, e, pos in rows]


def Q1(pe, pp, ae, ap, ee, ep):
    return {
        "id": "q1",
        "type": "comprehension",
        "prompt": {"en": pe, "pl": pp},
        "acceptedAnswers": {
            "en": [ae] if isinstance(ae, str) else list(ae),
            "pl": [ap] if isinstance(ap, str) else list(ap),
        },
        "explanation": {"en": ee, "pl": ep},
    }


def Q2(pe, pp, ae, ap, ee, ep):
    d = Q1(pe, pp, ae, ap, ee, ep)
    d["id"] = "q2"
    return d


def story(cat, kind, em, title, s, pl, v, q1, q2, en=None):
    if en is None:
        en = s
    return (cat, kind, em, title, s, pl, en, v, q1, q2)


def dump_pack(name, pack):
    var = {"en": "EN_PACK", "fr": "FR_PACK", "it": "IT_PACK"}[name]
    lines = [f"# Auto-generated story pack for {name}", f"{var} = {{"]
    for lv in ("A0", "A1", "A2", "B1", "B2"):
        lines.append(f'    "{lv}": [')
        for st in pack[lv]:
            lines.append(f"        {repr(st)},")
        lines.append("    ],")
    lines.append("}")
    path = OUT / f"story_packs_{name}.py"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Wrote", path, sum(len(pack[l]) for l in pack))


from seeds_en import PACK as EN  # noqa: E402
from seeds_en_rest import A1, A2, B1, B2  # noqa: E402

EN_FULL = {**EN, "A1": A1, "A2": A2, "B1": B1, "B2": B2}

if __name__ == "__main__":
    dump_pack("en", EN_FULL)
