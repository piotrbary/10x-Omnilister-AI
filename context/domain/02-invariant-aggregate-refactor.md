---
title: "Omnilister AI — Invariant Aggregate Refactor Plan"
created: 2026-06-26
type: refactor-plan
source: context/domain/01-domain-distillation.md
---

# Invariant Aggregate Refactor Plan

## KROK 0 — Kontekst

**Stack i warstwy logiki biznesowej:**

| Warstwa | Pliki | Rola |
|---------|-------|------|
| UI (React) | `src/components/transformation/TransformationSession.tsx`, `TransformationJobCard.tsx` | Prezentacja, zbieranie decyzji użytkownika |
| API routes | `src/pages/api/transformations/start.ts`, `save.ts`, `feedback.ts` | Parsowanie wejścia, delegacja, mapowanie odpowiedzi |
| Logika domenowa | `src/lib/transformation-processor.ts`, `quality-scoring.ts`, `transformation-styles.ts` | Przetwarzanie AI, obliczanie score, budowanie promptu |
| Persystencja | Supabase PostgreSQL + Storage; typy w `src/types/database.generated.ts` | Przechowywanie stanu joba |

**Brak jawnej warstwy domenowej** — reguły biznesowe żyją w `src/lib/` i bezpośrednio w API routes, bez agregatów ani value objects.

---

## KROK 1 — Niezmienniki biznesowe

| # | Niezmiennik | Źródło | Egzekwowany gdzie |
|---|-------------|--------|-------------------|
| **I-1** | `score_after.overall > score_before.overall` — zdjęcie po transformacji ma wyższy score niż oryginał | PRD §Primary Success Criteria: „Quality score zdjęć po transformacji jest wyższy niż przed" | UI pre-selection (`TransformationSession.tsx:88–93`) — i nigdzie więcej |
| **I-2** | Feedback (`improved` / `not_improved`) zbierany po każdej transformacji | PRD §Primary Success Criteria: „Użytkownik potwierdza (feedback) — potwierdzenie zbierane po każdej transformacji" | NIGDZIE — `save.ts` nie sprawdza feedbacku |
| **I-3** | Prompt ZAWSZE zawiera guardrail no-distortion jako sufiks | PRD §Guardrails: „Transformacja nie może zniekształcać produktu"; `transformation-styles.ts:3–4` | ENFORCED — `buildPrompt()` zawsze appenduje stałą |
| **I-4** | Zapis (`status = saved`) wymaga `status == full_ready` | US-01 AC; `save.ts:32` | ENFORCED server-side (`save.ts:32`) |
| **I-5** | `storage_used_bytes + new_size ≤ 100 MB` | PRD §NFR; `config.ts:9` | ENFORCED podwójnie — API soft guard + DB CHECK constraint |
| **I-6** | Kategoria transformacji pochodzi z potwierdzonej kategorii obiektu | PRD FR-008: „użytkownik może potwierdzić lub zmienić kategorię" | NARUSZONY — `transformation-processor.ts:23`: `?? "item"` bez notyfikacji |
| **I-7** | Max 10 zdjęć per obiekt | `config.ts:21` (`maxPhotosPerObject: 10`) | CZĘŚCIOWY — soft check w API; brak DB constraint; race condition możliwy |

---

## KROK 2 — Klasyfikacja i wybór #1

### Matryca klasyfikacji

| Niezmiennik | (a) Rdzeniowość dla sensu produktu | (b) Rozsmarowanie po warstwach | (c) Egzekwowanie | Wynik |
|-------------|-------------------------------------|-------------------------------|-----------------|-------|
| **I-1** score_after > score_before | ★★★★★ Primary Success Criteria #1 — bez tego produkt nie odróżnia się od zwykłego filtra | UI-only: 2 miejsca w TransformationSession; 0 w API/DB | **Tylko UI, naruszalny ręcznie** | 🔴 NAJSŁABSZY |
| **I-2** feedback po każdej transformacji | ★★★★☆ Primary Success Criteria #2 — jedyna pętla uczenia | NIGDZIE — endpoint istnieje, zero enforcement | **Całkowicie brak** | 🔴 BRAK |
| **I-3** guardrail no-distortion | ★★★★★ Core guardrail produktu | 1 miejsce (`buildPrompt`) — dobrze izolowany | **ENFORCED** | 🟢 OK |
| **I-4** save wymaga full_ready | ★★★☆☆ Spójność stanu joba | 1 miejsce (`save.ts:32`) — dobrze izolowany | **ENFORCED** | 🟢 OK |
| **I-5** storage limit | ★★☆☆☆ NFR operacyjny | 2 warstwy (API + DB trigger) | **ENFORCED podwójnie** | 🟢 OK |
| **I-6** potwierdzona kategoria | ★★★☆☆ Jakość scoringu i transformacji | `transformation-processor.ts:23` — silent fallback | **Naruszony cicho** | 🟡 RYZYKO |
| **I-7** max 10 zdjęć | ★★☆☆☆ Operacyjny | `upload-url.ts:92` — soft tylko | **Częściowy** | 🟡 RYZYKO |

### Wybrany niezmiennik: **I-1 — score_after.overall > score_before.overall**

**Uzasadnienie:**

1. **Rdzeniowość**: PRD §Primary Success Criteria definiuje ten warunek jako MIERZALNY DOWÓD WARTOŚCI produktu. Roadmap §S-03 nazywa sesję transformacji „north star" — „umożliwia udowodnienie, że hipoteza produktowa jest prawdziwa". Bez enforcement tego warunku platforma może milcząco pogarszać zdjęcia i sprzedawca nie dowie się o tym ze strony systemu.

2. **Najsłabsze egzekwowanie**: jedyną logiką weryfikującą jest pre-selection checkboxa w `TransformationSession.tsx:88–93` — wizualny hint, który użytkownik może ręcznie wyłączyć w 1 kliknięciu. Serwer (`save.ts`) nie wie o istnieniu tego warunku. **Klient jest jedynym strażnikiem rdzeniowej reguły biznesowej** — to jest klasyczny anti-pattern.

3. **Brak I-2 (feedback) jest poważny**, ale feedback to pętla uczenia, nie warunek poprawności stanu. I-1 to poprawność wyniku — fundamentalniejsza.

---

## KROK 3 — Diagnoza I-1

### Mapa wszystkich miejsc gdzie reguła żyje lub powinna żyć

#### Warstwa UI — jedyny strażnik (ANTYPATTERN)

**`src/components/transformation/TransformationSession.tsx`**

```
linia 27–29  (inicjalizacja po page-refresh):
  init[job.id] = after && before
    ? after.overall > before.overall
    : true;  ← fallback true gdy brak score — brak informacji dla użytkownika
```

```
linia 88–93  (po zakończeniu transformacji):
  newSaveChecked[job.id] = after && before
    ? after.overall > before.overall
    : true;  ← to samo — fallback true
```

**Problem**: `saveChecked` jest stanem React. `handleSaveToggle` (`linia 119–121`) pozwala użytkownikowi zmienić wartość dowolnie:
```
linia 119–121:
  function handleSaveToggle(jobId: string, save: boolean) {
    setSaveChecked((prev) => ({ ...prev, [jobId]: save }));
  }
```

Użytkownik może:
1. Zobaczyć, że checkbox jest odznaczony (score się pogorszył)
2. Ręcznie go zaznaczyć
3. Kliknąć „Confirm save" → `save.ts` zapisze bez sprzeciwu

**`src/components/transformation/TransformationJobCard.tsx`**

Komponent renderuje pole checkbox (`saveChecked`) ale nie blokuje ani nie ostrzega gdy `score_after.overall < score_before.overall`. Brak wizualnej informacji o regresji poza pre-selection.

#### Warstwa API — brak sprawdzenia (DZIURA)

**`src/pages/api/transformations/[jobId]/save.ts`**

```
linia 32–37:
  if (job.status !== "full_ready") {     ← jedyne sprawdzenie domenowe
    return new Response(..., { status: 400 });
  }
```

```
linia 50–58:
  const resultSize = job.result_file_size_bytes ?? 0;
  if (profile.storage_used_bytes + resultSize > storageConfig.Max_Client_Repository) {
    return new Response(..., { status: 400 });
  }
```

```
linia 62–65:
  await supabase.from("transformations")
    .update({ status: "saved", updated_at: ... })  ← bezwarunkowy UPDATE
    .eq("id", jobId).eq("user_id", user.id);
```

`score_before` i `score_after` są w tabeli `transformations` (pola JSON), ale `save.ts` nigdy ich nie odczytuje. **Serwer nie wie, że reguła istnieje.**

#### Warstwa processor — nie zgłasza regresji (POŁKNIĘTY BŁĄD)

**`src/lib/transformation-processor.ts`**

```
linia 118–129:
  let scoreAfter: QualityScoreSnapshot | null = null;
  try {
    scoreAfter = await scorePhoto(resultUrl, category);
  } catch {
    // Non-fatal: scoring failure doesn't block the transformation
  }

  await supabase.from("transformations")
    .update({ score_after: scoreAfter as unknown as Json, ... })
    .eq("id", job.id).eq("user_id", job.user_id);
    // ← Zapisuje score_after bez porównania z score_before
    // ← Brak log/signal gdy regression; brak zmiany statusu
```

Procesor jest jedyną warstwą, która MA oba wartości jednocześnie (score_before z INSERT w `start.ts:98–106`, score_after właśnie obliczony), ale ich nie porównuje i nie działanie nie różnicuje.

#### Warstwa DB — brak constraint

Tabela `transformations` nie ma CHECK constraint weryfikującego relację `score_after` vs `score_before`. Oba pola to `Json | null` — brak walidacji na poziomie bazy.

### Podsumowanie diagnozy

```
PRD:  score_after > score_before = MUSI być prawdą (Primary Success Criteria)
      │
      ▼
Procesor: oblicza score_after i ma score_before w scope — NIE porównuje
      │
      ▼
DB:   zapisuje obydwa jako Json bez warunku — NIE egzekwuje
      │
      ▼
save.ts: dostęp do score_before i score_after przez SELECT — NIE odczytuje
      │
      ▼
UI:   TransformationSession pre-selects checkbox na podstawie porównania ← JEDYNE miejsce
      │
      ▼  użytkownik może toggle
handleSaveToggle: setSaveChecked dowolnie ← NARUSZALNE jednym kliknięciem
      │
      ▼
save.ts: POST → bezwarunkowy UPDATE status='saved' ← ŻADNEJ ochrony
```

---

## KROK 4 — Projekt agregatu-strażnika

### Błędy domenowe

```typescript
// src/lib/domain/transformation-errors.ts

export class TransformationNotReadyError extends Error {
  readonly type = "TRANSFORMATION_NOT_READY" as const;
  constructor(public readonly currentStatus: string) {
    super(`Cannot save: job must be full_ready, current status is '${currentStatus}'`);
  }
}

export class ScoreRegressionError extends Error {
  readonly type = "SCORE_REGRESSION" as const;
  constructor(
    public readonly scoreBefore: number,
    public readonly scoreAfter: number,
  ) {
    super(
      `Cannot save: score_after (${scoreAfter.toFixed(2)}) ≤ score_before (${scoreBefore.toFixed(2)}) — transformation did not improve photo quality`,
    );
  }
}

export class StorageLimitExceededError extends Error {
  readonly type = "STORAGE_LIMIT_EXCEEDED" as const;
  constructor(public readonly limitLabel: string) {
    super(`Cannot save: storage limit of ${limitLabel} reached`);
  }
}
```

---

### Agregat — TransformationJob

```typescript
// src/lib/domain/TransformationJobAggregate.ts

import {
  ScoreRegressionError,
  TransformationNotReadyError,
  StorageLimitExceededError,
} from "./transformation-errors";
import type { QualityScoreSnapshot } from "@/types/transformations";

interface JobState {
  id: string;
  user_id: string;
  status: string;
  score_before: QualityScoreSnapshot | null;
  score_after: QualityScoreSnapshot | null;
  result_file_size_bytes: number | null;
  feedback: string | null;
}

interface StorageState {
  storage_used_bytes: number;
  limit_bytes: number;
  limit_label: string;
}

export interface SaveOptions {
  /** Explicit user acknowledgment that a score regression is acceptable. */
  override_regression?: boolean;
}

export interface SaveResult {
  /** Whether a regression warning was overridden. Useful for logging. */
  regression_acknowledged: boolean;
}

export class TransformationJobAggregate {
  private constructor(
    private readonly state: JobState,
    private readonly storage: StorageState,
  ) {}

  static load(state: JobState, storage: StorageState): TransformationJobAggregate {
    return new TransformationJobAggregate(state, storage);
  }

  /**
   * Attempt to save the job. Fails fast on:
   *   1. Wrong status (not full_ready)
   *   2. Storage limit would be exceeded
   *   3. score_after ≤ score_before AND override_regression not set
   *
   * Callers mapping the result to HTTP: ScoreRegressionError → 409 + delta payload.
   * This lets the client show the delta and ask for explicit confirmation.
   */
  save(opts: SaveOptions = {}): SaveResult {
    // Precondition 1: status lifecycle
    if (this.state.status !== "full_ready") {
      throw new TransformationNotReadyError(this.state.status);
    }

    // Precondition 2: storage quota
    const fileSize = this.state.result_file_size_bytes ?? 0;
    if (this.storage.storage_used_bytes + fileSize > this.storage.limit_bytes) {
      throw new StorageLimitExceededError(this.storage.limit_label);
    }

    // Precondition 3 (INVARIANT I-1): score must improve — fail-fast unless explicitly overridden
    const before = this.state.score_before?.overall ?? null;
    const after = this.state.score_after?.overall ?? null;
    const regression_acknowledged = before !== null && after !== null && after <= before && !!opts.override_regression;

    if (before !== null && after !== null && after <= before && !opts.override_regression) {
      throw new ScoreRegressionError(before, after);
    }

    // Postcondition: state transitions to 'saved'
    // (mutation not expressed here — repository handles the write)
    return { regression_acknowledged };
  }
}
```

**Kluczowe decyzje projektu:**

- `save()` jest jedyną metodą domenową — zgodnie z aktualnym zakresem invariantów
- `override_regression` pozwala użytkownikowi świadomie zachować pogorszone zdjęcie; nie blokuje UI bezwzględnie, ale wymaga jawnej deklaracji
- `StorageLimitExceededError` przeniesiony z `save.ts` do agregatu — to też niezmiennik domenowy
- Agregat jest immutable value object (czysta funkcja decyzyjna); repozytorium robi write

---

### Repozytorium

```typescript
// src/lib/domain/TransformationJobRepository.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { QualityScoreSnapshot } from "@/types/transformations";
import { TransformationJobAggregate } from "./TransformationJobAggregate";
import { storageConfig } from "@/lib/config";

export class TransformationJobRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async loadForSave(jobId: string, userId: string): Promise<TransformationJobAggregate> {
    // Single query: job + storage in parallel
    const [jobResult, profileResult] = await Promise.all([
      this.db
        .from("transformations")
        .select("id, user_id, status, score_before, score_after, result_file_size_bytes, feedback")
        .eq("id", jobId)
        .eq("user_id", userId)
        .single(),
      this.db
        .from("profiles")
        .select("storage_used_bytes")
        .eq("id", userId)
        .single(),
    ]);

    if (!jobResult.data) throw new Error("Job not found");
    if (!profileResult.data) throw new Error("Profile not found");

    const job = jobResult.data;
    return TransformationJobAggregate.load(
      {
        id: job.id,
        user_id: job.user_id,
        status: job.status,
        score_before: job.score_before as QualityScoreSnapshot | null,
        score_after: job.score_after as QualityScoreSnapshot | null,
        result_file_size_bytes: job.result_file_size_bytes,
        feedback: job.feedback,
      },
      {
        storage_used_bytes: profileResult.data.storage_used_bytes,
        limit_bytes: storageConfig.Max_Client_Repository,
        limit_label: storageConfig.Max_Client_Repository_Label,
      },
    );
  }

  /**
   * Persist the save decision. Called ONLY after aggregate.save() succeeds.
   * DB trigger on status='saved' increments profiles.storage_used_bytes atomically.
   */
  async markSaved(jobId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from("transformations")
      .update({ status: "saved", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", userId);

    if (error) throw new Error(`DB write failed: ${error.message}`);
  }
}
```

---

### Cienkie API route (after)

```typescript
// src/pages/api/transformations/[jobId]/save.ts  (po refaktorze)

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { TransformationJobRepository } from "@/lib/domain/TransformationJobRepository";
import {
  TransformationNotReadyError,
  ScoreRegressionError,
  StorageLimitExceededError,
} from "@/lib/domain/transformation-errors";

const SaveBodySchema = z.object({
  override_regression: z.boolean().optional().default(false),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { jobId } = context.params;
  if (!jobId) return json({ error: "Missing jobId" }, 400);

  // Parse override flag
  let body: unknown;
  try { body = await context.request.json(); } catch { body = {}; }
  const parsed = SaveBodySchema.safeParse(body);
  const overrideRegression = parsed.success ? parsed.data.override_regression : false;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "Service unavailable" }, 503);

  const repo = new TransformationJobRepository(supabase);

  try {
    const aggregate = await repo.loadForSave(jobId, user.id);
    const result = aggregate.save({ override_regression: overrideRegression });

    await repo.markSaved(jobId, user.id);

    return json({ saved: true, regression_acknowledged: result.regression_acknowledged });

  } catch (err) {
    if (err instanceof TransformationNotReadyError) {
      return json({ error: err.message, type: err.type }, 400);
    }
    if (err instanceof ScoreRegressionError) {
      // 409 Conflict: operation valid but violates invariant; client must send override_regression=true
      return json({
        error: err.message,
        type: err.type,
        score_before: err.scoreBefore,
        score_after: err.scoreAfter,
        delta: +(err.scoreAfter - err.scoreBefore).toFixed(2),
      }, 409);
    }
    if (err instanceof StorageLimitExceededError) {
      return json({ error: err.message, type: err.type }, 400);
    }
    throw err; // unexpected — let Astro handle as 500
  }
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
```

**Przeniesienie egzekucji z klienta na serwer:**

Klient (`TransformationSession.tsx`) po refaktorze:
1. Wysyła `POST /api/transformations/:id/save` bez `override_regression`
2. Jeśli 200 → sukces
3. Jeśli **409 ScoreRegressionError** → pokazuje dialog z deltą score'u i przyciskiem „Zachowaj mimo to" → wysyła ponownie z `override_regression: true`
4. Nie pre-selects checkboxów na podstawie score — to robi serwer

---

## KROK 5 — Before/After, plan faz, testy

### Before/After dla każdego miejsca reguły

| Plik | Linia | BEFORE | AFTER |
|------|-------|--------|-------|
| `TransformationSession.tsx` | 27–29 | Pre-selects `saveChecked` na podstawie `after.overall > before.overall` — jedyna egzekucja | Checkbox usunięty lub uproszczony; logika decyzji przeniesiona na serwer; przy 409 wyświetl modal z deltą |
| `TransformationSession.tsx` | 88–93 | Ponowna pre-selection po transformacji — ten sam pattern | j.w. — reaguje na odpowiedź 409 z serwera |
| `save.ts` | 32–65 | Sprawdza status; nie sprawdza score; bezwarunkowy UPDATE | Deleguje do `TransformationJobAggregate.save()` → mapuje `ScoreRegressionError` → 409 |
| `transformation-processor.ts` | 118–129 | Zapisuje `score_after`; nie porównuje z `score_before` | Bez zmian w fazie 1 (procesor działa poprawnie); opcjonalnie w fazie 3 logguje delta do `error_message` |
| `database.generated.ts` | — | Brak constraint na score_after vs score_before | Bez zmian (DB nie może egzekwować JSON field relation bez trigger) |

---

### Plan faz refaktoru

#### Faza 1 — Błędy domenowe + agregat (test-first) ✦

**Cel**: zamknąć logikę decyzji w `TransformationJobAggregate`; wszystkie testy przechodzą zanim dotkniemy `save.ts`.

1. Utwórz `src/lib/domain/transformation-errors.ts` z 3 klasami błędów
2. Utwórz `src/lib/domain/TransformationJobAggregate.ts`
3. Utwórz `src/lib/domain/TransformationJobAggregate.test.ts` (poniżej)
4. Uruchom testy — muszą przejść

**Test-first — przypadki testowe:**

```typescript
// src/lib/domain/TransformationJobAggregate.test.ts

import { describe, it, expect } from "vitest";
import { TransformationJobAggregate } from "./TransformationJobAggregate";
import {
  TransformationNotReadyError,
  ScoreRegressionError,
  StorageLimitExceededError,
} from "./transformation-errors";

const BASE_STORAGE = { storage_used_bytes: 0, limit_bytes: 100 * 1024 * 1024, limit_label: "100 MB" };

function makeJob(overrides: Partial<{
  status: string;
  score_before_overall: number | null;
  score_after_overall: number | null;
  result_file_size_bytes: number | null;
}> = {}) {
  const before = overrides.score_before_overall ?? 6.0;
  const after = overrides.score_after_overall ?? 8.0;
  return {
    id: "job-1",
    user_id: "user-1",
    status: overrides.status ?? "full_ready",
    score_before: before !== null ? { overall: before } as any : null,
    score_after: after !== null ? { overall: after } as any : null,
    result_file_size_bytes: overrides.result_file_size_bytes ?? 1024 * 1024,
    feedback: null,
  };
}

describe("TransformationJobAggregate.save()", () => {
  // ── LEGALNE PRZEJŚCIA ──────────────────────────────────────────────────

  it("LEGAL: saves when score_after > score_before", () => {
    const agg = TransformationJobAggregate.load(makeJob({ score_after_overall: 8.0, score_before_overall: 6.0 }), BASE_STORAGE);
    const result = agg.save();
    expect(result.regression_acknowledged).toBe(false);
  });

  it("LEGAL: saves when score_before is null (no baseline)", () => {
    const agg = TransformationJobAggregate.load(makeJob({ score_before_overall: null }), BASE_STORAGE);
    expect(() => agg.save()).not.toThrow();
  });

  it("LEGAL: saves when score_after is null (scoring failed)", () => {
    const agg = TransformationJobAggregate.load(makeJob({ score_after_overall: null }), BASE_STORAGE);
    expect(() => agg.save()).not.toThrow();
  });

  it("LEGAL: saves with regression when override_regression=true", () => {
    const agg = TransformationJobAggregate.load(makeJob({ score_after_overall: 4.0, score_before_overall: 7.0 }), BASE_STORAGE);
    const result = agg.save({ override_regression: true });
    expect(result.regression_acknowledged).toBe(true);
  });

  it("LEGAL: saves when score_after exactly equals score_before AND override=true", () => {
    const agg = TransformationJobAggregate.load(makeJob({ score_after_overall: 7.0, score_before_overall: 7.0 }), BASE_STORAGE);
    expect(() => agg.save({ override_regression: true })).not.toThrow();
  });

  // ── NIELEGALNE PRZEJŚCIA ───────────────────────────────────────────────

  it("ILLEGAL: rejects save when status=pending", () => {
    const agg = TransformationJobAggregate.load(makeJob({ status: "pending" }), BASE_STORAGE);
    expect(() => agg.save()).toThrow(TransformationNotReadyError);
  });

  it("ILLEGAL: rejects save when status=failed", () => {
    const agg = TransformationJobAggregate.load(makeJob({ status: "failed" }), BASE_STORAGE);
    expect(() => agg.save()).toThrow(TransformationNotReadyError);
  });

  it("ILLEGAL: rejects save when status=saved (already saved)", () => {
    const agg = TransformationJobAggregate.load(makeJob({ status: "saved" }), BASE_STORAGE);
    expect(() => agg.save()).toThrow(TransformationNotReadyError);
  });

  it("ILLEGAL: rejects save when score_after < score_before without override", () => {
    const agg = TransformationJobAggregate.load(makeJob({ score_after_overall: 4.5, score_before_overall: 7.0 }), BASE_STORAGE);
    const err = (() => { try { agg.save(); } catch(e) { return e; } })();
    expect(err).toBeInstanceOf(ScoreRegressionError);
    expect((err as ScoreRegressionError).scoreBefore).toBe(7.0);
    expect((err as ScoreRegressionError).scoreAfter).toBe(4.5);
  });

  it("ILLEGAL: rejects save when score_after === score_before without override", () => {
    const agg = TransformationJobAggregate.load(makeJob({ score_after_overall: 6.0, score_before_overall: 6.0 }), BASE_STORAGE);
    expect(() => agg.save()).toThrow(ScoreRegressionError);
  });

  it("ILLEGAL: rejects save when storage limit exceeded", () => {
    const fullStorage = { storage_used_bytes: 99 * 1024 * 1024, limit_bytes: 100 * 1024 * 1024, limit_label: "100 MB" };
    const agg = TransformationJobAggregate.load(makeJob({ result_file_size_bytes: 2 * 1024 * 1024 }), fullStorage);
    expect(() => agg.save()).toThrow(StorageLimitExceededError);
  });

  it("ILLEGAL: status checked before score (TransformationNotReadyError wins)", () => {
    // Even if score regresses, wrong status is reported first
    const agg = TransformationJobAggregate.load(
      makeJob({ status: "pending", score_after_overall: 3.0, score_before_overall: 8.0 }),
      BASE_STORAGE
    );
    expect(() => agg.save()).toThrow(TransformationNotReadyError);
  });
});
```

---

#### Faza 2 — Repozytorium + API route (wymaga Faza 1)

1. Utwórz `src/lib/domain/TransformationJobRepository.ts`
2. Zastąp ciało `save.ts` nową implementacją (thin route — parsowanie + delegacja + mapowanie błędów)
3. Usuń z `save.ts` inline logikę storage check (przeniesiona do agregatu)
4. Test manualny: `POST /api/transformations/:id/save` bez body → 409 gdy score regresja; z `{ override_regression: true }` → 200

---

#### Faza 3 — Callsite w UI (wymaga Faza 2)

1. `TransformationSession.tsx`: usuń pre-selection logikę na podstawie score (`linia 27–29`, `88–93`)
2. W `handleConfirmSave`: po 409 `ScoreRegressionError` — pokaż modal z deltą i przyciskiem „Zachowaj mimo to"; retry z `override_regression: true`
3. `TransformationJobCard.tsx`: brak zmian wymaganych (checkbox naturalnie obsługiwany przez wyniki API)
4. Test E2E (opcjonalny): zaloguj się → transformuj foto → jeśli 409 → potwierdź override → sprawdź `transformations.status = saved` w Supabase

---

### Nowe "load-bearing" nazwy do rejestru kontraktów

Jeśli projekt prowadzi rejestr kontraktów (`context/foundation/lessons.md` lub analogiczny):

| Nazwa | Typ | Opis |
|-------|-----|------|
| `TransformationJobAggregate` | Domain aggregate | Root egzekwujący I-1, I-4, I-5 |
| `TransformationJobRepository` | Repository | Ładuje agregat; persystuje stan po decyzji |
| `ScoreRegressionError` | Domain error | Naruszenie I-1; mapowany na HTTP 409 z delta payload |
| `TransformationNotReadyError` | Domain error | Naruszenie I-4; mapowany na HTTP 400 |
| `StorageLimitExceededError` | Domain error | Naruszenie I-5; mapowany na HTTP 400 |
| `override_regression` | API contract field | Explicit user acknowledgment — wymagany gdy 409 |
