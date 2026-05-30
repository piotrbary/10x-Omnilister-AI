---
project: "Omnilister AI"
version: 2
status: draft
created: 2026-05-25
updated: 2026-05-30
context_type: greenfield
product_type: web-app
target_scale:
  users: enterprise
  qps: medium
  data_volume: large
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-06-14
  after_hours_only: true
---

## Vision & Problem Statement

Sprzedawcy marketplace'ów (Vinted, Allegro, Otodom, Otomoto) regularnie tracą sprzedaż przez słabe zdjęcia produktów: źle skadrowane, nieostre, bez profesjonalnego tła, nieeksponujące cech obiektu. Problemem jest jednoczesny brak umiejętności fotograficznych, czasu, dostępu do sprzętu studyjnego i wiedzy, które ze zrobionych zdjęć rzeczywiście przyciągają kupującego.

Kluczowy insight: istniejące edytory i filtry działają estetycznie, ale nie kontekstowo. Omnilister AI wie, że to konkretny samochód do sprzedaży na Otomoto lub konkretne mieszkanie na Otodom — i dobiera transformacje pod ten cel sprzedażowy, a nie tylko pod wizualny efekt. AI ocenia, rekomenduje i transformuje zdjęcia tak, żeby obiekt wyglądał profesjonalnie i atrakcyjnie dla kupującego, zachowując przy tym dokładne odzwierciedlenie cech sprzedawanego przedmiotu.

## User & Persona

### Główna persona

Ogłoszeniodawca — każdy sprzedawca prywatny lub firma korzystająca z polskich marketplace'ów. Typ sprzedawanego obiektu (rzeczy codzienne, nieruchomości, samochody) jest wybierany w profilu klienta i determinuje rekomendacje AI dopasowane do specyfiki danej kategorii i platformy.

Moment: tuż przed opublikowaniem ogłoszenia — gdy sprzedawca ma serię własnych zdjęć i nie wie, jak sprawić, żeby były wystarczająco dobre do sprzedaży.

## Success Criteria

### Primary

- Zdjęcie po transformacji ma mierzalnie wyższy quality score niż oryginalne wejście. Score obejmuje: ostrość, jakość oświetlenia, profesjonalność tła, widoczność kluczowych cech obiektu, widoczność uszkodzeń/defektów, widoczność napisów/etykiet, pokrycie kątów (angle detector), sales readiness (gotowość do publikacji na portalu).
- Użytkownik potwierdza (feedback: poprawa / brak poprawy) — potwierdzenie zbierane po każdej transformacji.

### Secondary

- Biblioteka zapisanych stylów/promptów skraca czas kolejnej transformacji podobnego obiektu (użytkownik nie pisze promptu od zera).

### Guardrails

- Transformacja nie może zniekształcać produktu: aplikacja nie dodaje cech, których produkt nie posiada (wiarygodność ogłoszenia nienaruszalna).
- Biblioteki zdjęć użytkownika są izolowane per konto — żaden inny użytkownik nie ma do nich dostępu.
- Draft transformacji (niska rozdzielczość, koncepcja) widoczny w ciągu 5 sekund; pełna transformacja w ciągu 60 sekund.

## User Stories

### US-01: Sprzedawca uzyskuje profesjonalne zdjęcia produktu do ogłoszenia

- **Given** zalogowany sprzedawca, który ma serię własnych zdjęć produktu (np. samochód, mieszkanie, kurtka)
- **When** tworzy obiekt w bibliotece, wgrywa zdjęcia, aplikacja ocenia je i proponuje transformację (styl lub prompt), sprzedawca zatwierdza transformację
- **Then** w bibliotece obiektów pojawia się obiekt z oryginalnymi zdjęciami oraz wybranymi poprawionymi wersjami, gotowymi do użycia w ogłoszeniu

#### Acceptance Criteria

- Quality score zdjęć po transformacji jest wyższy niż przed (per-kategoria algorytm)
- Podgląd przed/po widoczny przed zatwierdzeniem
- Draft transformacji (niska rozdzielczość) pojawia się w ciągu 5 sekund; pełna transformacja w ciągu 60 sekund
- Transformowane zdjęcia nie mogą zawierać elementów nieobecnych w oryginale
- Sprzedawca może wybrać, które transformacje zachować w bibliotece

## Functional Requirements

### Autentykacja

- FR-001: Użytkownik może zarejestrować się przez email i hasło. Priority: must-have
  > Socrates: Kontrargument rozważony: "rejestracja to tarcie; anonimowy upload wystarczy." Odrzucony — biblioteka zdjęć per-użytkownik wymaga kont; FR stoi.

- FR-002: Użytkownik może się zalogować. Priority: must-have

### Biblioteka obiektów

- FR-003: Użytkownik może stworzyć obiekt z nazwą i numerem wersji. Priority: must-have
  > Socrates: Pierwotnie zawierało "kategorię". Kontrargument: "wybór kategorii przed wgraniem zdjęć to zła kolejność — aplikacja powinna to wykryć sama." Zaakceptowany — kategoria usunięta z tworzenia obiektu; wypełniana po detekcji (FR-007 + FR-008). Rewizja: "z nazwą i numerem wersji" (bez kategorii).

- FR-004: Aplikacja może zaproponować cechy obiektu na podstawie zdjęć; użytkownik potwierdza lub edytuje. Priority: must-have
  > Socrates: Pierwotnie "użytkownik ręcznie dodaje cechy." Kontrargument: "ręczne wpisywanie to za dużo pracy — aplikacja powinna sama wykrywać cechy ze zdjęć." Zaakceptowany — zmieniono na tryb suggest + user-confirm.

- FR-005: Użytkownik może wgrać zdjęcia do obiektu. Priority: must-have

- FR-006: Użytkownik może przeglądać galerię zdjęć obiektu. Priority: must-have
  > Socrates: Kontrargument rozważony: "lista z miniaturami wystarczy, galeria to złożoność UI." Odrzucony — minimalne UI wymagane dla biblioteki; FR stoi.

### AI Edytor

- FR-007: Aplikacja może automatycznie zaproponować kategorię obiektu na podstawie zdjęć. Priority: must-have
  > Socrates: Kontrargument rozważony: "aplikacja może się mylić na niszowych przedmiotach." Rozwiązanie: użytkownik może korygować i dawać feedback (pętla uczenia); błędy aplikacji nie blokują użytkownika; FR stoi z feedbackiem jako kluczowym elementem.

- FR-008: Użytkownik może potwierdzić lub zmienić kategorię zaproponowaną przez aplikację. Priority: must-have

- FR-009: Aplikacja może ocenić jakość zdjęć i zwrócić quality score per kategoria obiektu. Priority: must-have
  > Socrates: Kontrargument zaakceptowany: "score wymiary są różnie ważne dla różnych kategorii — jeden algorytm nie pasuje do wszystkich." Rewizja: algorytm scoringu jest specyficzny dla kategorii (samochód / mieszkanie / rzecz). Score obejmuje: ostrość, oświetlenie, tło, cechy obiektu, uszkodzenia/defekty, napisy/etykiety, pokrycie kątów (angle detector), sales readiness.

- FR-010: Użytkownik może wybrać styl transformacji z listy lub zdefiniować własny prompt w danej kategorii. Priority: must-have
  > Socrates: Kontrargument rozważony: "dwa tryby podwajają złożoność UI." Odrzucony z doprecyzowaniem: style definiują kategorię (gotowe szablony z przykładami efektów), prompty to zapisane wcześniej lub nowo zdefiniowane instrukcje w danej kategorii. Beginner używa stylów; zaawansowany pisze własny prompt i zapisuje go do biblioteki.

- FR-011: Aplikacja może wykonać transformację wybranych zdjęć i pokazać podgląd przed/po. Priority: must-have
  > Socrates: Kontrargument rozważony: "podgląd przed/po podwaja zdjęcia w pamięci." Odrzucony — porównanie przed/po jest kluczowe dla zaufania; FR stoi.

- FR-012: Użytkownik może wybrać i zapisać wybrane transformowane zdjęcia w bibliotece obiektu. Priority: must-have
  > Socrates: Kontrargument zaakceptowany: "zapis wszystkich wersji wyczerpie miejsce." Rozwiązanie: użytkownik wybiera które transformacje zachować; polityka retencji zdefiniowana. FR zaktualizowany: "wybrać i zapisać" (nie "wszystkie").

- FR-013: Użytkownik może opublikować styl/prompt transformacji pod nazwą w globalnej bibliotece dostępnej dla wszystkich użytkowników. Priority: must-have
  > Socrates: Kluczowa rewizja: biblioteka stylów jest PUBLICZNA i GLOBALNA — style/prompty współdzielone między wszystkimi użytkownikami. Popularność stylów to kluczowa funkcja produktu. Dobre style mogą przyciągać nowych użytkowników (pętla viralna). FR zmieniony z "osobistej biblioteki" na "globalną bibliotekę publiczną."

## Non-Functional Requirements

- Użytkownik widzi draft transformacji (niska rozdzielczość, koncepcja) w ciągu 5 sekund od zlecenia; pełna transformacja dostępna w ciągu 60 sekund.
- Biblioteki zdjęć, obiektów i prywatne prompty/style użytkownika są izolowane per konto — niedostępne dla innych użytkowników bez jawnego aktu publikacji przez właściciela.
- Autor (użytkownik) może opublikować obiekt z jego cechami, opisami i zdjęciami oraz własne style/prompty w przestrzeni publicznej; opublikowane zasoby dostępne dla wszystkich użytkowników.
- Aplikacja działa poprawnie na ostatnich dwóch wersjach Chrome, Safari i Firefox, zarówno na desktopie jak i urządzeniach mobilnych.
- Aplikacja dostępna 24/7 bez planowanych okien serwisowych niedostępności.
- Transformowane zdjęcia nie zawierają elementów wizualnie nieobecnych w oryginale (brak halucynacji — zakaz dodawania nieistniejących cech produktu).
- **Limit repozytorium klienta (`Max_Client_Repository = 100 MB`):** łączna przestrzeń dyskowa per konto (oryginalne + przetransformowane zdjęcia w Supabase Storage) nie może przekroczyć 100 MB. Przekroczenie limitu blokuje wgrywanie kolejnych zdjęć; użytkownik widzi komunikat z informacją o aktualnym zużyciu i limicie. Parametr zdefiniowany w `src/lib/config.ts` jako `storageConfig.Max_Client_Repository`.
- **Polityka retencji danych przez OpenAI (zerowe przechowywanie):** zdjęcia przesyłane do OpenAI API są przetwarzane wyłącznie in-memory na czas generowania odpowiedzi API. OpenAI nie może przechowywać, logować ani używać tych zdjęć po zwróceniu odpowiedzi. Jedynym miejscem trwałego przechowywania zdjęć użytkownika jest Omnilister AI (Supabase Storage). Wymagane: konfiguracja OpenAI API z polityką zero-data-retention (ZDR) lub równoważnym zapisem w umowie z OpenAI. Parametr `aiConfig.openaiZeroDataRetention = true` w `src/lib/config.ts` dokumentuje to wymaganie w kodzie.

## Business Logic

Aplikacja ocenia zdjęcia produktu według kategoriospecyficznego modelu jakości sprzedażowej i transformuje je tak, aby quality score po transformacji był wyższy niż przed, zachowując przy tym wierne odzwierciedlenie rzeczywistych cech obiektu.

Wejściami reguły są: zdjęcia wgrane przez sprzedawcę, wybrana kategoria obiektu (potwierdzona lub zaproponowana przez aplikację) oraz styl/prompt transformacji (wybrany z globalnej biblioteki lub zdefiniowany przez użytkownika). Wyjście to: ocenione zdjęcia z per-kategorię score'm oraz przetransformowane wersje z wyższym score'em. Użytkownik napotyka regułę przez podgląd przed/po z liczbowym porównaniem score'u i decyduje, które wersje zachować.

Quality score jest kategoriospecyficzny: samochód oceniany jest inaczej niż mieszkanie czy przedmiot codziennego użytku. Wymiary score'u obejmują: ostrość, jakość oświetlenia, profesjonalność tła, widoczność kluczowych cech obiektu, widoczność uszkodzeń/defektów, widoczność napisów/etykiet, pokrycie kątów (angle detector) oraz sales readiness (gotowość do publikacji na danym portalu).

**Próg sales readiness:** wynik 7/10 oznacza minimalne spełnienie 70% parametru każdej metryki — dobre światło, wyraźne szczegóły, profesjonalne tło, dokładne odzwierciedlenie produktu. Zdjęcia z wynikiem ≥ 7/10 aplikacja oznacza jako "gotowe do publikacji" (sales ready); poniżej progu — jako "wymagające poprawy". Próg jest jednolity dla wszystkich kategorii obiektów (samochód / mieszkanie / rzecz); wagi poszczególnych wymiarów mogą różnić się per kategoria, ale próg sumaryczny pozostaje 7/10.

## Access Control

Rejestracja emailem i hasłem; standardowy login. Płaska struktura użytkowników — każdy zarejestrowany użytkownik ma pełny dostęp do własnych obiektów, biblioteki zdjęć i edytora. Nie-zalogowany użytkownik nie ma dostępu do żadnych funkcji.

Role zaawansowane (Agencja z dostępem do kont klientów, tryb agenta automatycznego) — poza zakresem MVP; odłożone na fazę 2.

## Non-Goals

- **Brak workflow publikacji ogłoszeń (MVP)**: aplikacja nie publikuje ogłoszeń na Vinted, Ododom, Otomoto. Właściciel produktu jawnie oznaczył tę funkcję jako "NOT MVP" — faza 2.
- **Brak zaawansowanych ról użytkownika (MVP)**: model płaski; role Agencji i agenta automatycznego odłożone na fazę 2.
- **Brak skanowania 3D**: poza zakresem MVP.
- **Brak własnego modelu do transformacji zdjęć**: MVP nie trenuje ani nie hostuje własnego modelu generatywnego — korzysta z zewnętrznego serwisu AI.
- **Brak connectorów do platform zewnętrznych**: integracje z platformami marketplace'ów odłożone na fazę 2 razem z workflow publikacji.
- **Brak pełnego compliance GDPR / UODO (MVP)**: wymagania dotyczące zgody, dokumentów prawnych i praw użytkownika odłożone na fazę 2 — zdefiniowane szczegółowo w sekcji "Faza 2 — Wymagania funkcjonalne: GDPR / UODO" poniżej. Wymagane przed otwarciem publicznej rejestracji.

## Faza 2 — Wymagania funkcjonalne: GDPR / UODO

Poniższe wymagania muszą być zrealizowane przed publicznym launchem (otwarciem rejestracji dla szerokiej publiczności). Nie blokują MVP, ale stanowią warunek prawny konieczny do działania w Polsce i UE.

> Dostawca AI: **OpenAI** (wybrano 2026-05-30). Zdjęcia użytkownika przesyłane do OpenAI API w celu analizy (GPT-4o Vision) i transformacji (GPT-4o / DALL-E 3). **Wymaganie retencji: OpenAI nie może przechowywać zdjęć po przetworzeniu — zerowe przechowywanie (zero-data-retention).** Jedynym miejscem trwałego przechowywania jest Omnilister AI. Wymagane zawarcie odpowiedniej umowy z OpenAI (Enterprise ZDR lub Data Processing Addendum z zapisem ZDR) przed publicznym launchem.

### Zgoda i informacja o przetwarzaniu

- FR-P2-001: Przy rejestracji użytkownik musi aktywnie wyrazić zgodę na Regulamin i Politykę Prywatności przez zaznaczenie checkboxa (pole wymagane; rejestracja niemożliwa bez zaznaczenia). Treść zgody obejmuje: przetwarzanie danych konta (email, hasło), przechowywanie wgranych zdjęć w Supabase Storage, przesyłanie zdjęć do OpenAI w celu analizy jakości i transformacji. Priority: phase-2-must
  > Podstawa prawna: GDPR Art. 6 ust. 1 lit. a (zgoda) + Art. 7 (warunki zgody: dobrowolna, konkretna, świadoma, jednoznaczna). Checkbox nie może być domyślnie zaznaczony.

- FR-P2-002: Przed pierwszą operacją AI (scoring lub transformacja) aplikacja wyświetla jednorazowy modal informacyjny: „Twoje zdjęcia zostaną przesłane do OpenAI wyłącznie w celu analizy i transformacji. OpenAI przetwarza je in-memory i nie przechowuje ich po zakończeniu operacji. Jedynym miejscem trwałego przechowywania Twoich zdjęć jest Omnilister AI." Potwierdzenie zapisywane per konto w bazie danych; modal nie pojawia się ponownie po potwierdzeniu. Priority: phase-2-must
  > Podstawa prawna: GDPR Art. 13 ust. 1 lit. e (informacja o odbiorcach danych) + Art. 28 (umowa powierzenia przetwarzania z OpenAI jako podmiotem przetwarzającym z klauzulą zero-data-retention).

### Dokumenty prawne

- FR-P2-003: Aplikacja udostępnia stronę **Polityki Prywatności** pod stałym publicznym URL (dostępna bez logowania, link w stopce). Treść obejmuje co najmniej: kategorie przetwarzanych danych osobowych (email, hasło hashowane, zdjęcia, metadane obiektów), cel i podstawę prawną przetwarzania, listę odbiorców danych (Supabase jako dostawca infrastruktury, OpenAI jako podmiot przetwarzający zdjęcia wyłącznie in-memory bez przechowywania), czas retencji danych w Omnilister AI (do usunięcia konta lub na żądanie), limit repozytorium 100 MB per konto, prawa użytkownika (dostęp, sprostowanie, usunięcie, przenoszenie, sprzeciw, cofnięcie zgody), dane administratora danych, dane kontaktowe w sprawach RODO, oświadczenie że OpenAI nie przechowuje zdjęć po przetworzeniu (zero-data-retention). Priority: phase-2-must
  > Podstawa prawna: GDPR Art. 13 (informacje podawane przy zbieraniu danych).

- FR-P2-004: Aplikacja udostępnia stronę **Regulaminu** pod stałym publicznym URL (dostępna bez logowania, link w stopce). Treść obejmuje co najmniej: zasady korzystania z usługi, dopuszczalne użycie (zakaz wgrywania treści chronionych prawem autorskim bez uprawnień, zakaz wgrywania treści niezgodnych z prawem), ograniczenia odpowiedzialności operatora, warunki rozwiązania umowy (usunięcie konta), informację o stosowanym prawie (prawo polskie). Priority: phase-2-must

### Prawa użytkownika

- FR-P2-005: Użytkownik może złożyć żądanie **usunięcia konta i wszystkich powiązanych danych** (prawo do bycia zapomnianym) z poziomu ustawień konta. Zakres danych do usunięcia: konto (rekord w tabeli users), wszystkie obiekty i ich metadane, wszystkie oryginalne i przetransformowane zdjęcia z Supabase Storage, wszystkie prywatne style i prompty. Usunięcie realizowane w ciągu 30 dni od żądania. Użytkownik otrzymuje email z potwierdzeniem przyjęcia żądania oraz potwierdzeniem realizacji. Aplikacja informuje w toku procesu, że danych już przetworzonych przez OpenAI nie można odwołać. Priority: phase-2-must
  > Podstawa prawna: GDPR Art. 17 (prawo do usunięcia danych / „prawo do bycia zapomnianym").

- FR-P2-006: Użytkownik może pobrać **eksport swoich danych** (prawo do przenoszenia) z ustawień konta. Eksport zawiera: dane profilu (email, data rejestracji), listę obiektów z metadanymi (nazwa, wersja, kategoria, cechy), listę zdjęć z URL-ami do Supabase Storage, listę prywatnych stylów/promptów. Format: JSON lub CSV do wyboru przez użytkownika. Eksport generowany asynchronicznie; link do pobrania wysyłany emailem lub dostępny w panelu po przetworzeniu. Priority: phase-2-should
  > Podstawa prawna: GDPR Art. 20 (prawo do przenoszenia danych).

- FR-P2-007: Użytkownik może **wycofać zgodę na przetwarzanie zdjęć przez OpenAI** z poziomu ustawień konta. Skutek: funkcje AI (scoring, transformacja) zostają zablokowane dla tego konta; dane konta i dotychczasowe zdjęcia pozostają w Supabase (nie są usuwane). Użytkownik może ponownie udzielić zgody w ustawieniach, co przywraca dostęp do funkcji AI. Priority: phase-2-should
  > Podstawa prawna: GDPR Art. 7 ust. 3 (prawo do wycofania zgody w dowolnym momencie bez wpływu na zgodność przetwarzania sprzed wycofania).

## Open Questions

1. ~~**Polityka prywatności zdjęć przesyłanych do zewnętrznego serwisu AI**~~ — Rozwiązane 2026-05-30: wymagania GDPR / UODO przeniesione do fazy 2 i szczegółowo zdefiniowane jako FR-P2-001 — FR-P2-007 w sekcji "Faza 2 — Wymagania funkcjonalne: GDPR / UODO". Wymagane przed publicznym launchem.
2. ~~**Limity retencji i przechowywania danych**~~ — Rozwiązane 2026-05-30: `Max_Client_Repository = 100 MB` per konto (oryginalne + przetransformowane zdjęcia łącznie). Parametr zdefiniowany w `src/lib/config.ts`. Polityka retencji OpenAI: zero-data-retention — OpenAI nie może przechowywać zdjęć po przetworzeniu; jedynym miejscem przechowywania jest Omnilister AI (Supabase Storage).
3. ~~**Progowy quality score "sales readiness"**~~ — Rozwiązane 2026-05-30: wynik 7/10 oznacza minimalne spełnienie 70% parametru każdej metryki (dobre światło, wyraźne szczegóły, profesjonalne tło, dokładne odzwierciedlenie produktu). Próg 7/10 = minimalna "sales readiness" — zdjęcia poniżej progu aplikacja oznacza jako wymagające poprawy. Wdrożone jako interpretacja score w UI (S-02).
