# Score Regression Guard — Plan Brief

> Full plan: `context/changes/score-regression-guard/plan.md`
> Domain analysis: `context/domain/02-invariant-aggregate-refactor.md`
> Research: `context/changes/core-layer-spread/research.md`

## What & Why

Przeniesienie egzekucji głównego kryterium sukcesu produktu — `score_after > score_before`
(PRD §Primary Success Criteria) — z checkboxa UI na serwer. Dziś jedynym strażnikiem
invariantu I-1 jest pre-selection stanu React; jedno kliknięcie go pomija, a serwer
zapisuje bez sprzeciwu. To klasyczny anti-pattern: klient jako jedyny strażnik rdzeniowej
reguły domenowej.

## Starting Point

`save.ts` sprawdza tylko `status === "full_ready"` i storage limit — nigdy nie odczytuje
`score_before`/`score_after` mimo że obie wartości są w tabeli `transformations`. `TransformationSession.tsx`
pre-selectuje checkboxy na podstawie `after.overall > before.overall`, ale `handleSaveToggle`
pozwala użytkownikowi dowolnie je zmienić.

## Desired End State

POST `/api/transformations/:id/save` zwraca 409 z deltą gdy `score_after ≤ score_before`.
Klient reaguje modalem z deltą i przyciskiem „Zachowaj mimo to" (retry z `override_regression: true`).
UI nie zawiera już żadnej logiki porównującej score — serwer jest jedynym strażnikiem.

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Egzekucja | Server-side 409 + client override | Klient nie może być jedynym strażnikiem; 409 z deltą daje czytelną informację | Domain analysis |
| Override mechanism | `override_regression: true` w body | Explicit consent — użytkownik świadomie akceptuje regresję | Domain analysis |
| Pre-selection UI | Usuń całkowicie | Single source of truth; dwie implementacje tej samej reguły to dług | Plan session |
| Config rename | W tej samej zmianie (Faza 0) | lessons.md: nowe referencje do non-camelCase kluczy wymagają rename'u | Plan session |
| DB constraint | Nie | JSON fields nie wspierają relacyjnych constraints w PostgreSQL | Domain analysis |
| Feedback enforcement (I-2) | Nie w tej zmianie | Osobna, niezależna zmiana | Domain analysis |

## Scope

**In scope:**
- `src/lib/domain/` — nowy katalog z błędami, agregatem, repozytorium
- `save.ts` — zastąpienie cienką delegacją do agregatu
- `TransformationSession.tsx` — usunięcie pre-selection, obsługa 409
- `config.ts`, `upload-url.ts` — rename kluczy camelCase (Faza 0)

**Out of scope:**
- DB CHECK constraint na score_after vs score_before
- Egzekucja feedbacku (I-2)
- ACL refaktor (ports/adapters) — `03-anti-corruption-layer.md`
- `transformation-processor.ts` — nie zmienia się

## Architecture / Approach

```
POST /save
  ↓
save.ts (thin route)
  ↓ loadForSave()
TransformationJobRepository  ←── Supabase (job + profile, równolegle)
  ↓
TransformationJobAggregate.save()
  ↓ throws? 
ScoreRegressionError → 409 {score_before, score_after, delta}
  ↓ ok?
repo.markSaved() → 200 {saved: true}
```

UI: pierwszy round bez `override_regression` → 409 → modal → drugi round z `override_regression: true`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 0. Config rename | camelCase compliance, clean callsites | Pominięty callsite → typecheck catch |
| 1. Domain layer | Agregat + testy (10 cases) — fundament | Test-first; musi przejść zanim route się zmieni |
| 2. Repository + route | 409 response działa end-to-end | `save.ts` w pełni zastąpiony — brak powrotu |
| 3. UI changes | Modal z deltą, usunięcie pre-selection | UX regresja jeśli modal źle zaimplementowany |

**Prerequisites:** Żadnych zewnętrznych zależności; zmiana jest self-contained.  
**Estimated effort:** ~3 sesje po 1 fazie (Faza 0+1 można w jednej sesji, 2 i 3 osobno).

## Open Risks & Assumptions

- `score_after` jest `null` gdy scoring AI zawiódł → agregat traktuje to jako brak informacji i nie blokuje zapisu (safe default)
- Batch save wysyła `Promise.all` równolegle → implementacja zbiera wszystkie 409 przed pokazaniem modala (nie po jednym)
- Cloudflare Workers nie wspiera WebSockets — 409 jest synchroniczną odpowiedzią HTTP, no worries

## Success Criteria (Summary)

- `npm test` przechodzi z 10 nowymi case'ami dla `TransformationJobAggregate`
- POST `/api/transformations/:id/save` zwraca 409 dla joba z regresją score (manual test)
- Użytkownik może zapisać transformację z regresją po jawnym potwierdzeniu w modalu (manual test)
