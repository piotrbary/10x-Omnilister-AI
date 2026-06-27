---
title: "Omnilister AI — Domain Distillation"
created: 2026-06-26
type: domain-distillation
sources:
  - context/foundation/prd.md (v2, 2026-05-30)
  - context/foundation/roadmap.md (v1, 2026-05-30)
  - idea_omnilister_ai.md
  - src/lib/config.ts
  - src/lib/quality-scoring.ts
  - src/lib/transformation-processor.ts
  - src/lib/transformation-styles.ts
  - src/types/transformations.ts
  - src/types/database.generated.ts
  - src/pages/api/** (wybrane pliki)
---

# Omnilister AI — Domain Distillation

## KROK 0 — Kontekst projektu

### Dokumenty źródłowe

| Dokument | Status | Uwagi |
|----------|--------|-------|
| `context/foundation/prd.md` v2 | Główne źródło wymagań | 22 FR, w tym 7 FR-P2 odłożonych na fazę 2 |
| `context/foundation/roadmap.md` | Sekwencja slices F-01, S-01–S-04 | North star = S-03 (Sesja transformacji) |
| `idea_omnilister_ai.md` | Pierwotna narracja produktu | Nieformalna; PRD jest nadrzędny |

### Stack i struktura repozytorium

- **Frontend**: Astro 6.3 + React 19, routing plikowy (`src/pages/`)
- **Backend**: API routes Astro (`src/pages/api/`) — nie ma osobnej warstwy serwisu; logika biznesowa jest w `src/lib/`
- **Domena**: `src/lib/config.ts` (stałe), `src/lib/quality-scoring.ts`, `src/lib/transformation-processor.ts`, `src/lib/transformation-styles.ts`
- **Persystencja**: Supabase PostgreSQL + Storage; typy generowane w `src/types/database.generated.ts`
- **Infra**: Cloudflare Workers; deploy przez `wrangler`

**Ograniczenie metodologiczne**: brak wydzielonej warstwy domenowej. Reguły biznesowe żyją rozrzucone między `src/lib/`, schematem DB i kodem API routes. Nie ma agregatów jako klas — są tabele + funkcje + walidatory Zod.

---

## KROK 1 — Ubiquitous Language

| # | Pojęcie | Definicja | Cytat źródłowy | Lokalizacja w kodzie |
|---|---------|-----------|----------------|----------------------|
| 1 | **Ogłoszeniodawca / Sprzedawca** | Główna persona — prywatny lub firmowy sprzedawca na polskich marketplace'ach (Vinted, Allegro, Otodom, Otomoto) | PRD §User & Persona: „Ogłoszeniodawca — każdy sprzedawca prywatny lub firma korzystająca z polskich marketplace'ów" | BRAK w kodzie (role pominięte w MVP) |
| 2 | **Obiekt** | Sprzedawany przedmiot z nazwą, numerem wersji i galerią zdjęć; jednostka biblioteki użytkownika | PRD FR-003: „Użytkownik może stworzyć obiekt z nazwą i numerem wersji" | `src/types/objects.ts:1` (`ObjectRecord`); tabela `objects` — `database.generated.ts:37` |
| 3 | **Kategoria obiektu** | Typ sprzedawanego przedmiotu; determinuje model scoringu i style transformacji; wartości: `car`, `real-estate`, `item` | PRD FR-007/FR-009: „algorytm scoringu jest specyficzny dla kategorii" | `src/lib/config.ts:91` (`scoringConfig.categories`); `src/lib/quality-scoring.ts:26` (enum w GPT_JSON_SCHEMA) |
| 4 | **Zdjęcie (Photo)** | Plik graficzny wgrany do obiektu; punkt wejścia pipeline'u AI | PRD FR-005: „Użytkownik może wgrać zdjęcia do obiektu" | `src/types/objects.ts:9` (`PhotoRecord`); tabela `photos` — `database.generated.ts:70` |
| 5 | **Quality Score** | Ocena jakości sprzedażowej zdjęcia; 8 wymiarów × 0–10 + `overall` + `is_sales_ready`; obliczany per-kategoria | PRD FR-009: „quality score per kategoria obiektu... obejmuje: ostrość, oświetlenie, tło..." | `src/types/transformations.ts:7` (`QualityScoreSnapshot`); `src/lib/quality-scoring.ts:64` (`computeOverall`) |
| 6 | **Wymiary score'u** | 8 ocenianych aspektów: `sharpness`, `lighting`, `background`, `object_features`, `damage_defects`, `labels`, `angle_coverage`, `sales_readiness` | PRD §Business Logic: „Score obejmuje: ostrość, jakość oświetlenia, profesjonalność tła, widoczność kluczowych cech obiektu, widoczność uszkodzeń/defektów, widoczność napisów/etykiet, pokrycie kątów, sales readiness" | `src/lib/quality-scoring.ts:9–18` (`SCORE_DIMENSIONS`) |
| 7 | **Sales Readiness** | Próg jakości: overall ≥ 7/10 → zdjęcie gotowe do publikacji; poniżej → wymaga poprawy | PRD §Business Logic: „wynik 7/10 oznacza minimalne spełnienie 70% parametru każdej metryki" | `src/lib/config.ts:85` (`salesReadinessThreshold: 7`); `src/lib/quality-scoring.ts:159` (`is_sales_ready: overall >= scoringConfig.salesReadinessThreshold`) |
| 8 | **Transformacja** | Jednorazowy job AI: wejście = zdjęcie + prompt → wyjście = nowe zdjęcie z wyższym score'em; nie modyfikuje oryginału | PRD §Business Logic: „ocenia zdjęcia produktu i transformuje je tak, aby quality score po transformacji był wyższy niż przed" | `src/types/transformations.ts:20` (`TransformationJob`); tabela `transformations` — `database.generated.ts:248` |
| 9 | **Status transformacji** | Cykl życia joba: `pending` → `full_ready` → `saved` lub `failed` | BRAK explicite w PRD (wynikowy z US-01) | `src/types/transformations.ts:3` (`TransformationStatus`) |
| 10 | **Styl transformacji** | Szablon promptu per-kategoria; może być presetem (wbudowanym) lub zdefiniowanym przez użytkownika i opublikowanym globalnie | PRD FR-010: „styl transformacji z listy lub własny prompt"; FR-013: „publiczna globalna biblioteka" | `src/lib/transformation-styles.ts:13` (`PRESET_STYLES`); tabela `styles` — `database.generated.ts:203` |
| 11 | **Prompt** | Konkretna instrukcja tekstowa do modelu AI; zawsze zawiera guardrail no-distortion jako sufiks | PRD FR-010: „zapisane wcześniej lub nowo zdefiniowane instrukcje w danej kategorii" | `src/lib/transformation-styles.ts:3` (`NO_DISTORTION_GUARDRAIL`); `src/lib/transformation-styles.ts:94` (`buildPrompt`) |
| 12 | **Guardrail no-distortion** | Reguła biznesowa: transformacja nie może dodawać, usuwać ani zmieniać realnych cech produktu | PRD §Guardrails: „Transformacja nie może zniekształcać produktu"; NFR: „Transformowane zdjęcia nie zawierają elementów wizualnie nieobecnych w oryginale" | `src/lib/transformation-styles.ts:3–4`: `const NO_DISTORTION_GUARDRAIL = "IMPORTANT: Do NOT add, remove, or alter any actual features..."` |
| 13 | **Globalna biblioteka stylów** | Publiczna przestrzeń stylów dostępna dla wszystkich użytkowników; zasilana przez opublikowane style użytkowników | PRD FR-013: „opublikować styl/prompt transformacji pod nazwą w globalnej bibliotece dostępnej dla wszystkich użytkowników" | `src/pages/api/styles/index.ts:43` (filtr `is_public`); pole `is_public` w `database.generated.ts:209` |
| 14 | **Storage Quota** | Limit dyskowy per konto: 100 MB (oryginalne + transformowane zdjęcia łącznie) | PRD §NFR: „Max_Client_Repository = 100 MB... Przekroczenie blokuje wgrywanie" | `src/lib/config.ts:9` (`Max_Client_Repository: 100 * 1024 * 1024`); `src/pages/api/objects/[objectId]/photos/upload-url.ts:78` |
| 15 | **Feedback** | Ocena użytkownika po transformacji: `improved` lub `not_improved`; jedyna pętla uczenia w MVP | PRD §Success Criteria: „Użytkownik potwierdza (feedback: poprawa / brak poprawy) — potwierdzenie zbierane po każdej transformacji" | `src/types/transformations.ts:5` (`FeedbackValue`); `src/pages/api/transformations/[jobId]/feedback.ts` |
| 16 | **Cechy obiektu (features_text)** | Opisowy tekst widocznych cech wykrytych przez AI na zdjęciach; użytkownik może potwierdzić lub edytować | PRD FR-004: „Aplikacja może zaproponować cechy obiektu na podstawie zdjęć; użytkownik potwierdza lub edytuje" | `database.generated.ts:42` (kolumna `features_text`); `src/lib/quality-scoring.ts:289–307` (automatyczna aktualizacja, bez UI potwierdzenia) |
| 17 | **Draft transformacji** | Wersja niska rozdzielczość; widoczna < 5 sekund od zlecenia | PRD §Guardrails: „Draft transformacji (niska rozdzielczość) widoczny w ciągu 5 sekund" | `src/lib/config.ts:65` (`draftPreviewTimeoutMs: 5_000`); **BRAK implementacji** — brak dwufazowego pipeline'u |
| 18 | **Sesja transformacji** | Kompletny przepływ end-to-end: upload → scoring → transformacja → podgląd przed/po → zapis | Roadmap §S-03: „najmniejszy kompletny przepływ end-to-end... który udowadnia, że hipoteza produktowa jest prawdziwa" | Orchestrowana przez `src/pages/api/transformations/start.ts` (synchronicznie) |

---

## KROK 2 — Klasyfikacja subdomen

| Subdomena | Typ | Uzasadnienie |
|-----------|-----|--------------|
| **Kontekstowy Quality Scoring per-kategoria** | **Core** | Główny wyróżnik produktu wg Roadmap §Vision: „kontekstowa transformacja sprzedażowa: AI zna kategorię obiektu i dobiera transformację pod konkretny marketplace". Mierzalny dowód wartości (PRD §Primary Success Criteria). Bez tego to zwykły filtr. |
| **Guardrail no-distortion** | **Core** | Warunek nienaruszalności ogłoszenia (PRD §Guardrails). Bez tego reguły produkt może szkodzić sprzedawcy. Decyduje o zaufaniu produktu. |
| **Sesja transformacji AI (feedback loop)** | **Core** | North star (Roadmap §S-03). Jedyny mechanizm weryfikacji hipotezy produktowej. Feedback `improved/not_improved` jest jedyną pętlą uczenia w MVP. |
| **Biblioteka obiektów i zdjęć** | **Supporting** | Konieczna dla persystencji i izolacji per-konto (PRD §NFR), ale nie stanowi przewagi — typowy CRUD. Włącza przepływ core'owy, ale sam nie jest wyróżnikiem. |
| **Globalna biblioteka stylów** | **Supporting** | Reużywalność i pętla viralna (PRD FR-013 §Secondary Success Criteria). Buduje sieciowy efekt, ale jest wtórna wobec core scoringu i transformacji. |
| **Zarządzanie storage i limitami** | **Supporting** | Wymuszone przez NFR (100 MB per konto). Infrastrukturalna reguła biznesowa — konieczna, niewyróżniająca. |
| **Autentykacja (rejestracja, login)** | **Generic** | Standardowy flow — zrealizowany przez Supabase Auth. Brak domeny własnej. |
| **Przechowywanie plików** | **Generic** | Supabase Storage + RLS. Commodity; konfiguracja bez własnej logiki domenowej. |
| **GDPR / UODO (faza 2)** | **Generic** | Compliance zewnętrzny — standardowe wymagania prawne; nie stanowi przewagi produktowej. |

---

## KROK 3 — Kandydaci na agregaty i niezmienniki

### A1 — Obiekt (Object)

**Granica**: `objects` + powiązane `photos` (max 10)

| Niezmiennik | Źródło | Status w kodzie |
|-------------|--------|----------------|
| Max 10 zdjęć per obiekt | `src/lib/config.ts:21` (`maxPhotosPerObject: 10`) | **CZĘŚCIOWY** — soft guard w API (`upload-url.ts:92`), brak constraint DB; race condition możliwy przy równoległych wgraniach |
| Kategoria ∈ {car, real-estate, item} lub NULL (nieznana) | `src/lib/config.ts:91`; PRD FR-007 | **CZĘŚCIOWY** — walidacja przy zapisie score (`quality-scoring.ts:163`), ale kolumna `objects.category` to `string | null` bez CHECK constraint |
| Kategoria musi być potwierdzona przed transformacją, żeby scoring był sens | PRD FR-008: „Użytkownik może potwierdzić lub zmienić kategorię" | **IGNOROWANY** — jeśli `objects.category IS NULL`, `transformation-processor.ts:23` milcząco fallbackuje na `"item"` bez informowania użytkownika |

---

### A2 — Zdjęcie z Quality Score (Photo + QualityScore)

**Granica**: `photos` + `quality_scores` (0..N per photo — cache'owanie wielu wersji score'u)

| Niezmiennik | Źródło | Status w kodzie |
|-------------|--------|----------------|
| `overall` = ważona średnia 8 wymiarów per kategoria | PRD §Business Logic; `scoringConfig.categoryWeights` | **ENFORCED** — `quality-scoring.ts:64–76` (`computeOverall`) |
| `is_sales_ready` = `overall >= 7` | PRD §Business Logic: „próg 7/10 jednolity dla wszystkich kategorii" | **ENFORCED** — `quality-scoring.ts:159` |
| Wagi są równe dla wszystkich kategorii w MVP | `src/lib/config.ts:98–102` (wszystkie = 1) | **ZADEKLAROWANY, NIE SKALIBROWANY** — komentarz: „Calibrate per category before public launch" |

---

### A3 — TransformationJob

**Granica**: jeden wiersz `transformations`; orchestracja w `transformation-processor.ts`

| Niezmiennik | Źródło | Status w kodzie |
|-------------|--------|----------------|
| Prompt ZAWSZE zawiera guardrail no-distortion jako sufiks | PRD §Guardrails: „aplikacja nie dodaje cech, których produkt nie posiada" | **ENFORCED** — `transformation-styles.ts:94–106` (`buildPrompt` zawsze appenduje `NO_DISTORTION_GUARDRAIL`); działa dla preset AND custom styles przez `buildPrompt` |
| Zapis (`status = saved`) wymaga `status == full_ready` | US-01 AC: „podgląd przed/po widoczny przed zatwierdzeniem" | **ENFORCED** — `save.ts:32`: `if (job.status !== "full_ready") return 400` |
| `score_after >= score_before` (overall) | PRD §Primary Success Criteria: „Quality score zdjęć po transformacji jest wyższy niż przed" | **IGNOROWANY** — kod zapisuje `score_after` bez weryfikacji; użytkownik może zachować transformację z niższym score'em |
| Feedback musi być zebrany po każdej transformacji | PRD §Primary Success Criteria: „potwierdzenie zbierane po każdej transformacji" | **IGNOROWANY** — endpoint feedback istnieje, ale brak enforcement; status `saved` nie wymaga feedbacku |
| Retry ≤ `maxRetries` (= 2) | `src/lib/config.ts:68` | **ENFORCED** — `transformation-processor.ts:136` |

---

### A4 — Style (Styl transformacji)

**Granica**: `styles` (publiczne i prywatne)

| Niezmiennik | Źródło | Status w kodzie |
|-------------|--------|----------------|
| Kategoria ∈ {car, real-estate, item} | PRD FR-010: „styl w danej kategorii" | **ENFORCED** — `src/pages/api/styles/index.ts:9` (Zod `z.enum`) |
| Prompt min 10 znaków | PRD (implied — prompt musi być użyteczny) | **ENFORCED** — `styles/index.ts:11` (`z.string().min(10)`) |
| Opublikowany styl nie może zachęcać AI do halucynacji | PRD §Guardrails; Roadmap §S-04 Risk: „prompty skłaniające AI do dodawania nieistniejących cech" | **IGNOROWANY** — brak moderacji przed publikacją; `buildPrompt` dodaje guardrail do promptu bazowego, ale nie weryfikuje treści promptu |

---

### A5 — Profil / StorageQuota

**Granica**: `profiles.storage_used_bytes`; limit 100 MB

| Niezmiennik | Źródło | Status w kodzie |
|-------------|--------|----------------|
| `storage_used_bytes + new_file_size ≤ 100 MB` | PRD §NFR: `Max_Client_Repository = 100 MB` | **ENFORCED (podwójnie)** — soft check w `upload-url.ts:78`; hard CHECK constraint w DB (trigger na `profiles`) |
| `storage_used_bytes` rośnie przy wgraniu zdjęcia; spada przy usunięciu | PRD §NFR (implied) | **ENFORCED przez trigger DB** — `save.ts:60`: komentarz „F-01 trigger increments storage_used_bytes automatically" |

---

## KROK 4 — Rozjazdy MODEL vs KOD

| # | PRD mówi (MODEL) | Kod robi | Dowód (plik:linia) | Ocena ryzyka |
|---|-----------------|----------|--------------------|--------------|
| **D-1** | „Quality score po transformacji jest wyższy niż przed" (Primary Success Criteria) | Kod zapisuje `score_after` bez porównania z `score_before`; użytkownik może zachować transformację z niższym score'em | `transformation-processor.ts:118–129` — UPDATE z `score_after` bez warunku | **HIGH** — główne kryterium sukcesu nie jest egzekwowane; produkt może nie spełniać własnej obietnicy |
| **D-2** | „Feedback: zbierany po każdej transformacji" (Primary Success Criteria) | Feedback jest opcjonalny; `status = saved` nie wymaga feedbacku; endpoint istnieje ale bez enforcement | `save.ts:63` — UPDATE `status: "saved"` bez sprawdzenia `feedback` | **MEDIUM** — utrata danych uczenia; PRD mówi „zbierane po każdej transformacji" |
| **D-3** | „Użytkownik potwierdza lub edytuje cechy obiektu" (FR-004) | `features_text` aktualizowany automatycznie z pierwszego zdjęcia bez UI kroku potwierdzenia | `quality-scoring.ts:289–307` — UPDATE `features_text` przy `objectRow?.category === null` | **MEDIUM** — PRD zakłada confirm step; kod pomija UI confirm |
| **D-4** | „Draft transformacji widoczny w ciągu 5 sekund" (§Guardrails, NFR) | Implementacja jest czysto synchroniczna i jednofazowa; brak draft/low-res preview | `transformation-processor.ts:50–158` — jeden `while(true)` loop, brak fazy draft | **HIGH** — NFR złamane; `draftPreviewTimeoutMs = 5_000` w config.ts:65 to martwy config |
| **D-5** | „Kategoria jest wykrywana przez AI i potwierdzana przez użytkownika" (FR-007, FR-008) | Jeśli `objects.category IS NULL`, transformacja milcząco przyjmuje kategorię `"item"` i kontynuuje | `transformation-processor.ts:23`: `?? "item"` bez logowania ani odpowiedzi użytkownikowi | **MEDIUM** — transformacja bez potwierdzonej kategorii używa złego modelu scoringu |
| **D-6** | „Wagi wymiarów score'u są kalibrowane per kategoria" (PRD §Business Logic: „wagi poszczególnych wymiarów mogą różnić się per kategoria") | Wszystkie wagi = 1 dla wszystkich kategorii; komentarz wprost wskazuje na brak kalibracji | `config.ts:98–102`: `car: {sharpness:1, lighting:1,...}` — identyczne dla wszystkich; komentarz „Calibrate per category before public launch" | **MEDIUM** — scoring car i real-estate oceniane tak samo jak `item`; waga `angle_coverage` powinna być inna dla mieszkania |
| **D-7** | „Moderacja globalnej biblioteki stylów" (Roadmap §S-04 Risk: „prompty skłaniające AI do dodawania nieistniejących cech produktu... Potrzebna przynajmniej polityka moderacji reaktywnej") | Brak jakiejkolwiek moderacji; flaga `is_reported` istnieje w DB ale nie jest obsłużona w API | `database.generated.ts:213` (`is_reported: boolean`) — pole istnieje; BRAK endpointu do raportowania i obsługi | **HIGH** — guardrail no-distortion może być obejście przez custom style; to core reguła biznesowa |

---

## KROK 5 — Ranking refaktoru

### Matryca decyzyjna

| # | Kandydat | Jak rdzeniowy niezmiennik | Jak słabo egzekwowany | Priorytet |
|---|----------|--------------------------|----------------------|-----------|
| **R-1** | Weryfikacja `score_after >= score_before` przed zapisem | ★★★★★ (Primary Success Criteria) | Całkowicie ignorowany w kodzie | **#1** |
| **R-2** | Draft pipeline (< 5 s) — dwufazowa transformacja | ★★★★☆ (Core NFR, guardrail) | Martwy config; zero implementacji | **#2** |
| **R-3** | Moderacja / weryfikacja custom stylów przed publikacją | ★★★★☆ (guardrail no-distortion) | Pole `is_reported` bez obsługi | **#3** |
| **R-4** | Enforcement feedbacku przy `save` | ★★★☆☆ (Primary Success Criteria, pętla uczenia) | Opcjonalny; brak DB constraint | **#4** |
| **R-5** | Kalibracja wag per kategoria | ★★★☆☆ (różnicowanie scoringu) | Placeholder; TODO w kodzie | **#5** |
| **R-6** | Guard na kategorię przed transformacją | ★★☆☆☆ (spójność scoringu) | Silent fallback na "item" | **#6** |

---

### #1 do refaktoru: Weryfikacja score_after >= score_before

**Dlaczego pierwsze**: to jedyne miejsce, gdzie główne kryterium sukcesu produktu — mierzalnie wyższy score po transformacji — mogłoby być weryfikowane kodem. Dziś użytkownik może zapisać transformację, która pogorszyła zdjęcie, a produkt nie tylko na to pozwala, ale nie informuje o tym. Naruszenie PRD §Primary Success Criteria jest kompletne i ciche.

**Gdzie**: `src/pages/api/transformations/[jobId]/save.ts` — przed UPDATE `status = saved` dodać sprawdzenie `score_after.overall > score_before.overall` z odpowiedzią informacyjną (warn, nie hard block — użytkownik powinien móc overrideować). Równolegle `transformation-processor.ts` powinien logować delta score i oznaczać joba gdy score_after < score_before.

**Alternatywa UX**: nie blokować zapisu, ale wymagać jawnego potwierdzenia od użytkownika gdy `score_after < score_before` — zachowuje autonomię sprzedawcy (produkt oceniany subiektywnie), ale czyni naruszenie widzialnym.

---

## Podsumowanie artefaktu

Artefakt zawiera pełną mapę domenową Omnilister AI: 18-pojęciowy Ubiquitous Language zakotwieczony w PRD i kodzie, klasyfikację 9 subdomen (3 Core, 3 Supporting, 3 Generic), 5 kandydatów na agregaty z 15 zbadanymi niezmiennikami, 7 rozjazdów model-vs-kod oraz ranking 6 kandydatów do refaktoru.

**Najważniejszy wniosek**: główne kryterium sukcesu produktu (score_after > score_before — D-1) nie jest egzekwowane przez żadną warstwę kodu. Równolegle brak dwufazowej transformacji (D-4) sprawia, że NFR „draft < 5 sekund" jest martwym wymaganiem. Oba rozjazdy dotyczą rdzenia produktu i powinny trafić do planu przed publicznym launchem.
