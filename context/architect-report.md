# Architect Report — Omnilister AI

Data opracowania: 2026-06-30  
Repo analizowane: `piotrbary/10x-Omnilister-AI`  
Cel: skrócone podsumowanie historii, mapy projektu, analizy feature’a oraz zmian po refaktorze.

---

## 1. Opisane projekty

W module użyto jednego repozytorium. Raport źródłowy wskazuje, że wszystkie artefakty (`repo-map`, `ux-redesign-analysis`, `refactor-opportunities`, `domain/*.md`) pochodzą z `piotrbary/10x-Omnilister-AI`, branch `UX_REDESIGN`.

| Repo | Projekt | Stack | Skala orientacyjna | Przy którym artefakcie się pojawiło |
|---|---|---|---|---|
| `piotrbary/10x-Omnilister-AI` | Omnilister AI — aplikacja AI-first do oceny i transformacji zdjęć sprzedażowych / obiektów z użyciem scoringu jakości, Supabase i OpenRouter | Astro 6 SSR, React 19 islands, Cloudflare Workers, Supabase PostgreSQL + Storage, OpenRouter API; aktualne `package.json` potwierdza Astro, React, Supabase, Wrangler, Vitest, Stryker i dependency-cruiser | Orientacyjnie: 1 repo, 19 modułów API w mapie, 12 przepływów produktowych w analizie, fan-in 21 dla `supabase.ts` i `config.ts`, bus factor 1; po refaktorze repo ma testy `vitest run` i testy integracyjne | `context/map/repo-map.md`, `context/changes/ux-redesign-analysis/research.md`, `context/changes/refactor-opportunities/plan.md`, `context/domain/*.md`, aktualne pliki repo: `package.json`, `EditorShell.tsx`, `start.ts`, `save.ts`, `guest.ts`, `result-url.ts`, `photos-ownership.test.ts` |

**Wniosek:** w module nie porównywano wielu repozytoriów — analizowany był jeden projekt, ale z kilku perspektyw: mapa zależności, flow API/Supabase/OpenRouter, plan refaktoru i model domenowy.

---

## 2. Artefakty użyte

| ID | Artefakt | Co wniósł do raportu |
|---|---|---|
| AR-1 | `context/map/repo-map.md` | Stack, topologia modułów, lokalne centra, strefy ryzyka, entry pointy i unknowns `.astro` poza grafem |
| AR-2 | `context/changes/ux-redesign-analysis/research.md` | Analiza 12 flow, w tym F-2 Auth transform, F-3 Photo analysis, F-1 Guest transform; długi techniczne TD-1…TD-10 |
| AR-3 | `context/changes/refactor-opportunities/plan.md` | Plan 3 faz refaktoru: on-demand scoring, fix storage path, persistent `result_storage_path` + endpoint signed URL |
| AR-4 | `context/domain/01-domain-distillation.md` | Subdomeny, rozbieżności model vs kod, m.in. `score_after >= score_before`, draft pipeline, style moderation |
| AR-5 | `context/domain/02-invariant-aggregate-refactor.md` | Inwarianty biznesowe, szczególnie I-1 `score_after > score_before`, I-2 feedback, I-6 kategoria |
| AR-6 | `context/domain/03-anti-corruption-layer.md` | Projekt ACL: porty domenowe i adaptery Supabase |
| GH-1 | `package.json` z `main` | Aktualny stack narzędziowy: Astro, React, Supabase, Wrangler, Vitest, Stryker, dependency-cruiser |
| GH-2 | `src/components/editor/EditorShell.tsx` z `main` | Aktualny UI scoringu: brak `MOCK_SCORE`, użycie GET/POST `/api/quality-scores/photo/:photoId` |
| GH-3 | `src/pages/api/quality-scores/photo/[photoId].ts` z `main` | On-demand scoring z auth, ownership check i cache |
| GH-4 | `src/pages/api/transformations/start.ts` z `main` | Aktualny główny flow transformacji zalogowanego usera: auth, ownership, score_before, insert jobów, sync processing |
| GH-5 | `src/lib/transformation-processor.ts` z `main` | OpenRouter call, zapis `result_storage_path`, scoring po transformacji, fire-and-forget `scorePhoto` |
| GH-6 | `src/pages/api/transformations/[jobId]/result-url.ts` z `main` | Endpoint do odświeżania signed URL po `result_storage_path` z owner checkiem |
| GH-7 | `src/pages/api/transformations/[jobId]/save.ts` z `main` | Aktualny zapis joba: sprawdza auth, status i storage, ale nie porównuje `score_before` vs `score_after` |
| GH-8 | `src/pages/api/transformations/guest.ts` z `main` | Publiczny guest flow bez auth, z komentarzem o rate limiting dopiero przy abuse |
| GH-9 | `src/middleware.ts` z `main` | `PROTECTED_ROUTES = ["/dashboard", "/objects"]`; `/app/editor` nie jest chroniony middlewarem |
| GH-10 | `tests/integration/api/photos-ownership.test.ts` z `main` | Testy ryzyka ownership / IDOR na realnym RLS i dwóch userach |

---

## 3. Zmiany w repo po refaktorze

| Obszar | Przed refaktorem | Po refaktorze / aktualny stan | Artefakt / dowód |
|---|---|---|---|
| Scoring „przed” | `MOCK_SCORE_BEFORE` był raportowany jako bezwarunkowy mock w produkcji | `EditorShell.tsx` używa GET/POST endpointu scoringu; nie opiera się na stałej `MOCK_SCORE` | AR-2, AR-3, GH-2, GH-3 |
| Storage path | Raport wskazywał kruche `segments.slice(-3)` | `transformation-processor.ts` zapisuje wynik do deterministycznej ścieżki `${user_id}/${object_id}/${job_id}/full.jpg` | AR-2, AR-3, GH-5 |
| Signed URL | Raport wskazywał `result_url` wygasający po 24h | Dodano `result_storage_path` i endpoint `/api/transformations/[jobId]/result-url` generujący świeży signed URL | AR-2, AR-3, GH-5, GH-6 |
| Ownership / IDOR | Raport wskazywał braki `user_id` w części zapytań | `start.ts` sprawdza ownership obiektu, zdjęć i scoringów; test integracyjny dokumentuje IDOR cases | AR-2, GH-4, GH-10 |
| Testy | Raport: minimalne pokrycie, 2 pliki testowe, brak testów API | `package.json` ma `test: vitest run`, a repo zawiera testy integracyjne ryzyk | AR-2, GH-1, GH-10 |
| Core invariant | Raport: `score_after > score_before` tylko w UI | Nadal niedomknięte: `save.ts` nie pobiera i nie porównuje `score_before` / `score_after` | AR-5, GH-7 |
| Guest flow | Raport: `guest.ts` bez rate limitingu | Nadal ryzyko: `guest.ts` jest unauthenticated i sam komentarz mówi, żeby dodać IP rate limiting przy abuse | AR-2, GH-8 |

---

## 4. Mapa projektu — 5 wniosków

### 4.1 Lokalne centra

| Centrum | Dlaczego ważne | Artefakt / dowód |
|---|---|---|
| `middleware.ts` | Raport wskazuje 77 git partners, więc zmiana auth/routingu ma duży blast radius | AR-1 |
| `src/lib/supabase.ts` | Raport wskazuje fan-in 21 i brak warstwy serwisowej | AR-1, AR-6 |
| `src/lib/config.ts` | Raport wskazuje fan-in 21; zmiana kształtu configu uderza w wiele modułów | AR-1 |
| `EditorShell.tsx` | Raport wskazywał fan-out 9 i mock scoringu; aktualnie to centrum UI scoringu i transformacji | AR-1, AR-2, GH-2 |
| `start.ts → transformation-processor.ts → openrouter-images.ts` | Główny pipeline AI dla zalogowanego usera | AR-1, GH-4, GH-5 |

### 4.2 Entry pointy

| Entry point | Rola | Artefakt / dowód |
|---|---|---|
| `POST /api/transformations/start` | Startuje główną transformację: auth, ownership, score_before, insert jobów, OpenRouter processing | AR-2, GH-4 |
| `POST /api/transformations/guest` | Publiczny flow gościa bez DB i bez auth | AR-2, GH-8 |
| `GET/POST /api/quality-scores/photo/[photoId]` | Odczytuje lub generuje scoring jakości zdjęcia | AR-3, GH-3 |
| `POST /api/transformations/[jobId]/save` | Oznacza wynik jako zapisany i uruchamia storage accounting | AR-5, GH-7 |
| `GET /api/transformations/[jobId]/result-url` | Odtwarza signed URL z `result_storage_path` | AR-3, GH-6 |

### 4.3 Strefy ryzyka

| Ryzyko | Status po refaktorze | Artefakt / dowód |
|---|---|---|
| Mock scoringu w UI | Poprawione: UI używa realnego endpointu scoringu | AR-2, AR-3, GH-2, GH-3 |
| Signed URL po 24h | Poprawione backendowo: `result_storage_path` + endpoint signed URL | AR-2, AR-3, GH-5, GH-6 |
| Brak ownership checks | Znacznie poprawione: owner checki w flow i test IDOR | AR-2, GH-4, GH-10 |
| `score_after > score_before` | Nadal ryzyko P0: brak backendowego guarda w `save.ts` | AR-5, GH-7 |
| Guest abuse / koszty OpenRouter | Nadal ryzyko: publiczny endpoint bez auth/rate limit/size limit | AR-2, GH-8 |

### 4.4 Najważniejsze unknowns

| Unknown | Dlaczego ważne | Artefakt / dowód |
|---|---|---|
| `.astro` poza grafem dep-cruiser | Raport nie obejmował powiązań stron Astro z komponentami React | AR-1 |
| `/app/editor` poza `PROTECTED_ROUTES` | Middleware chroni `dashboard` i `objects`, ale nie `app/editor`; trzeba zdecydować, czy to świadomy guest editor | AR-1, GH-9 |
| Czy UI zawsze używa `/result-url` po wygaśnięciu signed URL | Backend jest gotowy, ale pełna redukcja ryzyka zależy od użycia w UI | AR-3, GH-6 |
| Czy scoring po transformacji ma blokować zapis | `scorePhoto` po transformacji jest non-fatal, a `save.ts` nie blokuje `score_after = null` | AR-5, GH-5, GH-7 |
| Czy ACL ma wejść przed kolejnym wzrostem kodu | `SupabaseClient` nadal przenika do logiki `src/lib`; ACL jest projektem, nie wdrożeniem | AR-6, GH-5 |

---

## 5. Analiza feature’a: UXDESIGN, realnie API + Supabase + OpenRouter flow

### 5.1 Badany przepływ i powód wyboru

Badany był flow F-2 Auth transform oraz F-3 Photo analysis, bo raport wskazuje je jako kluczowe ścieżki z największym ryzykiem: F-2 dotyka 8 operacji DB, 2 Storage i OpenRouter, a F-3 dotyka DB, Storage i modelu vision. Flow jest powiązany ze strefami ryzyka: `supabase.ts` fan-in 21, `EditorShell.tsx` jako centrum UX, pipeline `start.ts → transformation-processor.ts → openrouter-images.ts` oraz `save.ts` jako punkt domknięcia inwariantów.

Artefakty: AR-1, AR-2, GH-2, GH-3, GH-4, GH-5, GH-7.

### 5.2 Feature overview

Inputem jest zdjęcie, `object_id`, `photo_ids`, kategoria obiektu, styl/prompt i opcjonalny model. `start.ts` weryfikuje użytkownika, ownership obiektu i zdjęć, pobiera najnowszy `score_before`, tworzy rekordy `transformations`, a następnie synchronicznie wywołuje `processTransformationBatch`. `transformation-processor.ts` pobiera zdjęcie, woła OpenRouter przez `generateFull`, zapisuje wynik w Supabase Storage, ustawia `status = full_ready`, `result_url`, `result_storage_path` i próbuje dopisać `score_after`. Do UI wracają finalne joby, a zapis wyniku odbywa się osobno przez `save.ts`.

Artefakty: AR-2, GH-4, GH-5, GH-7.

### 5.3 Technical debt feature’a

| Dług / ryzyko | Znaczenie | Artefakt / dowód |
|---|---|---|
| `score_after > score_before` nadal nie jest egzekwowany w `save.ts` | Core business rule jest opisany w domenie, ale endpoint zapisu nie pobiera i nie porównuje scoringów | AR-5, GH-7 |
| `scorePhoto` po transformacji jest non-fatal | Transformacja może mieć `score_after = null`, a zapis nie jest przez to blokowany | AR-2, GH-5, GH-7 |
| Guest flow omija główny processor i jest publiczny | Osobna ścieżka AI zwiększa ryzyko kosztów, nadużyć i niespójności zmian modelu | AR-1, AR-2, GH-8 |
| Synchroniczne przetwarzanie | `start.ts` czeka na `processTransformationBatch`, więc timeout Cloudflare Workers pozostaje ryzykiem | AR-2, GH-4 |
| Potwierdzone ast-grepem przed refaktorem: `MOCK_SCORE_BEFORE` i guardrail promptu | Raport wskazuje, że TD-1 był potwierdzony ast-grepem; raport domenowy wskazuje też ast-grepowe potwierdzenie guardrail no-distortion w `buildPrompt()` | AR-2, AR-4, AR-5 |

---

## 6. Co było refaktoryzowane — fazy planu

| Faza | Jedna linijka | Status względem aktualnego kodu | Artefakt / dowód |
|---|---|---|---|
| Faza 1 / C-3 | On-demand quality scoring: usunięcie mocka i dodanie `POST /api/quality-scores/photo/[photoId]` | Potwierdzone w aktualnym kodzie przez `EditorShell.tsx` i endpoint scoringu | AR-3, GH-2, GH-3 |
| Faza 2 / C-5 | Fix storage path: odejście od `segments.slice(-3)` | Potwierdzone przez deterministyczny `fullPath = ${user_id}/${object_id}/${job_id}/full.jpg` | AR-3, GH-5 |
| Faza 3 / C-8 | Persistent `result_storage_path` + endpoint `GET /api/transformations/[jobId]/result-url` | Potwierdzone przez zapis `result_storage_path` i endpoint generowania signed URL | AR-3, GH-5, GH-6 |

---

## 7. Wnioski końcowe — maksymalnie krótko

1. Refaktor realnie poprawił mock scoringu, ownership checks, storage path, signed URL oraz bazę testów integracyjnych.  
   Artefakty: AR-2, AR-3, GH-2, GH-3, GH-5, GH-6, GH-10.

2. Najważniejszy invariant domenowy nadal nie jest zamknięty: `save.ts` nie sprawdza `score_after > score_before`.  
   Artefakty: AR-5, GH-7.

3. Największe lokalne centra i blast radius to `middleware.ts`, `supabase.ts`, `config.ts`, `EditorShell.tsx` oraz pipeline `start.ts → transformation-processor.ts → openrouter-images.ts`.  
   Artefakty: AR-1, GH-2, GH-4, GH-5.

4. Największe aktualne ryzyka to: brak backendowego score guard, publiczny guest endpoint bez rate limitingu, sync processing i niepewność `/app/editor` poza middleware protection.  
   Artefakty: AR-2, AR-5, GH-4, GH-7, GH-8, GH-9.

5. Następny refaktor powinien skupić się na `score-regression-guard` w `save.ts`, testach regresji scoringu oraz zabezpieczeniu `guest.ts`.  
   Artefakty: AR-5, GH-7, GH-8.

---

## 8. Source index

- AR-1 — `context/map/repo-map.md`, wskazany w raporcie źródłowym z 2026-06-26.
- AR-2 — `context/changes/ux-redesign-analysis/research.md`, wskazany w raporcie źródłowym z 2026-06-26.
- AR-3 — `context/changes/refactor-opportunities/plan.md`, wskazany w raporcie źródłowym z 2026-06-26.
- AR-4 — `context/domain/01-domain-distillation.md`, wskazany w raporcie źródłowym z 2026-06-26.
- AR-5 — `context/domain/02-invariant-aggregate-refactor.md`, wskazany w raporcie źródłowym z 2026-06-26.
- AR-6 — `context/domain/03-anti-corruption-layer.md`, wskazany w raporcie źródłowym z 2026-06-26.
- GH-1 — `package.json`, branch `main`, repo `piotrbary/10x-Omnilister-AI`.
- GH-2 — `src/components/editor/EditorShell.tsx`, branch `main`.
- GH-3 — `src/pages/api/quality-scores/photo/[photoId].ts`, branch `main`.
- GH-4 — `src/pages/api/transformations/start.ts`, branch `main`.
- GH-5 — `src/lib/transformation-processor.ts`, branch `main`.
- GH-6 — `src/pages/api/transformations/[jobId]/result-url.ts`, branch `main`.
- GH-7 — `src/pages/api/transformations/[jobId]/save.ts`, branch `main`.
- GH-8 — `src/pages/api/transformations/guest.ts`, branch `main`.
- GH-9 — `src/middleware.ts`, branch `main`.
- GH-10 — `tests/integration/api/photos-ownership.test.ts`, branch `main`.
