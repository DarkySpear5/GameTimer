"""One-time conversion: translations.py (extracted to scripts/combined.json)
-> per-language i18next locale files under src/locales/<lang>/{common,genres}.json.

Converts Python str.format() placeholders {name} to i18next's {{name}}.
Verified beforehand that every {...} token across all 10 languages is a
clean identifier (no stray braces), so a blanket regex conversion is safe.
"""

import json
import re
import os

INTERP = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def convert(value: str) -> str:
    return INTERP.sub(r"{{\1}}", value)


def main() -> None:
    with open("scripts/combined.json", encoding="utf-8") as f:
        data = json.load(f)

    out_root = "src/renderer/src/locales"
    for lang in data["languageOrder"]:
        lang_dir = os.path.join(out_root, lang)
        os.makedirs(lang_dir, exist_ok=True)

        common = {k: convert(v) for k, v in data["ui"][lang].items()}
        with open(os.path.join(lang_dir, "common.json"), "w", encoding="utf-8") as f:
            json.dump(common, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")

        genres = {k: convert(v) for k, v in data["genres"][lang].items()}
        with open(os.path.join(lang_dir, "genres.json"), "w", encoding="utf-8") as f:
            json.dump(genres, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")

    print("Wrote locales for:", ", ".join(data["languageOrder"]))


if __name__ == "__main__":
    main()
