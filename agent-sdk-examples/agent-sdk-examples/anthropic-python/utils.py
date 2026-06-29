"""Wczytywanie diffa do recenzji — odpowiednik `anthropic/utils.ts`.

Źródło diffa: stdin (gdy coś podpięto pipe'em) albo `data/<sample>.md`
(domyślnie `sample-1`, inny przez argument CLI).
"""

import sys
from pathlib import Path


def _load_sample_diff() -> str:
    sample = sys.argv[1] if len(sys.argv) > 1 else "sample-1"
    path = Path(__file__).parent.parent / "data" / f"{sample}.md"
    diff = path.read_text(encoding="utf8").strip()
    # Próbki bywają opakowane w ``` ... ``` — zdejmujemy fence, jeśli jest.
    if diff.startswith("```"):
        lines = diff.split("\n")
        diff = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return diff + "\n"


def read_diff() -> str:
    # stdin tylko gdy to pipe (nie interaktywny terminal).
    if not sys.stdin.isatty():
        piped = sys.stdin.read().strip()
        if piped:
            return piped + "\n"
    return _load_sample_diff()
