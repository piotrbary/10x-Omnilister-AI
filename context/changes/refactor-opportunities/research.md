---
date: 2026-06-26T00:00:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 5cd316aecd7d1fbe412d05b4ad19f4997480c647
branch: UX_REDESIGN
repository: piotrbary/10x-Omnilister-AI
topic: "Identyfikacja i ocena kandydatów do refaktoryzacji strukturalnej"
tags: [research, refactor, architecture, technical-debt, supabase, editor]
status: complete
last_updated: 2026-06-26
last_updated_by: Claude Sonnet 4.6
---

# Research: Refactor opportunities

**Date**: 2026-06-26  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: `5cd316aecd7d1fbe412d05b4ad19f4997480c647`  
**Branch**: `UX_REDESIGN`  
**Repository**: piotrbary/10x-Omnilister-AI

## Research Question

Na podstawie `context/changes/ux-redesign-analysis/research.md` (dług techniczny + ryzyka strukturalne): sklasyfikuj każdy problem jako KANDYDAT do refaktoryzacji lub nie, zbadaj każdego kandydata (obecny kształt, historia, wykonalność), zaproponuj ranking 2–3 najsilniejszych szans.

## Prior Research (priors, nie re-derive)

Badanie opiera się na ustaleniach:
- `context/changes/ux-redesign-analysis/research.md` — TD-1 przez TD-10, zweryfikowane ast-grep
- `context/map/repo-map.md` — blast-radius, hot-files, strefy ryzyka
- `context/foundation/lessons.md` — 7 reguł zespołowych (priors jakości)

---

## Klasyfikacja kandydatów

> KANDYDAT = naprawa wymagałaby zmiany struktury kodu (wyodrębnienie modułu, nowa abstrakcja, zmiana sygnatury, migracja DB).  
> NOT-KANDYDAT = naprawa to 1–3 linie lub brakujący test/dokumentacja — wejście do oceny kosztu, nie do rankingu refaktoryzacji.

### KANDYDACI — 8 problemów

| ID | Problem | Źródło |
|----|---------|--------|
| C-1 | `supabase.ts` fan-in=21, brak warstwy serwisowej — 21 callerów obsługuje null samodzielnie, 3 różne wzorce | TD (repo-map strefa ryzyka #4) |
| C-2 | `guest.ts` — równoległa ścieżka AI poza `transformation-processor` | repo-map strefa ryzyka #3 |
| C-3 | `MOCK_SCORE_BEFORE` bezwarunkowy w produkcji — UI zawsze pokazuje mock 5.8 | TD-1 |
| C-4 | `EditorShell` god-component — 34 zmienne stanu, fan-out=9 | repo-map strefa ryzyka #5 |
| C-5 | Ekstrakcja storage path przez `segments.slice(-3)` zamiast trusted values | TD-6 |
| C-6 | Podwójny ownership check (API route + `analyzeObject`) — 4 redundantne SELECT | TD-7 |
| C-7 | Race condition w concurrent save — pre-check bez transakcji, 23514 nieobsługiwane | TD-9 |
| C-8 | Signed URLs wygasają po 24h, brak mechanizmu refresh | TD-5 |

### NOT-KANDYDACI — wejście do oceny kosztu

| Problem | Typ | Koszt naprawy |
|---------|-----|--------------|
| TD-2: brak `.eq("user_id")` w 2 zapytaniach | security one-liner | 2 linie kodu |
| TD-3: brak rate limiting w `guest.ts` | infrastruktura zewnętrzna (CF Workers) | nowy system |
| TD-4: synchroniczne przetwarzanie (timeout risk) | inicjatywa infrastrukturalna (queue) | poza scope refaktoru |
| TD-8: spekulatywne modele w TRANSFORMATION_MODELS | config cleanup + runtime guard | małe |
| TD-10: brak obsługi 23514 w `photos/index.ts` | catch handler | 3 linie (wzorzec w save.ts) |
| fire-and-forget `scorePhoto` bez logu | brak obserwowalności | 1 linia log |
| 17 tras bez testów | test gap | nie strukturalny |
| brak `user_id` w final SELECT `start.ts` | security one-liner | 1 linia |
| `Max_Client_Repository` — PascalCase_snake (lessons.md rule) | renaming | 2 pliki |

---

## Analiza kandydatów

### C-1: `supabase.ts` fan-in=21, brak warstwy serwisowej

**Obecny kształt:**

- [evidence] `src/lib/supabase.ts:9–28` — fabryka `createClient()` zwracająca `SupabaseClient<Database> | null` jeśli brakuje kluczy. 28 linii, brak jakichkolwiek helpersów do zapytań.
- [evidence] 17 z 19 plików `src/pages/api/` + `src/middleware.ts` importują i wywołują `createClient()` bezpośrednio. 3 pliki `.astro` — łącznie 21 callerów.
- [evidence] Trzy odrębne wzorce obsługi null w kodzie produkcyjnym:
  - Wzorzec A (JSON 503): `src/pages/api/objects/index.ts:32–35`, `src/pages/api/transformations/start.ts:37–38`
  - Wzorzec B (silent continue): `src/pages/api/auth/signout.ts:5–8` — `if (supabase)` bez zwrócenia błędu
  - Wzorzec C (context-aware): `src/pages/api/auth/signin.ts:21–25` — różny komunikat dla JSON vs form
- [evidence] Żaden plik w `src/` nie definiuje abstrakacji serwisowej nad Supabase — grep dla `*service*`, `*repository*`, `*repo*` nie znalazł nic poza `report.ts` (niezwiązane).
- [evidence] Wzorzec SupabaseClient-jako-parametr istnieje: `src/lib/transformation-processor.ts:11` przekazuje klienta jako argument — jedyna demonstracja modelu odrębnego od bezpośredniego wywoływania fabryki.

**Werdykt intencjonalności:** accidental complexity.  
`supabase.ts` powstał w commicie `94b145d` jako cienka fabryka bez dyskusji o service layer. Pattern propagował przez copy-paste — żaden commit message, plan ani przegląd nie rozważył trade-offów. `artifact-2-structure.md:50` stwierdza `"17 tras importuje supabase.ts — brak serwisu"` bez ADR.

**Wykonalność migracji:**
- Istniejące abstrakcje: żadne query-wrappery; wzorzec klienta-jako-parametr w `transformation-processor.ts` jako model.
- Blast radius: 21 callerów — ale migracja jest *addytywna*: nowy moduł `src/lib/db/` nie wymaga natychmiastowej zmiany callerów.
- Testy: zero dla callerów i dla `createClient()`. Migracja bez testów jest ślepa.
- CI: brak kroku testowego w `.github/workflows/ci.yml` — tylko lint + build.
- Ścieżka inkrementalna:
  1. Utwórz `src/lib/db/photos.ts` z jedną funkcją (np. `getPhotosByObject`), bez zmiany callerów.
  2. Migruj najbardziej powtarzające się zapytanie (ownership check w `start.ts`).
  3. Dodaj kolejne funkcje per tabela; migruj callerów jeden po drugim.
  4. Scentralizuj obsługę null w serwisie, usuń z callerów.
- **Pierwszy krok-prererekwizyt:** Utwórz `src/lib/db/photos.ts` z `getPhotosByObject(supabase, objectId, userId)` — czysto addytywne, żadnych zmian callerów, weryfikacja struktury modułu przed migracją.

---

### C-2: `guest.ts` — równoległa ścieżka AI

**Obecny kształt:**

- [evidence] `src/pages/api/transformations/guest.ts:44` wywołuje `generateFull(imageBytes, prompt, body.mimeType, [], model)` bezpośrednio. Zwraca `{ result_base64: uint8ArrayToBase64(buffer) }` (linia 45).
- [evidence] `src/pages/api/transformations/start.ts:137` wywołuje `processTransformationBatch(jobs, supabase, model)` — pełna ścieżka z DB, storage, scoringiem.
- [evidence] Pełna rozbieżność ścieżek:
  - `guest.ts`: no DB, no storage, no scoring, base64 output.
  - `start.ts → transformation-processor.ts`: 8 operacji DB + 2 storage + `scorePhoto`.
- [evidence] `guest.ts:9–23` definiuje `base64ToUint8Array` i `uint8ArrayToBase64` lokalnie. Te same funkcje istnieją w `src/lib/openrouter-images.ts:3–11` — duplikacja kodu.
- [evidence] Komentarz w kodzie: `// ponytail: no auth check — unauthenticated transforms. Add IP rate limiting if abuse occurs.` (guest.ts:25).

**Werdykt intencjonalności:** conscious constraint.  
Commit `e77ab09` (jedyny commit dotyczący `guest.ts`) ma wiadomość: `"Add POST /api/transformations/guest — unauthenticated AI transform path (base64 in/out, no DB, no storage, no auth)"`. Architektura była intencjonalna i współprojektowana z EditorShell. Brak DB/storage w ścieżce gościa to decyzja nośna.

**Nota:** Sama równoległa architektura nie jest kandydatem do usunięcia — jest świadoma. Realnym problemem jest duplikacja helpersów base64.

**Wykonalność migracji (duplikacja base64):**
- `src/lib/utils.ts` istnieje — naturalny cel dla shared utilities.
- Blast radius: 2 pliki (`guest.ts`, `openrouter-images.ts`) — minimal.
- Testy: zero.
- **Pierwszy krok-prererekwizyt:** Przenieś `base64ToUint8Array` i `uint8ArrayToBase64` z `guest.ts:9–23` do `src/lib/utils.ts`, zaimportuj w obu plikach. Czyste usunięcie duplikacji bez żadnej zmiany zachowania.

---

### C-3: `MOCK_SCORE_BEFORE` bezwarunkowy w produkcji

**Obecny kształt:**

- [evidence] `src/components/editor/EditorShell.tsx:2`: `import { MOCK_SCORE_BEFORE } from "@/data/mockEditorData"` — brak guardu `import.meta.env.DEV`.
- [evidence] `src/components/editor/EditorShell.tsx:686`: `<ScoreSidebar scoreBefore={MOCK_SCORE_BEFORE} scoreAfter={scoreAfter} />` — mock 5.8 przekazywany zawsze.
- [evidence] `MOCK_SCORE_BEFORE` zdefiniowane w `src/data/mockEditorData.ts:39` jako pełny `QualityScoreSnapshot` z `overall: 5.8`.
- [evidence] Prawdziwe `scoreBefore` jest pobierane w `src/pages/api/transformations/start.ts:67–92` z tabeli `quality_scores` i zapisywane w DB jako `score_before` w wierszu `transformations` — ale nigdy nie wraca do EditorShell ani nie jest wyświetlane użytkownikowi.
- [evidence] `scoreAfter` w EditorShell jest prawdziwe: `const [scoreAfter, setScoreAfter] = useState<QualityScoreSnapshot | null>(null)` (linia 67), wypełniane po transformacji.
- [evidence] Endpoint `GET /api/quality-scores/photo/[photoId]` istnieje i jest w pełni zaimplementowany (`src/pages/api/quality-scores/photo/[photoId].ts`). Pobiera ostatni wynik z tabeli `quality_scores` dla danego `photoId` z ownership check.
- [evidence] `ScoreSidebar` obsługuje `scoreBefore: QualityScoreSnapshot | null` — przy `null` renderuje "Brak danych" (obsługa nulla już istnieje).
- [inference] `selectedPhoto?.id` jest dostępne w EditorShell przez `photos[selectedPhotoIndex]?.id` — komponent posiada `photo_id` potrzebne do fetch.

**Werdykt intencjonalności:** accidental complexity (znany WIP, nigdy niezebrany do usunięcia).  
Commit `0ec14f4` wprowadził mock z opisem `"Add mock data for editor development"`. Trzy kolejne commity (`c6f9630`, `2239db7`, `e77ab09`) zmieniały EditorShell bez usunięcia mocka. Brak TODO, brak tiketu, brak reguły w `lessons.md` o cleanup mocków.

**Wykonalność migracji:**
- Istniejące abstrakcje: endpoint `/api/quality-scores/photo/[photoId].ts` — gotowy, ownership-safe. `ScoreSidebar` — null-safe.
- Blast radius: 1 plik (`EditorShell.tsx`) + usunięcie stałej z `mockEditorData.ts`. Zero wpływu na inne komponenty.
- Testy: zero dla EditorShell.
- Ścieżka inkrementalna:
  1. Dodaj `const [scoreBefore, setScoreBefore] = useState<QualityScoreSnapshot | null>(null)` w EditorShell. Zamień linię 686: `scoreBefore={MOCK_SCORE_BEFORE}` → `scoreBefore={scoreBefore}`. Sidebar pokazuje "Brak danych" — lepiej niż mock 5.8.
  2. Dodaj `useEffect` wyzwalany zmianą `selectedPhoto?.id` (non-guest mode): fetch `/api/quality-scores/photo/${id}` → `setScoreBefore(data.score)`.
  3. Usuń import `MOCK_SCORE_BEFORE` i stałą z `mockEditorData.ts`.
- **Pierwszy krok-prererekwizyt:** Krok 1 powyżej — czysto lokalny, nie wymaga nowego endpointu (endpoint już istnieje), żadnych zmian w propstypach komponentów potomnych.

---

### C-4: `EditorShell` — god-component (34 zmienne stanu, fan-out=9)

**Obecny kształt:**

- [evidence] `src/components/editor/EditorShell.tsx:54–89`: 34 wywołania `useState` + `useRef` + `useEffect` + `useMemo` — łącznie 38 hooków.
- [evidence] Komentarze w pliku (`// Core editor state`, `// Guest mode`, `// Auth modal`, `// Object browser`) dokumentują 6 grup logicznych — seamy do ekstrakcji są już nazwane.
- [evidence] Fan-out=9 runtime importów (bez type-only imports): AppNavBar, OriginalImagePanel, TransformedImagePanel, TransformToolbar, ScoreSidebar, StatusBar, PromptDrawer, @/data/mockEditorData, @/lib/config.
- [evidence] Grupy stanu z naturalną granicą:
  - **Auth modal** (7 vars): `showAuthModal`, `authMode`, `authEmail`, `authPassword`, `authError`, `authLoading`, `authSuccess` + `handleAuth()`, `openAuthModal()` — zero zależności krzyżowych z transform state.
  - **Object browser** (3 vars): `showObjectBrowser`, `objectList`, `objectBrowserLoading` + `openObjectBrowser()`, `handleLoadObject()`.
  - **Transform state** (8 vars): `selectedStyleKey`, `selectedPhotoIndex`, `isTransforming`, `resultUrl`, `currentJobId`, `resultSaved`, `scoreAfter`, `previewMode`.
  - **Upload state** (3 vars): `uploads`, `creatingObject`, `guestFiles`.
  - **Session/object** (5 vars): `objectId`, `object`, `photos`, `category`, `loading`.
  - **UI chrome** (8 vars): `isSaveable`, `showSaveModal`, `saveName`, `saving`, `savingResult`, `status`, `showPromptDrawer`, `selectedModel`.
- [evidence] Brak `src/hooks/` directory. Brak custom hooków w `src/components/editor/`.
- [evidence] Brak zależności od zewnętrznej biblioteki stanu (`package.json`: brak Zustand, Jotai, Redux).

**Werdykt intencjonalności:** accidental complexity.  
Commit `0ec14f4` stworzył EditorShell od razu z 540 liniami i 17 hookami — god-component powstał na starcie, nie wyrósł. Żaden commit message nie rozważa "refactor", "extract", "split component". Brak ADR uzasadniającego centralny orchestrator.

**Nota:** Brak zewnętrznej biblioteki stanu jest prawidłowy — problem to złożoność wewnątrz jednego komponentu (nie sharing między komponentami), więc custom hooks to właściwy cel, nie Zustand.

**Wykonalność migracji:**
- Istniejące abstrakcje: 6 skomentowanych grup w pliku — seamy są gotowe.
- Blast radius: EditorShell ma 9 dzieci które przyjmują computed props (nie settery stanu) — ekstrakcja hooków NIE zmienia propsów dzieci.
- Testy: zero dla EditorShell i dzieci.
- Ścieżka inkrementalna:
  1. Wyodrębnij `useAuthModal()` — `src/components/editor/useAuthModal.ts` (7 vars + 2 handlers). Zero cross-dependencies z transform state. Przenieś JSX auth modal do `AuthModal.tsx`.
  2. Wyodrębnij `useObjectBrowser()` — 3 vars + 2 handlers.
  3. Wyodrębnij `useTransformState()` — core transform lifecycle.
  4. Wyodrębnij `useUploadState()` — upload + delete handlers.
  5. EditorShell = cienka kompoycja 4 hooków + JSX layout.
- **Pierwszy krok-prererekwizyt:** Ekstrakcja `useAuthModal` do `src/components/editor/useAuthModal.ts` — auth state nie dotyka `isTransforming`, `resultUrl` ani żadnego transform state. Ryzyko buga React closure: minimalne dla tej grupy. Nic nie jest nieodwracalne.

---

### C-5: Ekstrakcja storage path przez `segments.slice(-3)`

**Obecny kształt:**

- [evidence] `src/pages/api/objects/[objectId]/photos/[photoId].ts:32–35`:
  ```typescript
  const urlObj = new URL(photo.original_url);
  const segments = urlObj.pathname.split("/").filter(Boolean);
  const storagePath = segments.slice(-3).join("/");
  ```
- [evidence] `user.id` (z `context.locals.user`) i `objectId` (z `context.params.objectId`) są dostępne w tym punkcie kodu.
- [evidence] Format ścieżki upload potwierdzony w `src/pages/api/objects/[objectId]/photos/upload-url.ts:106`: `const path = \`${user.id}/${objectId}/${safeName}\`` — 3 segmenty: `userId/objectId/safeName`.
- [evidence] Bucket `original-photos` jest publiczny od migracji `20260601000001_make_original_photos_public.sql`. `original_url` w DB jest publicznym URL, nie podpisanym.
- [evidence] `slice(-3)` jest ekwiwalente `${user.id}/${objectId}/${filename}` gdy format URL jest `.../{user.id}/{objectId}/{safeName}` — działa poprawnie *dziś*, ale jest kruche wobec zmian struktury URL.
- [inference] Zdjęcia uploadowane PRZED migracją `20260601000001` mogły mieć inny format `original_url` (signed URL zamiast public URL). Delete dla tych wierszy przez `slice(-3)` może dać błędną ścieżkę.
- [unknown] Czy w DB istnieją wiersze z `original_url` w formacie przed-migracyjnym — wymaga sprawdzenia w live DB.
- [evidence] Reguła w `lessons.md:19–23`: "Reconstruct storage paths from trusted values, not public URLs" — napisana dokładnie z powodu tego wzorca.

**Werdykt intencjonalności:** accidental complexity (z post-hoc regułą dokumentującą problem).  
`slice(-3)` pochodzi z commitu `4ad5ddd` — `original_url` było zawsze zapisywane jako publiczny URL (decyzja w `photos/index.ts` używająca `getPublicUrl()`), a `[photoId].ts` odzwierciedlało ten format. Konsekwencja kruchości nie była rozpoznana aż do napisania reguły `lessons.md`.

**Wykonalność migracji:**
- Blast radius: 1 plik, 1 funkcja (3 linie).
- Testy: zero.
- Fix: `const storagePath = \`${user.id}/${objectId}/${photo.original_url.split('/').at(-1)}\`;`
- Ryzyko: wiersze sprzed migracji publicznego bucketu mogą mieć signed URL w `original_url` — `split('/').at(-1)` da tylko fragment tokenu. **Prererekwizyt: weryfikacja, że żaden istniejący wiersz w `photos` nie ma signed URL jako `original_url`** (sprawdz format w live DB lub datę migracji vs najstarszy wiersz).
- **Pierwszy krok-prererekwizyt:** Zweryfikuj format `original_url` w live DB (czy wszystkie wiersze mają format public URL). Jeśli tak — 1-liniowa zamiana `slice(-3)` na `\`${user.id}/${objectId}/${filename}\``. Nic nie jest nieodwracalne.

---

### C-6: Podwójny ownership check (`analyzeObject`)

**Obecny kształt:**

- [evidence] `src/pages/api/objects/[objectId]/analyze.ts:43–73`: API route wykonuje (1) SELECT objects (user_id), (2) SELECT photos (object_id, user_id).
- [evidence] `src/lib/quality-scoring.ts:186–191` sygnatura `analyzeObject(objectId, photoIds, supabase, userId)`.
- [evidence] Wewnątrz `analyzeObject`: linia 194–199 SELECT photos (`.eq("object_id", objectId).eq("user_id", userId)`), linia 205–210 SELECT objects (`.eq("id", objectId).eq("user_id", userId)`) — oba identyczne z zapytaniami w API route.
- [evidence] Jedyny callsite `analyzeObject`: `src/pages/api/objects/[objectId]/analyze.ts:77`.
- [evidence] Przy błędzie ownership w `analyzeObject` (photo query fail): rzuca błędem, brak partial results.
- [evidence] `userId` jest dalej potrzebny wewnątrz `analyzeObject` do INSERT w `quality_scores` (linia ~255).

**Werdykt intencjonalności:** accidental complexity.  
`analyzeObject` projektowane z własnym filtrem `user_id` per reguły `lessons.md` (każde zapytanie ma user_id). API route niezależnie dodało własny ownership check. Brak ADR lub komentarza uzasadniającego defense-in-depth. Duplikacja powstała przez niezależną implementację obu stron.

**Wykonalność migracji:**
- Single callsite: ryzyko regresu izolowane do `analyze.ts`.
- Testy: `quality-scoring.test.ts` testuje `scorePhoto`, nie `analyzeObject` — zero pokrycia dla ownership path.
- Fix opcja A (zalecana): Usuń `.eq("user_id", userId)` z queries photos i objects wewnątrz `analyzeObject`, dodaj JSDoc `@param photoIds - pre-verified as owned by userId by caller`. `userId` pozostaje potrzebne dla INSERT.
- Fix opcja B: Usuń ownership check z `analyze.ts` — ryzykowniejsze (API route traci defense-in-depth).
- **Pierwszy krok-prererekwizyt:** Potwierdź single callsite (ast-grep `analyzeObject($$$)` — zrobione: tylko `analyze.ts:77`). Następnie dodaj dokumentację precondition w JSDoc przed usunięciem wewnętrznych queries.

---

### C-7: Race condition w concurrent save

**Obecny kształt:**

- [evidence] `src/pages/api/transformations/[jobId]/save.ts:40–58`: SELECT profiles (quota), CHECK quota, UPDATE transformations (status=saved) — sekwencja bez transakcji.
- [evidence] Trigger `on_transformation_storage_change` w `supabase/migrations/20260530000000_initial_schema.sql:54–70`: na UPDATE transformations z status → 'saved': `UPDATE profiles SET storage_used_bytes += result_file_size_bytes`. Trigger działa AFTER UPDATE.
- [evidence] CHECK constraint na `profiles`: `storage_used_bytes <= 104857600` (104857600 = 100MB) — backstop w DB.
- [evidence] Przy naruszeniu CHECK constraint (concurrent save przekracza limit): trigger UPDATE zwróci błąd `23514`. Kod w `save.ts:61–69` nie obsługuje `23514` osobno — zwraca generyczne 500.
- [evidence] Wzorzec obsługi 23514 istnieje już w kodzie: `src/pages/api/objects/[objectId]/photos/index.ts:122–124` sprawdza `error.code === "23514"` i zwraca 409 `"Storage limit reached"`.
- [evidence] Brak `supabase.rpc()` w całej bazie kodu (grep: zero matches) — brak transakcji.

**Werdykt intencjonalności:** conscious constraint (partially) — wzorzec soft-guard race jest udokumentowany w `lessons.md:47–52` i zaakceptowany explicite dla upload flow w planie `object-and-photo-upload/plan.md:70`. `save.ts` nigdy nie otrzymał analogicznej adnotacji.

**Wykonalność migracji (dwa poziomy):**
- **Poziom 1 — backstop (3 linie):** Skopiuj wzorzec z `photos/index.ts:122–124` do `save.ts:61–69`. Zmienia UX z cryptic 500 na 409 `"Storage limit reached"`. Zero blast radius, zero ryzyka, wzorzec w codebase już istnieje.
- **Poziom 2 — transakcja (Supabase RPC):** Utwórz SQL function `save_transformation_atomic(job_id, user_id)` z `FOR UPDATE` lock na `profiles`. Deploy przez migrację. Ryzyko: deadlock z SECURITY DEFINER triggerem — wymaga testowania.
- **Pierwszy krok-prererekwizyt:** Poziom 1 (backstop) jest prererekwizyt dla poziomu 2. Sam w sobie jest zamkniętą zmianą.

---

### C-8: Signed URLs wygasają po 24h

**Obecny kształt:**

- [evidence] `src/lib/transformation-processor.ts:97–99`: `.createSignedUrl(fullPath, 86400)` — 24h TTL.
- [evidence] `result_url` zapisywane do `transformations.result_url` (kolumna TEXT). Tabela `transformations` NIE ma kolumny `result_storage_path`.
- [evidence] Storage path jest deterministyczny: `${job.user_id}/${job.object_id}/${job.id}/full.jpg` (`transformation-processor.ts:84`) — rekonstruowalny z danych w wierszu `transformations`.
- [evidence] Bucket `transformed-photos` jest **prywatny** (initial migration: `public = false`). Brak migracji zmieniającej widoczność.
- [evidence] Bucket `original-photos` jest **publiczny** (migracja `20260601000001_make_original_photos_public.sql`).
- [evidence] Brak jakiegokolwiek mechanizmu refresh URL (`createSignedUrl` wywoływane tylko 2 razy: `transformation-processor.ts:99` i `quality-scoring.ts:220`).
- [inference] Po 24h wszystkie `result_url` w DB stają się nieważne — UI renderuje broken image dla saved transformations.

**Werdykt intencjonalności:** accidental complexity.  
`86400` pojawia się w commicie `6183494` bez komentarza uzasadniającego. Plan `ai-transformation-session/plan.md:277` mówi tylko "update result_url=<signed url>" bez specyfikacji TTL. Brak porównania z TTL = ∞ (public) vs ∞ (stored path + on-demand sign). `impl-review` dla scoring module flaguje 60s jako za krótkie do retriesów — implikuje świadomość TTL trade-offów, ale nie przeniesiono tego na `transformation-processor.ts`.

**Wykonalność migracji (dwie opcje):**

- **Opcja A — make bucket public:** Migracja `public = true` dla `transformed-photos` + zamiana `createSignedUrl` na `getPublicUrl` w `transformation-processor.ts`. Prostsza implementacja. **Ryzyko:** trwały publiczny dostęp do URL zdjęć (nawet jeśli UUID czyni guessing trudnym) — nieodwracalne po akumulacji publicznych URL w DB.
- **Opcja B — on-demand refresh endpoint (zalecana):** 
  1. Migracja: dodaj kolumnę `result_storage_path TEXT` do `transformations`.
  2. Aktualizuj `transformation-processor.ts`: zapisuj ścieżkę obok URL.
  3. Dodaj endpoint `GET /api/transformations/[jobId]/result-url` — generuje świeży signed URL z zapamiętanej ścieżki.
  4. Klient wywołuje endpoint gdy URL wygasa (lub zawsze przy ładowaniu).
- Blast radius Opcja B: 1 migracja + 1 zmiana w `transformation-processor.ts` + 1 nowy plik API. `transformation-processor.ts` co-changes historycznie z `start.ts`, `openrouter-images.ts` — ryzyko nieintuicyjnego zaangażowania tych plików.
- **Pierwszy krok-prererekwizyt (Opcja B):** Migracja dodająca `result_storage_path TEXT` do tabeli `transformations`. Addytywna, nieodwracalna (drop column = osobna decyzja), nie zmienia żadnego kodu aplikacji.

---

## Refactor Opportunities

### Ranking 2–3 najsilniejszych kandydatów

---

#### 🥇 #1: C-3 — `MOCK_SCORE_BEFORE` → prawdziwy `scoreBefore` z API

**Obecny → docelowy kształt:**  
`EditorShell.tsx:686 scoreBefore={MOCK_SCORE_BEFORE}` (stała mock 5.8) → `scoreBefore={scoreBefore}` gdzie `scoreBefore: QualityScoreSnapshot | null` pobierane z istniejącego endpointu przy zmianie wybranego zdjęcia.

**Dlaczego #1 — koszt długu vs koszt zmiany:**
- Koszt długu: **WYSOKI** — feature "porównanie jakości przed/po" jest fundamentalnym UX wartości aplikacji. Wyświetlanie mock 5.8 dezinformuje użytkownika przy każdej transformacji. Problem jest user-facing, widoczny przy każdym użyciu, i nie zniknie sam.
- Koszt zmiany: **BARDZO NISKI** — endpoint `/api/quality-scores/photo/[photoId]` już istnieje i jest ownership-safe. `ScoreSidebar` już obsługuje `null`. Zmiana izolowana do EditorShell.tsx.
- ROI: najlepszy w zbiorze kandydatów.

**Blast radius:** 1 plik (`EditorShell.tsx`) + opcjonalne usunięcie stałej z `mockEditorData.ts`. Brak zmian w propsach dzieci.

**Szkic inkrementalnej ścieżki:**
1. W EditorShell.tsx: dodaj `const [scoreBefore, setScoreBefore] = useState<QualityScoreSnapshot | null>(null)`. Zamień linię 686 na `scoreBefore={scoreBefore}`. Deploy — sidebar pokazuje "Brak danych" (uczciwe zamiast mock).
2. Dodaj `useEffect(() => { if (!selectedPhoto || isGuest) { setScoreBefore(null); return; } fetch(\`/api/quality-scores/photo/${selectedPhoto.id}\`).then(r => r.ok ? r.json() : null).then(d => setScoreBefore(d?.score ?? null)); }, [selectedPhoto?.id])`.
3. Usuń import `MOCK_SCORE_BEFORE`, usuń stałą z `mockEditorData.ts`.

**Pierwszy krok-prererekwizyt:** Krok 1 (zamiana mock na null state w EditorShell.tsx) — 3 linie kodu, deploy-safe jako pierwsze commit.

---

#### 🥈 #2: C-5 — storage path z trusted values zamiast `slice(-3)`

**Obecny → docelowy kształt:**  
`segments.slice(-3).join("/")` (3 segmenty z końca public URL) → `` `${user.id}/${objectId}/${photo.original_url.split('/').at(-1)}` `` (rekonstrukcja z kontekstu + tylko filename z URL).

**Dlaczego #2 — koszt długu vs koszt zmiany:**
- Koszt długu: **ŚREDNI-WYSOKI** — istniejąca reguła `lessons.md:19–23` opisuje dokładnie ten problem. Wzorzec jest kruchy: zmiana formatu CDN URL (np. dodanie prefiksu), przejście na inny bucket provider, lub edge case w URL parsing powoduje *silent failure* — DELETE zwraca sukces ale plik nie zostaje usunięty, storage przecieka.
- Koszt zmiany: **BARDZO NISKI** — 3 linie zastąpione 1 linią, 1 plik, 0 zmian w interfejsach.
- Kontekst regulacyjny: to jedyny kandydat który łamie istniejącą, udokumentowaną regułę zespołową (`lessons.md`). Każdy PR który dotknie `[photoId].ts` powinien tę regułę respektować.

**Prererekwizyt (jedyne ryzyko):** Weryfikacja że wszystkie istniejące wiersze `photos.original_url` mają format public URL (nie signed URL sprzed migracji `20260601000001`). Jeśli tak → zmiana jest bezwarunkowa. Jeśli nie → potrzebna data migracja lub warunkowa obsługa obu formatów.

**Blast radius:** 1 plik, 1 funkcja, 1 zmienna. Nie zmienia DB, nie zmienia API contract.

**Szkic inkrementalnej ścieżki:**
1. Zweryfikuj format `original_url` w live DB (SELECT DISTINCT substring(original_url...) lub sprawdź daty migracji vs daty wierszy).
2. Zamień linie 33–35 w `[photoId].ts` na jedną linię.
3. Opcjonalnie: dodaj komentarz potwierdzający zgodność z `lessons.md`.

**Pierwszy krok-prererekwizyt:** Krok 1 — weryfikacja formatu URL w DB. Nie wymaga żadnej zmiany kodu.

---

#### 🥉 #3: C-8 — Opcja B: dodaj `result_storage_path`, przygotuj do URL refresh

**Obecny → docelowy kształt:**  
`transformations.result_url` (signed URL 24h, brak path w DB) → `transformations.result_url` (24h) + `transformations.result_storage_path` (persistent path) + endpoint `GET /api/transformations/[jobId]/result-url` generujący świeży URL.

**Dlaczego #3 — koszt długu vs koszt zmiany:**
- Koszt długu: **WYSOKI** — po 24h wszystkie saved transformations mają broken `result_url`. Jest to regresja UX dotykająca *każdego* użytkownika który wraca do aplikacji po dobie. Funkcja save jest bezwartościowa długoterminowo.
- Koszt zmiany: **ŚREDNI** — Opcja B wymaga migracji DB + 2 zmian kodu. Jest addytywna i odwracalna na poziomie kolumny DB. Opcja A (public bucket) jest prostsza ale nieodwracalna po akumulacji publicznych URL.
- Opcja B jest zalecana ze względu na brak trade-offu bezpieczeństwa.

**Blast radius:**
- 1 migracja SQL (addytywna kolumna).
- `transformation-processor.ts` (aktualizacja INSERT) co-changes historycznie z `start.ts` i `openrouter-images.ts` — ryzyko niechcianego rozszerzenia zmiany na te pliki. Zmiana jest jednak minimalna (dodanie 1 linii `result_storage_path: fullPath` do UPDATE).
- 1 nowy plik API (`/api/transformations/[jobId]/result-url.ts`) — brak wpływu na istniejący kod.

**Szkic inkrementalnej ścieżki:**
1. Migracja: `ALTER TABLE transformations ADD COLUMN result_storage_path TEXT`. Deploy.
2. W `transformation-processor.ts:105–115`: dodaj `result_storage_path: fullPath` do UPDATE (linia ~108). Deploy.
3. Nowy endpoint `GET /api/transformations/[jobId]/result-url.ts`: weryfikacja ownership, rekonstrukcja path lub odczyt z `result_storage_path`, `createSignedUrl(path, 3600)`, zwróć `{ url }`.
4. Klient: przy renderowaniu transformation result wywołuje endpoint jeśli `result_url` wygasł (lub zawsze — prostsze).
5. Opcjonalna data migracja: update istniejących wierszy `result_storage_path = concat(user_id, '/', object_id, '/', id, '/full.jpg')` dla wierszy gdzie pole jest NULL.

**Pierwszy krok-prererekwizyt:** Krok 1 (migracja addytywna) — czysto addytywna do DB, brak zmian w kodzie aplikacji, brak deployment risk. Samodzielnie deployowalna.

---

### Kandydaci rozważeni i odrzuceni

| Kandydat | Powód odrzucenia |
|----------|-----------------|
| **C-1: service layer** | Właściwy kierunek, zły moment — 21 callerów + zero testów = ryzyko cichych regresji przy migracji. Prererekwizyt: test coverage dla kluczowych tras. Długoterminowy refaktor, nie krótkoterminowa szansa. |
| **C-2: guest.ts (base64 utils)** | Duplication fix ma wartość (src/lib/utils.ts ← 2 funkcje), ale nie jest strukturalnie ważny. Równoległa ścieżka AI jest conscious constraint — nie do usunięcia. Wart osobnego małego commitu, ale poza scope rankingiem. |
| **C-4: EditorShell** | `useAuthModal` extraction jest bezpieczne i wartościowe, ale zero testów komponentowych czyni każdy hook extraction słaby bez siatki bezpieczeństwa. Prererekwizyt: testy dla transformacji stanu EditorShell przed ekstrakcją. Długoterminowy refaktor. |
| **C-6: double ownership check** | 4 SELECT → 2 SELECT to gain 2 DB round-trips — performance win niewielki, ryzyko usunięcia wewnętrznego security check bez testów. Single callsite potwierdzony — fix jest bezpieczny, ale nie przynosi użytkownikowi wartości bezpośrednio. Wart uwagi gdy pojawi się test coverage dla analyzeObject. |
| **C-7: race condition (backstop)** | Backstop (23514 catch, 3 linie) jest NOT-KANDYDATEM strukturalnym — to TD fix. Pełna transakcja to C-7 ale wymaga Supabase RPC + SECURITY DEFINER testing. Backstop powinien trafić do osobnego małego commitu, nie blokuje rankingu. Pełna transakcja: prererekwizyt = testowanie RPC w supabase staging. |

---

## CI Configuration

`.github/workflows/ci.yml` (zweryfikowane): push/PR do `master` only. Kroki: `npm ci` → `astro sync` → `npm run lint` (ESLint) → `npm run build`. **Brak kroku `npm test`** — Vitest nie jest wdrożony w CI. Brak typecheck w CI. `stryker.config.mjs` istnieje ale poza CI.

**Implikacja dla refaktoryzacji:** Żaden z powyższych kandydatów nie jest osłonięty przez CI testy. Każda zmiana strukturalna ląduje bez automatycznej siatki bezpieczeństwa poza lint + build. To nie blokuje #1 i #2 (blast radius = 1 plik), ale jest to kontekst dla #3 i dalszych kandydatów.

---

## Related Research

- `context/changes/ux-redesign-analysis/research.md` — źródłowy raport TD i ryzyk strukturalnych
- `context/map/repo-map.md` — strefy ryzyka, hot-files, coupling pairs
- `context/map/artifact-2-structure.md` — dep-cruiser: fan-in/fan-out, brak cykli
- `context/foundation/lessons.md` — 7 reguł jako priors (szczególnie reguła storage path i user_id filter)

## Open Questions

1. **Format `original_url` w live DB** — prererekwizyt dla C-5: czy istnieją wiersze sprzed migracji `20260601000001` ze signed URL zamiast public URL?
2. **Intencja `score_before` w UI** — C-3 zakłada że `scoreBefore` powinno pokazywać ostatni wynik przed transformacją. Czy UX intencja to "wynik ostatniej analizy" czy "wynik obliczony na chwilę przed transform"? Wpływa na logikę useEffect.
3. **Expiry detection w UI** — C-8 zakłada że klient wykrywa wygasłe URL i woła refresh endpoint. Alternatywa: zawsze używaj endpointu zamiast `result_url` z DB. Który model preferowany?
4. **Staging Supabase** — Czy istnieje środowisko staging dla testowania migracji DB (prererekwizyt C-8 krok 1 i C-7 pełna transakcja)?
