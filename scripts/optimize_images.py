#!/usr/bin/env python3
"""
Convert images in site/assets to WebP (max 1600 px on the long edge) and make
a small thumbnail for each one.

    python3 scripts/optimize_images.py            # photos, posters, docs
    python3 scripts/optimize_images.py site/assets/photos/my-new-photo.jpg

What it does
  * JPG / PNG / TIFF / BMP / WebP  ->  NAME.webp (max 1600 px) + NAME.thumb.webp (max 640 px)
  * Removes ALL metadata (EXIF GPS location, camera, date) - the pixels are all that remain.
  * Applies the camera's rotation, converts to sRGB.
  * MOVES the original file out of site/ into originals/processed/ so that the
    un-optimised (and possibly un-blurred) photo can never be published by accident.
  * Prints a JSON snippet you can paste into content/site.json.

REMEMBER: this script does NOT blur faces. Run scripts/blur_faces.py first for any photo
with school students or other children (see README).

Needs:  pip install pillow
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageCms, ImageOps
except ImportError:
    sys.exit("Pillow is required:  pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
ORIGINALS = ROOT / "originals" / "processed"
DEFAULT_DIRS = ["assets/photos", "assets/posters", "assets/docs"]
SOURCE_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}
THUMB_MAX = 640

_SRGB = None


def to_srgb(im):
    """Convert to sRGB if the image carries another ICC profile (phone photos are often Display-P3)."""
    global _SRGB
    icc = im.info.get("icc_profile")
    if icc:
        try:
            import io
            if _SRGB is None:
                _SRGB = ImageCms.createProfile("sRGB")
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            mode = "RGBA" if im.mode in ("RGBA", "LA") else "RGB"
            return ImageCms.profileToProfile(im, src, _SRGB, outputMode=mode)
        except Exception:
            pass
    return im


def prepare(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    im = to_srgb(im)
    if im.mode == "P":
        im = im.convert("RGBA" if "transparency" in im.info else "RGB")
    elif im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    return im


def fit(im, longest):
    w, h = im.size
    if max(w, h) <= longest:
        return im.copy()
    scale = longest / max(w, h)
    return im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def save_webp(im, out, quality):
    im.save(out, "WEBP", quality=quality, method=6)  # no exif/icc passed => stripped


def collect(targets):
    files = []
    for t in targets:
        t = Path(t)
        if not t.is_absolute():
            t = (SITE / t) if (SITE / t).exists() else (Path.cwd() / t)
        if t.is_dir():
            files += [p for p in sorted(t.rglob("*")) if p.is_file()]
        elif t.is_file():
            files.append(t)
        else:
            print(f"  skip (not found): {t}")
    return [p for p in files if p.suffix.lower() in SOURCE_EXT and not p.name.endswith(".thumb.webp")]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", help="files or folders (default: site/assets/photos, posters, docs)")
    ap.add_argument("--max", type=int, default=1600, help="max long edge in px (default 1600)")
    ap.add_argument("--docs-max", type=int, default=2000, help="max long edge for assets/docs so letters stay readable (default 2000)")
    ap.add_argument("--quality", type=int, default=82, help="WebP quality 1-100 (default 82)")
    ap.add_argument("--keep-originals", action="store_true", help="do NOT move originals out of site/ (not recommended)")
    args = ap.parse_args()

    targets = args.paths or [SITE / d for d in DEFAULT_DIRS]
    files = collect(targets)
    if not files:
        print("Nothing to do: no JPG/PNG/WebP files found.")
        return

    snippets = []
    for src in files:
        rel = src.relative_to(SITE) if SITE in src.parents else Path(src.name)
        is_doc = "docs" in rel.parts
        longest = args.docs_max if is_doc else args.max
        out = src.with_suffix(".webp")
        thumb = src.with_name(src.stem + ".thumb.webp")
        is_webp_in_place = src.suffix.lower() == ".webp"
        try:
            im = prepare(src)
        except Exception as e:  # noqa: BLE001
            print(f"  FAILED {rel}: {e}")
            continue

        if not is_webp_in_place and out.exists() and out != src:
            print(f"  WARNING {rel}: {out.name} already exists and will be overwritten")
        main_im = fit(im, longest)
        # An already-small .webp is left untouched (but still gets a thumbnail if missing).
        if not (is_webp_in_place and max(im.size) <= longest):
            save_webp(main_im, out, args.quality)
        if not thumb.exists() or not is_webp_in_place:
            save_webp(fit(im, THUMB_MAX), thumb, 78)

        final = Image.open(out)
        kb = out.stat().st_size / 1024
        print(f"  ok  {rel}  ->  {out.name} {final.size[0]}x{final.size[1]} ({kb:.0f} KB) + {thumb.name}")
        if kb > 600:
            print(f"      note: {kb:.0f} KB is large; try --quality 72")

        if not is_webp_in_place and not args.keep_originals:
            dest = ORIGINALS / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            n = 1
            while dest.exists():
                dest = dest.with_name(f"{dest.stem}-{n}{dest.suffix}")
                n += 1
            shutil.move(str(src), str(dest))
        base = "/".join(rel.with_suffix(".webp").parts)
        snippets.append({"src": base, "thumb": base[:-5] + ".thumb.webp", "alt": "", "caption": "", "people_under_18": None})

    if snippets:
        print("\nPaste into content/site.json (fill in alt, caption and the people_under_18 flag):\n")
        print(json.dumps(snippets, indent=2, ensure_ascii=False))
        if not args.keep_originals:
            print(f"\nOriginals were moved to {ORIGINALS.relative_to(ROOT)}/ (git-ignored, never published).")


if __name__ == "__main__":
    main()
