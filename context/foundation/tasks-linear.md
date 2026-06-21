---
project: "Omnilister AI"
created: 2026-05-30
tool: Linear (MCP)
workspace: Cloudcapex
linear_project_url: https://linear.app/cloudcapex/project/omnilister-ai-mvp-10f71bf2fd76
---

# Linear — Omnilister AI MVP

Roadmap z `context/foundation/roadmap.md` został przepisany do Linear jako projekt **Omnilister AI MVP** w workspace **Cloudcapex** (team key: `CLO`).

## Projekt

| Pole | Wartość |
|------|---------|
| Nazwa | Omnilister AI MVP |
| Team | Cloudcapex (`CLO`) |
| Priority | High |
| Status | Backlog |
| URL | https://linear.app/cloudcapex/project/omnilister-ai-mvp-10f71bf2fd76 |

## Issues — mapa roadmap → Linear

| Roadmap ID | Change ID | Linear ID | Tytuł | Status | Priority |
|------------|-----------|-----------|-------|--------|----------|
| F-01 | db-schema-storage | **CLO-5** | F-01: Zaprojektuj schemat DB + buckety Storage (Supabase + RLS) | Todo | Urgent |
| S-01 | object-and-photo-upload | **CLO-6** | S-01: Tworzenie obiektu + wgrywanie zdjęć + galeria miniaturek | Backlog | High |
| S-02 | ai-analysis-score | **CLO-7** | S-02: Analiza AI — kategoria + cechy + quality score per wymiar | Backlog | High |
| S-03 | ai-transformation-session | **CLO-8** | S-03: Sesja transformacji AI + before/after + zapis wybranych [NORTH STAR] | Backlog | Urgent |
| S-04 | global-style-library | **CLO-9** | S-04: Globalna biblioteka stylów/promptów z przeglądaniem | Backlog | Medium |

## Linki bezpośrednie

- CLO-5 (F-01): https://linear.app/cloudcapex/issue/CLO-5/f-01-zaprojektuj-schemat-db-buckety-storage-supabase-rls
- CLO-6 (S-01): https://linear.app/cloudcapex/issue/CLO-6/s-01-tworzenie-obiektu-wgrywanie-zdjec-galeria-miniaturek
- CLO-7 (S-02): https://linear.app/cloudcapex/issue/CLO-7/s-02-analiza-ai-kategoria-cechy-quality-score-per-wymiar
- CLO-8 (S-03): https://linear.app/cloudcapex/issue/CLO-8/s-03-sesja-transformacji-ai-beforeafter-zapis-wybranych
- CLO-9 (S-04): https://linear.app/cloudcapex/issue/CLO-9/s-04-globalna-biblioteka-stylowpromptow-z-przegladaniem

## Graf zależności (blockedBy)

```
CLO-5 (F-01) ──► CLO-6 (S-01) ──► CLO-7 (S-02) ──► CLO-8 (S-03) ──► CLO-9 (S-04)
     └──────────────────────────────────────────────────────────────────────────────►
                      └────────────────────────────────────────────────────────────►
                                               └──────────────────────────────────►
                                                                    └─────────────►
```

Relacje `blockedBy` są ustawione w Linear — widok "Dependencies" w projekcie pokazuje pełny DAG.

## Statusy użyte

| Linear status | Znaczenie w roadmapie |
|---------------|-----------------------|
| Todo | `status: ready` — gotowe do implementacji |
| Backlog | `status: proposed` — zablokowane prereqami |

## Konwencje

- **Priority Urgent** = F-01 (foundation, blokuje wszystko) + S-03 (North Star)
- **Priority High** = S-01, S-02 (ścieżka krytyczna do North Star)
- **Priority Medium** = S-04 (po North Star, rozwinięcie)
- Każdy issue zawiera: Outcome, Change ID, PRD refs, Prerequisites (z linkami CLO-X), Risk
- Git branch name generowany automatycznie przez Linear (np. `piotrbarylak/clo-5-f-01-...`)

## Jak korzystać

Przy starcie implementacji danego slice'a:
1. Otwórz odpowiedni issue w Linear (CLO-X)
2. Sprawdź że prerequisite issues mają status **Done**
3. Uruchom `/10x-plan <change-id>` żeby wygenerować plan implementacji
4. Przesuń issue do **In Progress** i utwórz gałąź z Linear (branch name jest już gotowy)
