"""Schema strukturalnego wyniku recenzji PR-a (pydantic, wersja Pythonowa).

To samodzielny odpowiednik `common/review-schema.ts`. Tak jak tam Zod jest
jednym źródłem prawdy (schema + walidacja), tu tę rolę pełni pydantic:

  * REVIEW_JSON_SCHEMA = ReviewResult.model_json_schema() — podajemy do
    `output_format` w Claude Agent SDK (odpowiednik z.toJSONSchema),
  * ReviewResult.model_validate(...) — waliduje to, co zwrócił agent
    (odpowiednik ReviewResult.safeParse z TS).

Recenzja ocenia sześć kryteriów w skali 1–10, wydaje wiążący werdykt
pass/fail i generuje gotowe do wklejenia podsumowanie w markdown.

Uwaga o skali 1–10: `score` to zwykły `int` BEZ `ge`/`le`. Structured output
Anthropica odrzuca `minimum`/`maximum` na typie integer ("For 'integer' type,
properties maximum, minimum are not supported"), a `Field(ge=..., le=...)`
emituje dokładnie te pola. Schema nie koduje więc granicy — robi to rubryka
(opisy pól + prompt). Ale samą granicę 1–10 wymuszamy przy walidacji wyniku
przez `field_validator` na `score`: działa w runtime, nie dorzuca nic do
`model_json_schema()`, więc REVIEW_JSON_SCHEMA zostaje bezpieczne dla Anthropica.
To świadoma różnica względem wersji TS (`common/review-schema.ts`), która granicy
nie waliduje wcale — tu walidacja wyniku faktycznie ją sprawdza.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReviewCriterion(BaseModel):
    # extra="forbid" => additionalProperties:false w wygenerowanej schemie.
    model_config = ConfigDict(extra="forbid")

    score: int = Field(description="Liczba całkowita od 1 (najgorzej) do 10 (najlepiej).")
    rationale: str = Field(
        description="Dlaczego taka ocena; na tyle konkretnie, by uzasadnić niski wynik."
    )

    @field_validator("score")
    @classmethod
    def _score_w_zakresie(cls, v: int) -> int:
        # Granica 1–10 nie może wejść do schemy (Anthropic odrzuca minimum/maximum
        # na integerze), więc wymuszamy ją tu — przy walidacji wyniku, nie w schemie.
        # field_validator (mode="after", bez json_schema_input_type) nie emituje
        # żadnych słów kluczowych do model_json_schema(), więc REVIEW_JSON_SCHEMA
        # zostaje bezpieczne dla Anthropica.
        if not 1 <= v <= 10:
            raise ValueError("score musi być liczbą całkowitą od 1 do 10")
        return v


class ReviewCriteria(BaseModel):
    model_config = ConfigDict(extra="forbid")

    implementationCorrectness: ReviewCriterion = Field(
        description=(
            "Czy kod robi to, co deklaruje, obsługując przypadki brzegowe i ścieżki błędów bez regresji? "
            "1: logika zepsuta, pomija oczywiste edge/error case'y lub cicho regresuje. "
            "10: poprawny na happy path, edge case'ach i ścieżkach błędów, bez regresji."
        )
    )
    idiomaticity: ReviewCriterion = Field(
        description=(
            "Czy kod trzyma się konwencji języka, frameworka i projektu? "
            "1: walczy z idiomami stacku i wzorcami repo, czyta się obco. "
            "10: nie do odróżnienia od dobrze napisanego otoczenia."
        )
    )
    complexity: ReviewCriterion = Field(
        description=(
            "Czy rozwiązanie jest tak proste, jak pozwala problem, bez zbędnej abstrakcji? "
            "1: przeinżynierowane lub splątane, przypadkowa złożoność zaciemnia intencję. "
            "10: minimalne i jasne, najprostszy projekt rozwiązujący problem w całości."
        )
    )
    testRiskCoverage: ReviewCriterion = Field(
        description=(
            "Czy istotne zachowania i ryzykowne ścieżki są testowane proporcjonalnie do ryzyka? "
            "1: ryzykowna logika idzie bez testów; testy nieobecne, trywialne lub nic nie sprawdzają. "
            "10: pokrycie ważone ryzykiem — to, co najłatwiej zepsuć, jest testowane celowo."
        )
    )
    documentation: ReviewCriterion = Field(
        description=(
            "Czy nieoczywiste decyzje, publiczne API i trudny kod są wyjaśnione tam, gdzie trzeba? "
            "1: nieprzejrzyste — brak komentarzy/dokumentacji, intencję trzeba odtwarzać. "
            "10: tyle dokumentacji, by wyjaśnić 'dlaczego', bez powtarzania oczywistości."
        )
    )
    securitySafety: ReviewCriterion = Field(
        description=(
            "Czy zmiana unika podatności, wycieku sekretów i niebezpiecznej obsługi niezaufanych danych? "
            "1: wprowadza wykorzystywalną lukę, wycieka sekrety lub ufa niezaufanym danym. "
            "10: dane walidowane, sekrety obsłużone poprawnie, brak nowej powierzchni ataku."
        )
    )


class ReviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    criteria: ReviewCriteria
    verdict: Literal["pass", "fail"] = Field(description="Wiążący ogólny werdykt dla zmiany.")
    summary: str = Field(description="Podsumowanie w markdown, gotowe pod komentarz do PR-a.")


# JSON Schema wyniku recenzji — podajemy ją wprost do `output_format` w Claude
# Agent SDK (odpowiednik REVIEW_JSON_SCHEMA z TS, tu generowany z pydantica).
REVIEW_JSON_SCHEMA: dict = ReviewResult.model_json_schema()


# System prompt napędzający schemę ReviewResult. Powtarza kontrakt, którego
# schema nie zakoduje: każdy `score` to LICZBA CAŁKOWITA 1–10, każde kryterium
# wymaga konkretnego uzasadnienia, werdykt jest jeden (pass/fail), a `summary`
# to markdown gotowy pod komentarz w PR.
REVIEWER_PROMPT = """Jesteś rygorystycznym recenzentem kodu. Zrecenzuj podany diff i zwróć WYŁĄCZNIE obiekt strukturalny zdefiniowany przez schemę — bez prozy poza nim.

Oceń te sześć kryteriów, każde jako LICZBĘ CAŁKOWITĄ od 1 (najgorzej) do 10 (najlepiej), i daj każdemu konkretne uzasadnienie liczby (zwłaszcza niskich ocen):
- implementationCorrectness — czy kod robi to, co deklaruje, na edge case'ach i ścieżkach błędów?
- idiomaticity — czy trzyma się konwencji języka, frameworka i repo?
- complexity — czy jest tak prosty, jak pozwala problem, bez zbędnej abstrakcji?
- testRiskCoverage — czy ryzykowne ścieżki są testowane proporcjonalnie do ryzyka?
- documentation — czy nieoczywiste decyzje i publiczne API są wyjaśnione?
- securitySafety — czy unika podatności, wycieku sekretów i niebezpiecznej obsługi niezaufanych danych?

Następnie wydaj jeden wiążący `verdict` ("pass" lub "fail") oraz `summary` napisane jako markdown nadające się do wklejenia jako komentarz w PR (zacznij od werdyktu, potem najważniejsze ustalenia)."""
