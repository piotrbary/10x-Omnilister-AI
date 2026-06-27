---
date: 2026-06-26T00:00:00+02:00
researcher: claude-sonnet-4-6
git_commit: 25f46672d3f469aaf1927efd43b37deecfaf330f
branch: UX_REDESIGN
repository: piotrbary/10x-Omnilister-AI
topic: "Jak głęboko Core subdomeny są rozsmarowane po warstwach (lib / api-routes / frontend / db)"
tags: [research, codebase, quality-scoring, transformation, guardrail, layer-spread, domain-bleed]
status: complete
last_updated: 2026-06-26
last_updated_by: claude-sonnet-4-6
---

# Research: Core subdomain layer spread — Omnilister AI

**Date**: 2026-06-26  
**Researcher**: claude-sonnet-4-6  
**Git Commit**: 25f4667  
**Branch**: UX_REDESIGN  
**Repository**: piotrbary/10x-Omnilister-AI

## Research Question

Jak głęboko 3 Core subdomeny (Quality Scoring per-kategoria, Guardrail no-distortion, Sesja
transformacji AI) są dziś rozsmarowane po warstwach architektonicznych? Które warstwy zawierają
logikę domenową, która powinna mieszkać wyłącznie w `src/lib/`?

Wejście: `context/domain/01-domain-distillation.md` (18 pojęć UL, 5 agregatów, 7 rozjazdów D-1–D-7).

---

## Summary

| Subdomena | Główny moduł | Call-sites produkcyjne | Pliki z wyciekiem | Gross severity |
|-----------|-------------|----------------------|-------------------|----------------|
| Quality Scoring | `quality-scoring.ts` | 3 (analyze, quality-scores/photo, transformation-processor) | **13** | HIGH — progi hardkodowane 3× w komponentach; DIMENSIONS 5× |
| Sesja transformacji | `transformation-processor.ts` + routes | 1 `processTransformationBatch` | **8** | MEDIUM — logika biznesowa w routes (dedup, storage check, guard statusu); status strings 3× w UI |
| Guardrail no-distortion | `transformation-styles.ts:buildPrompt` | 2 (start.ts, guest.ts) | **0 wycieków** | ✅ ENFORCED — brak ścieżek bypass; constant prywatny; testy potwierdzają |

**Kluczowy wniosek**: Guardrail jest najlepiej izolowaną Core subdomeną. Quality Scoring ma
najpoważniejszy "smear" — progi domenowe (`salesReadinessThreshold = 7`) i lista wymiarów
(`SCORE_DIMENSIONS`) są niezależnie reimplementowane w 5 plikach komponentów, co przy każdej
zmianie PRD wymaga ręcznej synchronizacji w 5 miejscach.

---

## Detailed Findings

### A. Quality Scoring — Fan-in i wycieki

#### A1. Call-sites `analyzeObject` (główny entry point)

| Plik | Linia | Rola |
|------|-------|------|
| [`src/pages/api/objects/[objectId]/analyze.ts:4`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/api/objects/%5BobjectId%5D/analyze.ts#L4) | import | API route |
| [`src/pages/api/objects/[objectId]/analyze.ts:77`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/api/objects/%5BobjectId%5D/analyze.ts#L77) | `await analyzeObject(objectId, parsed.data.photo_ids, supabase, userId)` | jedyny producyjny call-site |

**Jeden call-site.** Funkcja przyjmuje `SupabaseClient<Database>` jako parametr → zależność
infrastrukturalna wciągnięta do sygnatury domenowej (rozjazd z `03-anti-corruption-layer.md`).

#### A2. Call-sites `scorePhoto` (per-photo scoring)

| Plik | Linia | Kontekst |
|------|-------|---------|
| [`src/pages/api/quality-scores/photo/[photoId].ts:4,134`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/api/quality-scores/photo/%5BphotoId%5D.ts#L134) | `await scorePhoto(photo.original_url, category, aiConfig.previewModel)` | on-demand scoring z tanim modelem |
| [`src/lib/transformation-processor.ts:7,120`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/lib/transformation-processor.ts#L120) | `await scorePhoto(resultUrl, category)` | score_after po pełnej transformacji |

#### A3. Bezpośrednie zapytania do tabeli `quality_scores` poza `src/lib/`

| Plik | Linia | Operacja | Layer |
|------|-------|----------|-------|
| `src/pages/api/quality-scores/photo/[photoId].ts:37–44` | SELECT latest | API route |
| `src/pages/api/quality-scores/photo/[photoId].ts:95–103` | SELECT (cache check) | API route |
| `src/pages/api/quality-scores/photo/[photoId].ts:140–154` | INSERT score_after | API route |
| `src/pages/api/transformations/start.ts:67–74` | SELECT scores for score_before | API route |
| [`src/pages/objects/[objectId].astro:63–70`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/objects/%5BobjectId%5D.astro#L63) | SELECT all | **Astro SSR page** |
| [`src/pages/objects/[objectId]/transform.astro:64–70`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/objects/%5BobjectId%5D/transform.astro#L64) | SELECT + dedup | **Astro SSR page** |

Brak repozytorium / query obiektu — każdy konsument pisze własne zapytanie.

#### A4. `salesReadinessThreshold = 7` hardkodowany w komponentach (HIGH)

Jedyne źródło prawdy: [`src/lib/config.ts:85`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/lib/config.ts#L85)

| Plik | Linia | Hardkod |
|------|-------|---------|
| [`src/components/AnalysisSection.tsx:52–56`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/AnalysisSection.tsx#L52) | `if (score >= 7)` | `scoreColor()` |
| [`src/components/editor/ScoreBreakdown.tsx:14–18`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/editor/ScoreBreakdown.tsx#L14) | `if (score >= 7)` | `scoreBarColor()` |
| [`src/components/editor/ScoreSidebar.tsx:14–18`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/editor/ScoreSidebar.tsx#L14) | `if (val >= 7)` | `scoreColor()` |

Jeśli PRD podniesie próg z 7 do 7.5 — UI będzie pokazywać błędne kolory mimo poprawnego backendu.

#### A5. `SCORE_DIMENSIONS` duplikowane w 5 plikach (HIGH)

Źródło w [`src/lib/quality-scoring.ts:9–18`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/lib/quality-scoring.ts#L9) — **nie jest eksportowane**.

Niezależne kopie w:

| Plik | Linia | Język etykiet |
|------|-------|--------------|
| [`src/components/AnalysisSection.tsx:33–42`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/AnalysisSection.tsx#L33) | EN |
| [`src/components/editor/ScoreBreakdown.tsx:3–12`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/editor/ScoreBreakdown.tsx#L3) | PL (pełne) |
| [`src/components/editor/ScoreSidebar.tsx:3–12`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/editor/ScoreSidebar.tsx#L3) | PL (skrócone) |
| [`src/components/transformation/TransformationJobCard.tsx:15–24`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/transformation/TransformationJobCard.tsx#L15) | EN |

Zmiana nazwy wymiaru (np. `object_features` → `product_features`) wymaga aktualizacji 5 miejsc.

---

### B. Sesja Transformacji — Fan-in i logika w routes

#### B1. `processTransformationBatch` — jeden call-site

| Plik | Linia | Kontekst |
|------|-------|---------|
| [`src/pages/api/transformations/start.ts:137`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/api/transformations/start.ts#L137) | `await processTransformationBatch(jobs, supabase, model)` | synchronicznie, brak error wrapping |

Dobra izolacja — przetwarzanie wsadowe jest w `src/lib/`. Problem: brak try/catch wokół wywołania.

#### B2. Logika domenowa w routes

| Route | Linia | Logika w route (zamiast lib) | Ocena |
|-------|-------|------------------------------|-------|
| `start.ts:76–93` | Deduplication `quality_scores` → wybór najnowszego per photo | Kandydat do wyciągnięcia do lib |
| `start.ts:97–115` | INSERT `transformations` z `status: "pending"` | CRUD, OK w route |
| `save.ts:32–37` | Guard `if (job.status !== "full_ready")` — state machine check | Business rule w route |
| [`save.ts:40–58`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/api/transformations/%5BjobId%5D/save.ts#L40) | Storage check `storage_used_bytes + resultSize ≤ Max_Client_Repository` | Business rule w route |

#### B3. `TransformationStatus` — strings hardkodowane poza typem

Definicja: [`src/types/transformations.ts:3`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/types/transformations.ts#L3)

| Plik | Linia | String | Kontekst |
|------|-------|--------|---------|
| [`TransformationJobCard.tsx:39–41`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/transformation/TransformationJobCard.tsx#L39) | `=== "full_ready"`, `=== "failed"` | `isTerminal`, `isFailed` w UI |
| [`TransformationSession.tsx:130,220–221,280`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/transformation/TransformationSession.tsx#L130) | `=== "full_ready"`, `=== "saved"` | Save-eligibility filter |
| [`EditorShell.tsx:581,587`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/editor/EditorShell.tsx#L581) | `=== "full_ready"`, `=== "failed"` | Warunkowe renderowanie |
| [`transform.astro:99`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/objects/%5BobjectId%5D/transform.astro#L99) | `.eq("status", "full_ready")` | SSR page query |

Brak predykatu `isReadyToSave(status)` — logika rozsmarowana w 4 lokalizacjach.

#### B4. Podwójna generacja Signed URL

| Plik | Linia | Kontekst |
|------|-------|---------|
| [`src/lib/transformation-processor.ts:97–99`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/lib/transformation-processor.ts#L97) | Generuje i zapisuje do DB `result_url` |
| [`src/pages/api/transformations/[jobId]/result-url.ts:37`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/api/transformations/%5BjobId%5D/result-url.ts#L37) | Regeneruje `signedUrl` na żądanie |

Dwie ścieżki do tego samego zasobu — ryzyko rozbieżności przy zmianie storage path format.

#### B5. `score_after > score_before` — porównanie w UI zamiast serwera

| Plik | Linia | Logika |
|------|-------|--------|
| [`TransformationSession.tsx:28,92`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/transformation/TransformationSession.tsx#L28) | `after.overall > before.overall ? auto-check save` | Reguła biznesowa `init[job.id]` w komponencie |

To rozjazd D-1 z distylacji — Primary Success Criteria nie tylko nie jest egzekwowane serwerowo,
ale reguła domyślnego zaznaczenia "zapisz" żyje wyłącznie w komponencie React.

---

### C. Guardrail no-distortion — ENFORCED (brak wycieków)

#### C1. Definicja i enkapsulacja

[`src/lib/transformation-styles.ts:3–4`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/lib/transformation-styles.ts#L3)  
`const NO_DISTORTION_GUARDRAIL = "IMPORTANT: Do NOT add, remove, or alter..."` — **nie eksportowany**.

#### C2. Call-sites `buildPrompt`

| Plik | Linia | Ścieżka |
|------|-------|--------|
| [`src/pages/api/transformations/start.ts:95`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/api/transformations/start.ts#L95) | Auth flow | `buildPrompt(style_name, custom_prompt)` |
| [`src/pages/api/transformations/guest.ts:41`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/pages/api/transformations/guest.ts#L41) | Guest flow | `buildPrompt(body.style_name, body.custom_prompt)` |

Obie ścieżki wejścia do AI pokryte. Guardrail jest zawsze ostatnim elementem w prompt (nie może
być nadpisany przez `custom_prompt` — append, nie replace).

#### C3. Analiza bypass — wynik: ZERO

Zbadano: bezpośrednie wywołania `fetch` do OpenRouter poza `buildPrompt`, template literals
z promptami w routes/komponentach, modyfikacja `PRESET_STYLES` w runtime, eksport stałej.
**Żaden bypass nie istnieje.**

Testy w [`src/lib/transformation-styles.test.ts`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/lib/transformation-styles.test.ts)
weryfikują guardrail w obu wariantach (bez i z custom_prompt). Regresja jest wykrywalna.

---

### D. Wycieki kategorii do frontendu

Kategoria obiektu (`car | real-estate | item`) zdefiniowana w
[`src/lib/config.ts:91`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/lib/config.ts#L91)
— ale **niezeksportowana jako stała lista**. Efekt: 4 niezależne kopie w komponentach.

| Plik | Linia | Problem |
|------|-------|---------|
| [`EditorShell.tsx:22–26`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/editor/EditorShell.tsx#L22) | `VALID_CATEGORIES = ["car", "real-estate", "item"]` | Walidacja w komponencie |
| [`CategorySelector.tsx:8–12`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/editor/CategorySelector.tsx#L8) | `CATEGORY_OPTIONS` — PL labels | Display |
| [`TransformToolbar.tsx:7–11`](https://github.com/piotrbary/10x-Omnilister-AI/blob/25f46672d3f469aaf1927efd43b37deecfaf330f/src/components/editor/TransformToolbar.tsx#L7) | `CATEGORY_OPTIONS` — PL labels | Display |
| `AnalysisSection.tsx:44–48` | `CATEGORY_LABELS` — EN labels | Display |

---

## Code References

Warstwy przytknięte do Core:

- `src/lib/quality-scoring.ts` — Core scoring (nie eksportuje `SCORE_DIMENSIONS`)
- `src/lib/transformation-styles.ts` — Core guardrail (prywatna stała, dobrze zaprojektowane)
- `src/lib/transformation-processor.ts:120` — `scorePhoto` po transformacji
- `src/pages/api/objects/[objectId]/analyze.ts:77` — jedyny call-site `analyzeObject`
- `src/pages/api/quality-scores/photo/[photoId].ts:134` — on-demand `scorePhoto`
- `src/pages/api/transformations/start.ts:76–93,95,137` — dedup score_before + buildPrompt + delegate
- `src/pages/api/transformations/[jobId]/save.ts:32–58` — status guard + storage check
- `src/components/AnalysisSection.tsx:33–56` — DIMENSIONS + scoreColor (duplikat + hardkod)
- `src/components/editor/ScoreBreakdown.tsx:3–18` — DIMENSIONS + scoreBarColor
- `src/components/editor/ScoreSidebar.tsx:3–18` — DIMENSIONS + scoreColor
- `src/components/transformation/TransformationJobCard.tsx:15–41` — SCORE_DIMENSIONS + status strings
- `src/components/transformation/TransformationSession.tsx:28,130,220,280` — score delta + status filter
- `src/components/editor/EditorShell.tsx:22–26,581,587` — VALID_CATEGORIES + status strings

---

## Architecture Insights

### Gradient izolacji Core subdomen

```
Guardrail (best) ───────────────────────────────── Quality Scoring (worst)
     │                     │                              │
  2 call-sites          1 call-site               3 call-sites
  0 bypass paths        processTransformationBatch  13 affected files
  private constant      logika biznesowa w routes  5× DIMENSIONS duplikat
  testy potwierdzają    status strings w 4 UI       3× hardkodowany próg 7
```

### Wzorzec anty-korupcyjny w practice

Wszystkie 3 Core subdomeny wciągają `SupabaseClient<Database>` do sygnatur — zgodnie z
`03-anti-corruption-layer.md` to główna luka. `analyzeObject(supabase)` i `processTransformationBatch(supabase)`
nie mogą być testowane bez pełnego mocka Supabase.

### Brak eksportowanego modułu domeny UI

`src/lib/` nie eksportuje:
- `SCORE_DIMENSIONS` (nie eksportowane z `quality-scoring.ts`)
- `SCORE_THRESHOLDS` (hardkodowane w config.ts ale nie jako re-używalny obiekt)
- `scoreToColor()` / `isReadyToSave()` / `isTerminalStatus()` helper functions
- `CATEGORY_LIST` (config.ts trzyma tablicę, nie eksportuje jej jako const)

To tworzy próżnię, którą każdy komponent wypełnia własną kopią.

### Dwie drogi generowania signed URL

`transformation-processor.ts` generuje + zapisuje `result_url`. `result-url.ts` regeneruje na
żądanie. Brak informacji dlaczego obie ścieżki istnieją — prawdopodobnie URL wygasają i regeneracja
jest potrzebna, ale nie jest to zakomentowane.

---

## Historical Context (from prior changes)

- `context/archive/` — brak archiwalnego researchu bezpośrednio o layer spread
- `context/changes/refactor-opportunities/` — zbliżony temat; klasyfikował moduły pod kątem blast
  radius i ryzyk testowalności (wynik: `quality-scoring.ts` i `transformation-processor.ts` jako
  top hub z fan-in > 15); nie badał wycieku do frontendu
- `context/domain/03-anti-corruption-layer.md` — identyfikuje `SupabaseClient<Database>` w
  sygnaturach jako największy problem; proponuje `PhotoReadPort`, `ScoreWritePort`,
  `TransformationWritePort`; niniejszy research potwierdza problem i dodaje wymiar UI bleed

---

## Open Questions

1. **Signed URL lifecycle**: Dlaczego `result-url.ts` regeneruje URL skoro `transformation-processor.ts` już
   go generuje i zapisuje? Czy URL wygasają szybciej niż 60s expiry transformacji? Brak komentarza
   w kodzie.

2. **`overall` vs `overall_score` mapping**: Distylacja mówi o duplikacie mapowania w 3 miejscach.
   Research potwierdza odczyty `snapshot.overall` w komponentach i `score_after?.overall` w
   TransformationJobCard — czy DB zwraca `overall` czy `overall_score`? Jeśli `overall_score`, gdzie
   jest mapowanie i czy jest kompletne?

3. **`buildPromptFromRaw` — Phase 2**: Funkcja jest zaimplementowana i eksportowana, ale nie jest
   używana w produkcji. Kiedy globalny styl z DB będzie wybrany przez usera — który route wywoła
   `buildPromptFromRaw`? `start.ts` obecnie robi `buildPrompt(style_name, custom_prompt)` co obsługuje
   tylko presety. Zmiana nie jest zaplanowana w `context/changes/global-style-library/plan.md`?

4. **Retry na dwóch poziomach**: `transformation-processor.ts` ma retry na poziomie batcha (≤2);
   `quality-scoring.ts` ma własny retry na poziomie AI call. Komponent liczy tylko retry z batcha.
   Czy użytkownik jest wprowadzany w błąd — widzi "retry_count = 1" gdy tak naprawdę AI call był
   wywołany 3× (1 batch retry × 3 AI call retries)?

---

## Ranking punktów naprawczych (według blast radius × PRD severity)

| # | Problem | Pliki dotknięte | PRD severity | Quick fix |
|---|---------|----------------|--------------|-----------|
| 1 | `SCORE_DIMENSIONS` nie eksportowane z lib | 5 komponentów | MEDIUM | Export z `quality-scoring.ts` lub nowy `domain-constants.ts` |
| 2 | `salesReadinessThreshold` hardkodowany 3× w UI | 3 komponenty | HIGH (D-1 connected) | Import z `scoringConfig.salesReadinessThreshold` |
| 3 | `TransformationStatus` strings 4× w UI | 3 komponenty + 1 astro | MEDIUM | Predykat `isReadyToSave(status)` w `src/lib/` lub `src/types/` |
| 4 | `score_after > score_before` tylko w UI | 1 komponent | HIGH (D-1) | Serwer powinien zwracać `score_improved: boolean` w response |
| 5 | `CATEGORY_LIST` 4× w komponentach | 4 komponenty | LOW | Export `VALID_CATEGORIES` z `config.ts` |
| 6 | Business rules w routes (dedup, storage check) | 2 routes | LOW-MEDIUM | Kandydaci do wyciągnięcia do lib przy budowie ACL |
