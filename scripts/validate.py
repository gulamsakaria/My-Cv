#!/usr/bin/env python3
"""
Check site/content/site.json before you publish.

    python3 scripts/validate.py

Errors (exit code 1) = something would be hidden or broken, or is unsafe.
Warnings              = worth a look, not fatal.

Checks: valid JSON, files exist, alt text present, people_under_18 / faces_blurred flags,
documents marked redacted, http(s) links, un-optimised JPG/PNG left in assets, large files,
and a scan for e-mail addresses / phone numbers in any text.
No third-party packages needed.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DATA = SITE / "content" / "site.json"

errors, warnings = [], []
err = errors.append
warn = warnings.append

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"(?<![\w/])(\+?88)?0?1[3-9][\d\s-]{8,10}(?!\d)|\+\d[\d\s-]{9,}")
URL = re.compile(r"^https?://", re.I)


def strings(node, path=""):
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from strings(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from strings(v, f"{path}[{i}]")


def check_file(rel, where, kind="file"):
    if not rel:
        return
    p = SITE / rel
    if not p.is_file():
        err(f"{where}: {kind} not found: site/{rel}")
        return
    ext = p.suffix.lower()
    size = p.stat().st_size
    if ext in (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"):
        warn(f"{where}: {rel} is not WebP - run scripts/optimize_images.py")
    if ext in (".webp", ".jpg", ".jpeg", ".png") and size > 700 * 1024:
        warn(f"{where}: {rel} is {size // 1024} KB - consider a smaller image (--quality 72)")
    if ext in (".mp4", ".webm", ".mov") and size > 25 * 1024 * 1024:
        warn(f"{where}: {rel} is {size // (1024 * 1024)} MB - compress the clip or only link to Facebook")


def check_image(img, where, need_flags=True, portrait=False):
    if not isinstance(img, dict):
        err(f"{where}: must be an object with src/alt")
        return
    if not img.get("src"):
        err(f"{where}: missing src")
        return
    check_file(img["src"], where)
    if img.get("thumb"):
        check_file(img["thumb"], where + ".thumb")
    if not (img.get("alt") or img.get("caption")):
        err(f"{where}: needs alt text (describe the activity, not individuals)")
    if need_flags:
        flag = img.get("people_under_18")
        if not isinstance(flag, bool):
            err(f"{where}: people_under_18 must be true or false (it is hidden on the site until set)")
        elif flag and img.get("faces_blurred") is not True:
            err(f"{where}: shows people under 18 but faces_blurred is not true - blur first (scripts/blur_faces.py)")


def check_url(u, where, required=False):
    if not u:
        if required:
            err(f"{where}: missing URL")
        return
    if not URL.match(u):
        err(f"{where}: must start with http:// or https:// ({u})")


def main():
    if not DATA.is_file():
        sys.exit(f"Not found: {DATA}")
    try:
        d = json.loads(DATA.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"site.json is not valid JSON: {e}")

    for key in ("profile", "stats", "cartoons", "school", "activities", "outcomes", "gallery", "posts", "documents", "organisations", "footer"):
        if key not in d:
            err(f"missing top-level key: {key}")

    # --- profile
    prof = d.get("profile", {})
    if prof.get("portrait"):
        check_image(prof["portrait"], "profile.portrait")

    # --- stats sanity (only checks what is internally inconsistent)
    for s in d.get("stats", {}).get("items", []):
        if s.get("breakdown") and isinstance(s.get("value"), (int, float)) and s["id"] == "reached":
            tot = sum(b["value"] for b in s["breakdown"])
            if tot != s["value"]:
                warn(f"stats.{s['id']}: breakdown adds up to {tot}, headline says {s['value']}")

    # --- cartoons
    c = d.get("cartoons", {})
    check_url(c.get("page_url"), "cartoons.page_url")
    items = c.get("items", [])
    if isinstance(c.get("count"), int) and len(items) > c["count"]:
        warn(f"cartoons: {len(items)} items but count is {c['count']}")
    for i, it in enumerate(items):
        w = f"cartoons.items[{i}]"
        if not (it.get("title") or it.get("facebook_url") or it.get("video")):
            err(f"{w}: needs at least a title, facebook_url or video")
        check_file(it.get("poster"), w + ".poster")
        check_file(it.get("thumb"), w + ".thumb")
        check_file(it.get("video"), w + ".video")
        check_url(it.get("facebook_url"), w + ".facebook_url")
        if it.get("video") and not it.get("poster"):
            warn(f"{w}: video without a poster image shows a plain tile")

    # --- school
    s = d.get("school", {})
    if s.get("photo"):
        check_image(s["photo"], "school.photo")
    ids = {doc.get("id") for doc in d.get("documents", [])}
    if s.get("permission_document") and s["permission_document"] not in ids:
        err(f"school.permission_document '{s['permission_document']}' does not match any document id")
    if not s.get("permission_document"):
        warn("school: no permission_document linked - add the school's written permission letter to documents and set its id here")
    if isinstance(s.get("survey"), dict) and not s["survey"].get("respondents"):
        warn("school.survey: 'respondents' (how many students answered) is empty - evaluators will likely ask")

    # --- activities
    for i, a in enumerate(d.get("activities", [])):
        w = f"activities[{i}]"
        if not a.get("title"):
            err(f"{w}: missing title")
        if a.get("photo"):
            check_image(a["photo"], w + ".photo")
        check_url(a.get("link"), w + ".link")

    # --- gallery
    for i, g in enumerate(d.get("gallery", [])):
        check_image(g, f"gallery[{i}]")

    # --- posts
    total = {"views": 0, "reactions": 0, "comments": 0}
    for i, p in enumerate(d.get("posts", [])):
        w = f"posts[{i}]"
        check_url(p.get("url"), w + ".url", required=True)
        if not p.get("title"):
            warn(f"{w}: no title")
        if p.get("image"):
            check_image(p["image"], w + ".image")
        for k in total:
            if isinstance(p.get(k), (int, float)):
                total[k] += p[k]
            else:
                warn(f"{w}: no '{k}' count")
    if d.get("posts"):
        warn(f"posts add up to {total['views']} views / {total['reactions']} reactions / {total['comments']} comments "
             "- headline says 27,400+ / 2,600+ / 350+ for five posts; make sure they agree")
        if len(d["posts"]) != 5:
            warn(f"posts: {len(d['posts'])} listed, the headline figures describe five posts")

    # --- documents
    for i, doc in enumerate(d.get("documents", [])):
        w = f"documents[{i}]"
        if not doc.get("title") or not doc.get("file"):
            err(f"{w}: needs title and file")
            continue
        check_file(doc["file"], w + ".file")
        check_file(doc.get("thumb"), w + ".thumb")
        if doc.get("redacted") is not True:
            err(f"{w}: set redacted: true once names, phone numbers, addresses and signatures of other people are covered (hidden on the site until then)")
        if doc["file"].lower().endswith(".pdf"):
            warn(f"{w}: PDFs cannot be redacted by this site - make sure the PDF itself has the details blacked out, then flatten it")

    # --- PII scan on all text
    for path, text in strings(d):
        if path.endswith(("src", "thumb", "poster", "file", "video")) or URL.match(text):
            continue
        if EMAIL.search(text):
            err(f"{path}: looks like an e-mail address - remove it (only the owner's details may be public)")
        if PHONE.search(text):
            err(f"{path}: looks like a phone number - remove it")

    # --- assets not referenced / not optimised
    referenced = {x for _, x in strings(d) if x.startswith("assets/")}
    for folder in ("photos", "posters", "docs", "cartoons"):
        base = SITE / "assets" / folder
        if not base.is_dir():
            continue
        for f in sorted(base.rglob("*")):
            if f.is_file() and f.name != ".gitkeep":
                rel = f.relative_to(SITE).as_posix()
                if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".heic"):
                    warn(f"{rel}: un-optimised original inside site/ - it WILL be published. Run scripts/optimize_images.py (it moves originals out)")
                elif rel not in referenced:
                    warn(f"{rel}: not used in site.json (it is still publicly reachable if someone guesses the address)")

    print(f"Checked {DATA.relative_to(ROOT)}")
    for m in warnings:
        print("  warning:", m)
    for m in errors:
        print("  ERROR:  ", m)
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
