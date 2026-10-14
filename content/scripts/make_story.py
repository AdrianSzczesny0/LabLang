"""Compact story row -> mk tuple for FR/IT packs."""
from seeds_common import Q1, Q2, mk, sp, tit, voc


def fr_row(cat, kind, em, en_t, pl_t, fr_t, fr_s, pl_s, en_s, voc_rows, q1, q2):
    return mk(
        cat,
        kind,
        em,
        tit(en_t, pl_t, fr=fr_t),
        sp(fr_s),
        sp(pl_s),
        sp(en_s),
        voc(*voc_rows),
        Q1(*q1),
        Q2(*q2),
    )


def it_row(cat, kind, em, en_t, pl_t, it_t, it_s, pl_s, en_s, voc_rows, q1, q2):
    return mk(
        cat,
        kind,
        em,
        tit(en_t, pl_t, it=it_t),
        sp(it_s),
        sp(pl_s),
        sp(en_s),
        voc(*voc_rows),
        Q1(*q1),
        Q2(*q2),
    )
