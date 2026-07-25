"""One-time extraction: pulls translations.py out of `main`'s git history
(it doesn't exist in the v2 branch's working tree — v2 is a full rewrite)
and dumps its dicts to scripts/combined.json, the input for split-locales.py.
"""

import json
import subprocess
import sys
import tempfile
import os


def main() -> None:
    source = subprocess.run(
        ["git", "show", "main:translations.py"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    ).stdout

    with tempfile.TemporaryDirectory() as tmp:
        module_path = os.path.join(tmp, "translations_v1.py")
        with open(module_path, "w", encoding="utf-8") as f:
            f.write(source)
        sys.path.insert(0, tmp)
        import translations_v1 as t  # noqa: E402

        combined = {
            "ui": t.TRANSLATIONS,
            "genres": t.GENRE_TRANSLATIONS,
            "genreOptions": t.GENRE_OPTIONS,
            "languageOrder": t.LANGUAGE_ORDER,
            "languageNames": t.LANGUAGE_NAMES,
        }

    os.makedirs("scripts", exist_ok=True)
    with open("scripts/combined.json", "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    print("Languages:", ", ".join(t.LANGUAGE_ORDER))
    print("Keys per language:", len(t.TRANSLATIONS["en"]))


if __name__ == "__main__":
    main()
