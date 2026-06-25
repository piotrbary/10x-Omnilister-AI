# Artifact 3 — Contributor Analysis

> Zakres: ostatnie 12 miesięcy. Branch: `UX_REDESIGN`. Data: 2026-06-25.
> Podstawa: `artifact-1-territory.md` + `artifact-2-structure.md`.
> Filtr: usunięto co-authory AI (Claude Sonnet 4.6, Claude Opus 4.7) oraz boty.

---

## Ludzcy kontrybutorzy

| Autor | Email | Commity (12 mies.) |
|-------|-------|-------------------|
| piotrbary | piotr.barylak@gmail.com | 30 |

Jedyny ludzki kontrybutor. Wszystkie 30 commitów nosi `Co-Authored-By` agentów AI, ale wyraźne autorstwo człowieka jest obecne w każdym.

---

## Aktywność w 5 obszarach ryzyka

### 1. `src/middleware.ts` — auth & routing

| Commit | Opis |
|--------|------|
| `0ec14f4` | Editor redesign + Supabase migrations (middleware dotknięty w sweep) |
| `4ad5ddb` | API Routes — object upload (nowe chronione trasy) |
| `c11e54a` | Foundation — bucket policy, config, types |

**Wzorzec:** middleware zmienia się reaktywnie przy każdym nowym obszarze funkcjonalnym, nie z inicjatywy. Piotrbary jest jedynym właścicielem decyzji auth flow.

---

### 2. `src/lib/config.ts` — hub konfiguracyjny (fan-in=15)

| Commit | Opis |
|--------|------|
| `cb77b4e` | Migracja OpenAI → Gemini/OpenRouter (główna restrukturyzacja) |
| `c11e54a` | Bucket policy + stałe storage |
| `be29699` | Config, types & DB migration dla scoring |
| `1469164` | Data contracts & schema (AI transformation session) |
| `2239db7` | Model selector — dodanie konfiguracji wyboru modelu |

**Wzorzec:** `config.ts` rośnie przy każdej nowej integracji zewnętrznej. Piotrbary jest jedyną osobą znającą granicę między "stałe UI" a "live env" w tym pliku.

---

### 3. AI pipeline — trójdzielny (`start.ts` / `guest.ts` / `analyze.ts`)

| Commit | Opis |
|--------|------|
| `cb77b4e` | Migracja całego AI pipeline (OpenAI → OpenRouter) |
| `6183494` | Backend Transformation API p2 — `start.ts` + `transformation-processor` |
| `c63a4d7` | Scoring Core Module — `quality-scoring.ts` + `analyze.ts` |
| `2239db7` | Model selector — wybór modelu w `start.ts` |

**Wzorzec:** `guest.ts` pojawił się jako untracked w `0ec14f4` bez dedykowanego commitu — brak udokumentowanej intencji rozgałęzienia. Piotrbary jest jedyną osobą znającą powód istnienia osobnej ścieżki dla gości.

---

### 4. `src/lib/supabase.ts` — hub DB (fan-in=18)

| Commit | Opis |
|--------|------|
| `d032e47` | Core schema — tables, functions, triggers |
| `6bfe3bb` | RLS Policies |
| `891d507` | Indexes, storage buckets, seeds |
| `0ec14f4` | Supabase migrations + editor redesign |

**Wzorzec:** schemat wdrożony fazowo (p1→p2→p3). Piotrbary zna kontekst każdej polityki RLS i powód struktury tabel.

---

### 5. Orphaned WIP w `src/components/editor/`

Pliki: `CategorySelector.tsx`, `EditorHeader.tsx`, `GuardrailBox.tsx`

| Commit | Opis |
|--------|------|
| `0ec14f4` | Editor UI redesign — pierwsze pojawienie się komponentów |
| `c6f9630` | Photo delete, prompt drawer, save/discard — dalsza rozbudowa edytora |

**Wzorzec:** piotrbary jest jedyną osobą wiedzącą czy te komponenty są aktywnym WIP, zaplanowanymi placeholderami czy porzuconym kodem.

---

## Wniosek

**Bus factor = 1** we wszystkich pięciu obszarach ryzyka.

Brak podziału własności między osoby — każda decyzja architektoniczna (auth flow, konfiguracja AI, schemat DB, rozgałęzienie pipeline, stan WIP edytora) spoczywa wyłącznie na jednym kontrybutorownie. Warto odnotować przy planowaniu testów lub onboardingu nowych kontrybutorów.
