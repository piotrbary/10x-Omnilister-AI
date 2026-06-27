---
title: "Omnilister AI — Anti-Corruption Layer Plan"
created: 2026-06-26
type: refactor-plan
source: context/domain/01-domain-distillation.md, context/domain/02-invariant-aggregate-refactor.md
---

# Anti-Corruption Layer Plan

## KROK 0 — Kontekst

### Stack

| Warstwa | Technologia |
|---------|-------------|
| UI/rendering | Astro 6 (SSR) + React 19 (islands) |
| API routes | Astro API routes (`.ts` serverless, Cloudflare Workers runtime) |
| Aplikacja/domena | `src/lib/` — quality-scoring.ts, transformation-processor.ts |
| Persystencja | Supabase: PostgreSQL (`@supabase/supabase-js ^2.99.1`) + Storage |
| Auth middleware | `@supabase/ssr ^0.10.3` (cookie-based) |
| AI provider | OpenRouter (raw `fetch`, brak npm-pakietu) — modele: GPT-4o, Gemini 2.5 Flash Image |

### Zależności zewnętrzne w `package.json`

Zewnętrzne SDK z potencjalnym przeciekiem warstw:
- `@supabase/supabase-js ^2.99.1` — klient DB + Storage
- `@supabase/ssr ^0.10.3` — SSR wrapper do tworzenia klienta
- OpenRouter — **brak npm-pakietu**; wołany wyłącznie przez `fetch` w `src/lib/openrouter-images.ts` i `src/lib/quality-scoring.ts`
- `zod ^4.4.1` — walidacja schematów; używany tylko na granicy API (DTO) — brak przecieku

### Warstwy kodu

```
pages/              ← routing + API routes (infra)
  api/              ← API routes: parse req → call lib → return Response
components/         ← React islands (UI)
lib/                ← DOMAIN/APPLICATION services (powinny być infra-agnostyczne)
  supabase.ts       ← adapter: tworzy SupabaseClient (jedyne dozwolone miejsce)
  quality-scoring.ts  ← PROBLEM: domain + infra razem
  transformation-processor.ts  ← PROBLEM: domain + infra razem
types/              ← shared types (DTO, domain)
middleware.ts       ← auth check (infra)
```

---

## KROK 1 — Identyfikacja przeciekających zależności

### Zależność A: `@supabase/supabase-js` — `SupabaseClient<Database>` przecieka do serwisów domenowych

| Plik | Linia | Forma przecieku |
|------|-------|-----------------|
| `src/lib/quality-scoring.ts` | 2 | `import type { SupabaseClient } from "@supabase/supabase-js"` |
| `src/lib/quality-scoring.ts` | 191 | `analyzeObject(..., supabase: SupabaseClient<Database>, ...)` — parametr sygnatury |
| `src/lib/transformation-processor.ts` | 1 | `import type { SupabaseClient } from "@supabase/supabase-js"` |
| `src/lib/transformation-processor.ts` | 11 | `processTransformationBatch(jobs, supabase: SupabaseClient<Database>, ...)` — parametr sygnatury |
| `src/lib/transformation-processor.ts` | 29 | `writeLog(supabase: SupabaseClient<Database>, ...)` — parametr sygnatury |
| `src/lib/transformation-processor.ts` | 43 | `processJob(job, supabase: SupabaseClient<Database>, ...)` — parametr sygnatury |
| `src/pages/api/objects/[objectId]/analyze.ts` | 77 | `analyzeObject(objectId, ids, supabase, userId)` — przekazanie klienta do domeny |
| `src/pages/api/transformations/start.ts` | 137 | `processTransformationBatch(jobs, supabase, model)` — przekazanie klienta do domeny |

### Zależność B: Nazwy kolumn/tabel Supabase duplikowane jako wiedza domenowa

| Plik | Linia | Forma |
|------|-------|-------|
| `src/pages/api/transformations/start.ts` | 78–93 | Manualne mapowanie wiersza `quality_scores` → `QualityScoreSnapshot` (kolumny: `sharpness`, `lighting`, ..., `overall_score`, `is_sales_ready`). Rekonstrukcja shape'u DTO z surowego row'a Supabase w warstwie API. |
| `src/lib/quality-scoring.ts` | 149–160 | Ten sam mapping z `gpt.scores` → `QualityScoreSnapshot` (lustrzane odbicie struktury kolumn DB) |
| `src/lib/quality-scoring.ts` | 254–274 | Manualne `supabase.from("quality_scores").insert({...})` z 11 kolumnami dosłownie wpisanymi |
| `src/lib/transformation-processor.ts` | 105–116 | `supabase.from("transformations").update({...})` z kolumnami `status`, `result_url`, `result_storage_path`, `result_file_size_bytes` — kolumny znane domenie |

### Zależność C: OpenRouter response shape duplikowany w dwóch plikach lib

| Plik | Linia | Forma |
|------|-------|-------|
| `src/lib/openrouter-images.ts` | 65 | `(await res.json()) as { choices: Array<{ message: { content: string } }> }` |
| `src/lib/openrouter-images.ts` | 115–121 | `type ImageChoice = { message: { content?: string; images?: Array<...> } }` |
| `src/lib/quality-scoring.ts` | 129 | `(await response.json()) as { choices?: Array<{ message?: { content?: string } }> }` |

---

## KROK 2 — Klasyfikacja i wybór #1

### Matryca

| # | Zależność | (a) Warstwy dotknięte | (b) Koszt wymiany dziś | (c) Intencja vs kod | Wynik |
|---|-----------|----------------------|-----------------------|---------------------|-------|
| **A** | `SupabaseClient<Database>` w sygnaturach serwisów domenowych | 3 warstwy: infra (Supabase) → serwis domenowy (lib) → API route (pages/api). **`SupabaseClient` jest typem argumentu PUBLICZNYCH FUNKCJI DOMENOWYCH**. Wymiana Supabase = przepisanie `analyzeObject` i `processTransformationBatch` | WYSOKI: każda zmiana dostawcy DB/Storage wymaga modyfikacji 2 serwisów domenowych; testy jednostkowe wymagają Supabase (lub złożonego mocka) | PRD §Non-Goals: „Brak własnego modelu do transformacji" — AI provider jest external i ma być wymienialna. Analogicznie: infra persistence nie jest wymieniona jako wymienialna, ALE `lib/` deklaruje się jako domena przez swoje nazwy (`quality-scoring`, `transformation-processor`) — rozjazd jest wprost zakodowany w strukturze katalogów | 🔴 **NAJGORSZY** |
| **B** | Nazwy kolumn DB duplikowane jako wiedza domenowa | 2 warstwy: API route + lib — ta sama struktura kolumn pisana dwukrotnie (start.ts i quality-scoring.ts) | ŚREDNI: zmiana schematu kolumny (np. `overall_score` → `score_overall`) wymaga edycji API route i serwisu domenowego | Brak deklaracji; naturalny kłopot wynikający z A | 🟠 OBJAW ZALEŻNOŚCI A |
| **C** | OpenRouter response shape duplikowany | 1 warstwa: lib — oba pliki są w `src/lib/` | NISKI: zmiana API OpenRouter → 2 miejsca, ale oba w tym samym pliku `lib` | Brak deklaracji o wymienialności modelu AI; ale `aiConfig.provider = "openrouter"` sugeruje świadomość | 🟡 RYZYKO ŚREDNIE |

### Wybrany przeciek: **A — `SupabaseClient<Database>` w sygnaturach serwisów domenowych**

**Uzasadnienie:**

Typ `SupabaseClient<Database>` z pakietu `@supabase/supabase-js` jest użyty jako **parametr czterech funkcji** w `src/lib/` — warstwie, która powinna być niezależna od infrastruktury. Skutki:

1. **Izolacja niemożliwa**: `analyzeObject` i `processTransformationBatch` są niepotestowalne bez prawdziwego Supabase lub złożonego, kłamliwego mocka całego `SupabaseClient`.
2. **Fusja odpowiedzialności**: `analyzeObject` (linia 179–316) robi jednocześnie: pobieranie zdjęć, generowanie signed URLs, wywoływanie AI, wstawianie do `quality_scores`, aktualizację tabeli `objects` — cały `SupabaseClient` jest potrzebny, bo funkcja nie zna swoich granic.
3. **Wymiana infra = przepisanie domeny**: zamiana Supabase na inny ORM/DB wymaga edycji `analyzeObject` i `processTransformationBatch`, mimo że te funkcje nie powinny wiedzieć nic o wyborze infra.
4. **Zależność B jest OBJAWEM A**: manualne mapowanie kolumn w `start.ts:80-93` istnieje, bo nie ma adaptera, który zwróciłby gotowy `QualityScoreSnapshot` — każde miejsce rekonstruuje go samodzielnie z surowego wiersza Supabase.

---

## KROK 3 — Diagnoza

### Fusja domeny z infrastrukturą w `analyzeObject`

**`src/lib/quality-scoring.ts:188–316`** — funkcja deklaruje się jako serwis domenowy (plik `quality-scoring.ts` w `src/lib/`), ale de facto jest orchestratorem infrastruktury:

```
analyzeObject(objectId, photoIds, supabase: SupabaseClient<Database>, userId)
│
├── supabase.from("photos").select(...)           ← infra: czyta z DB
├── supabase.from("objects").select(...)          ← infra: czyta z DB
├── supabase.storage.from("original-photos").createSignedUrl(...)  ← infra: Storage
├── _callGptVision(url, ...)                      ← DOMENA: wywołanie AI
├── supabase.from("quality_scores").insert({...}) ← infra: pisze do DB (11 kolumn)
└── supabase.from("objects").update({...})        ← infra: pisze do DB
```

Argument `supabase: SupabaseClient<Database>` (linia 191) to **wylot do pełnego klienta Supabase** — domena dostaje dostęp do całej bazy, nie tylko do tego, czego potrzebuje.

**`src/lib/transformation-processor.ts:9–158`** — analogiczna fuzja:

```
processTransformationBatch(jobs, supabase: SupabaseClient<Database>, ...)
│
└── processJob(job, supabase, ...)
    ├── supabase.from("photos").select(...)       ← infra: czyta
    ├── fetch(photoRow.original_url)              ← infra: pobiera bajty
    ├── generateFull(imageData, prompt, ...)      ← DOMENA: AI
    ├── supabase.storage.from("transformed-photos").upload(...) ← infra: Storage
    ├── supabase.storage.from(...).createSignedUrl(...)  ← infra: Storage
    └── supabase.from("transformations").update(...) ← infra: pisze status, score_after
```

### Duplikowana rekonstrukcja `QualityScoreSnapshot` — trzy miejsca, zero adaptera

**Miejsce 1: `src/pages/api/transformations/start.ts:78–93`** — API route ręcznie odtwarza snapshot z `quality_scores` row:

```typescript
// start.ts:80-92
latestScoreByPhotoId.set(row.photo_id, {
  sharpness:       row.sharpness,
  lighting:        row.lighting,
  background:      row.background,
  object_features: row.object_features,
  damage_defects:  row.damage_defects,
  labels:          row.labels,
  angle_coverage:  row.angle_coverage,
  sales_readiness: row.sales_readiness,
  overall:         row.overall_score,          // ← kolumna: overall_score, field: overall
  is_sales_ready:  row.is_sales_ready,
});
```

**Miejsce 2: `src/lib/quality-scoring.ts:149–160`** — serwis domenowy odtwarza snapshot z odpowiedzi GPT:

```typescript
// quality-scoring.ts:149-160
const snapshot: QualityScoreSnapshot = {
  sharpness:       gpt.scores.sharpness,
  lighting:        gpt.scores.lighting,
  background:      gpt.scores.background,
  object_features: gpt.scores.object_features,
  // ...
  overall,
  is_sales_ready: overall >= scoringConfig.salesReadinessThreshold,
};
```

**Miejsce 3: `src/lib/quality-scoring.ts:254–274`** — ten sam snapshot jest rozkładany z powrotem na 11 kolumn przy INSERT:

```typescript
// quality-scoring.ts:254-274
await supabase.from("quality_scores").insert({
  user_id, photo_id, category,
  sharpness:       snapshot.sharpness,
  lighting:        snapshot.lighting,
  background:      snapshot.background,
  object_features: snapshot.object_features,
  damage_defects:  snapshot.damage_defects,
  labels:          snapshot.labels,
  angle_coverage:  snapshot.angle_coverage,
  sales_readiness: snapshot.sales_readiness,
  overall_score:   snapshot.overall,           // ← odwrotny mapping: .overall → overall_score
  is_sales_ready:  snapshot.is_sales_ready,
})
```

Kolumna DB nazywa się `overall_score` (linia 269), ale domenowy typ ma pole `overall` (linia 150, `QualityScoreSnapshot`). **Ten mapping `overall ↔ overall_score` jest zakodowany w dwóch miejscach** (insert i select) — zmiana nazwy kolumny w DB wymaga edycji dwóch plików.

### Przekazanie klienta przez warstwę API → domenę (obejście adaptera)

**`src/pages/api/objects/[objectId]/analyze.ts:77`**:

```typescript
// analyze.ts:37 — tworzy klienta
const supabase = createClient(context.request.headers, context.cookies);
// analyze.ts:77 — wstrzykuje go BEZPOŚREDNIO do domeny
result = await analyzeObject(objectId, parsed.data.photo_ids, supabase, user.id);
```

**`src/pages/api/transformations/start.ts:37, 137`**:

```typescript
// start.ts:37
const supabase = createClient(context.request.headers, context.cookies);
// start.ts:137
await processTransformationBatch(jobs, supabase, model);
```

W obu przypadkach API route tworzy klienta Supabase i **podaje go bezpośrednio do serwisu domenowego** — `src/lib/supabase.ts` istnieje jako adapter, ale jest ominięty: adapter dostarcza klienta, który trafia do domeny.

---

## KROK 4 — Projekt ACL

### Trzy wąskie porty domenowe

```typescript
// src/lib/ports/photo-read-port.ts

export interface PhotoRecord {
  id: string;
  originalUrl: string;
  mimeType: string;
}

export interface PhotoReadPort {
  /** Pobiera metadane zdjęcia należącego do userId. */
  fetchPhoto(photoId: string, userId: string): Promise<PhotoRecord>;

  /** Pobiera wiele zdjęć obiektu (filtruje po liście ID). */
  fetchPhotosForObject(
    objectId: string,
    userId: string,
    photoIds: string[],
  ): Promise<PhotoRecord[]>;

  /** Generuje signed URL dla bucketu photos (oryginały). */
  createPhotoSignedUrl(storagePath: string, expiresSeconds: number): Promise<string>;

  /** Zwraca kategorię obiektu lub null. */
  fetchObjectCategory(objectId: string, userId: string): Promise<string | null>;
}
```

```typescript
// src/lib/ports/score-write-port.ts

import type { QualityScoreSnapshot } from "@/types/transformations";
import type { ObjectCategory } from "@/lib/config";

export interface ScoreWritePort {
  /**
   * Utrwala QualityScoreSnapshot dla zdjęcia.
   * Adapter odpowiada za mapowanie domenowych pól (overall, is_sales_ready)
   * na kolumny DB (overall_score, is_sales_ready).
   */
  insertScore(
    userId: string,
    photoId: string,
    category: ObjectCategory,
    snapshot: QualityScoreSnapshot,
  ): Promise<{ id: string }>;

  /** Aktualizuje kategorię i/lub features_text obiektu. */
  updateObjectCategoryIfNull(
    objectId: string,
    userId: string,
    category: ObjectCategory,
    featuresText: string | null,
  ): Promise<void>;

  /** Aktualizuje features_text obiektu niezależnie od kategorii. */
  updateObjectFeaturesText(objectId: string, userId: string, featuresText: string): Promise<void>;

  /**
   * Pobiera najnowszy QualityScoreSnapshot per photoId dla listy zdjęć.
   * Adapter robi deduplikację (ORDER BY created_at DESC, DISTINCT ON photo_id).
   */
  fetchLatestScores(
    photoIds: string[],
    userId: string,
  ): Promise<Map<string, QualityScoreSnapshot>>;
}
```

```typescript
// src/lib/ports/transformation-write-port.ts

import type { QualityScoreSnapshot } from "@/types/transformations";

export interface TransformationWritePort {
  /** Dołącza logi do transformacji (error_message). */
  appendLog(jobId: string, userId: string, logs: string[]): Promise<void>;

  /** Oznacza job jako full_ready i zapisuje result URL + path + size. */
  markReady(
    jobId: string,
    userId: string,
    opts: { storagePath: string; signedUrl: string; fileSizeBytes: number },
  ): Promise<void>;

  /** Zapisuje score_after po zakończeniu scoringu. */
  writeScoreAfter(
    jobId: string,
    userId: string,
    snapshot: QualityScoreSnapshot,
  ): Promise<void>;

  /** Oznacza job jako failed z logami. */
  markFailed(jobId: string, userId: string, logs: string[]): Promise<void>;

  /** Aktualizuje retry_count i logi. */
  updateRetryCount(
    jobId: string,
    userId: string,
    retryCount: number,
    logs: string[],
  ): Promise<void>;

  /**
   * Uploaduje przetransformowane zdjęcie do bucketu i zwraca signed URL.
   * Adapter ukrywa bucket name, content-type i opcje upsert.
   */
  uploadTransformedPhoto(
    storagePath: string,
    data: Uint8Array,
  ): Promise<{ signedUrl: string }>;
}
```

---

### Adapter Supabase (jedyne miejsce wiedzy o SDK)

```typescript
// src/lib/adapters/supabase-photo-read.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { PhotoReadPort, PhotoRecord } from "@/lib/ports/photo-read-port";

export class SupabasePhotoReadAdapter implements PhotoReadPort {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async fetchPhoto(photoId: string, userId: string): Promise<PhotoRecord> {
    const { data } = await this.db
      .from("photos")
      .select("id, original_url, mime_type")
      .eq("id", photoId)
      .eq("user_id", userId)
      .single();
    if (!data) throw new Error(`Photo not found: ${photoId}`);
    return { id: data.id, originalUrl: data.original_url, mimeType: data.mime_type };
  }

  async fetchPhotosForObject(objectId: string, userId: string, photoIds: string[]): Promise<PhotoRecord[]> {
    const { data } = await this.db
      .from("photos")
      .select("id, original_url, mime_type")
      .eq("object_id", objectId)
      .eq("user_id", userId)
      .in("id", photoIds);
    return (data ?? []).map((r) => ({ id: r.id, originalUrl: r.original_url, mimeType: r.mime_type }));
  }

  async createPhotoSignedUrl(storagePath: string, expiresSeconds: number): Promise<string> {
    const { data } = await this.db.storage
      .from("original-photos")
      .createSignedUrl(storagePath, expiresSeconds);
    return data?.signedUrl ?? storagePath;
  }

  async fetchObjectCategory(objectId: string, userId: string): Promise<string | null> {
    const { data } = await this.db
      .from("objects")
      .select("category")
      .eq("id", objectId)
      .eq("user_id", userId)
      .single();
    return data?.category ?? null;
  }
}
```

```typescript
// src/lib/adapters/supabase-score-write.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { ScoreWritePort } from "@/lib/ports/score-write-port";
import type { QualityScoreSnapshot } from "@/types/transformations";
import type { ObjectCategory } from "@/lib/config";

export class SupabaseScoreWriteAdapter implements ScoreWritePort {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async insertScore(
    userId: string,
    photoId: string,
    category: ObjectCategory,
    snap: QualityScoreSnapshot,
  ): Promise<{ id: string }> {
    const { data } = await this.db
      .from("quality_scores")
      .insert({
        user_id: userId,
        photo_id: photoId,
        category,
        sharpness:       snap.sharpness,
        lighting:        snap.lighting,
        background:      snap.background,
        object_features: snap.object_features,
        damage_defects:  snap.damage_defects,
        labels:          snap.labels,
        angle_coverage:  snap.angle_coverage,
        sales_readiness: snap.sales_readiness,
        overall_score:   snap.overall,       // ← mapping overall → overall_score tylko tu
        is_sales_ready:  snap.is_sales_ready,
      })
      .select("id")
      .single();
    if (!data) throw new Error("DB insert failed for quality_scores");
    return { id: data.id };
  }

  async fetchLatestScores(photoIds: string[], userId: string): Promise<Map<string, QualityScoreSnapshot>> {
    const { data } = await this.db
      .from("quality_scores")
      .select("photo_id, sharpness, lighting, background, object_features, damage_defects, labels, angle_coverage, sales_readiness, overall_score, is_sales_ready, created_at")
      .in("photo_id", photoIds)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const result = new Map<string, QualityScoreSnapshot>();
    for (const row of data ?? []) {
      if (!result.has(row.photo_id)) {
        result.set(row.photo_id, {
          sharpness:       row.sharpness,
          lighting:        row.lighting,
          background:      row.background,
          object_features: row.object_features,
          damage_defects:  row.damage_defects,
          labels:          row.labels,
          angle_coverage:  row.angle_coverage,
          sales_readiness: row.sales_readiness,
          overall:         row.overall_score,  // ← mapping overall_score → overall tylko tu
          is_sales_ready:  row.is_sales_ready,
        });
      }
    }
    return result;
  }

  async updateObjectCategoryIfNull(objectId: string, userId: string, category: ObjectCategory, featuresText: string | null): Promise<void> {
    const payload: { category: ObjectCategory; features_text?: string } = { category };
    if (featuresText) payload.features_text = featuresText;
    await this.db.from("objects").update(payload).eq("id", objectId).eq("user_id", userId);
  }

  async updateObjectFeaturesText(objectId: string, userId: string, featuresText: string): Promise<void> {
    await this.db.from("objects").update({ features_text: featuresText }).eq("id", objectId).eq("user_id", userId);
  }
}
```

```typescript
// src/lib/adapters/supabase-transformation-write.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { TransformationWritePort } from "@/lib/ports/transformation-write-port";
import type { QualityScoreSnapshot } from "@/types/transformations";

export class SupabaseTransformationWriteAdapter implements TransformationWritePort {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async appendLog(jobId: string, userId: string, logs: string[]): Promise<void> {
    await this.db.from("transformations")
      .update({ error_message: logs.join("\n"), updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("user_id", userId);
  }

  async markReady(jobId: string, userId: string, opts: { storagePath: string; signedUrl: string; fileSizeBytes: number }): Promise<void> {
    await this.db.from("transformations")
      .update({
        status: "full_ready",
        result_url: opts.signedUrl,
        result_storage_path: opts.storagePath,
        result_file_size_bytes: opts.fileSizeBytes,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId).eq("user_id", userId);
  }

  async writeScoreAfter(jobId: string, userId: string, snapshot: QualityScoreSnapshot): Promise<void> {
    await this.db.from("transformations")
      .update({ score_after: snapshot as unknown as import("@/types/database.generated").Json, updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("user_id", userId);
  }

  async markFailed(jobId: string, userId: string, logs: string[]): Promise<void> {
    await this.db.from("transformations")
      .update({ status: "failed", error_message: logs.join("\n"), updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("user_id", userId);
  }

  async updateRetryCount(jobId: string, userId: string, count: number, logs: string[]): Promise<void> {
    await this.db.from("transformations")
      .update({ retry_count: count, error_message: logs.join("\n"), updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("user_id", userId);
  }

  async uploadTransformedPhoto(storagePath: string, data: Uint8Array): Promise<{ signedUrl: string }> {
    const { error } = await this.db.storage
      .from("transformed-photos")
      .upload(storagePath, new Blob([data.buffer as ArrayBuffer], { type: "image/jpeg" }), {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data: signed } = await this.db.storage
      .from("transformed-photos")
      .createSignedUrl(storagePath, 86400);
    if (!signed?.signedUrl) throw new Error("Failed to create signed URL after upload");
    return { signedUrl: signed.signedUrl };
  }
}
```

---

### Sygnatury serwisów po refaktorze (bez `SupabaseClient`)

```typescript
// src/lib/quality-scoring.ts — AFTER

export async function analyzeObject(
  objectId: string,
  photoIds: string[],
  userId: string,
  // ↓ TYLKO porty — bez SupabaseClient
  photos: PhotoReadPort,
  scores: ScoreWritePort,
): Promise<ObjectAnalysisResult> { /* ... */ }
```

```typescript
// src/lib/transformation-processor.ts — AFTER

export async function processTransformationBatch(
  jobs: TransformationJob[],
  // ↓ TYLKO porty
  photos: PhotoReadPort,
  transform: TransformationWritePort,
  model?: string,
): Promise<void> { /* ... */ }
```

### Fabryka adapterów w API routes (jedyne miejsce komponowania)

```typescript
// Wewnątrz każdego API route, zamiast supabase do domeny:

const supabase = createClient(context.request.headers, context.cookies);
if (!supabase) return json({ error: "Service unavailable" }, 503);

// Buduj adaptery w route, NIE przekazuj supabase
const photoReader = new SupabasePhotoReadAdapter(supabase);
const scoreWriter = new SupabaseScoreWriteAdapter(supabase);

const result = await analyzeObject(objectId, photoIds, user.id, photoReader, scoreWriter);
```

Wartość kluczowa: `supabase` istnieje i jest używane w routes (do autoryzacji, resource-fetch itp.) — ACL nie zabrania tego. Zabrania podawania go do `src/lib/` jako parametru.

---

## KROK 5 — Dowód izolacji + before/after

### Zmiana biblioteki (Supabase → PostgreSQL+MinIO) dotyka TYLKO adapterów

| Plik/moduł | BEFORE (zna Supabase?) | AFTER |
|------------|------------------------|-------|
| `src/lib/adapters/supabase-photo-read.ts` | — (nowy plik) | ✅ ZNA — jedyne dozwolone miejsce |
| `src/lib/adapters/supabase-score-write.ts` | — (nowy plik) | ✅ ZNA — jedyne dozwolone miejsce |
| `src/lib/adapters/supabase-transformation-write.ts` | — (nowy plik) | ✅ ZNA — jedyne dozwolone miejsce |
| `src/lib/supabase.ts` | ✅ ZNA | ✅ ZNA — adapter klienta (bez zmian) |
| `src/lib/quality-scoring.ts` | 🔴 ZNA (`import`, parametr) | ✅ NIE ZNA — tylko porty |
| `src/lib/transformation-processor.ts` | 🔴 ZNA (`import`, parametr x3) | ✅ NIE ZNA — tylko porty |
| `src/pages/api/*/` — wszystkie routes | ✅ ZNA (przez createClient) | ✅ ZNA (createClient + new Adapter) — budowanie adapterów to OK |
| `src/components/` | ✅ NIE ZNA (bez zmian) | ✅ NIE ZNA |
| `src/types/transformations.ts` | ✅ NIE ZNA (bez zmian) | ✅ NIE ZNA |

**Wymiana infra (Supabase → cokolwiek) = napisanie nowego zestawu adapterów. Żaden serwis domenowy (`src/lib/quality-scoring.ts`, `transformation-processor.ts`) nie jest dotknięty.**

---

### Before/After — zduplikowane miejsca rekonstrukcji `QualityScoreSnapshot`

#### Mapowanie `overall_score → overall` (BEFORE — 2 miejsca)

**BEFORE `src/pages/api/transformations/start.ts:89`:**
```typescript
overall: row.overall_score,   // ← API route zna nazwę kolumny DB
```

**BEFORE `src/lib/quality-scoring.ts:269`:**
```typescript
overall_score: snapshot.overall,  // ← domenowy serwis zna nazwę kolumny DB
```

#### AFTER — tylko adapter

**AFTER `src/lib/adapters/supabase-score-write.ts`:**
```typescript
// fetchLatestScores (insert i read w jednym adapterze)
overall: row.overall_score,   // ← mapping tylko tu

// insertScore
overall_score: snap.overall,  // ← mapping tylko tu
```

`start.ts` po refaktorze:
```typescript
// Zamiast ręcznego mapowania:
const latestScores = await scoreWriter.fetchLatestScores(photo_ids, user.id);
// → latestScores to już Map<photoId, QualityScoreSnapshot> — gotowy domenowy typ
```

---

### Before/After — sygnatury serwisów domenowych

#### `analyzeObject`

| | BEFORE | AFTER |
|---|--------|-------|
| Sygnatura | `analyzeObject(id, ids, supabase: SupabaseClient<Database>, userId)` | `analyzeObject(id, ids, userId, photos: PhotoReadPort, scores: ScoreWritePort)` |
| Import w pliku | `import type { SupabaseClient } from "@supabase/supabase-js"` | brak importu z `@supabase/` |
| Testowalność | Wymaga mockowania całego `SupabaseClient` | Wymaga implementacji 2 interfejsów (in-memory lub stub) |
| Wiedza o DB | Zna tabele: `photos`, `objects`, `quality_scores`; bucket: `original-photos` | NIE zna tabel ani bucketów |

#### `processTransformationBatch`

| | BEFORE | AFTER |
|---|--------|-------|
| Sygnatura | `processTransformationBatch(jobs, supabase: SupabaseClient<Database>, model?)` | `processTransformationBatch(jobs, photos: PhotoReadPort, transform: TransformationWritePort, model?)` |
| Import w pliku | `import type { SupabaseClient } from "@supabase/supabase-js"` | brak importu z `@supabase/` |
| Wiedza o DB | Zna tabele: `photos`, `transformations`; bucket: `transformed-photos` | NIE zna tabel ani bucketów |

---

## KROK 6 — Weryfikacja + plan faz

### Kryterium sukcesu

**Grep po `@supabase/supabase-js` zwraca TYLKO pliki w katalogu `adapters/` i `src/lib/supabase.ts`.**

#### Pliki, które DZIŚ znają `@supabase/supabase-js`:

```
src/lib/quality-scoring.ts        ← import + parametr sygnatur
src/lib/transformation-processor.ts ← import + parametr sygnatur x3
src/env.d.ts                      ← typ User w Astro.locals (akceptowalny — infra)
src/lib/supabase.ts               ← adapter (dozwolony)
```

_(Pliki `pages/api/` importują tylko `@/lib/supabase`, nie `@supabase/supabase-js` bezpośrednio.)_

#### Pliki, które PO REFAKTORZE znają `@supabase/supabase-js`:

```
src/lib/supabase.ts                          ← adapter klienta (bez zmian)
src/lib/adapters/supabase-photo-read.ts      ← nowy adapter
src/lib/adapters/supabase-score-write.ts     ← nowy adapter
src/lib/adapters/supabase-transformation-write.ts ← nowy adapter
src/env.d.ts                                 ← Astro.locals typ (bez zmian)
```

`src/lib/quality-scoring.ts` i `src/lib/transformation-processor.ts` — **nie pojawiają się w wyniku grep.**

---

### Plan faz

#### Faza 1 — Definicja portów (brak zmian w kodzie produkcyjnym)

1. Utwórz katalog `src/lib/ports/`
2. Napisz `photo-read-port.ts` z interfejsem `PhotoReadPort`
3. Napisz `score-write-port.ts` z interfejsem `ScoreWritePort`
4. Napisz `transformation-write-port.ts` z interfejsem `TransformationWritePort`

Kryterium: `tsc --noEmit` przechodzi; żaden istniejący plik nie jest modyfikowany.

---

#### Faza 2 — Adaptery Supabase (test-first dla mapowań)

1. Utwórz katalog `src/lib/adapters/`
2. Napisz `SupabasePhotoReadAdapter` implementujący `PhotoReadPort`
3. Napisz `SupabaseScoreWriteAdapter` implementujący `ScoreWritePort` — szczególnie `fetchLatestScores` i `insertScore` (mappingi `overall_score ↔ overall`)
4. Napisz `SupabaseTransformationWriteAdapter` implementujący `TransformationWritePort`
5. Napisz testy jednostkowe dla mapowań (in-memory stubs portów, bez Supabase):
   - `fetchLatestScores` — deduplikacja (najnowszy per photo_id)
   - `insertScore` — poprawne mapowanie `snap.overall → overall_score`

Kryterium: `npm test` zielony; nowe adaptery mają 100% pokrycia gałęzi w mapowaniach.

---

#### Faza 3 — Refactor `quality-scoring.ts`

1. Usuń `import type { SupabaseClient } from "@supabase/supabase-js"` z `quality-scoring.ts`
2. Dodaj import portów: `import type { PhotoReadPort } from "./ports/photo-read-port"`, `import type { ScoreWritePort } from "./ports/score-write-port"`
3. Zmień sygnaturę `analyzeObject`: podmień `supabase: SupabaseClient<Database>` na `photos: PhotoReadPort, scores: ScoreWritePort`
4. Zastąp wewnętrzne wywołania Supabase wywołaniami portów
5. Zaktualizuj `src/pages/api/objects/[objectId]/analyze.ts`: utwórz adaptery, przekaż je zamiast `supabase`

Kryterium: `grep -r "@supabase/supabase-js" src/lib/quality-scoring.ts` → brak wyników; `npm test` zielony.

---

#### Faza 4 — Refactor `transformation-processor.ts`

1. Usuń `import type { SupabaseClient } from "@supabase/supabase-js"` z `transformation-processor.ts`
2. Dodaj importy portów
3. Zmień sygnatury `processTransformationBatch`, `writeLog` (usuń), `processJob`
4. Zastąp wywołania Supabase wywołaniami portów
5. Zaktualizuj `src/pages/api/transformations/start.ts`: utwórz adaptery, przekaż je

Kryterium: `grep -r "@supabase/supabase-js" src/lib/transformation-processor.ts` → brak wyników; `npm test` zielony.

---

#### Faza 5 — Usunięcie duplikacji w `start.ts`

1. Usuń ręczne mapowanie kolumn Supabase → `QualityScoreSnapshot` z `start.ts:78-93`
2. Zastąp wywołaniem `scoreWriter.fetchLatestScores(photo_ids, user.id)`

Kryterium: `start.ts` nie zawiera nazw kolumn `sharpness`, `overall_score`, `is_sales_ready` ani nazw tabel `quality_scores` dosłownie wpisanych poza wywołaniem adaptera.

---

#### Faza 6 — Weryfikacja grep + typecheck

```bash
# Musi zwrócić TYLKO: src/lib/supabase.ts, src/lib/adapters/*.ts, src/env.d.ts
grep -r "from \"@supabase/supabase-js\"" src/

# Musi przejść bez błędów
npm run typecheck
npm test
```

---

### Nowe artefakty po refaktorze

| Artefakt | Katalog | Rola |
|----------|---------|------|
| `PhotoReadPort` | `src/lib/ports/` | Interfejs domenowy odczytu zdjęć |
| `ScoreWritePort` | `src/lib/ports/` | Interfejs domenowy zapisu score'ów |
| `TransformationWritePort` | `src/lib/ports/` | Interfejs domenowy zapisu stanu transformacji |
| `SupabasePhotoReadAdapter` | `src/lib/adapters/` | Jedyne miejsce wiedzy o `original-photos` bucket i tabeli `photos` |
| `SupabaseScoreWriteAdapter` | `src/lib/adapters/` | Jedyne miejsce mappingu `overall ↔ overall_score` |
| `SupabaseTransformationWriteAdapter` | `src/lib/adapters/` | Jedyne miejsce wiedzy o `transformations` i `transformed-photos` |
