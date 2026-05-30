---
project: "Omnilister AI"
version: 1
status: draft
created: 2026-05-30
updated: 2026-05-30
ai_provider: openai
prd_version: 2
main_goal: speed
top_blocker: capacity
---

# Roadmap: Omnilister AI

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Sprzedawcy polskich marketplace'ów (Vinted, Allegro, Otodom, Otomoto) tracą sprzedaż przez słabe zdjęcia — źle skadrowane, nieostre, bez profesjonalnego tła. Omnilister AI rozwiązuje ten problem inaczej niż typowe filtry: rozumie *co* jest na zdjęciu i *dlaczego* jest sprzedawane, i dobiera transformacje pod cel sprzedażowy, nie tylko wizualny efekt. Kluczowa cecha wyróżniająca produkt (wedge — jedna właściwość, której usunięcie sprawiłoby, że aplikacja jest nie do odróżnienia od zwykłego edytora) to kontekstowa transformacja sprzedażowa: AI zna kategorię obiektu (samochód / mieszkanie / rzecz) i dobiera transformację pod konkretny marketplace. Mierzalny dowód wartości: quality score po transformacji wyższy niż przed, z potwierdzeniem od użytkownika (feedback: poprawa / brak poprawy).

## North star

**S-03: Sesja transformacji AI** — najmniejszy kompletny przepływ end-to-end (upload → scoring → transformacja → podgląd przed/po → zapis), który udowadnia, że hipoteza produktowa jest prawdziwa.

> Gwiazda przewodnia (north star) to najwcześniej możliwy do zaplanowania pionowy przepływ, którego pomyślna realizacja dowodzi, że rdzeń produktu działa — umieszczony tak wcześnie w sekwencji, jak pozwalają na to zależności. Wszystko przed S-03 to warunki wstępne; wszystko po S-03 to rozwinięcie. Sekwencjonujemy agresywnie: cel główny to `speed`, więc każda godzina deweloperska trafia w must-have path.

## At a glance

| ID    | Change ID                   | Outcome (user can …)                                               | Prerequisites    | PRD refs                                               | Status   |
| ----- | --------------------------- | ------------------------------------------------------------------ | ---------------- | ------------------------------------------------------ | -------- |
| F-01  | db-schema-storage           | (foundation) schemat DB + buckety Storage gotowe i izolowane      | —                | NFR (izolacja per-konto), FR-003, FR-005, FR-009, FR-012, FR-013 | ready    |
| S-01  | object-and-photo-upload     | stworzyć obiekt, wgrać zdjęcia i przeglądać galerię               | F-01             | FR-001, FR-002, FR-003, FR-005, FR-006                 | proposed |
| S-02  | ai-analysis-score           | zobaczyć kategorię i quality score zaproponowane przez AI          | F-01, S-01       | FR-004, FR-007, FR-008, FR-009                         | proposed |
| S-03  | ai-transformation-session   | wybrać styl, zlecić transformację, zobaczyć przed/po i zapisać    | F-01, S-01, S-02 | FR-010, FR-011, FR-012                                 | proposed |
| S-04  | global-style-library        | opublikować własny styl/prompt w globalnej bibliotece              | F-01, S-03       | FR-013                                                 | proposed |

## Baseline

What's already in place in the codebase as of 2026-05-30 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6.3.1 + React 19.2.6, routing plikowy, strony auth (`src/pages/auth/`), Radix UI slot + CVA + Tailwind; brak stron produktowych (biblioteka obiektów, edytor AI)
- **Backend / API:** partial — trasy auth (signin, signup, signout w `src/pages/api/auth/`) + middleware chroniący `/dashboard`; brak tras produktowych (obiekty, storage, AI)
- **Data:** partial — klient Supabase skonfigurowany (`src/lib/supabase.ts` z `@supabase/ssr`); brak schematu DB i migracji (Supabase `config.toml` ma `schema_paths = []`)
- **Auth:** present — pełny flow: rejestracja (`FR-001`), logowanie (`FR-002`), wylogowanie; middleware blokujący nieuwierzytelnionych użytkowników; formularze (`SignInForm.tsx`, `SignUpForm.tsx`)
- **Deploy / infra:** present — `wrangler.jsonc` skonfigurowany, cel: Cloudflare Workers, GitHub Actions CI z auto-deploy-on-merge
- **Observability:** absent — brak logowania, error trackingu, metryk; tylko `wrangler tail` dostępny natywnie

## Foundations

### F-01: Schemat bazy danych i buckety Storage

- **Outcome:** (foundation) schemat DB (tabele: `objects`, `photos`, `quality_scores`, `transformations`, `styles`) + buckety Supabase Storage (`original-photos`, `transformed-photos`) gotowe; Row Level Security skonfigurowane per-konto; migracje uruchomione lokalnie.
- **Change ID:** db-schema-storage
- **PRD refs:** NFR (izolacja per-konto), FR-003, FR-005, FR-009, FR-012, FR-013
- **Unlocks:** S-01 (potrzebuje tabel `objects` + `photos`), S-02 (potrzebuje tabeli `quality_scores`), S-03 (potrzebuje tabeli `transformations` + bucketu `transformed-photos`), S-04 (potrzebuje tabeli `styles` z flagą publiczna/prywatna)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - ~~Górne limity per konto nie zdefiniowane~~ — Rozwiązane 2026-05-30: `Max_Client_Repository = 100 MB` per konto (`src/lib/config.ts`). Schemat musi śledzić `storage_used_bytes` per konto (kolumna w tabeli `accounts` lub agregat z tabeli `photos`) i egzekwować limit przed każdym wgraniem. Block: resolved.
- **Risk:** Pominięcie Row Level Security w Supabase na tym etapie oznacza, że zdjęcia jednego użytkownika będą widoczne dla innych — naruszenie guardrail `izolacja per-konto`. RLS musi być wdrożone razem ze schematem, nie jako późniejsza poprawka, bo retroaktywne dodawanie RLS do zaludnionych tabel wymaga testowania na danych produkcyjnych.
- **Status:** ready

## Slices

### S-01: Tworzenie obiektu i wgrywanie zdjęć

- **Outcome:** user can stworzyć obiekt (nazwa + numer wersji), wgrać do niego zdjęcia i przeglądać galerię miniaturek wcześniej wgranych zdjęć.
- **Change ID:** object-and-photo-upload
- **PRD refs:** FR-001, FR-002, FR-003, FR-005, FR-006; US-01 (first part)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Cloudflare Workers ma limit 100 MB ciała żądania (64 MB na Free) — zdjęcia wysokiej rozdzielczości muszą trafiać bezpośrednio do Supabase Storage przez signed upload URLs, a nie przez Worker. Błędny routing spowoduje błąd 413 dla realnych zdjęć użytkownika i nie pojawi się w lokalnym `wrangler dev`.
- **Status:** proposed

### S-02: Analiza AI — kategoria, cechy i quality score

- **Outcome:** user can po wgraniu zdjęć zobaczyć: zaproponowaną kategorię obiektu (samochód / mieszkanie / rzecz) do potwierdzenia lub zmiany, cechy wykryte przez AI do korekty, oraz quality score per-zdjęcie per-wymiar (ostrość, oświetlenie, tło, cechy obiektu, uszkodzenia/defekty, napisy/etykiety, pokrycie kątów, sales readiness).
- **Change ID:** ai-analysis-score
- **PRD refs:** FR-004, FR-007, FR-008, FR-009; US-01 (analysis part)
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - ~~Który zewnętrzny serwis AI do scoringu jakości i detekcji kategorii?~~ — Rozwiązane 2026-05-30: **OpenAI** (GPT-4o Vision) wybrany do analizy zdjęć, detekcji kategorii i quality scoringu. Block: resolved.
  - ~~Wagi i progi wymiarów quality score — jak obliczyć score sumaryczny?~~ — Rozwiązane 2026-05-30: próg sales readiness = 7/10 (70% parametru każdej metryki). Wagi per kategoria do zdefiniowania w implementacji S-02; sumaryczny próg gotowości ustalony. Block: resolved.
- **Risk:** Projekt scoringu per kategoria (8 wymiarów × 3 kategorie = 24 konfiguracje) jest największym wyzwaniem projektowym MVP — błędnie skalibrowany score podważa główne kryterium sukcesu. Zalecana walidacja manualna (kilka zdjęć testowych per kategoria) przed integracją UI, żeby weryfikacja score była możliwa bez uruchamiania pełnego przepływu.
- **Status:** proposed

### S-03: Sesja transformacji AI — podgląd przed/po i zapis

- **Outcome:** user can wybrać styl transformacji z globalnej biblioteki (lub wpisać własny prompt), zlecić transformację wybranych zdjęć, zobaczyć draft w ciągu 5 sekund i pełną wersję w ciągu 60 sekund, porównać before/after z numerycznym score'em i zapisać wybrane przetransformowane zdjęcia w bibliotece obiektu.
- **Change ID:** ai-transformation-session
- **PRD refs:** FR-010, FR-011, FR-012; US-01 (transformation part — north star)
- **Prerequisites:** F-01, S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - ~~Który zewnętrzny serwis AI do transformacji zdjęć?~~ — Rozwiązane 2026-05-30: **OpenAI** (GPT-4o lub DALL-E 3) wybrany do transformacji obrazów. Block: resolved.
  - Polityka prywatności zdjęć wysyłanych do zewnętrznego serwisu AI (GDPR / UODO) — Owner: właściciel produktu. Block: no (nie blokuje MVP; wymagane przed publicznym launchem, per PRD Open Question #1).
- **Risk:** NFR "draft < 5 sekund + pełna transformacja < 60 sekund" wymaga asynchronicznego UI — Worker może czekać na AI API bez limitu CPU (czas sieciowy nie liczy się do CPU quota na Cloudflare Workers), ale UI musi implementować polling lub streaming, inaczej użytkownik zobaczy pusty ekran przez 60 sekund i uzna że aplikacja nie działa.
- **Status:** proposed

### S-04: Globalna biblioteka stylów

- **Outcome:** user can opublikować własny styl/prompt transformacji pod nazwą w globalnej bibliotece dostępnej dla wszystkich użytkowników; każdy użytkownik może przeglądać bibliotekę i wybierać cudze style przy transformacji.
- **Change ID:** global-style-library
- **PRD refs:** FR-013; US-01 (secondary — style reuse and viral loop)
- **Prerequisites:** F-01, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Publiczna biblioteka bez moderacji może zawierać prompty skłaniające AI do dodawania nieistniejących cech produktu (naruszenie guardrail "no distortion"). Potrzebna przynajmniej polityka moderacji reaktywnej (zgłoszenia) lub automatyczna weryfikacja przed publikacją — zakres do ustalenia przed planowaniem S-04.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                         | Ready for `/10x-plan` | Notes |
| ---------- | --------------------------- | ------------------------------------------------------------- | --------------------- | ----- |
| F-01       | db-schema-storage           | Zaprojektuj schemat DB + buckety Storage (Supabase + RLS)    | yes                   | Uruchom `/10x-plan db-schema-storage` |
| S-01       | object-and-photo-upload     | Tworzenie obiektu + wgrywanie zdjęć + galeria miniaturek     | no                    | Wymaga ukończenia F-01 |
| S-02       | ai-analysis-score           | Analiza AI: kategoria + cechy + quality score per wymiar     | no                    | Wymaga ukończenia F-01 i S-01 |
| S-03       | ai-transformation-session   | Sesja transformacji AI + before/after + zapis wybranych      | no                    | Wymaga ukończenia S-02 |
| S-04       | global-style-library        | Globalna biblioteka stylów/promptów z przeglądaniem          | no                    | Zależy od S-03 |

## Open Roadmap Questions

1. ~~**Polityka prywatności zdjęć przesyłanych do zewnętrznego serwisu AI**~~ — Rozwiązane 2026-05-30: przeniesione do fazy 2 jako FR-P2-001 – FR-P2-007 w PRD (v2). Block: resolved dla MVP; wymagane przed publicznym launchem.
2. ~~**Górne limity retencji i przechowywania danych**~~ — Rozwiązane 2026-05-30: `Max_Client_Repository = 100 MB` per konto; parametr w `src/lib/config.ts`. OpenAI: zero-data-retention (nie przechowuje zdjęć po API response). Block: resolved; F-01 może uwzględnić storage-tracking w schemacie.
3. ~~**Próg quality score "sales readiness"**~~ — Rozwiązane 2026-05-30: 7/10 = minimalne spełnienie 70% parametru każdej metryki (dobre światło, szczegóły, profesjonalne tło, dokładne odzwierciedlenie produktu). Próg jednolity dla wszystkich kategorii; wdrożony jako oznaczenie "gotowe / wymaga poprawy" w UI S-02. Block: resolved.
4. ~~**Wybór zewnętrznego serwisu AI**~~ — Rozwiązane 2026-05-30: **OpenAI** wybrany (GPT-4o Vision do scoringu i detekcji kategorii; GPT-4o / DALL-E 3 do transformacji). Block: resolved.

## Parked

- **Workflow publikacji ogłoszeń** — Why parked: PRD §Non-Goals, faza 2; aplikacja nie publikuje na Vinted / Otodom / Otomoto.
- **Zaawansowane role użytkownika (Agencja, AI Agent)** — Why parked: PRD §Non-Goals, model płaski w MVP; faza 2.
- **Skanowanie 3D** — Why parked: PRD §Non-Goals, oznaczone "NOT MVP".
- **Własny model AI do transformacji** — Why parked: PRD §Non-Goals; MVP korzysta z zewnętrznego API.
- **Connectors do platform marketplace (MCP)** — Why parked: PRD §Non-Goals, faza 2 razem z workflow publikacji.
- **Observability (structured logging, error tracking, metryki)** — Why parked: absent w baseline; przy celu sekwencjonowania `speed` odkładamy — `wrangler tail` + Cloudflare dashboard wystarczą na wczesnych iteracjach; dodać przed publicznym launchem.
- **GDPR / UODO — faza 2 (FR-P2-001 – FR-P2-007)** — Why parked: nie blokuje MVP; wymagane przed publicznym launchem. Zakres: zgoda przy rejestracji (FR-P2-001), modal informacyjny przed AI (FR-P2-002), Polityka Prywatności (FR-P2-003), Regulamin (FR-P2-004), usunięcie konta i danych (FR-P2-005), eksport danych (FR-P2-006), wycofanie zgody AI (FR-P2-007). Szczegóły w PRD v2 §Faza 2.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)
