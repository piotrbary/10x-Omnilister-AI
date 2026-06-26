---
project: "Omnilister AI"
version: 2
status: draft
created: 2026-06-26
updated: 2026-06-26
prd_version: 2
main_goal: quality
top_blocker: capacity
---

# Roadmap: Omnilister AI

> Derived from `context/foundation/prd.md` (v2) + Event Storming board (`event-storming/board.json`, 7 hotspotów zamkniętych) + domain distillation (`context/domain/01-domain-distillation.md`) + layer-spread research (`context/changes/core-layer-spread/research.md`).
> v1 (2026-05-30) zarchiwizowane → `context/foundation/archive/2026-06-26-roadmap.md`.
> Edit-in-place; archive when superseded.
> Slices poniżej posortowane w kolejności zależności. Tabela "At a glance" jest indeksem.

## Vision recap

Sprzedawcy polskich marketplace'ów (Vinted, Allegro, Otodom, Otomoto) tracą sprzedaż przez słabe zdjęcia. Omnilister AI odróżnia się od typowych edytorów jedną właściwością — **kontekstową transformacją sprzedażową**: AI zna kategorię obiektu (samochód / mieszkanie / rzecz) i dobiera transformacje pod konkretny marketplace, nie tylko pod wizualny efekt. Mierzalny dowód tej wartości to quality score po transformacji wyższy niż przed, potwierdzony przez użytkownika (feedback: poprawa / brak poprawy).

MVP (F-01 + S-01–S-04) jest wdrożony. Roadmap v2 sekwencjonuje zmiany post-MVP wynikające z Event Stormingu — egzekucję niezmienników domenowych i domknięcie otwartych ryzyk jakościowych — w kolejności **wartość × ryzyko biznesowe**.

## North star

**S-05: Score regression guard** — serwer egzekwuje `score_after > score_before` zamiast pozostawiać to checkbox'owi UI.

> Gwiazda przewodnia (north star) — najmniejszy end-to-end slice, którego pomyślna realizacja dowodzi, że rdzeń produktu faktycznie spełnia PRD §Primary Success Criteria. S-03 (sesja transformacji) jest wdrożone, ale nie egzekwuje głównego kryterium sukcesu; S-05 domknuje tę lukę. Plan `context/changes/score-regression-guard/plan.md` istnieje — następny krok to `/10x-implement score-regression-guard phase 1`.

## At a glance

| ID    | Change ID                      | Outcome (user can …)                                                         | Prerequisites          | PRD refs                                       | Status   |
| ----- | ------------------------------ | ---------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------- | -------- |
| F-01  | db-schema-storage              | (foundation) schemat DB + buckety Storage gotowe i izolowane per-konto       | —                      | NFR (izolacja), FR-003, FR-005, FR-009, FR-012, FR-013 | ready    |
| S-01  | object-and-photo-upload        | stworzyć obiekt, wgrać zdjęcia i przeglądać galerię                          | F-01                   | FR-001, FR-002, FR-003, FR-005, FR-006; US-01  | ready    |
| S-02  | ai-analysis-score              | zobaczyć kategorię, cechy i quality score zaproponowane przez AI              | F-01, S-01             | FR-004, FR-007, FR-008, FR-009; US-01          | ready    |
| S-03  | ai-transformation-session      | wybrać styl, zlecić transformację, zobaczyć przed/po i zapisać               | F-01, S-01, S-02       | FR-010, FR-011, FR-012; US-01                  | ready    |
| S-04  | global-style-library           | opublikować własny styl w globalnej bibliotece                                | F-01, S-03             | FR-013; US-01                                  | ready    |
| S-05  | score-regression-guard         | zapisać tylko transformację, która poprawia score; dostać 409 + delta gdy nie | S-03                   | §Primary SC, FR-012; US-01 AC                  | ready    |
| S-06  | style-ai-moderation            | wiedzieć, że opublikowany styl przeszedł AI guardrail check                  | S-04                   | §Guardrails, FR-013                            | proposed |
| S-07  | feedback-popularity-sort       | widzieć bibliotekę stylów posortowaną wg popularności (positive_count)        | S-03, S-04             | §Secondary SC, FR-013; US-01                   | proposed |
| S-08  | category-rescore-on-correction | po zmianie kategorii dostać ponownie obliczony score_before z nowymi wagami   | S-02                   | FR-008, FR-009; US-01                          | proposed |
| S-09  | batch-completion-summary       | zobaczyć podsumowanie batcha (ile gotowych / ile failed) po zakończeniu       | S-03                   | FR-011; US-01 AC                               | proposed |

## Streams

Navigation aid — grupy elementów dzielące wspólny łańcuch zależności. Kanoniczne sortowanie żyje w grafie zależności poniżej; ta tabela to proponowany porządek czytania przez równoległe tory.

| Stream | Tema                   | Łańcuch                                              | Nota                                                                      |
| ------ | ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| A      | Core MVP trunk         | `F-01` → `S-01` → `S-02` → `S-03` → `S-04`          | Główny trunk MVP; wszystkie pozostałe streamy od niego zależą             |
| B      | Score integrity        | `S-03` → `S-05`                                      | #1 priorytet post-MVP — Primary SC enforcement; odgałęzienie od A przy S-03 |
| C      | Style quality          | `S-04` → `S-06` / `S-07` (parallel)                  | Odgałęzienie od A przy S-04; S-06 i S-07 niezależne, mogą biec równolegle |
| D      | Analysis refinement    | `S-02` → `S-08`                                      | Odgałęzienie od A przy S-02; parallel z B, C, E                          |
| E      | Batch UX               | `S-03` → `S-09`                                      | Odgałęzienie od A przy S-03; parallel z B, C, D                          |

## Baseline

Stan codebase'u na 2026-06-26 (tech-stack.md + domain distillation + layer-spread research).
Foundations poniżej zakładają że poniższe warstwy są w miejscu i ich NIE re-scaffoldują.

- **Frontend:** present — Astro 6.3 + React 19; pełny zestaw komponentów UI (ScoreBreakdown, TransformationSession, EditorShell, AnalysisSection, CategorySelector, TransformationJobCard); routing plikowy
- **Backend / API:** present — API routes dla objects/photos/quality-scores/transformations/styles + guest transform; auth middleware (`src/pages/api/`)
- **Data:** present — pełny schemat DB: `objects`, `photos`, `quality_scores`, `transformations`, `styles`, `profiles`; Supabase Storage (`original-photos`, `transformed-photos`) + RLS; trigger śledzący `storage_used_bytes`
- **Auth:** present — Supabase Auth, pełny flow (signup FR-001, signin FR-002, signout), middleware blokujący `/dashboard`
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), GitHub Actions CI z auto-deploy-on-merge
- **Observability:** absent — tylko `wrangler tail`; brak structured logging, error tracking, metryk

## Foundations

### F-01: Schemat bazy danych i buckety Storage

- **Outcome:** (foundation) schemat DB (tabele: `objects`, `photos`, `quality_scores`, `transformations`, `styles`, `profiles`) + buckety Supabase Storage (`original-photos`, `transformed-photos`) gotowe; Row Level Security skonfigurowane per-konto; trigger śledzący `storage_used_bytes`; migracje uruchomione.
- **Change ID:** db-schema-storage
- **PRD refs:** NFR (izolacja per-konto, Max_Client_Repository = 100 MB), FR-003, FR-005, FR-009, FR-012, FR-013
- **Unlocks:** S-01, S-02, S-03, S-04 (wszystkie slices MVP)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pominięcie RLS w Supabase oznaczałoby, że zdjęcia jednego konta są widoczne dla innych — naruszenie NFR izolacji. Według baseline: present; ryzyko historyczne, nie aktualne.
- **Status:** ready

## Slices

### S-01: Tworzenie obiektu i wgrywanie zdjęć

- **Outcome:** user can stworzyć obiekt (nazwa + numer wersji), wgrać do niego zdjęcia przez signed upload URL i przeglądać galerię miniaturek z informacją o zużyciu storage (X MB / 100 MB).
- **Change ID:** object-and-photo-upload
- **PRD refs:** FR-001, FR-002, FR-003, FR-005, FR-006; US-01 (first part)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Cloudflare Workers ma limit ciała żądania — zdjęcia muszą trafiać bezpośrednio do Supabase Storage przez signed URLs; błędny routing = 413 dla realnych zdjęć. Rozwiązane w implementacji (`upload-url.ts`).
- **Status:** ready

### S-02: Analiza AI — kategoria, cechy i quality score

- **Outcome:** user can po wgraniu zdjęć zobaczyć: zaproponowaną kategorię (samochód / mieszkanie / rzecz) do potwierdzenia lub zmiany, cechy wykryte przez AI, oraz quality score per-zdjęcie per-wymiar (ostrość, oświetlenie, tło, cechy, uszkodzenia, napisy, pokrycie kątów, sales readiness) z progiem sales readiness = 7/10.
- **Change ID:** ai-analysis-score
- **PRD refs:** FR-004, FR-007, FR-008, FR-009; US-01 (analysis part)
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wagi per-kategoria niezakalibrowane (wszystkie = 1 per `config.ts:98–102`; komentarz „Calibrate per category before public launch") — scoring samochodu i mieszkania identyczny jak przedmiotu codziennego. Medium-severity rozjazd D-6; do adresowania przed publicznym launchem.
- **Status:** ready

### S-03: Sesja transformacji AI — podgląd przed/po i zapis

- **Outcome:** user can wybrać styl transformacji z globalnej biblioteki (lub wpisać własny prompt), zlecić transformację wybranych zdjęć, porównać before/after z numerycznym score'em i zapisać wybrane przetransformowane zdjęcia w bibliotece obiektu.
- **Change ID:** ai-transformation-session
- **PRD refs:** FR-010, FR-011, FR-012; US-01 (transformation part — north star MVP)
- **Prerequisites:** F-01, S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Polityka prywatności zdjęć wysyłanych do OpenRouter (GDPR / UODO) — Owner: właściciel produktu. Block: no (nie blokuje MVP; wymagane przed publicznym launchem, per PRD FR-P2-001–FR-P2-007).
- **Risk:** NFR „draft < 5 sekund" jest nierealizowanym wymaganiem (evt-8 PARKOWANY, hot-1). Brak dwufazowego pipeline'u — transformacja synchroniczna, brak draft preview. Marker ryzyka D-4.
- **Status:** ready

### S-04: Globalna biblioteka stylów

- **Outcome:** user can opublikować własny styl/prompt transformacji pod nazwą w globalnej bibliotece dostępnej dla wszystkich użytkowników; każdy użytkownik może przeglądać bibliotekę i wybierać cudze style przy transformacji.
- **Change ID:** global-style-library
- **PRD refs:** FR-013; US-01 (secondary — style reuse and viral loop)
- **Prerequisites:** F-01, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Publiczna biblioteka bez moderacji może zawierać prompty skłaniające AI do dodawania nieistniejących cech (naruszenie guardrail no-distortion, D-7). Adresowane przez S-06.
- **Status:** ready

---

> Poniższe slices (S-05–S-09) to zmiany post-MVP wynikające z Event Stormingu (7 zamkniętych hotspotów).
> Sekwencja: wartość × ryzyko biznesowe (R-1 › R-3 › R-4 › R-6 › hot-4).

---

### S-05: Score regression guard — server-side enforcement

- **Outcome:** user can zapisać transformację tylko gdy `score_after > score_before`; serwer zwraca 409 z deltą gdy warunek nie jest spełniony; UI pokazuje modal z deltą i przyciskiem „Zachowaj mimo to" (override_regression: true).
- **Change ID:** score-regression-guard
- **PRD refs:** §Primary Success Criteria: „Quality score zdjęć po transformacji jest wyższy niż przed"; FR-012; US-01 AC: „Quality score zdjęć po transformacji jest wyższy niż przed (per-kategoria algorytm)"
- **Prerequisites:** S-03
- **Parallel with:** S-08, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Główne kryterium sukcesu produktu (D-1) jest dziś całkowicie ignorowane — serwer zapisuje transformacje bez porównania score_after vs score_before. Plan `context/changes/score-regression-guard/plan.md` istnieje (4 fazy); Phase 0 rename camelCase + Phase 1 domain layer to krytyczne fundamenty. Blast radius: `save.ts`, `TransformationJobAggregate`, `TransformationSession.tsx`. Brak powrotu po Phase 2 (save.ts w pełni zastąpiony).
- **Status:** ready

### S-06: Style publication AI guardrail

- **Outcome:** user can wiedzieć, że styl przed publikacją w globalnej bibliotece przeszedł AI guardrail check; style naruszające guardrail no-distortion są odrzucane z wyjaśnieniem (pol-7 + evt-13).
- **Change ID:** style-ai-moderation
- **PRD refs:** §Guardrails: „Transformacja nie może zniekształcać produktu: aplikacja nie dodaje cech, których produkt nie posiada"; FR-013
- **Prerequisites:** S-04
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:**
  - Jaki model do guardrail check (cost vs precision)? Previewowy GPT-4o-mini jak w on-demand scoring? — Owner: deweloper. Block: no (można defaultować do najtańszego dostępnego w OpenRouter).
- **Risk:** Brak moderacji (D-7) oznacza że publiczna biblioteka może zawierać prompty obchodzące guardrail no-distortion. `buildPrompt` appenduje guardrail do WYKONANIA transformacji, ale nie weryfikuje TREŚCI samego promptu przed publikacją. Adresowanie resolves S-04's Risk.
- **Status:** proposed

### S-07: Feedback → popularity sorting

- **Outcome:** user can widzieć globalną bibliotekę stylów posortowaną według popularności (`positive_count`); feedback „poprawa" inkrementuje `positive_count` wybranego stylu (pol-8 + evt-12 + rm-3).
- **Change ID:** feedback-popularity-sort
- **PRD refs:** §Secondary Success Criteria: „Biblioteka zapisanych stylów/promptów skraca czas kolejnej transformacji podobnego obiektu"; FR-013
- **Prerequisites:** S-03, S-04
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Feedback jest dziś opcjonalny (D-2) — endpoint istnieje ale `status = saved` nie wymaga feedbacku; brak danych do sortowania biblioteki. Wymaga rozróżnienia: feedback pozostaje opcjonalny (sprzedawca może nie chcieć oceniać), ale `positive_count` inkrementuje tylko przy jawnym „poprawa". Race condition przy równoległym feedback: ostateczna konsekwencja — pominięty inkrement. Acceptable dla MVP.
- **Status:** proposed

### S-08: Category rescore on correction

- **Outcome:** user can po zmianie kategorii obiektu automatycznie zobaczyć ponownie obliczony `score_before` z wagami właściwymi dla nowej kategorii (pol-2 + evt-17), bez potrzeby ręcznego ponownego uruchamiania analizy.
- **Change ID:** category-rescore-on-correction
- **PRD refs:** FR-008: „Użytkownik może potwierdzić lub zmienić kategorię zaproponowaną przez aplikację"; FR-009: „algorytm scoringu jest specyficzny dla kategorii"; US-01
- **Prerequisites:** S-02
- **Parallel with:** S-05, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Dziś po korekcie kategorii score_before i score_after są nieporównywalne — obliczone z różnymi wagami (D-5, D-6). Użytkownik widzi delta score, który nie uwzględnia zmiany kategorii. Medium severity; priorytet niższy niż S-05 (kryterium sukcesu) i S-06 (guardrail), ale ważny dla wiarygodności scoringu.
- **Status:** proposed

### S-09: Batch completion summary

- **Outcome:** user can po zakończeniu transformacji wsadowej zobaczyć podsumowanie batcha: ile zdjęć gotowych, ile failed, z możliwością ponowienia failed (pol-5 + evt-22 + rm-5).
- **Change ID:** batch-completion-summary
- **PRD refs:** FR-011: „Aplikacja może wykonać transformację wybranych zdjęć i pokazać podgląd przed/po"; US-01 AC: „Sprzedawca może wybrać, które transformacje zachować w bibliotece"
- **Prerequisites:** S-03
- **Parallel with:** S-05, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Dziś UI nie ma zdarzenia „batch ukończony" — polling indywidualnych statusów bez agregacji. Użytkownik nie wie kiedy cały batch jest gotowy do decyzji o zapisie. Najniższy priorytet spośród nowych slices — UX improvement, nie integrity issue.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                                    | Ready for `/10x-plan` | Notes                                                    |
| ---------- | --------------------------- | ------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------- |
| F-01       | db-schema-storage           | Schemat DB + buckety Storage + RLS (Supabase)                           | yes                   | Zrealizowane; `/10x-archive db-schema-storage` aby oznaczyć done |
| S-01       | object-and-photo-upload     | Tworzenie obiektu + wgrywanie zdjęć + galeria                           | yes                   | Zrealizowane; `/10x-archive object-and-photo-upload`     |
| S-02       | ai-analysis-score           | Analiza AI: kategoria + cechy + quality score per wymiar                | yes                   | Zrealizowane; `/10x-archive ai-analysis-score`           |
| S-03       | ai-transformation-session   | Sesja transformacji AI + before/after + zapis wybranych                 | yes                   | Zrealizowane; `/10x-archive ai-transformation-session`   |
| S-04       | global-style-library        | Globalna biblioteka stylów/promptów z przeglądaniem                     | yes                   | Zrealizowane; `/10x-archive global-style-library`        |
| S-05       | score-regression-guard      | **[#1] Server-side 409 gdy score_after ≤ score_before + UI modal**     | yes — plan gotowy     | **Uruchom `/10x-implement score-regression-guard phase 1`** |
| S-06       | style-ai-moderation         | AI guardrail check przed publikacją stylu w bibliotece globalnej        | yes                   | Uruchom `/10x-plan style-ai-moderation`                  |
| S-07       | feedback-popularity-sort    | Feedback → positive_count++ → biblioteka sortowana wg popularności      | yes                   | Uruchom `/10x-plan feedback-popularity-sort`             |
| S-08       | category-rescore-on-correction | Ponowny scoring po korekcie kategorii (pol-2)                        | yes                   | Uruchom `/10x-plan category-rescore-on-correction`       |
| S-09       | batch-completion-summary    | Podsumowanie batcha transformacji (ile gotowych / ile failed) — pol-5  | yes                   | Uruchom `/10x-plan batch-completion-summary`             |

## Open Roadmap Questions

1. **Kalibracja wag per kategoria** — (`config.ts:98–102`: wszystkie = 1; komentarz „Calibrate before public launch"). Owner: właściciel produktu + deweloper. Block: no dla MVP; **wymagane przed publicznym launchem** (wpływa na S-02's Risk i spójność scoringu w S-05). Rozjazd D-6.
2. **GDPR / UODO (FR-P2-001–FR-P2-007)** — szczegóły w PRD v2 §Faza 2. Owner: właściciel produktu. Block: no dla MVP; **wymagane przed otwarciem publicznej rejestracji**.
3. **Observability przed launchem** — brak structured logging / error tracking (tylko `wrangler tail`). Block: no dla MVP; recommended przed wzrostem ruchu.

## Parked

- **Draft pipeline (NFR ≤5 sekund)** — Dlaczego parkowany: hot-1 zamknięty — „NFR nierealizowalny z obecnym modelem synchronicznym"; dwufazowy pipeline wymaga refaktoru całego `transformation-processor.ts`. Backlog post-MVP.
- **Workflow publikacji ogłoszeń** — Dlaczego parkowany: PRD §Non-Goals; faza 2; aplikacja nie publikuje na Vinted / Otodom / Otomoto.
- **Zaawansowane role użytkownika (Agencja, AI Agent)** — Dlaczego parkowany: PRD §Non-Goals; model płaski w MVP; faza 2.
- **Skanowanie 3D** — Dlaczego parkowany: PRD §Non-Goals; oznaczone „NOT MVP".
- **Własny model AI do transformacji** — Dlaczego parkowany: PRD §Non-Goals; MVP korzysta z OpenRouter.
- **Connectors do platform marketplace** — Dlaczego parkowany: PRD §Non-Goals; faza 2 razem z workflow publikacji.
- **Observability (structured logging, error tracking, metryki)** — Dlaczego parkowany: absent w baseline; cel `quality` podnosi priorytet, ale nie blokuje S-05–S-09; dodać przed launchem.
- **GDPR / UODO — faza 2 (FR-P2-001–FR-P2-007)** — Dlaczego parkowany: nie blokuje MVP; wymagane przed publicznym launchem. Zakres w PRD v2 §Faza 2.
- **Retry = upsert (hot-7)** — Dlaczego parkowany: zachowanie zaimplementowane w `transformation-processor.ts` (evt-21 + pol-3/pol-4); brak osobnej zmiany potrzebnej.

## Done

(Empty on first generation of v2. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived. S-01–S-04 i F-01 są zrealizowane w codebase; uruchom `/10x-archive <change-id>` aby przenieść je tutaj.)
