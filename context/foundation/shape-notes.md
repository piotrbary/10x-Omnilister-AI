---
project: "Omnilister AI"
context_type: greenfield
created: 2026-05-24
updated: 2026-05-24
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 13
  gray_areas_resolved:
    - topic: "rodzaj bólu"
      decision: "wszystkie cztery: brak umiejętności fotograficznych, zbyt długi/ręczny proces, brak dostępu do narzędzi, brak wiedzy które zdjęcia są najlepsze"
    - topic: "główna persona"
      decision: "każdy sprzedawca prywatny lub firma; typ sprzedawanego obiektu (rzeczy/nieruchomości/samochody) wybierany w profilu"
    - topic: "kluczowy insight"
      decision: "AI rozumie CO jest na zdjęciu i CZEMU serwuje — kontekstowa transformacja sprzedażowa, nie tylko estetyczna"
    - topic: "auth model"
      decision: "email + hasło; rejestracja i logowanie w MVP"
    - topic: "model ról"
      decision: "płaska struktura — jeden typ użytkownika w MVP; role (AI Agent, Agencja) odłożone na później"
    - topic: "scope MVP"
      decision: "workflow i MCP poza MVP (zgodnie z oryginalnymi notatkami); core = biblioteka obiektów + transformacja AI"
    - topic: "timeline MVP"
      decision: "3 tygodnie po godzinach"
    - topic: "kryterium sukcesu"
      decision: "zdjęcie po transformacji ma wyższy quality score niż przed (ostrość, światło, tło, cechy obiektu, uszkodzenia, napisy, pokrycie kątów, sales readiness) + feedback od użytkownika"
    - topic: "guardrails"
      decision: "no distortion, prywatność per konto, transformacja < 60s, draft preview < 5s na niskiej rozdzielczości"
  frs_drafted: 13
  quality_check_status: accepted
---

## Vision & Problem Statement

Sprzedawcy marketplace'ów (Vinted, Allegro, Otodom, Otomoto) regularnie tracą sprzedaż przez słabe zdjęcia produktów: źle skadrowane, nieostre, bez profesjonalnego tła, nieeksponujące cech obiektu. Problemem jest jednoczesny brak umiejętności fotograficznych, czasu, dostępu do sprzętu studyjnego i wiedzy, które ze zrobionych zdjęć rzeczywiście przyciągają kupującego.

Kluczowy insight: istniejące edytory i filtry działają estetycznie, ale nie kontekstowo. Omnilister AI wie, że to konkretny samochód do sprzedaży na Otomoto lub konkretne mieszkanie na Otodom — i dobiera transformacje pod ten cel sprzedażowy, a nie tylko pod wizualny efekt. AI ocenia, rekomenduje i transformuje zdjęcia tak, żeby obiekt wyglądał profesjonalnie i atrakcyjnie dla kupującego, zachowując przy tym dokładne odzwierciedlenie cech sprzedawanego przedmiotu.

## User & Persona

### Główna persona
Ogłoszeniodawca — każdy sprzedawca prywatny lub firma korzystająca z polskich marketplace'ów. Typ sprzedawanego obiektu (rzeczy codzienne, nieruchomości, samochody) jest wybierany w profilu klienta i determinuje rekomendacje AI dopasowane do specyfiki danej kategorii i platformy.

Moment: tuż przed opublikowaniem ogłoszenia — gdy sprzedawca ma serię własnych zdjęć i nie wie, jak sprawić, żeby były wystarczająco dobre do sprzedaży.

## Access Control

Rejestracja emailem i hasłem; standardowy login. Płaska struktura użytkowników — każdy zarejestrowany użytkownik ma pełny dostęp do własnych obiektów, biblioteki zdjęć i edytora AI. Nie-zalogowany użytkownik nie ma dostępu do żadnych funkcji.

Role zaawansowane (AI Agent, Agencja z dostępem do kont klientów) — poza zakresem MVP; odłożone na fazę 2.

## Success Criteria

### Primary
- Zdjęcie po transformacji ma mierzalnie wyższy quality score niż oryginalne wejście. Score obejmuje: ostrość, jakość oświetlenia, profesjonalność tła, widoczność kluczowych cech obiektu, widoczność uszkodzeń/defektów, widoczność napisów/etykiet, pokrycie kątów (angle detector), sales readiness (gotowość do publikacji na portalu).
- Użytkownik potwierdza (feedback: poprawa / brak poprawy) — potwierdzenie zbierane po każdej transformacji.

### Secondary
- Biblioteka zapisanych stylów/promptów skraca czas kolejnej transformacji podobnego obiektu (użytkownik nie pisze promptu od zera).

### Guardrails
- Transformacja nie może zniekształcać produktu: AI nie dodaje cech, których produkt nie posiada (wiarygodność ogłoszenia nienaruszalna).
- Biblioteki zdjęć użytkownika są izolowane per konto — żaden inny użytkownik nie ma do nich dostępu.
- Draft transformacji (niska rozdzielczość, koncepcja) widoczny w ciągu 5 sekund; pełna transformacja w ciągu 60 sekund.

## Functional Requirements

### Autentykacja
- FR-001: Użytkownik może zarejestrować się przez email i hasło. Priority: must-have
  > Socrates: Kontrargument rozważony: "rejestracja to tarcie; anonimowy upload wystarczy." Odrzucony — biblioteka zdjęć per-użytkownik wymaga kont; FR stoi.

- FR-002: Użytkownik może się zalogować. Priority: must-have

### Biblioteka obiektów
- FR-003: Użytkownik może stworzyć obiekt z nazwą i numerem wersji. Priority: must-have
  > Socrates: Pierwotnie zawierało "kategorię". Kontrargument: "wybór kategorii przed wgraniem zdjęć to zła kolejność — AI powinna to wykryć sama." Zaakceptowany — kategoria usunieta z tworzenia obiektu; wypełniana po detekcji AI (FR-007 + FR-008). Rewizja: "z nazwą i numerem wersji" (bez kategorii).

- FR-004: AI może zaproponować cechy obiektu na podstawie zdjęć; użytkownik potwierdza lub edytuje. Priority: must-have
  > Socrates: Pierwotnie "użytkownik ręcznie dodaje cechy." Kontrargument: "ręczne wpisywanie to za dużo pracy — AI powinna sama wykrywać cechy ze zdjęć." Zaakceptowany — zmieniono na tryb AI-suggest + user-confirm.

- FR-005: Użytkownik może wgrać zdjęcia do obiektu. Priority: must-have

- FR-006: Użytkownik może przeglądać galerię zdjęć obiektu. Priority: must-have
  > Socrates: Kontrargument rozważony: "lista z miniaturami wystarczy, galeria to złożoność UI." Odrzucony — minimalne UI wymagane dla biblioteki; FR stoi.

### AI Edytor
- FR-007: AI może automatycznie zaproponować kategorię obiektu na podstawie zdjęć. Priority: must-have
  > Socrates: Kontrargument rozważony: "AI może się mylić na niszowych przedmiotach." Rozwiązanie: użytkownik może korygować i dawać feedback AI (pętla uczenia); błędy AI nie blokują użytkownika; FR stoi z feedbackiem jako kluczowym elementem.

- FR-008: Użytkownik może potwierdzić lub zmienić kategorię zaproponowaną przez AI. Priority: must-have

- FR-009: AI może ocenić jakość zdjęć i zwrócić quality score per kategoria obiektu. Priority: must-have
  > Socrates: Kontrargument zaakceptowany: "score wymiary są różnie ważne dla różnych kategorii — jeden algorytm nie pasuje do wszystkich." Rewizja: algorytm scoringu jest specyficzny dla kategorii (samochód / mieszkanie / rzecz). Score obejmuje: ostrość, oświetlenie, tło, cechy obiektu, uszkodzenia/defekty, napisy/etykiety, pokrycie kątów (angle detector), sales readiness.

- FR-010: Użytkownik może wybrać styl transformacji z listy lub zdefiniować własny prompt AI w danej kategorii. Priority: must-have
  > Socrates: Kontrargument rozważony: "dwa tryby podwajają złożoność UI." Odrzucony z doprecyzowaniem: style definiują kategorię (gotowe szablony z przykładami efektów), prompty to zapisane wcześniej lub nowo zdefiniowane instrukcje w danej kategorii. Beginner używa stylów; zaawansowany pisze własny prompt i zapisuje go do biblioteki.

- FR-011: AI może wykonać transformację wybranych zdjęć i pokazać podgląd przed/po. Priority: must-have
  > Socrates: Kontrargument rozważony: "podgląd przed/po podwaja zdjęcia w pamięci." Odrzucony — porównanie przed/po jest kluczowe dla zaufania; FR stoi.

- FR-012: Użytkownik może wybrać i zapisać wybrane transformowane zdjęcia w bibliotece obiektu. Priority: must-have
  > Socrates: Kontrargument zaakceptowany: "zapis wszystkich wersji wyczerpie miejsce." Rozwiązanie: użytkownik wybiera które transformacje zachować; polityka retencji zdefiniowana. FR zaktualizowany: "wybrać i zapisać" (nie "wszystkie").

- FR-013: Użytkownik może opublikować styl/prompt transformacji pod nazwą w globalnej bibliotece dostępnej dla wszystkich użytkowników. Priority: must-have
  > Socrates: Kluczowa rewizja: biblioteka stylów jest PUBLICZNA i GLOBALNA — style/prompty współdzielone między wszystkimi użytkownikami. Popularność stylów to kluczowa funkcja produktu. Dobre style mogą przyciągać nowych użytkowników (pętla viralna). FR zmieniony z "osobistej biblioteki" na "globalną bibliotekę publiczną."

## User Stories

### US-01: Sprzedawca uzyskuje profesjonalne zdjęcia produktu do ogłoszenia

- **Given** zalogowany sprzedawca, który ma serię własnych zdjęć produktu (np. samochód, mieszkanie, kurtka)
- **When** tworzy obiekt w bibliotece, wgrywa zdjęcia, AI ocenia je i proponuje transformację (styl lub prompt), sprzedawca zatwierdza transformację
- **Then** w bibliotece obiektów pojawia się obiekt z oryginalnymi zdjęciami oraz wybranymi poprawionymi wersjami, gotowymi do użycia w ogłoszeniu

#### Acceptance Criteria
- Quality score zdjęć po transformacji jest wyższy niż przed (per-kategoria algorytm)
- Podgląd przed/po widoczny przed zatwierdzeniem
- Draft transformacji (niska rozdzielczość) pojawia się w ciągu 5 sekund; pełna transformacja w ciągu 60 sekund
- Transformowane zdjęcia nie mogą zawierać elementów nieobecnych w oryginale (no hallucination)
- Sprzedawca może wybrać, które transformacje zachować w bibliotece

## Business Logic

Aplikacja ocenia zdjęcia produktu według kategoriospecyficznego modelu jakości sprzedażowej i transformuje je tak, aby quality score po transformacji był wyższy niż przed, zachowując przy tym wierne odzwierciedlenie rzeczywistych cech obiektu.

Wejściami reguły są: zdjęcia wgrane przez sprzedawcę, wybrana kategoria obiektu (potwierdzona lub zaproponowana przez AI) oraz styl/prompt transformacji (wybrany z globalnej biblioteki lub zdefiniowany przez użytkownika). Wyjście to: ocenione zdjęcia z per-kategorię score'm oraz przetransformowane wersje z wyższym score'em. Użytkownik napotyka regułę przez podgląd przed/po z liczbowym porównaniem score'u i decyduje, które wersje zachować.

Quality score jest kategoriospecyficzny: samochód oceniany jest inaczej niż mieszkanie czy przedmiot codziennego użytku. Wymiary score'u obejmują: ostrość, jakość oświetlenia, profesjonalność tła, widoczność kluczowych cech obiektu, widoczność uszkodzeń/defektów, widoczność napisów/etykiet, pokrycie kątów (angle detector) oraz sales readiness (gotowość do publikacji na danym portalu).

## Non-Functional Requirements

- Użytkownik widzi draft transformacji (niska rozdzielczość, koncepcja) w ciągu 5 sekund od zlecenia; pełna transformacja dostępna w ciągu 60 sekund.
- Biblioteki zdjęć, obiektów i prywatne prompty/style użytkownika są izolowane per-konto — niedostępne dla innych użytkowników bez jawnego aktu publikacji przez właściciela.
- Autor (użytkownik) może opublikować obiekt z jego cechami, opisami i zdjęciami oraz własne style/prompty w przestrzeni publicznej; opublikowane zasoby dostępne dla wszystkich użytkowników.
- Aplikacja działa poprawnie na ostatnich dwóch wersjach Chrome, Safari i Firefox, zarówno na desktopie jak i urządzeniach mobilnych.
- Aplikacja dostępna 24/7 bez planowanych okien serwisowych niedostępności.
- Transformowane zdjęcia nie zawierają elementów wizualnie nieobecnych w oryginale (brak halucynacji AI — zakaz dodawania nieistniejących cech produktu).

### Timeline acknowledgment
3-tygodniowy MVP po godzinach. Zakres MVP: rejestracja, biblioteka obiektów, auto-detekcja kategorii, transformacja AI z promptem/stylem, quality scoring, podgląd przed/po, zapis wyników. Workflow i MCP odłożone na fazę 2.

Deadline pierwotnie 2026-06-06 (13 dni) — przesunięty świadomie na ~2026-06-14, bo zakres MVP (3 tygodnie) jest ważniejszy niż data. Acknowledged on 2026-05-24: użytkownik akceptuje 3-tygodniowy timeline side-project; nieograniczona skala od dnia 1 oznacza większe wymagania na infrastrukturę.

## Non-Goals

- **Brak workflow publikacji ogłoszeń (MVP)**: aplikacja nie publikuje ogłoszeń na Vinted, Otodom, Otomoto. Funkcja oznaczona w notatkach jako "NOT MVP" — faza 2.
- **Brak zaawansowanych ról użytkownika (MVP)**: model płaski; role AI Agent i Agencja odłożone na fazę 2.
- **Brak skanowania 3D**: wyraźnie oznaczone jako "NOT MVP" w notatkach.
- **Brak własnego modelu AI do transformacji zdjęć**: MVP korzysta z zewnętrznego API/modelu (np. LLM nanobanana, grok imagine, deevid lub innego). Aplikacja nie trenuje ani nie hostuje własnego modelu generatywnego.
- **Brak konfiguracji MCP i connectorów do marketplace'ów**: odłożone na fazę 2 razem z workflow.





