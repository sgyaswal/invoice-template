#!/usr/bin/env python3
"""Pre-deploy sanity check for the static site.

There is no build step here, so nothing else would catch a renamed asset or a
typo'd path — the page just silently loses its stylesheet on the live URL. This
asserts the files we ship exist and that every local reference inside them
resolves. Third-party URLs (fonts, jsPDF, html2canvas, GSI) are listed, not
fetched, so the check stays offline and fast.

Run it locally exactly as CI does:  python3 scripts/check_site.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

REQUIRED = [
    "index.html",
    "styles.css",
    "script.js",
    "assets/logo.png",
]

# href="…" / src="…" in HTML, and url(…) in CSS.
HTML_REF = re.compile(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
CSS_REF = re.compile(r"""url\(\s*["']?([^"')]+)["']?\s*\)""", re.IGNORECASE)

# Anything that is not a file on disk we control.
EXTERNAL = ("http://", "https://", "//", "data:", "mailto:", "tel:", "#", "javascript:")


def local_refs(text: str, pattern: re.Pattern[str]) -> list[str]:
    out = []
    for ref in pattern.findall(text):
        ref = ref.strip()
        if not ref or ref.startswith(EXTERNAL):
            continue
        out.append(ref.split("?")[0].split("#")[0])
    return out


def main() -> int:
    errors: list[str] = []
    external: set[str] = set()

    for name in REQUIRED:
        if not (ROOT / name).is_file():
            errors.append(f"required file is missing: {name}")

    for name, pattern in (("index.html", HTML_REF), ("styles.css", CSS_REF)):
        path = ROOT / name
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")

        for ref in local_refs(text, pattern):
            if not (ROOT / ref).is_file():
                errors.append(f"{name}: broken local reference -> {ref}")

        for ref in pattern.findall(text):
            if ref.startswith(("http://", "https://", "//")):
                external.add(ref.split("?")[0])

    print(f"checked {len(REQUIRED)} required files")
    if external:
        print(f"third-party URLs referenced ({len(external)}):")
        for url in sorted(external):
            print(f"  {url}")

    if errors:
        for err in errors:
            print(f"::error::{err}", file=sys.stderr)
        return 1

    print("site check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
