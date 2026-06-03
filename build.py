#!/usr/bin/env python3
"""
build.py — assembles the modular source tree into a single deployable HTML file.

Usage:
    python3 build.py                  # writes longevity-lab.html
    python3 build.py --out dist.html  # custom output path
"""

import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
SRC  = ROOT / "src"

# ── JS load order ─────────────────────────────────────────────────────────────
# Each entry is a path relative to SRC.  Order matters: files earlier in the
# list must define everything that files later in the list depend on.
JS_FILES = [
    "parsing/utils.js",         # shared parse helpers — no deps
    "acquisition/zip-reader.js", # raw ZIP parser — no deps
    "parsing/garmin-zip.js",    # Garmin ZIP normaliser — needs utils
    "parsing/garmin-csv.js",    # Garmin CSV normaliser — needs utils
    "acquisition/loader.js",    # file loaders — needs zip-reader, garmin-*, utils
    "analysis/analytics.js",    # analytics engine — needs state (main), parsing types
    "analysis/recommendations.js", # recommendations — needs analytics
    "ui/templates.js",          # HTML generators — needs analytics, recommendations, utils
    "ui/charts.js",             # chart renderers — needs analytics, utils
    "main.js",                  # state + render loop + boot — needs everything above
]

CSS_FILE  = SRC / "ui" / "styles.css"
SHELL_FILE = SRC / "html-shell.html"


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def build(output_path: pathlib.Path) -> None:
    shell = read(SHELL_FILE)

    # ── inline CSS ────────────────────────────────────────────────────────────
    css = read(CSS_FILE)
    if "<!-- INJECT:STYLES -->" not in shell:
        sys.exit("ERROR: <!-- INJECT:STYLES --> marker not found in html-shell.html")
    shell = shell.replace("<!-- INJECT:STYLES -->", css)

    # ── inline JS ─────────────────────────────────────────────────────────────
    js_parts = []
    for rel in JS_FILES:
        path = SRC / rel
        if not path.exists():
            sys.exit(f"ERROR: JS file not found: {path}")
        js_parts.append(f"/* === {rel} === */")
        js_parts.append(read(path))

    combined_js = "\n\n".join(js_parts)

    if "<!-- INJECT:SCRIPTS -->" not in shell:
        sys.exit("ERROR: <!-- INJECT:SCRIPTS --> marker not found in html-shell.html")
    shell = shell.replace("<!-- INJECT:SCRIPTS -->", combined_js)

    # ── write output ──────────────────────────────────────────────────────────
    output_path.write_text(shell, encoding="utf-8")
    size_kb = output_path.stat().st_size / 1024
    print(f"Built {output_path.name}  ({size_kb:.1f} KB)")
    print(f"  CSS: {CSS_FILE.name}")
    print(f"  JS modules ({len(JS_FILES)}):")
    for rel in JS_FILES:
        print(f"    {rel}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bundle Longevity Lab into a single HTML file.")
    parser.add_argument("--out", default="longevity-lab.html", help="Output file path (default: longevity-lab.html)")
    args = parser.parse_args()

    output = pathlib.Path(args.out)
    if not output.is_absolute():
        output = ROOT / output

    build(output)
