# LangLab PWA — German & Spanish

Gotowa statyczna aplikacja do nauki niemieckiego i hiszpańskiego. Nie wymaga Node.js, kompilacji, bazy danych ani konta.

## Co zawiera

- **100 tekstów**: po **50 czytanek w każdym języku** — 10 na każdym poziomie A0, A1, A2, B1 i B2.
- Krótkie opowiadania i dialogi. Każde zdanie ma polskie tłumaczenie, które można ukryć.
- Odsłuch pojedynczych zdań i całej historii syntezatorem mowy urządzenia; wybór głosu i prędkości, jeśli są dostępne.
- Tryb „Tylko czytanie” bez przycisków audio.
- Dwa pytania dotyczące każdej czytanki z przykładowymi odpowiedziami do odkrycia.
- Pole do pisemnego odtworzenia opowiadania z możliwością skopiowania do ChatGPT do korekty.
- **52 weekendowe zestawy po 5 rzeczowników na każdy język** (260 kart / język) plus własne fiszki.
- Tygodniowy plan (od poniedziałku do piątku czytanki i ćwiczenia, w weekend fiszki).
- Osobne postępy dla niemieckiego i hiszpańskiego, zaliczanie tekstów, powtórki fiszek i eksport/import JSON.
- Instalację na ekranie głównym Androida po opublikowaniu na HTTPS, działanie offline po pierwszym pełnym załadowaniu.

## Jak zainstalować na Androidzie — sposób zalecany

Aby aplikacja była **prawdziwą PWA**, pliki muszą być serwowane przez HTTPS (lub localhost podczas testów). Sam plik HTML z folderu Pobrane **nie zainstaluje PWA**.

### Opcja A: GitHub Pages

1. Utwórz nowe publiczne repozytorium na GitHub, np. `langlab`.
2. Wgraj **zawartość** paczki PWA tak, żeby `index.html` leżał w głównym katalogu repozytorium (nie w dodatkowym folderze).
3. W repozytorium wybierz **Settings → Pages → Build and deployment → Deploy from a branch** i ustaw `main` oraz `/ (root)`.
4. Po opublikowaniu otwórz otrzymany adres `https://TWOJ_LOGIN.github.io/langlab/` w Chrome na telefonie.
5. Naciśnij menu **⋮ → Zainstaluj aplikację** albo **Dodaj do ekranu głównego**.
6. Otwórz aplikację raz z internetem; po zapisaniu plików przez service workera teksty działają offline.

### Opcja B: Netlify

1. Rozpakuj ZIP na komputerze.
2. W Netlify użyj metody ręcznej publikacji, wskazując **folder z `index.html`** (np. przez Netlify Drop).
3. Otwórz opublikowany adres HTTPS w Chrome na Androidzie, zainstaluj z menu ⋮.

### Test na komputerze, bez publikacji

W folderze z `index.html` wykonaj:

```bash
python3 -m http.server 8000
```

Otwórz `http://localhost:8000`. Test serwera `localhost` nadaje się również do service workera i instalacji na komputerze.

## Test odsłuchiwania na Androidzie

1. Otwórz czytankę i naciśnij **▶ obok pojedynczego zdania**.
2. Jeśli nie słychać: sprawdź głośność multimediów, wybierz inny głos na liście i ustaw tempo 1×.
3. W ustawieniach Androida wyszukaj **Zamiana tekstu na mowę / Text-to-speech output** i sprawdź, czy są dostępne głosy **de-DE** oraz **es-ES**.
4. W Chrome odczyt może korzystać z usług Androida. Nie każdy głos zadziała offline; aplikacja nie zawiera plików lektorskich ani nagrań MP3.

Odsłuch jest realizowany przez Web Speech API, a nie odtwarzacz MP3. W zależności od wersji Androida i usług mowy zachowanie może się różnić.

## Przeniesienie postępów ze starego LangLab

1. W starej aplikacji otwórz „Plan” → **Eksportuj postępy JSON**.
2. W nowej PWA otwórz **Postępy → Importuj JSON**.
3. Sprawdź zadania, własne fiszki i wyniki po imporcie.

Pamięć PWA i starego pliku HTML **nie synchronizują się automatycznie** (różne adresy pochodzenia). Dane trzymane są lokalnie, bez konta i bez automatycznego backupu w chmurze. Eksportuj regularnie JSON.

## Pliki

- `index.html` — interfejs.
- `styles.css` — styl mobilny i desktopowy.
- `app.js` — interakcje, Web Speech API, postępy, fiszki.
- `stories.json` — 50 dwujęzycznych zestawów historii (każdy w wersjach DE, ES, PL).
- `legacy-words.json` — tygodniowe rzeczowniki i fiszki.
- `sw.js` — cache offline.
- `manifest.webmanifest`, `icons/` — instalacja PWA i ikona.
- `README.md` — instrukcja.

## Aktualizacje

Po zmianie zawartości aplikacji opublikuj zaktualizowane pliki pod tym samym adresem. Jeżeli chcesz wymusić odświeżenie cache PWA, zwiększ numer `CACHE` w `sw.js`; przeglądarka wczyta nową wersję zasobów. Postępy zapisane w `localStorage` pozostaną, chyba że dane strony zostaną ręcznie usunięte.

## Zakres i ograniczenia

Teksty na poziomach B1/B2 to krótkie czytanki o bardziej złożonym słownictwie i składni; nie stanowią pełnego kursu certyfikacyjnego B2. Pytania to ćwiczenia z przykładowymi odpowiedziami, a nie automatycznie oceniany egzamin. Aplikacja sama nie poprawia pisanych tekstów, lecz przygotowuje prompt do ChatGPT. Interfejs był sprawdzany w przeglądarce Chromium z symulowanym syntezatorem; działanie rzeczywistych głosów Androida wymaga sprawdzenia na urządzeniu.
