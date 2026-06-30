---
title: "Omnilister AI — Raport architektoniczny"
created: 2026-06-26
sources:
  - context/map/repo-map.md
  - context/changes/ux-redesign-analysis/research.md
  - context/changes/refactor-opportunities/plan.md
  - context/domain/01-domain-distillation.md
  - context/domain/02-invariant-aggregate-refactor.md
  - context/domain/03-anti-corruption-layer.md
---

# Raport architektoniczny — Omnilister AI

## 1. Opisane projekty

Wszystkie cztery artefakty źródłowe pochodzą z tego samego repozytorium:

| Artefakt | Repozytorium | Branch | Data |
|----------|--------------|--------|------|
| `context/map/repo-map.md` | piotrbary/10x-Omnilister-AI | UX_REDESIGN | 2026-06-25 |
| `context/changes/ux-redesign-analysis/research.md` | piotrbary/10x-Omnilister-AI | UX_REDESIGN | 2026-06-25 (weryfikacja ast-grep: 2026-06-26) |
| `context/changes/refactor-opportunities/plan.md` | piotrbary/10x-Omnilister-AI | UX_REDESIGN | 2026-06-26 |
| `context/domain/*.md` (3 pliki) | piotrbary/10x-Omnilister-AI | UX_REDESIGN | 2026-06-26 |

**Czego brakuje**: ux-redesign-analysis nie zawiera osobnego `research.md` dla UX — artefakt o tej nazwie dotyczy przepływów Supabase i API (nie designu UI). Brak osobnego artefaktu UX/redesign per se.

---

## 2. Mapa projektu

**Stack**: Astro 6 (SSR) + React 19 (islands) · Cloudflare Workers · Supabase (PostgreSQL + Storage) · OpenRouter API (Gemini 2.5 Flash Image, GPT-4o vision)

**Topologia modułów** (z dep-cruiser, commit `06218b9`):

```
middleware.ts (77 git partners)
    ↓
API routes (19 modułów)
    ↓
src/lib/supabase.ts ← fan-in 21 (18 .ts/.tsx + 3 .astro poza grafem)
src/lib/config.ts   ← fan-in 21 (wcześniej raportowano 15 — nieaktualne)

AI pipeline:
  start.ts → transformation-processor.ts → openrouter-images.ts
  guest.ts  → openrouter-images.ts   ← OSOBNA, niesprzężona ścieżka
  analyze.ts → quality-scoring.ts

UX:
  EditorShell.tsx → fan-out 9 komponentów
```

**6 stref ryzyka** (repo-map §4):

| # | Plik | Ryzyko |
|---|------|--------|
| 1 | `middleware.ts` | 77 git partners — każda zmiana auth/routing ma ukryty zasięg |
| 2 | `config.ts` | fan-in 21 — zmiana kształtu obiektu uderza w 21 modułów bez błędu kompilacji |
| 3 | `guest.ts` | omija `transformation-processor`; zmiana modelu AI naturalnie omija tę ścieżkę |
| 4 | `supabase.ts` | fan-in 21, brak warstwy serwisowej; 21 callerów obsługuje `null` z osobna |
| 5 | `EditorShell.tsx` | fan-out 9, mock w produkcji (`MOCK_SCORE_BEFORE` zawsze 5.8) |
| 6 | Orphaned WIP | `CategorySelector.tsx`, `EditorHeader.tsx`, `GuardrailBox.tsx` — brak importerów |

**Brak cykli** w grafie zależności (dep-cruiser). Bus factor = 1 (jedyny kontrybutor: piotrbary).

**Pliki `.astro` poza grafem**: dep-cruiser nie objął `.astro` — powiązania stron Astro z komponentami React są nieznane.

---

## 3. Analiza funkcjonalna (przepływy Supabase/API)

Źródło: `context/changes/ux-redesign-analysis/research.md`, commit `06218b9`, branch UX_REDESIGN.

**12 przepływów produktowych** — kluczowe:

| Flow | Opis | Supabase ops | AI call |
|------|------|--------------|---------|
| F-2: Auth transform | Główna ścieżka transformacji | 8 DB + 2 Storage | OpenRouter (image + vision) |
| F-3: Photo analysis | Scoring jakości zdjęcia | 4 DB + 1 Storage | GPT-4o (vision) |
| F-4a/b: Upload | Wgrywanie zdjęć + trigger quota | 5 DB + Storage | — |
| F-1: Guest transform | Gość bez auth | 0 DB | OpenRouter (1-2 calle) |

**Pokrycie testami**: MINIMALNE (<5%). 2 pliki testowe, 176 linii. Żadna z 17 tras API nie ma testu. Auth flow, ownership verification, AI pipeline — niesprawdzone.

**10 długów technicznych** zidentyfikowanych w artefakcie:

| ID | Dotkliwość | Opis |
|----|-----------|------|
| TD-1 | ❗ | `MOCK_SCORE_BEFORE` bezwarunkowy w produkcji — UI zawsze pokazuje 5.8 jako "wynik przed" |
| TD-2 | ⚠️ | Brak filtra `user_id` w 2 zapytaniach (photos w `objectId/index.ts`, quality_scores w `photo/[photoId].ts`) |
| TD-3 | ⚠️ | `guest.ts` bez rate limiting; logi AI tracone (puste `[]` zamiast bufora) |
| TD-4 | ⚠️ | Synchroniczne przetwarzanie transformacji — ryzyko timeout w Cloudflare Workers |
| TD-5 | ❗ | Signed URLs (24h TTL) — po dobie `result_url` w DB wygasa; UI pokazuje broken image |
| TD-6 | ⚠️ | Ekstrakcja storage path przez `segments.slice(-3)` — kruche wobec zmian CDN URL |
| TD-7 | 🔵 | Podwójny ownership check w F-3 — 4 redundantne SELECT per żądanie |
| TD-8 | 🔵 | `TRANSFORMATION_MODELS` zawiera spekulatywne modele (prawdopodobnie niedostępne w OpenRouter) |
| TD-9 | ⚠️ | Race condition w concurrent save — pre-check i trigger F-02 nie są w transakcji |
| TD-10 | 🔵 | Brak obsługi błędu 23514 (storage quota exceeded) — użytkownik dostaje 500 |

**Triggery DB sprzężone z kodem**:
- `on_photo_storage_change` (F-01): `photos` INSERT/DELETE → `profiles.storage_used_bytes` ±
- `on_transformation_storage_change` (F-02): `transformations` UPDATE (`status='saved'`) → `profiles.storage_used_bytes` +

**`scorePhoto` jest fire-and-forget** (`try { } catch { }`) — błąd scoringu nie blokuje transformacji (RU-3).

---

## 4. Plan refaktoryzacji

Źródło: `context/changes/refactor-opportunities/plan.md`, branch UX_REDESIGN.

**Status: WSZYSTKIE 3 FAZY KOMPLETNE** (wszystkie checkboxy `[x]`).

| Faza | Co zrobiono | SHA |
|------|------------|-----|
| 1 (C-3) | On-demand quality scoring — usunięto `MOCK_SCORE_BEFORE`, dodano `POST /api/quality-scores/photo/[photoId]` | `13e3742` |
| 2 (C-5) | Fix storage path — `segments.slice(-3)` → `fileName = url.split('/').at(-1)!; path = \`${user.id}/${objectId}/${fileName}\`` | `35b13b1` |
| 3 (C-8) | Persistent `result_storage_path` + nowy endpoint `GET /api/transformations/[jobId]/result-url` | `9ada6cc` |

**Uwaga**: plan.md wskazuje kompletność, ale `MOCK_SCORE_BEFORE` jest nadal importowany bezwarunkowo wg research.md (TD-1) i potwierdzony przez ast-grep na tym samym branchu. Możliwa rozbieżność między stanem planu a stanem kodu — wymaga weryfikacji `grep "MOCK_SCORE_BEFORE" src/`.

---

## 5. Domena (DDD)

Źródła: `context/domain/01-domain-distillation.md`, `02-invariant-aggregate-refactor.md`, `03-anti-corruption-layer.md`.

### Subdomeny

| Subdomena | Typ | Status |
|-----------|-----|--------|
| Kontekstowy Quality Scoring per-kategoria | **Core** | Zaimplementowany, ale niesprawdzony testami |
| Guardrail no-distortion | **Core** | ENFORCED — `buildPrompt()` zawsze appenduje stałą (potwierdzone ast-grep) |
| Sesja transformacji AI (feedback loop) | **Core** | Zaimplementowany; feedback enforcement BRAK (I-2 niespełniony) |
| Biblioteka obiektów i zdjęć | Supporting | — |
| Globalna biblioteka stylów | Supporting | — |
| Zarządzanie storage | Supporting | Enforced podwójnie (API + DB trigger) |
| Auth, Storage, GDPR | Generic | — |

### Niezmienniki biznesowe (wg `02-invariant-aggregate-refactor.md`)

| ID | Niezmiennik | Egzekwowanie |
|----|-------------|--------------|
| **I-1** | `score_after.overall > score_before.overall` | **TYLKO UI** — checkbox pre-selection w `TransformationSession.tsx:88–93`; serwer (`save.ts`) nigdy nie sprawdza score. Anti-pattern: klient jest jedynym strażnikiem rdzeniowej reguły biznesowej |
| **I-2** | Feedback po każdej transformacji | **BRAK** — endpoint istnieje, zero enforcement |
| **I-3** | Prompt zawsze zawiera guardrail no-distortion | **ENFORCED** — `buildPrompt()` i `buildPromptFromRaw()` obie ścieżki |
| **I-4** | Zapis wymaga `status == full_ready` | **ENFORCED** — `save.ts:32` |
| **I-5** | `storage_used_bytes + new_size ≤ 100 MB` | **ENFORCED** podwójnie |
| **I-6** | Kategoria potwierdzona przed transformacją | **NARUSZONY** — `transformation-processor.ts:23` silent fallback na `"item"` |
| **I-7** | Max 10 zdjęć per obiekt | **CZĘŚCIOWY** — soft check w API, brak DB constraint |

### Agregat TransformationJobAggregate (projekt, `02-invariant-aggregate-refactor.md`)

Zaprojektowany agregat (jeszcze nie zaimplementowany w kodzie produkcyjnym):

```
POST /save
  → TransformationJobRepository.loadForSave()
  → TransformationJobAggregate.save()
      throws ScoreRegressionError → 409 {score_before, score_after, delta}
      throws TransformationNotReadyError → 400
      throws StorageLimitExceededError → 400
  → repo.markSaved() → 200
```

Przenosi egzekucję I-1 z klienta na serwer. Zmiana zaplanowana jako `score-regression-guard` (status: `planned`).

### Anti-Corruption Layer (projekt, `03-anti-corruption-layer.md`)

**Problem**: `SupabaseClient<Database>` jest parametrem 4 funkcji w `src/lib/` — warstwie, która powinna być infra-agnostyczna. `analyzeObject()` i `processTransformationBatch()` są niepotestowalne bez prawdziwego Supabase lub złożonego mocka.

**Projekt ACL** (niezaimplementowany): 3 porty domenowe + 3 adaptery Supabase:

```
Porty: PhotoReadPort · ScoreWritePort · TransformationWritePort
Adaptery: SupabasePhotoReadAdapter · SupabaseScoreWriteAdapter · SupabaseTransformationWriteAdapter
```

Kryterium sukcesu: `grep "@supabase/supabase-js" src/lib/quality-scoring.ts` → brak wyników.

### Rozbieżności model vs kod (z `01-domain-distillation.md`)

| # | Rozbieżność | Dotkliwość |
|---|-------------|-----------|
| D-1 | `score_after ≥ score_before` całkowicie ignorowany przez serwer | HIGH |
| D-4 | Draft pipeline (5s preview) nie zaimplementowany — martwy config | HIGH |
| D-7 | Style moderation: moderacja AI stylów użytkownika nieobecna w kodzie | HIGH |

---

## 6. Decyzje do podjęcia (właściciela)

Na podstawie artefaktów — otwarte pytania wymagające decyzji produktowej lub technicznej:

1. **TD-1 / I-1**: Czy `MOCK_SCORE_BEFORE` nadal jest w kodzie produkcyjnym mimo zaznaczonej Fazy 1 jako kompletnej? Wymaga `grep "MOCK_SCORE_BEFORE" src/` na aktualnym branchu.

2. **TD-5 (signed URLs)**: Czy UI odświeża `result_url` po wygaśnięciu (24h TTL)? Jeśli nie, saved transformacje są broken po dobie. Endpoint `GET /api/transformations/[jobId]/result-url` (Faza 3 refaktoru) adresuje to — czy jest wdrożony i używany przez UI?

3. **I-2 (feedback enforcement)**: Feedback jest warunkiem PRD §Primary Success Criteria. Kiedy egzekucja feedbacku wejdzie w zakres? (Nie jest w `score-regression-guard`.)

4. **D-4 (draft pipeline)**: `draftPreviewTimeoutMs: 5_000` w configu, ale brak implementacji dwufazowego pipeline. PRD NFR: draft ≤ 5s. Czy to blokuje launch, czy jest świadomie pominięte?

5. **`/app/editor` poza PROTECTED_ROUTES**: Edytor nie jest chroniony przez `middleware.ts`. Auth jest w `editor.astro` (niesprawdzone — poza zasięgiem dep-cruiser), czy edytor celowo wspiera tryb gościa?

6. **`computeOverall` — wagi = 1 dla wszystkich wymiarów**: Komentarz w kodzie: "Calibrate per category before public launch." Czy brak kalibracji blokuje launch?

7. **ACL refaktor**: Plan istnieje w `03-anti-corruption-layer.md`. Czy i kiedy wchodzi jako zmiana? Jest warunkiem testowania jednostkowego `analyzeObject` i `processTransformationBatch`.
