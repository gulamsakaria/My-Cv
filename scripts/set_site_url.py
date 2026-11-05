#!/usr/bin/env python3
"""
Add the canonical address and the share-preview image to index.html.

    python3 scripts/set_site_url.py https://portfolio.example.org/

Social apps (WhatsApp, Facebook, LinkedIn) need an ABSOLUTE address for the preview image,
so run this once, after you know the public link, then upload again.
"""
import re
import sys
from pathlib import Path

if len(sys.argv) != 2 or not sys.argv[1].startswith("http"):
    sys.exit(__doc__)
base = sys.argv[1].rstrip("/") + "/"
page = Path(__file__).resolve().parent.parent / "site" / "index.html"
html = page.read_text(encoding="utf-8")
block = (
    "<!-- site-url:start (filled in by scripts/set_site_url.py once you know your public address) -->\n"
    f'<link rel="canonical" href="{base}">\n'
    f'<meta property="og:url" content="{base}">\n'
    f'<meta property="og:image" content="{base}assets/og.png">\n'
    '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
    '<meta property="og:image:alt" content="Gulam Sakaria – volunteer evidence portfolio, National Volunteer Award 2026">\n'
    f'<meta name="twitter:image" content="{base}assets/og.png">\n'
    "<!-- site-url:end -->"
)
new, n = re.subn(r"<!-- site-url:start.*?<!-- site-url:end -->", lambda _: block, html, flags=re.S)
if not n:
    sys.exit("Markers not found in index.html")
page.write_text(new, encoding="utf-8")
print(f"Updated index.html for {base}")
