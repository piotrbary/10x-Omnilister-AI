Uzytkownikiem jest ogłoszeniodawca market place’u ( vinted, allegro, otodom, etc)
Problem : Uzytkownik chce umieści dobre zdjecie ale ze względu na brak doświadczenia robi zwykle zdjecie zle skadrowane, nie ostre, bez profesjonalnego tla, słabo oddające cechy obiektu i nie generujące zainteresowania ogladajacego.
                    Aplikacja skraca czas procesu wybiera najlepsze zdjęcia produktu do sprzedaży, rekomenduje jakie zdjęcia dodać jeżeli jakość jest niewystarczająca, a następnie poprawia zdjęcia tak aby produkt prezentował się atrakcyjnie dla kupującego : miał doskonałe oświetlenie, profesjonalne i atrakcyjne tła, świetny klimat, wyróżniało się na tle innych jakośćią i powodowało większe zainteresowanie.
             
Pierwszy tydzień :
MVP  :   0). Uzytkownik się rejestruje, robi zdjęcia, wgrywa do serwisu, system automatycznie identyfikuje obiekt wybiera cechy prosi użytkownika o potwierdzenie., użytkownik może poprawić.
                1). Uzytkownik wybiera jaki to obiekt ( AI rekomenduje detekcje automatyczna) ( mieszkanie, samochód, rzecz).
2). Uzytkownik robi kilka zdjecie AI ocenia, daje wskazówki i rekomenduje poprawia zdjęcia przedmiotu tak aby wykonać jak najlepsze zdjęcia obiektu tak aby mieć kilkanaście dobrych zdjęć reprezentujących cechy obiektu. (można pominąć)
3). Uzytkownik wybiera typy poprawy zdjęć obiektu i zapisuje poprawione zdjęcia w bibliotece zdjęć obiektów pod konkretną nazwą i identyfikatorem wersji obiektu
4). AI pokazuje ocenę zdjęć pod względem skuteczności w marketplaceach 
5). AI rekomenduje transformacje zdjęć pod konkretny portal i cel który zdjęcia mają osiągnąć.
                
TEST : 1). UZtykownik się rejestruje, użytkownik może się zalogować
             2). Uzytkownik dołącza zdjęcia do folderu o nazwie i wersji obiektu
             3). Zdjęcia są dostępne dla użytkownika i widoczne w folderze
             4). Uzytkownik definiuje transforamte/ulepszać zdjęcia wpostaci promptu AI
             5). Aplikacja wykonuje transformacje wyspecyfikowana w prompcie AI na wybranych zdjęciach i pokazuje rezlutat i umożliwia zapis wynikowych zdjęć.  Proces 4,5 można powtarzać do osięgnięcia celu. Prompty są zapisywane w bazie.
             6) transformata jest zapisywana pod nazwa i stylem w celu wybrania z szybkie listy później.
          
Logika biznesowa : konwersja zdjęć użytkownika w taki sposób aby obiekty do sprzedaży wygladały profesjonalnie ( tło, klimat, kontekst) ale odzwierciedlały dokładnie cechy sprzedawanego produktu.   
             
1.	Aplikacja Omnilister AI.
a.	użytkownika
i.	rejestracja
ii.	logowanie
iii.	Kategoria użytkownika ( Tego nie robię w MVP )
1.	normalny użytkownik – robi zdjęcia, publikuje
2.	Agent      AI                        -  ma dostęp do zdjęć, może automatycznie edytować i uruchamiać workflowy.
3.	Agencja                            -  ma dostęp do dashboardów dla klientów i może wchodzi na konta klientów jako agencja.

b.	Przechowuje obiekty użytkownika w bibliotece
Toolbar {- dodaj unikalny obiekt ( kategoria, model, wersja, numer seryjny, adres)
- dodaj cechę ( id, „Nazwa cechy”, „wartość”)
- dodaj opisy ( id,  „nazwa opisu”,  „wartość opisu ”1..n)
- dodaj zdjęcie obiektu (id, idzdjęcia) 
- publikuj obiekt ( udsotępnia link do komplentej biblioteki obiektu)
- zeskanuj 3D obiekt    (tego nie ma w MVP)               }
   
Podgląd obiektu na cały ekran główne cechy, zdjęcia, opisy.
                      c.   AI Edytor/rekomender   zdjęć obiektów  , konwersji    
                                (Toolbar{
                             - ai detect ( podpowiada automatyczne wybory )
                             - kategoria obiektu  ( samochód, mieszkanie, rzecz)
                              - pod kategoria obiektu ( samochód sportowy, sedan)
                              - typ workflow (publikacja ogłoszenia otodom)
                              - typ konwersji ( zwięszkenie sprzedaży samochodu, zwięskzanie sprzedaży mieszkania).
                              - style konwersji ( mieszkanie nowoczesne, mieszkanie glamour utwórz swój schemat konwersji)
                               - opis konwersji (numer konwersji, skill opisujący konwersję , prompt opisującyc konwersję)
                               - zastosowane konwersje ( a, b, c,d).
                              - zapisz } end of toolbar
                           (podgląd zdjęć) 
                                    Okienko podglądu obiektu przed i po konwersji AI cały ekran
                      d.   Workflow  (nice to have features for faze 2 not MVP)
 		- dodaj ogłoszenie vinted ( wybierz obiekt, wybierz zdjęcia, ai asisst wybiera wszystko automatycznie do akceptacji, publikuje na vinted i zachowuje wersje ogłoszenia).
                             - dodaj ogłoszenie otodom
                             - dodaj ogłoszenie otomoto
                              - podgląd ogłoszenia
                      e). MCP/API connectors ( konfiguracja) ( nice to have features no for MVP)
                            - dodaj otomoto, otodom, vinted
                            - sprawdź czy każdy mcp server i jest połączony z aplikacją 
