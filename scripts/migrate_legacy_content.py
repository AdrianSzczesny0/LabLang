#!/usr/bin/env python3
"""Migrate bilingual stories.json + legacy-words.json into per-language LangLab 3.0 schema."""
from __future__ import annotations

import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
OUT_STORIES = BASE / "content" / "stories"
OUT_VOCAB = BASE / "content" / "vocabulary"

TITLE_EN = {
    "a0-01": "The Cat Mimi",
    "a0-02": "The Red Ball",
    "a0-03": "Good Morning!",
    "a0-04": "A Glass of Water",
    "a0-05": "My Family",
    "a0-06": "In the Small Shop",
    "a0-07": "The Dog Max",
    "a0-08": "In the Room",
    "a0-09": "What Is Your Name?",
    "a0-10": "It Is Raining",
    "a1-01": "Sunday Breakfast",
    "a1-02": "The Lost Key",
    "a1-03": "At the Café",
    "a1-04": "A Day in the Park",
    "a1-05": "The Bus Is Coming",
    "a1-06": "The New Neighbour",
    "a1-07": "A Gift",
    "a1-08": "After Work",
    "a1-09": "A Phone Call",
    "a1-10": "A Free Afternoon",
    "a2-01": "A Weekend by the Sea",
    "a2-02": "A Problem with the Bike",
    "a2-03": "A Reservation",
    "a2-04": "The First Day at Work",
    "a2-05": "An Unexpected Visit",
    "a2-06": "The Wrong Address",
    "a2-07": "Grandma’s Recipe",
    "a2-08": "A Misunderstanding",
    "a2-09": "The Library",
    "a2-10": "A New Habit",
    "b1-01": "A Career Decision",
    "b1-02": "A Trip Without Internet",
    "b1-03": "A Hotel Complaint",
    "b1-04": "A Difficult Conversation",
    "b1-05": "A Small Business",
    "b1-06": "A Village Is Changing",
    "b1-07": "A Good Idea?",
    "b1-08": "Why I Read",
    "b1-09": "A Plan for Winter",
    "b1-10": "The Forgotten Parcel",
    "b2-01": "Technology and Attention",
    "b2-02": "A Compromise in the Team",
    "b2-03": "The City of the Future",
    "b2-04": "An Unexpected Result",
    "b2-05": "What Does Success Mean?",
    "b2-06": "A Book Without an Ending",
    "b2-07": "A Debate on Education",
    "b2-08": "A Difficult Move",
    "b2-09": "The Limits of Planning",
    "b2-10": "The Art of Listening",
}

EN_LINES = {
    "a0-01": [
        "This is Anna.",
        "Anna has a cat.",
        "The cat is named Mimi.",
        "Mimi is small.",
        "Mimi sleeps on the sofa.",
    ],
    "a0-02": [
        "Tom has a ball.",
        "The ball is red.",
        "Tom plays in the garden.",
        "The ball is lying in the grass.",
    ],
    "a0-03": [
        "“Good morning, Anna!”",
        "“Good morning, Tom!”",
        "“How are you?”",
        "“Fine, thanks. And you?”",
        "“Fine too!”",
    ],
    "a0-04": [
        "Lena is thirsty.",
        "She takes a glass.",
        "She drinks water.",
        "The water is cold.",
    ],
    "a0-05": [
        "This is my family.",
        "My mother is named Eva.",
        "My father is named Jan.",
        "I have a brother.",
        "We live together.",
    ],
    "a0-06": [
        "“Hello! I would like some bread.”",
        "“One loaf?”",
        "“Yes, please.”",
        "“Here you are!”",
        "“Thank you!”",
    ],
    "a0-07": [
        "This is Max.",
        "Max is a dog.",
        "Max is big and brown.",
        "He runs fast.",
        "Max likes water.",
    ],
    "a0-08": [
        "This is my room.",
        "The bed is white.",
        "The table is small.",
        "There is a book on the table.",
    ],
    "a0-09": [
        "“Hi! What is your name?”",
        "“My name is Sara.”",
        "“And you?”",
        "“My name is Leo.”",
        "“Nice to meet you!”",
    ],
    "a0-10": [
        "It is raining today.",
        "The sky is grey.",
        "Eva has an umbrella.",
        "She is going home.",
        "It is warm at home.",
    ],
    "a1-01": [
        "On Sunday Paul gets up late.",
        "He makes coffee and cuts bread.",
        "His sister eats an egg.",
        "They sit together in the kitchen.",
        "Afterwards they clear the table.",
    ],
    "a1-02": [
        "Marta is looking for her key.",
        "She looks in her bag.",
        "There is only her phone there.",
        "Then she sees the key on the table.",
        "“There you are!” she says.",
    ],
    "a1-03": [
        "“What would you like to drink?”",
        "“Tea, please.”",
        "“With sugar?”",
        "“No, thank you. Without sugar.”",
        "“That will be three euros.”",
    ],
    "a1-04": [
        "The sun is shining today.",
        "Nina goes to the park with her dog.",
        "Many children are playing on the playground.",
        "Nina sits down on a bench.",
        "Her dog sleeps next to her.",
    ],
    "a1-05": [
        "“Excuse me, does this bus go to the station?”",
        "“Yes, but it leaves in ten minutes.”",
        "“Where can I buy a ticket?”",
        "“Directly from the driver.”",
        "“Thank you very much!”",
    ],
    "a1-06": [
        "A new neighbour lives next to us now.",
        "Her name is Maria and she comes from Italy.",
        "Every morning she greets us kindly.",
        "Today she brings a small cake.",
        "We invite her for coffee.",
    ],
    "a1-07": [
        "Today is my friend’s birthday.",
        "I buy a book for him.",
        "He really likes reading stories.",
        "In the evening I give him the gift.",
        "He smiles and says thank you.",
    ],
    "a1-08": [
        "I work until five today.",
        "Afterwards I go shopping.",
        "I need milk, rice and vegetables.",
        "At home I cook a simple dinner.",
        "Later I read a few pages.",
    ],
    "a1-09": [
        "“Hi, this is Lisa. Do you have time today?”",
        "“Yes, after six.”",
        "“Shall we go for a walk?”",
        "“Gladly! Where shall we meet?”",
        "“In front of the cinema.”",
    ],
    "a1-10": [
        "I am free in the afternoon.",
        "I want to do something new.",
        "First I paint a picture.",
        "Then I call my friend.",
        "We go for ice cream together.",
    ],
    "a2-01": [
        "Last weekend we went to the sea.",
        "On Saturday it was windy but sunny.",
        "We walked along the beach for a long time.",
        "In the evening we ate in a small restaurant.",
        "On Sunday we came back tired and happy.",
    ],
    "a2-02": [
        "Yesterday I wanted to cycle to work.",
        "But one tyre was suddenly flat.",
        "Luckily my neighbour lives next door.",
        "He lent me his pump.",
        "I was only five minutes late.",
    ],
    "a2-03": [
        "“Good evening, do you have a table for two?”",
        "“Do you have a reservation?”",
        "“Unfortunately not.”",
        "“A table will be free in twenty minutes.”",
        "“No problem, we are happy to wait.”",
    ],
    "a2-04": [
        "On Monday Julia had her first day at work.",
        "She was a little nervous.",
        "Her colleague showed her the office.",
        "During lunch break Julia met the team.",
        "By the end of the day Julia already felt better.",
    ],
    "a2-05": [
        "I was cooking when the doorbell rang.",
        "My old school friend was standing at the door.",
        "We had not seen each other for years.",
        "She had brought a cake.",
        "We talked until late in the evening.",
    ],
    "a2-06": [
        "We were looking for a small bookshop.",
        "But the navigation showed us the wrong street.",
        "We asked a man for directions.",
        "He explained that we had to turn left.",
        "Ten minutes later we found the shop.",
    ],
    "a2-07": [
        "My grandmother showed me her favourite recipe.",
        "First we chopped the vegetables.",
        "Then we cooked everything slowly.",
        "The soup smelled wonderful.",
        "Now I can prepare it on my own as well.",
    ],
    "a2-08": [
        "“Why weren’t you there yesterday?”",
        "“I thought we were meeting today.”",
        "“But I wrote to you!”",
        "“Oh, I didn’t see the message.”",
        "“Then let’s see each other tomorrow.”",
    ],
    "a2-09": [
        "I often go to the library because it is quiet there.",
        "Last week I found an exciting novel.",
        "I only wanted to read one chapter.",
        "In the end I stayed for three hours.",
        "Today I am returning the book.",
    ],
    "a2-10": [
        "For a month I have been walking every morning.",
        "At first it was quite hard.",
        "Now I look forward to the fresh air.",
        "Sometimes I listen to a podcast while walking.",
        "That way I start the day with more energy.",
    ],
    "b1-01": [
        "For some time Daniel has been wondering whether he should change jobs.",
        "He likes his current team, but he hardly learns anything new there.",
        "Another company offers him more responsibility.",
        "Before he answers, he talks with his family.",
        "In the end he decides to take on the new challenge.",
    ],
    "b1-02": [
        "When we arrived in the mountains, we suddenly lost signal.",
        "At first we were worried because we could not load maps.",
        "Luckily we had a paper hiking map.",
        "Along the way we discovered a small waterfall.",
        "In the end the break from the phone even turned out pleasant.",
    ],
    "b1-03": [
        "“Excuse me, the heating in my room is not working.”",
        "“We are very sorry. Since when has this been a problem?”",
        "“Since yesterday evening. It was cold all night.”",
        "“We can offer you another room right away.”",
        "“Thank you, that would be a good solution.”",
    ],
    "b1-04": [
        "Mila argued with her friend and did not know what to say.",
        "First she wrote a long message, but then she deleted it.",
        "Instead she suggested meeting in person.",
        "They both listened to each other without interrupting.",
        "Afterwards they understood each other much better.",
    ],
    "b1-05": [
        "Two friends had long wanted to open their own company.",
        "One handled the website, the other the customers.",
        "In the first months they earned very little.",
        "They improved the service after receiving feedback.",
        "After a year they could hire their first employee.",
    ],
    "b1-06": [
        "In the past our village only had a small shop.",
        "In the meantime many young families have moved here.",
        "That is why the municipality built a new playground.",
        "Some people are happy; others miss the old quiet.",
        "At the next meeting everyone wants to talk about it.",
    ],
    "b1-07": [
        "“I want to practise a new language every day.”",
        "“Do you have enough time for that?”",
        "“Maybe only twenty minutes in the evening.”",
        "“That sounds doable if you stay consistent.”",
        "“Exactly. Better little but often.”",
    ],
    "b1-08": [
        "As a child I read books because the stories made me curious.",
        "Today I also read to discover new perspectives.",
        "Sometimes I only understand a chapter the second time.",
        "That does not bother me, because I notice more details then.",
        "Reading is not a duty for me, but a small journey.",
    ],
    "b1-09": [
        "Last winter we often stayed at home because it got dark so early.",
        "This year we want to do more things together.",
        "So we wrote a list of short trips.",
        "If the weather is good, we will go to the forest.",
        "If it rains, we will visit a museum.",
    ],
    "b1-10": [
        "An important parcel was supposed to arrive on Friday, but nobody was home.",
        "The courier left a note on the door.",
        "I had to go to the post office the next day.",
        "There it turned out that the parcel was still on the way.",
        "In the end it arrived on Monday directly to me.",
    ],
    "b2-01": [
        "Although digital tools make everyday life easier, they take up a large share of our attention.",
        "Many people only notice in the evening how often they unlocked their phone for no clear reason.",
        "Consciously limiting notifications helps more than relying on willpower alone.",
        "The key is not rejecting technology, but deciding for yourself when it is useful.",
    ],
    "b2-02": [
        "“If we move the deadline, we may lose the client’s trust.”",
        "“But if we deliver too early, we risk serious mistakes.”",
        "“Could we release a limited version first?”",
        "“That would be reasonable, as long as the most important features work reliably.”",
        "“Then let’s write down the remaining risks.”",
    ],
    "b2-03": [
        "In many cities there is a debate about how to share public space more fairly.",
        "While some demand more parking spaces, others want safe bike lanes and wider pavements.",
        "A convincing solution must consider the needs of different groups.",
        "That is why transparent decisions are just as important as good technical designs.",
    ],
    "b2-04": [
        "At first the experiment seemed to confirm the original hypothesis.",
        "After a closer look, however, an important factor had been overlooked.",
        "The team repeated the measurements under stricter conditions.",
        "The new data clearly contradicted the first interpretation.",
        "It was exactly this correction that finally led to a more interesting discovery.",
    ],
    "b2-05": [
        "In the past I measured success almost only by quantifiable results.",
        "Over time I realised how much that view left out.",
        "A quiet evening with family can be worth more than another checked-off task.",
        "That is why I now try to look at achievements and quality of life together.",
    ],
    "b2-06": [
        "The novel I finished yesterday left a surprising number of questions open.",
        "At first I was annoyed because I had expected a clear ending.",
        "The longer I thought about it, the more interesting that choice seemed.",
        "Perhaps the author wanted us to finish the story ourselves.",
    ],
    "b2-07": [
        "“Should schools schedule more time for practical projects?”",
        "“Yes, as long as basic knowledge is not neglected.”",
        "“Still, children also learn by trying things themselves.”",
        "“Maybe a balanced mix would make more sense than a radical change.”",
    ],
    "b2-08": [
        "We had underestimated how many decisions moving to another city involves.",
        "Apart from the flat, we had to deal with school, transport and many formalities.",
        "The hardest part was leaving familiar habits behind.",
        "Looking back, though, the experience made us more independent.",
    ],
    "b2-09": [
        "A careful plan can reduce uncertainty, but never remove it completely.",
        "That is why it helps to consider not only goals, but also possible deviations.",
        "Anyone who treats every change as failure often misses new opportunities.",
        "Flexibility does not mean giving up preparation; it means using it wisely.",
    ],
    "b2-10": [
        "In conversations we often only wait for our turn to speak again.",
        "That way we miss important nuances that are not said explicitly.",
        "Anyone who asks attentive questions not only shows respect, but often understands the real problem better.",
        "Good listening is therefore an active skill, not just a pause in speaking.",
    ],
}

CATEGORY = {
    "dialogue": "conversation",
    "story": "everyday",
}


def extract_vocab(sentences: list[str], lang: str, pl_lines: list[str], en_lines: list[str]):
    """Lightweight vocab hints from short sentences (first content words)."""
    items = []
    seen = set()
    for i, sent in enumerate(sentences[:6]):
        clean = sent.strip(" „«»\"'!?.,;:").split()
        if not clean:
            continue
        # Prefer nouns-ish later tokens for DE articles
        word = clean[0]
        if lang == "de" and word.lower() in {"der", "die", "das", "ein", "eine"} and len(clean) > 1:
            word = f"{clean[0]} {clean[1]}"
        if lang in {"es", "fr", "it"} and word.lower() in {
            "el", "la", "los", "las", "un", "una",
            "le", "les", "un", "une",
            "il", "lo", "gli", "i", "le",
        } and len(clean) > 1:
            word = f"{clean[0]} {clean[1]}"
        key = word.lower()
        if key in seen or len(word) < 2:
            continue
        seen.add(key)
        gloss_pl = pl_lines[i].strip(" „«»\"'!?.,;:").split()[:2]
        gloss_en = en_lines[i].strip(" „«»\"'!?.,;:").split()[:2]
        items.append(
            {
                "word": word.strip("„«»\"'"),
                "gloss": {
                    "pl": " ".join(gloss_pl) if gloss_pl else word,
                    "en": " ".join(gloss_en) if gloss_en else word,
                },
                "pos": "phrase",
            }
        )
        if len(items) >= 5:
            break
    return items


def make_questions(story_id: str, lang: str, sentences: list[str], pl: list[str], en: list[str]):
    first_pl, last_pl = pl[0], pl[-1]
    first_en, last_en = en[0], en[-1]
    prompts = {
        "de": ("Was passiert am Anfang?", "Was passiert am Ende?"),
        "es": ("¿Qué pasa al principio?", "¿Qué pasa al final?"),
        "en": ("What happens at the beginning?", "What happens at the end?"),
        "fr": ("Que se passe-t-il au début ?", "Que se passe-t-il à la fin ?"),
        "it": ("Cosa succede all'inizio?", "Cosa succede alla fine?"),
    }
    p1, p2 = prompts[lang]
    return [
        {
            "id": f"{story_id}-q1",
            "type": "comprehension",
            "prompt": {
                "en": "What happens at the beginning?",
                "pl": "Co dzieje się na początku?",
                lang: p1,
            },
            "acceptedAnswers": {
                "en": [first_en, en[0]],
                "pl": [first_pl, pl[0]],
                lang: [sentences[0]],
            },
            "explanation": {
                "en": first_en,
                "pl": first_pl,
            },
        },
        {
            "id": f"{story_id}-q2",
            "type": "comprehension",
            "prompt": {
                "en": "What happens at the end?",
                "pl": "Co dzieje się na końcu?",
                lang: p2,
            },
            "acceptedAnswers": {
                "en": [last_en, en[-1]],
                "pl": [last_pl, pl[-1]],
                lang: [sentences[-1]],
            },
            "explanation": {
                "en": last_en,
                "pl": last_pl,
            },
        },
    ]


def convert_stories():
    legacy = json.loads((BASE / "stories.json").read_text(encoding="utf-8"))
    by_lang = {"de": [], "es": []}
    for s in legacy:
        sid = s["id"]
        en = EN_LINES[sid]
        pl = s["lines"]["pl"]
        assert len(en) == len(pl) == len(s["lines"]["de"]) == len(s["lines"]["es"]), sid
        minutes = {"A0": 2, "A1": 2, "A2": 3, "B1": 4, "B2": 5}[s["level"]]
        for lang in ("de", "es"):
            sentences = s["lines"][lang]
            new_id = f"{lang}-{sid}"
            titles = {
                lang: s["titles"][lang],
                "pl": s["titles"]["pl"],
                "en": TITLE_EN[sid],
            }
            # keep the other romance/germanic title as secondary display aid
            other = "es" if lang == "de" else "de"
            titles[other] = s["titles"][other]
            by_lang[lang].append(
                {
                    "id": new_id,
                    "legacyId": sid,
                    "targetLang": lang,
                    "level": s["level"],
                    "kind": s["kind"],
                    "category": CATEGORY.get(s["kind"], "everyday"),
                    "estimatedMinutes": minutes,
                    "titles": titles,
                    "sentences": sentences,
                    "translations": {"pl": pl, "en": en},
                    "vocabulary": extract_vocab(sentences, lang, pl, en),
                    "questions": make_questions(new_id, lang, sentences, pl, en),
                    "audioRecommended": bool(s.get("audioRecommended")),
                }
            )
    OUT_STORIES.mkdir(parents=True, exist_ok=True)
    for lang, items in by_lang.items():
        path = OUT_STORIES / f"{lang}.json"
        path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path} ({len(items)} stories)")


def convert_vocab():
    legacy = json.loads((BASE / "legacy-words.json").read_text(encoding="utf-8"))
    # English glosses for Polish weekend nouns (shared meaning)
    PL_TO_EN = {
        "lalka": "doll",
        "piłka": "ball",
        "dłoń": "hand",
        "noga": "leg",
        "głowa": "head",
        "dom": "house",
        "drzwi": "door",
        "okno": "window",
        "stół": "table",
        "krzesło": "chair",
        "kot": "cat",
        "pies": "dog",
        "ptak": "bird",
        "ryba": "fish",
        "mysz": "mouse",
        "matka": "mother",
        "ojciec": "father",
        "brat": "brother",
        "siostra": "sister",
        "dziecko": "child",
        "chleb": "bread",
        "mleko": "milk",
        "woda": "water",
        "jabłko": "apple",
        "ser": "cheese",
        "koszula": "shirt",
        "spodnie": "trousers",
        "buty": "shoes",
        "kurtka": "jacket",
        "czapka": "cap",
        "szkoła": "school",
        "książka": "book",
        "ołówek": "pencil",
        "zeszyt": "notebook",
        "plecak": "backpack",
        "miasto": "city",
        "ulica": "street",
        "sklep": "shop",
        "park": "park",
        "most": "bridge",
        "drzewo": "tree",
        "kwiat": "flower",
        "rzeka": "river",
        "góra": "mountain",
        "las": "forest",
        "słońce": "sun",
        "deszcz": "rain",
        "śnieg": "snow",
        "wiatr": "wind",
        "chmura": "cloud",
        "godzina": "hour",
        "dzień": "day",
        "tydzień": "week",
        "miesiąc": "month",
        "rok": "year",
        "pociąg": "train",
        "autobus": "bus",
        "bilety": "tickets",
        "bilet": "ticket",
        "walizka": "suitcase",
        "mapa": "map",
        "praca": "work",
        "biuro": "office",
        "spotkanie": "meeting",
        "szef": "boss",
        "kolega": "colleague",
        "komputer": "computer",
        "telefon": "phone",
        "ekran": "screen",
        "hasło": "password",
        "aplikacja": "app",
        "zdrowie": "health",
        "lekarz": "doctor",
        "apteka": "pharmacy",
        "ból": "pain",
        "leki": "medicine",
        "sport": "sport",
        "piłka nożna": "football",
        "bieg": "run",
        " basen": "pool",
        "basen": "pool",
        "rower": "bicycle",
        "radość": "joy",
        "smutek": "sadness",
        "strach": "fear",
        "złość": "anger",
        "spokój": "calm",
    }

    OUT_VOCAB.mkdir(parents=True, exist_ok=True)
    for lang in ("de", "es"):
        weeks_out = []
        for wi, week in enumerate(legacy[lang], start=1):
            words = []
            for wi2, w in enumerate(week["words"], start=1):
                pl = w["pl"]
                en = PL_TO_EN.get(pl.lower(), pl)
                article = None
                token = w["word"]
                parts = token.split(None, 1)
                if lang == "de" and parts and parts[0].lower() in {"der", "die", "das"}:
                    article = parts[0].lower()
                if lang == "es" and parts and parts[0].lower() in {"el", "la", "los", "las", "un", "una"}:
                    article = parts[0].lower()
                words.append(
                    {
                        "id": f"{lang}-w{wi:02d}-{wi2:02d}",
                        "word": token,
                        "article": article,
                        "example": "",
                        "gloss": {"pl": pl, "en": en},
                        "pos": "noun",
                        "legacy": True,
                    }
                )
            weeks_out.append(
                {
                    "week": wi,
                    "title": {"pl": week["title"], "en": week["title"]},
                    "words": words,
                }
            )
        path = OUT_VOCAB / f"{lang}.json"
        path.write_text(json.dumps(weeks_out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path} ({len(weeks_out)} weeks)")


def main():
    convert_stories()
    convert_vocab()
    # validate
    for lang in ("de", "es"):
        stories = json.loads((OUT_STORIES / f"{lang}.json").read_text(encoding="utf-8"))
        assert len(stories) == 50, lang
        from collections import Counter

        c = Counter(s["level"] for s in stories)
        assert all(c[l] == 10 for l in ("A0", "A1", "A2", "B1", "B2")), c
        for s in stories:
            assert len(s["sentences"]) == len(s["translations"]["pl"]) == len(s["translations"]["en"])
    print("migration OK")


if __name__ == "__main__":
    main()
