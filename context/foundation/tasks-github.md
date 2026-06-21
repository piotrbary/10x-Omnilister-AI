---
project: "Omnilister AI"
created: 2026-05-30
tool: GitHub Issues (GH CLI)
repo: piotrbary/10x-Omnilister-AI
repo_url: https://github.com/piotrbary/10x-Omnilister-AI
---

# GitHub — Omnilister AI MVP

Roadmap z `context/foundation/roadmap.md` został częściowo przepisany do GitHub Issues w repozytorium **piotrbary/10x-Omnilister-AI**.

> **Uwaga:** Sesja GitHub została przerwana po issue #2 (S-01). Issues #3–#5 (S-02, S-03, S-04) nie zostały utworzone — praca została przeniesiona do Linear (patrz `tasks-linear.md`).

## Repozytorium

| Pole | Wartość |
|------|---------|
| Nazwa | 10x-Omnilister-AI |
| Owner | piotrbary |
| Widoczność | Private |
| URL | https://github.com/piotrbary/10x-Omnilister-AI |
| Remote | `origin` → `https://github.com/piotrbary/10x-Omnilister-AI.git` |
| Branch główny | `main` |

Repo zostało utworzone przez `gh repo create` z lokalnego katalogu. Initial commit obejmuje cały scaffold projektu (108 plików, Astro + React + Supabase + Cloudflare Workers).

## Milestone

| Nazwa | URL |
|-------|-----|
| MVP | https://github.com/piotrbary/10x-Omnilister-AI/milestone/1 |

Opis: *Minimalny kompletny przepływ end-to-end (S-03 North Star)*

## Labels

| Label | Kolor | Opis |
|-------|-------|------|
| `foundation` | #0075ca | Enabler bez user-visible outcome |
| `slice` | #e4e669 | Vertical slice — user-visible outcome |
| `ai` | #d93f0b | Integracja z AI (OpenAI) |
| `database` | #1d76db | Schemat DB / Storage |
| `north-star` | #8B6914 | S-03 north star milestone |
| `status:ready` | #0e8a16 | Gotowe do implementacji |
| `status:proposed` | #fbca04 | Zaplanowane, blokowane prereqami |

## Issues — mapa roadmap → GitHub

| Roadmap ID | Change ID | GitHub # | Tytuł | Labels | Status |
|------------|-----------|----------|-------|--------|--------|
| F-01 | db-schema-storage | **#1** | F-01: Zaprojektuj schemat DB + buckety Storage (Supabase + RLS) | `foundation` `database` `status:ready` | ✅ Utworzony |
| S-01 | object-and-photo-upload | **#2** | S-01: Tworzenie obiektu + wgrywanie zdjęć + galeria miniaturek | `slice` `status:proposed` | ✅ Utworzony |
| S-02 | ai-analysis-score | — | S-02: Analiza AI — kategoria + cechy + quality score per wymiar | `slice` `ai` `status:proposed` | ❌ Nie utworzony |
| S-03 | ai-transformation-session | — | S-03: Sesja transformacji AI + before/after + zapis wybranych [NORTH STAR] | `slice` `ai` `north-star` `status:proposed` | ❌ Nie utworzony |
| S-04 | global-style-library | — | S-04: Globalna biblioteka stylów/promptów z przeglądaniem | `slice` `status:proposed` | ❌ Nie utworzony |

## Linki bezpośrednie

- Issue #1 (F-01): https://github.com/piotrbary/10x-Omnilister-AI/issues/1
- Issue #2 (S-01): https://github.com/piotrbary/10x-Omnilister-AI/issues/2

## Jak dokończyć brakujące issues (jeśli potrzebne)

Jeśli zdecydujesz się uzupełnić GitHub Issues o S-02, S-03, S-04, użyj poniższych komend GH CLI. Uruchom w katalogu projektu.

### S-02

```bash
gh issue create \
  --title "S-02: Analiza AI — kategoria + cechy + quality score per wymiar" \
  --label "slice,ai,status:proposed" \
  --milestone "MVP" \
  --body "## Outcome
User can po wgraniu zdjęć zobaczyć: zaproponowaną kategorię obiektu (samochód / mieszkanie / rzecz) do potwierdzenia lub zmiany, cechy wykryte przez AI do korekty, oraz quality score per-zdjęcie per-wymiar (ostrość, oświetlenie, tło, cechy obiektu, uszkodzenia/defekty, napisy/etykiety, pokrycie kątów, sales readiness).

## Change ID
\`ai-analysis-score\`

## PRD refs
FR-004, FR-007, FR-008, FR-009; US-01 (analysis part)

## Prerequisites
- [ ] F-01 \`db-schema-storage\` (#1)
- [ ] S-01 \`object-and-photo-upload\` (#2)

## AI provider
**OpenAI GPT-4o Vision** do analizy zdjęć, detekcji kategorii i quality scoringu.

## Resolved unknowns
Próg sales readiness = **7/10** (70% parametru każdej metryki). Wagi per kategoria do zdefiniowania w implementacji.

## Risk
Projekt scoringu per kategoria (8 wymiarów × 3 kategorie = 24 konfiguracje) jest największym wyzwaniem projektowym MVP — błędnie skalibrowany score podważa główne kryterium sukcesu."
```

### S-03

```bash
gh issue create \
  --title "S-03: Sesja transformacji AI + before/after + zapis wybranych [NORTH STAR]" \
  --label "slice,ai,north-star,status:proposed" \
  --milestone "MVP" \
  --body "## Outcome
User can wybrać styl transformacji z globalnej biblioteki (lub wpisać własny prompt), zlecić transformację wybranych zdjęć, zobaczyć draft w ciągu **5 sekund** i pełną wersję w ciągu **60 sekund**, porównać before/after z numerycznym score'em i zapisać wybrane przetransformowane zdjęcia w bibliotece obiektu.

> **North Star** — najmniejszy kompletny przepływ end-to-end (upload → scoring → transformacja → podgląd przed/po → zapis).

## Change ID
\`ai-transformation-session\`

## PRD refs
FR-010, FR-011, FR-012; US-01 (transformation part)

## Prerequisites
- [ ] F-01 \`db-schema-storage\` (#1)
- [ ] S-01 \`object-and-photo-upload\` (#2)
- [ ] S-02 \`ai-analysis-score\` (#3)

## AI provider
**OpenAI GPT-4o / DALL-E 3** do transformacji obrazów.

## Risk
NFR draft < 5 sek + pełna transformacja < 60 sek wymaga asynchronicznego UI — polling lub streaming, inaczej użytkownik zobaczy pusty ekran przez 60 sek."
```

### S-04

```bash
gh issue create \
  --title "S-04: Globalna biblioteka stylów/promptów z przeglądaniem" \
  --label "slice,status:proposed" \
  --milestone "MVP" \
  --body "## Outcome
User can opublikować własny styl/prompt transformacji pod nazwą w globalnej bibliotece dostępnej dla wszystkich użytkowników; każdy użytkownik może przeglądać bibliotekę i wybierać cudze style przy transformacji.

## Change ID
\`global-style-library\`

## PRD refs
FR-013; US-01 (secondary — style reuse and viral loop)

## Prerequisites
- [ ] F-01 \`db-schema-storage\` (#1)
- [ ] S-03 \`ai-transformation-session\` (#4)

## Risk
Publiczna biblioteka bez moderacji może zawierać prompty skłaniające AI do dodawania nieistniejących cech produktu (naruszenie guardrail no distortion). Potrzebna polityka moderacji reaktywnej lub automatyczna weryfikacja."
```

## Relacja z Linear

Kompletna wersja wszystkich 5 issues (F-01, S-01–S-04) żyje w Linear jako CLO-5 – CLO-9.
Szczegóły: `context/foundation/tasks-linear.md`

Jeśli chcesz mieć pełną parę GitHub ↔ Linear, dokończ 3 brakujące issues komendami powyżej.
