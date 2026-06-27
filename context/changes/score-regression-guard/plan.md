# Score Regression Guard — Implementation Plan

## Overview

Przeniesienie egzekucji invariantu I-1 (`score_after.overall > score_before.overall`) z warstwy UI
na serwer. Dziś jedynym strażnikiem jest pre-selection checkboxa w `TransformationSession.tsx`
— jedno kliknięcie go pomija, a `save.ts` zapisuje bez sprzeciwu. Po tej zmianie:

- `TransformationJobAggregate.save()` rzuca `ScoreRegressionError` gdy score regresuje
- `save.ts` mapuje to na HTTP 409 z payloadem `{score_before, score_after, delta}`
- UI usuwa pre-selection logikę; 409 triggeruje modal z deltą i przyciskiem „Zachowaj mimo to"

## Current State Analysis

| Lokalizacja | Stan |
|-------------|------|
| `src/lib/config.ts:9,12` | Klucze `Max_Client_Repository` i `Max_Client_Repository_Label` — PascalCase_snake, naruszenie lessons.md |
| `src/pages/api/transformations/[jobId]/save.ts:32` | Guard `status !== "full_ready"` ✅ |
| `src/pages/api/transformations/[jobId]/save.ts:40–58` | Storage check inline w route |
| `src/pages/api/transformations/[jobId]/save.ts:62–65` | Bezwarunkowy `UPDATE status='saved'` — brak sprawdzenia score |
| `src/components/transformation/TransformationSession.tsx:23–31` | `saveChecked` init: `after.overall > before.overall` — jedyne miejsce reguły |
| `src/components/transformation/TransformationSession.tsx:87–95` | Ponowna pre-selection po transformacji |
| `src/lib/domain/` | Katalog nie istnieje |

## Desired End State

- `src/lib/domain/` zawiera `transformation-errors.ts`, `TransformationJobAggregate.ts`, `TransformationJobRepository.ts`
- `npm test` przechodzi z 10 nowymi przypadkami testowymi dla agregatu
- POST `/api/transformations/:id/save` zwraca 409 gdy `score_after ≤ score_before` (bez `override_regression: true`)
- POST `/api/transformations/:id/save` z `{ override_regression: true }` zwraca 200
- UI nie pre-selectuje checkboxów na podstawie score; 409 triggeruje modal z deltą

### Key Discoveries:

- `storageConfig.Max_Client_Repository` istnieje w `config.ts:9`; `Max_Client_Repository_Label` w `config.ts:12` — oba muszą być przemianowane zgodnie z lessons.md przed dodaniem nowych referencji (`config.ts:9,12`, `upload-url.ts:78`, `save.ts:51,54`)
- `src/lib/domain/` nie istnieje — tworzymy nowy katalog
- Test command: `npm test` (vitest run)
- `handleConfirmSave` (`TransformationSession.tsx:127`) robi `Promise.all` bez body — trzeba dodać obsługę 409 i retry z `override_regression: true`
- Lessons.md rule: mirror WHERE filters — `markSaved` musi zawierać `.eq("user_id", userId)` ✅ (już w projekcie agregatu)

## What We're NOT Doing

- Nie dodajemy DB CHECK constraint (JSON fields nie wspierają relacyjnych constraints w PostgreSQL)
- Nie refaktorujemy `TransformationJobRepository` do pełnego portu ACL (to `03-anti-corruption-layer.md`)
- Nie egzekwujemy feedbacku (I-2) — to osobna zmiana
- Nie zmieniamy UI `TransformationJobCard.tsx` — checkbox nadal istnieje; tylko logika pre-selection znika
- Nie robimy walidacji `score_before` w `transformation-processor.ts` — procesor ma scope obliczenia, nie decyzji

## Implementation Approach

Test-first dla agregatu domenowego, potem cienki route jako wywołujący. Config rename jako
wstępna Faza 0 (lessons.md compliance). UI zmiana jako ostatnia — czeka aż 409 response shape
jest stabilne.

## Critical Implementation Details

**Kolejność faz jest twarda**: Faza 1 (agregat + testy) musi przejść zanim Faza 2 podmieni `save.ts`,
bo `save.ts` po zamianie deleguje do agregatu — bez niego nie skompiluje się.

**`handleConfirmSave` obsługuje regresję wsadowo**: `Promise.all` może zwrócić mieszankę 200 i 409.
Implementacja powinna zebrać wszystkie 409, pokazać jeden modal z listą regresji (job ID + delta),
a po potwierdzeniu zrobić drugi round `Promise.all` tylko dla jobów z regresją, tym razem z
`override_regression: true`.

---

## Phase 0: Config key rename (camelCase compliance)

### Overview

Przemianowanie kluczy `storageConfig` z PascalCase_snake na camelCase zgodnie z lessons.md, zanim
dodamy nowe referencje w repozytorium agregatu.

### Changes Required:

#### 1. `src/lib/config.ts`

**File**: `src/lib/config.ts`

**Intent**: Zmień nazwy kluczy `storageConfig` na camelCase. Oba klucze (`Max_Client_Repository`
→ `maxClientRepositoryBytes`, `Max_Client_Repository_Label` → `maxClientRepositoryLabel`)
zmieniają nazwy; wartości pozostają bez zmian.

**Contract**: `storageConfig.maxClientRepositoryBytes` (number) i
`storageConfig.maxClientRepositoryLabel` (string).

#### 2. `src/pages/api/objects/[objectId]/photos/upload-url.ts`

**File**: `src/pages/api/objects/[objectId]/photos/upload-url.ts`

**Intent**: Zaktualizuj referencję do `storageConfig.Max_Client_Repository` na `maxClientRepositoryBytes`
(linia 78).

**Contract**: Zmiana nazwy klucza; logika warunku bez zmian.

#### 3. `src/pages/api/transformations/[jobId]/save.ts`

**File**: `src/pages/api/transformations/[jobId]/save.ts`

**Intent**: Zaktualizuj referencje `Max_Client_Repository` (linia 51) i `Max_Client_Repository_Label`
(linia 54) na nowe nazwy camelCase. Plik zostanie zastąpiony w Fazie 2, ale rename musi nastąpić
wcześniej żeby Phase 0 commit był kompletny i typecheck przechodził.

**Contract**: Tylko rename; logika bez zmian.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` przechodzi bez błędów — brak referencji do starych kluczy
- `npm run lint` przechodzi

#### Manual Verification:

- Wgraj zdjęcie przekraczające 100 MB limit — sprawdź czy komunikat o limicie nadal pojawia się poprawnie

---

## Phase 1: Domain layer — errors, aggregate, tests (test-first)

### Overview

Stworzenie `src/lib/domain/` z klasami błędów domenowych i agregatem `TransformationJobAggregate`.
Testy muszą przejść zanim jakikolwiek route zostanie zmieniony.

### Changes Required:

#### 1. `src/lib/domain/transformation-errors.ts` (nowy plik)

**File**: `src/lib/domain/transformation-errors.ts`

**Intent**: Trzy klasy błędów domenowych: `TransformationNotReadyError`, `ScoreRegressionError`,
`StorageLimitExceededError`. Każda ma `readonly type` literal dla type narrowing w catch blocks.
`ScoreRegressionError` niesie `scoreBefore` i `scoreAfter` jako pola publiczne.

**Contract**: Zgodnie ze specyfikacją w `context/domain/02-invariant-aggregate-refactor.md` §KROK 4.
Wszystkie trzy klasy eksportowane jako named exports.

#### 2. `src/lib/domain/TransformationJobAggregate.ts` (nowy plik)

**File**: `src/lib/domain/TransformationJobAggregate.ts`

**Intent**: Agregat domenowy z metodą `save(opts?)`. Metoda egzekwuje trzy niezmienniki w kolejności:
status, storage, score. Rzuca odpowiedni błąd domenowy przy naruszeniu. `override_regression: true`
pozwala ominąć niezmiennik score.

**Contract**: Zgodnie ze specyfikacją w `02-invariant-aggregate-refactor.md` §KROK 4.
Interfejsy `JobState`, `StorageState`, `SaveOptions`, `SaveResult` i klasa `TransformationJobAggregate`
ze statyczną fabryką `load()` i metodą `save()`. Importuje `maxClientRepositoryBytes` i
`maxClientRepositoryLabel` z `storageConfig` (nowe nazwy z Fazy 0).

#### 3. `src/lib/domain/TransformationJobAggregate.test.ts` (nowy plik)

**File**: `src/lib/domain/TransformationJobAggregate.test.ts`

**Intent**: 10 przypadków testowych zgodnie ze specyfikacją w `02-invariant-aggregate-refactor.md`
§KROK 5. Test-first — plik tworzony PRZED uruchomieniem testów.

**Contract**: Plik zawiera dokładnie te 10 przypadków co w dokumencie domenowym (5 legalnych,
5 nielegalnych). Helper `makeJob()` z override defaults. `BASE_STORAGE` jako stała.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi — wszystkie 10 nowych przypadków testowych zielone
- `npm run typecheck` przechodzi — brak błędów TS w nowym katalogu `src/lib/domain/`
- `npm run lint` przechodzi

#### Manual Verification:

- Brak — faza czysto backendowa/domenowa

---

## Phase 2: Repository + thin API route

### Overview

Stworzenie `TransformationJobRepository` i zastąpienie `save.ts` cienką delegacją do agregatu.
Logika business pozostaje w agregacie; route zajmuje się tylko parsowaniem i mapowaniem błędów.

### Changes Required:

#### 1. `src/lib/domain/TransformationJobRepository.ts` (nowy plik)

**File**: `src/lib/domain/TransformationJobRepository.ts`

**Intent**: Repozytorium ładuje agregat (równoległe zapytania job + profile), persystuje decyzję
save (`markSaved`). Używa nowych camelCase kluczy z `storageConfig`.

**Contract**: Klasa `TransformationJobRepository` z konstruktorem `(db: SupabaseClient<Database>)`.
Metody:
- `loadForSave(jobId, userId): Promise<TransformationJobAggregate>` — SELECT job + profile równolegle; rzuca `Error` gdy nie znaleziono
- `markSaved(jobId, userId): Promise<void>` — UPDATE `status='saved'`, `updated_at`; musi zawierać `.eq("user_id", userId)` (lessons.md: mirror WHERE filters)

Zgodnie ze specyfikacją w `02-invariant-aggregate-refactor.md` §KROK 4.

#### 2. `src/pages/api/transformations/[jobId]/save.ts` (zastąpienie)

**File**: `src/pages/api/transformations/[jobId]/save.ts`

**Intent**: Zastąp całe ciało route'u cienką delegacją. Route parsuje `override_regression` z body
(Zod schema z `.default(false)`), ładuje agregat przez repozytorium, wywołuje `aggregate.save()`,
mapuje błędy domenowe na HTTP kody.

**Contract**: Mapowanie błędów:
- `TransformationNotReadyError` → 400 `{ error, type }`
- `ScoreRegressionError` → **409** `{ error, type, score_before, score_after, delta }`
- `StorageLimitExceededError` → 400 `{ error, type }`
- Sukces → 200 `{ saved: true, regression_acknowledged }`

Schema body: `z.object({ override_regression: z.boolean().optional().default(false) })`.
Route NIE wykonuje już żadnych inline business checks — wszystko przez agregat.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` przechodzi
- `npm run lint` przechodzi
- `npm test` nadal przechodzi (agregat nie zmieniony)

#### Manual Verification:

- Transformuj zdjęcie do wyniku `full_ready`. Wywołaj `POST /api/transformations/:id/save` bez body → gdy score regresja: 409 z `{type: "SCORE_REGRESSION", score_before, score_after, delta}`; gdy brak regresji: 200
- Wywołaj ten sam endpoint z `{ override_regression: true }` dla joba z regresją → 200 `{ saved: true, regression_acknowledged: true }`
- Wywołaj dla joba ze statusem `pending` → 400 `{type: "TRANSFORMATION_NOT_READY"}`

---

## Phase 3: UI — remove pre-selection, handle 409

### Overview

Usunięcie pre-selection logiki opartej na score z `TransformationSession.tsx`. Serwer staje się
jedynym strażnikiem reguły. UI obsługuje 409 przez modal z deltą i możliwością override.

### Changes Required:

#### 1. `src/components/transformation/TransformationSession.tsx` — pre-selection removal

**File**: `src/components/transformation/TransformationSession.tsx`

**Intent**: Usuń logikę `after.overall > before.overall` z inicjalizatora `saveChecked` (linie
23–31) i z `handleStyleSelect` po transformacji (linie 87–95). Checkbox startuje domyślnie
`true` dla wszystkich `full_ready` jobów — decyzję o regresji podejmuje serwer.

**Contract**: 
- Initializer `saveChecked` (linia 23): `init[job.id] = true` dla każdego joba (bez porównania score)
- `handleStyleSelect` po sukcesie: `setJobs(data.jobs); setStep("saving")` bez bloku `newSaveChecked`
- `handleSaveToggle` bez zmian

#### 2. `src/components/transformation/TransformationSession.tsx` — 409 handling w `handleConfirmSave`

**File**: `src/components/transformation/TransformationSession.tsx`

**Intent**: Zaktualizuj `handleConfirmSave` (linia 127) żeby obsługiwała 409 `ScoreRegressionError`.
Pierwsza runda: wyślij wszystkie zapisy bez `override_regression`. Zbierz joby które zwróciły 409
i ich delta payload. Jeśli są — pokaż modal z listą regresji. Po potwierdzeniu: wyślij ponownie
tylko te joby z `{ override_regression: true }`.

**Contract**: 
- Nowy state: `regressionJobs: Array<{jobId: string, scoreBefore: number, scoreAfter: number, delta: number}>` (pusty = brak modala)
- `handleConfirmSave`: po pierwszym `Promise.all`, zbierz 409 → setRegressionJobs; 200s → usuń z `jobs` lub flagnuj
- Modal (inline lub osobny komponent): wyświetla delta per job; przycisk „Zachowaj mimo to" → drugi round z `override_regression: true`; po sukcesie: `window.location.assign`
- `handleSaveToggle` i checkbox UI bez zmian strukturalnych

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` przechodzi
- `npm run lint` przechodzi

#### Manual Verification:

- Transformuj zdjęcie które pogarsza score. Na ekranie „saving": kliknij „Confirm save" → pojawia się modal z deltą (score_before, score_after, delta) → kliknij „Zachowaj mimo to" → zdjęcie zapisane, przekierowanie na `/objects/:id`
- Transformuj zdjęcie które poprawia score → „Confirm save" → bezpośrednie przekierowanie, bez modala
- Zmiksuj: 2 joby — 1 z regresją, 1 bez → modal pokazuje tylko job z regresją → po potwierdzeniu oba zapisane

---

## Testing Strategy

### Unit Tests:

- `src/lib/domain/TransformationJobAggregate.test.ts` — 10 przypadków (Faza 1)
- Wszystkie edge case'y objęte: null score_before/after, override=true, status checks, storage overflow, kolejność rzucania błędów

### Integration Tests:

- Brak automatycznych integration tests w tej zmianie — weryfikacja przez manual testing Fazy 2 i 3

### Manual Testing Steps (kompletny scenariusz po Fazie 3):

1. Zaloguj się jako `testuser@demo.com / !#demo123`
2. Stwórz obiekt, wgraj zdjęcie
3. Uruchom analizę → uzyskaj `score_before` (np. 7.0)
4. Uruchom transformację ze stylem który OBNIŻA score (np. ciemny styl dla jasnego zdjęcia) → poczekaj na `full_ready`
5. Kliknij „Confirm save" → sprawdź czy pojawia się modal z deltą (nie redirect)
6. Kliknij „Zachowaj mimo to" → sprawdź redirect na `/objects/:id` i status `saved` w Supabase
7. Powtórz z transformacją podwyższającą score → bezpośredni redirect bez modala

## References

- Domain analysis: `context/domain/02-invariant-aggregate-refactor.md`
- Layer spread research: `context/changes/core-layer-spread/research.md`
- ACL plan (powiązany): `context/domain/03-anti-corruption-layer.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 0: Config key rename

#### Automated

- [ ] 0.1 npm run typecheck przechodzi — brak referencji do starych kluczy
- [ ] 0.2 npm run lint przechodzi

#### Manual

- [ ] 0.3 Wgraj zdjęcie powyżej limitu — komunikat o storage limit nadal pojawia się poprawnie

### Phase 1: Domain layer — errors, aggregate, tests

#### Automated

- [ ] 1.1 npm test przechodzi — wszystkie 10 nowych przypadków testowych zielone
- [ ] 1.2 npm run typecheck przechodzi — brak błędów TS w src/lib/domain/
- [ ] 1.3 npm run lint przechodzi

### Phase 2: Repository + thin API route

#### Automated

- [ ] 2.1 npm run typecheck przechodzi
- [ ] 2.2 npm run lint przechodzi
- [ ] 2.3 npm test nadal przechodzi

#### Manual

- [ ] 2.4 POST /api/transformations/:id/save bez body → 409 gdy score regresja; 200 gdy poprawa
- [ ] 2.5 POST z { override_regression: true } → 200 regression_acknowledged: true dla joba z regresją
- [ ] 2.6 POST dla joba z status=pending → 400 TRANSFORMATION_NOT_READY

### Phase 3: UI — remove pre-selection, handle 409

#### Automated

- [ ] 3.1 npm run typecheck przechodzi
- [ ] 3.2 npm run lint przechodzi

#### Manual

- [ ] 3.3 Zdjęcie z regresją score → Confirm save → modal z deltą → Zachowaj mimo to → redirect
- [ ] 3.4 Zdjęcie z poprawą score → Confirm save → bezpośredni redirect bez modala
- [ ] 3.5 Mixed batch (1 regresja + 1 poprawa) → modal dla regresji → oba zapisane po potwierdzeniu
