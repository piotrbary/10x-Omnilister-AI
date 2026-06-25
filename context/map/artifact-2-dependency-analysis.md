# Artifact 2 — Dependency Analysis

> Narzędzie: dependency-cruiser v17.4.3. Branch: `UX_REDESIGN`. Data: 2026-06-24.
> Zakres: pełny skan `src/`. Kontekst: `artifact-1-territory.md`.

---

## Pliki wygenerowane

| Plik | Format | Opis |
|------|--------|------|
| `context/map/graph-1-modules.svg` | SVG (Graphviz) | Cały `src/` collapsed do folderów |
| `context/map/graph-2-start-risk.svg` | SVG (Graphviz) | Drzewo tranzytywne `start.ts` |
| `context/map/graph-1-modules.mmd` | Mermaid | j.w. do renderowania w GitHub/Obsidian |
| `context/map/graph-2-start-risk.mmd` | Mermaid | j.w. |

---

## Konfiguracja dependency-cruiser

Plik: `.dependency-cruiser.cjs`

Reguły aktywne:
- `no-circular` (warn) — cykliczne zależności
- `no-orphans` (warn) — moduły bez importerów
- `not-to-unresolvable` (error) — nierozwiązywalne importy
- `not-to-test` (error) — src importuje pliki testowe
- `pages-api-only-lib` (warn) — API routes importują komponenty
- `components-not-to-pages` (warn) — komponenty importują strony

Skrypty w `package.json`:
```bash
npm run depcruise          # walidacja w konsoli
npm run depcruise:graph    # SVG przez dot
npm run depcruise:html     # raport HTML
```

---

## Wyniki skanowania

### Cykle zależności

**Wynik: brak cykli.** 0 krawędzi circular w całym `src/`.

Projekt ma 30 commitów — cykle nie zdążyły się wytworzyć. Ryzyko wzrośnie gdy `EditorShell` (fan-out=9) będzie dalej rósł.

### Orphaned modules (8 ostrzeżeń)

Moduły niezaimportowane przez nikogo w zakresie skanu:

| Moduł | Warstwa | Uwaga |
|-------|---------|-------|
| `src/components/editor/CategorySelector.tsx` | UX | Możliwy WIP na branchu UX_REDESIGN |
| `src/components/editor/EditorHeader.tsx` | UX | j.w. |
| `src/components/editor/GuardrailBox.tsx` | UX | j.w. |
| `src/lib/config-status.ts` | LIB | Nie używany nigdzie |
| `src/lib/utils.ts` | LIB | Używany tylko przez `FormField` i `button.tsx` (te są w skanie) — sprawdzić |
| `src/types/analysis.ts` | TYPES | Nie importowany przez żaden moduł w src/ |
| `src/types/database.generated.ts` | TYPES | Generowany 4× w git, ale nie importowany |
| `src/types/objects.ts` | TYPES | Nie importowany |

> Uwaga: skan nie obejmował plików `.astro` — część orphanów może być importowana przez strony Astro.

---

## Granice warstw

### Mapa warstw

```
UX:components  →  LIB:logic  →  EXT:ai-pipeline  →  [OpenRouter API]
UX:components  →  UX:mock-data
API:routes     →  DB:client  →  [Supabase]
API:routes     →  EXT:ai-pipeline
API:routes     →  LIB:logic
MW:auth        →  DB:client
```

### Naruszenia formalne

**Wynik: brak twardych naruszeń.** Żaden komponent UI nie importuje Supabase. Żaden `lib/` nie importuje komponentów.

### Szara strefa: `config.ts` w komponentach

6 komponentów importuje `src/lib/config.ts` bezpośrednio:

- `src/components/AnalysisSection.tsx`
- `src/components/editor/EditorShell.tsx`
- `src/components/editor/TransformToolbar.tsx`
- `src/components/objects/PhotoGallery.tsx`
- `src/components/objects/PhotoUploader.tsx`
- `src/components/transformation/TransformationJobCard.tsx`

`config.ts` to #1 hot file (5 edycji w git). Każda zmiana jego struktury wymaga przeglądania komponentów UI.

### Problemy strukturalne

**Problem 1 — Dwa równoległe wejścia do AI pipeline:**

```
start.ts   → transformation-processor.ts → openrouter-images.ts
guest.ts   → openrouter-images.ts  (bezpośrednio, pomija procesor)
analyze.ts → quality-scoring.ts    (trzecia ścieżka)
```

Zmiana modelu AI wymaga aktualizacji 3 miejsc. `guest.ts` jest nowy (nie w top hot files git) — ślepa plamka mapy terytorium.

**Problem 2 — Mock dane w produkcyjnym komponencie:**

`EditorShell.tsx` importuje `src/data/mockEditorData.ts` bezpośrednio (nie warunkowo). Sprawdzić czy `MOCK_SCORE_BEFORE` jest używany jako fallback czy stała renderowana zawsze.

---

## Metryki hubów

| Moduł | Fan-in | Fan-out | Charakter |
|-------|--------|---------|-----------|
| `src/lib/supabase.ts` | 18 | 0 | Hub systemowy — każda trasa API |
| `src/lib/config.ts` | 15 | 0 | Hub konfiguracyjny — wszystkie warstwy |
| `src/lib/transformation-styles.ts` | 5 | 0 | Hub stylów transformacji |
| `src/components/editor/EditorShell.tsx` | 1 | 9 | Najwyższy fan-out — ryzyko testowe |
| `src/pages/api/transformations/start.ts` | 0 | 4 | DB + AI jednocześnie |

---

## Ryzyka testowalności

### Ranking ryzyk

| Wynik | Moduł | Flagi | Uzasadnienie |
|-------|-------|-------|--------------|
| 11 | `EditorShell.tsx` | CFG, MOCK | fan-out=9, mock w produkcji |
| 10 | `start.ts` | DB, AI | fan-out=4, 7 tranzytywnych |
| 8 | `analyze.ts` | DB, AI | fan-out=2, dwie hard deps |
| 7 | `guest.ts` | AI, CFG | omija transformation-processor |
| 7 | `transformation-processor.ts` | AI, CFG | jedyny importer = start.ts |
| 6 | `category.ts`, `save.ts`, `upload-url.ts` | DB, CFG | standardowe API+DB |
| 6 | `quality-scoring.test.ts` | AI, CFG | test importujący config AI |

### Transitive dependency surface

| Moduł | Transitive deps | DB | AI |
|-------|-----------------|----|----|
| `start.ts` | 7 | ✓ | ✓ |
| `EditorShell.tsx` | 10 | ✗ | ✗ |
| `TransformationSession.tsx` | 6 | ✗ | ✗ |
| `analyze.ts` | 3 | ✓ | ✓ |
| `transformation-processor.ts` | 3 | ✗ | ✓ |
| `guest.ts` | 3 | ✗ | ✓ |

### Co testować jak

| Moduł | Zalecany typ testu | Powód |
|-------|-------------------|-------|
| `start.ts` | integracyjny (Supabase local) lub e2e | DB + AI naraz, nie da się sensownie unit-testować |
| `guest.ts` | integracyjny z MSW | Osobna ścieżka AI — musi być testowany niezależnie od `start.ts` |
| `analyze.ts` | integracyjny | DB + `quality-scoring` bezpośrednio |
| `transformation-processor.ts` | unit — jeśli eksportuje czystą funkcję | Weryfikacja potrzebna |
| `middleware.ts` | e2e jedyna opcja | Auth flow nie da się przetestować bez HTTP |
| `EditorShell.tsx` | e2e (mock server API) | Za duży na unit, mock data w produkcji |
| `config.ts` | brak testu potrzebny | Czyste stałe — testowane pośrednio |

---

## Wnioski

### Gdzie projekt jest naprawdę kruchy

1. **`guest.ts`** — przy zmianie modelu AI w `openrouter-images.ts` naturalny odruch to aktualizacja `transformation-processor.ts`. `guest.ts` będzie działał ze starym modelem bez żadnego błędu kompilacji.

2. **`config.ts` w komponentach** — 6 komponentów importuje config infrastruktury AI/storage. Jeśli to czyste stałe (`MAX_FILE_SIZE`, `ACCEPTED_MIME_TYPES`) — wystarczy przenieść do `constants.ts` i odciąć 6 niepotrzebnych zależności.

3. **`supabase.ts` bez warstwy serwisowej** — 18 tras z bezpośrednim dostępem. Pierwsza potrzeba (multi-tenant, testy z mockiem DB, rotacja kluczy) uderzy w 18 plików jednocześnie.

### Zgodność z artifact-1-territory.md

| Wniosek z git (artifact-1) | Potwierdzenie przez dep-cruiser |
|---------------------------|--------------------------------|
| `config.ts` = #1 hot file | fan-in=15, obecny we wszystkich warstwach ✓ |
| `transformation-processor` + `openrouter-images` = jeden moduł | Oba importowane przez `start.ts`, procesor importuje images ✓ |
| `EditorShell` rośnie szybko | fan-out=9, najwyższy w repo ✓ |
| `supabase.ts` nie w top hot files | fan-in=18 — hub niewidoczny w git, widoczny w grafie ✓ |
| `guest.ts` poza mapą terytorium | Nowy plik, nie w 60-dniowej historii — ślepa plamka ✓ |

---

## Co sprawdzić dalej

1. Czy `transformation-processor.ts` eksportuje czystą funkcję bez `Astro.context`?
2. Które pola `config.ts` czytają komponenty — stałe czy live env?
3. Czy import `mockEditorData` w `EditorShell` jest warunkowy (`import.meta.env.DEV`)?
4. Czy `guest.ts` i `start.ts` wywołują AI z tymi samymi parametrami — jeśli tak, można je scalić.
5. Rozszerzyć skan o `.astro` — dodać `extensions: [".astro"]` do `enhancedResolveOptions` w `.dependency-cruiser.cjs`.
