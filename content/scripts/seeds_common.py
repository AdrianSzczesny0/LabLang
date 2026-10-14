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


def mk(cat, kind, em, title, s, pl, v, q1, q2, en=None):
    if en is None:
        en = s
    return (cat, kind, em, title, s, pl, en, v, q1, q2)
