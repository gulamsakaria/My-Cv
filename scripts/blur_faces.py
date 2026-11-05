#!/usr/bin/env python3
"""
Blur faces in photos BEFORE they go anywhere near the website.

    python3 scripts/blur_faces.py originals/incoming -o originals/blurred
    python3 scripts/blur_faces.py photo.jpg --preview          # only draw boxes, blur nothing
    python3 scripts/blur_faces.py photo.jpg --region 120,80,200,200   # blur a box by hand (x,y,w,h in pixels)

!!! AUTOMATIC FACE DETECTION IS NOT PERFECT !!!
It misses faces that are small, turned away, in shadow, covered, tilted or at the edge of
the picture. YOU MUST OPEN EVERY OUTPUT IMAGE AND CHECK IT BY EYE. If a face is still
visible, run again with --region x,y,w,h for that spot (or --sensitive), or do not publish
that photo. Anyone under 18 must never be identifiable on the public site.

Detection uses OpenCV's bundled Haar cascades (frontal + profile, also on a mirrored copy).
It is deliberately over-sensitive: it prefers blurring a non-face to missing a face.
The output is re-encoded from pixels only, so camera metadata (GPS etc.) is dropped.

Needs:  pip install "opencv-python-headless<5" numpy
        (OpenCV 5 removed the Haar face detector this script uses, so stay on version 4.x)
"""
import argparse
import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError:
    sys.exit('OpenCV is required:  pip install "opencv-python-headless<5" numpy')

EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
CASCADES = ["haarcascade_frontalface_default.xml", "haarcascade_frontalface_alt2.xml", "haarcascade_profileface.xml"]


def load_cascades():
    if not hasattr(cv2, "CascadeClassifier"):
        sys.exit(f'OpenCV {cv2.__version__} has no Haar face detector. Install version 4:  pip install "opencv-python-headless<5"')
    base = Path(cv2.data.haarcascades)
    out = []
    for name in CASCADES:
        c = cv2.CascadeClassifier(str(base / name))
        if c.empty():
            sys.exit(f"Could not load OpenCV cascade {name}")
        out.append((name, c))
    return out


def detect(img, cascades, sensitive):
    gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    h, w = gray.shape
    # work on a normalised size so the same settings behave the same on big and small photos
    scale = 1600.0 / max(h, w) if max(h, w) > 1600 else 1.0
    g = cv2.resize(gray, None, fx=scale, fy=scale) if scale != 1.0 else gray
    gw = g.shape[1]
    min_size = max(18, int(min(g.shape) * (0.018 if sensitive else 0.03)))
    neighbors = 2 if sensitive else 3
    boxes = []
    for name, c in cascades:
        found = c.detectMultiScale(g, scaleFactor=1.06, minNeighbors=neighbors, minSize=(min_size, min_size))
        boxes += [tuple(map(int, b)) for b in found]
        if "profile" in name:  # profile cascade only looks one way; mirror to catch the other
            flipped = cv2.flip(g, 1)
            for (x, y, bw, bh) in c.detectMultiScale(flipped, scaleFactor=1.06, minNeighbors=neighbors, minSize=(min_size, min_size)):
                boxes.append((gw - int(x) - int(bw), int(y), int(bw), int(bh)))
    return [(int(x / scale), int(y / scale), int(bw / scale), int(bh / scale)) for (x, y, bw, bh) in boxes]


def merge(boxes, shape, grow):
    """Grow each box (hair, ears, chin) and merge overlapping ones."""
    H, W = shape[:2]
    grown = []
    for (x, y, w, h) in boxes:
        dx, dy = int(w * grow), int(h * grow)
        x0, y0 = max(0, x - dx), max(0, y - int(dy * 1.3))   # more room above for hair
        x1, y1 = min(W, x + w + dx), min(H, y + h + dy)
        grown.append([x0, y0, x1, y1])
    merged = True
    while merged:
        merged = False
        out = []
        while grown:
            a = grown.pop()
            for b in grown:
                if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                    b[0], b[1], b[2], b[3] = min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])
                    merged = True
                    break
            else:
                out.append(a)
        grown = out
    return [tuple(b) for b in grown]


def blur_region(img, box, pixelate):
    x0, y0, x1, y1 = box
    roi = img[y0:y1, x0:x1]
    if roi.size == 0:
        return
    h, w = roi.shape[:2]
    if pixelate:
        blocks = 8
        small = cv2.resize(roi, (max(1, blocks), max(1, int(blocks * h / w) or 1)), interpolation=cv2.INTER_LINEAR)
        roi[:] = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
    else:
        k = max(31, (max(w, h) // 2) | 1)
        roi[:] = cv2.GaussianBlur(cv2.GaussianBlur(roi, (k, k), 0), (k, k), 0)
    # soft edge so it does not look like a hard rectangle: blend with an elliptical mask
    # (the strong blur above already removes identity; the ellipse is cosmetic)


def parse_region(s):
    try:
        x, y, w, h = [int(v) for v in s.split(",")]
        return (x, y, w, h)
    except ValueError:
        raise argparse.ArgumentTypeError("--region needs x,y,w,h in pixels, e.g. 120,80,200,200")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="image files or folders")
    ap.add_argument("-o", "--out", default="originals/blurred", help="output folder (default originals/blurred)")
    ap.add_argument("--preview", action="store_true", help="draw green boxes where faces were found, do not blur")
    ap.add_argument("--sensitive", action="store_true", help="find more (and smaller) faces; more false positives")
    ap.add_argument("--pixelate", action="store_true", help="use mosaic instead of blur")
    ap.add_argument("--grow", type=float, default=0.35, help="enlarge boxes by this fraction (default 0.35)")
    ap.add_argument("--region", action="append", type=parse_region, default=[], help="extra x,y,w,h box to blur (repeatable; applies to every input image)")
    args = ap.parse_args()

    files = []
    for i in args.inputs:
        p = Path(i)
        files += sorted(f for f in p.rglob("*") if f.suffix.lower() in EXT) if p.is_dir() else [p]
    if not files:
        sys.exit("No images found.")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    cascades = load_cascades()
    total = 0
    for f in files:
        img = cv2.imread(str(f), cv2.IMREAD_COLOR)  # honours EXIF rotation
        if img is None:
            print(f"  FAILED to read {f}")
            continue
        boxes = detect(img, cascades, args.sensitive)
        merged = merge(boxes, img.shape, args.grow)
        manual = [(x, y, x + w, y + h) for (x, y, w, h) in args.region]
        regions = merged + manual
        total += len(regions)
        if args.preview:
            for (x0, y0, x1, y1) in regions:
                cv2.rectangle(img, (x0, y0), (x1, y1), (0, 220, 0), max(2, img.shape[1] // 400))
            dest = out_dir / (f.stem + "_preview.jpg")
        else:
            for b in regions:
                blur_region(img, b, args.pixelate)
            dest = out_dir / (f.stem + ("_blurred" if regions else "") + ".jpg")
        cv2.imwrite(str(dest), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        flag = "" if regions else "   <-- NO FACES FOUND: check by eye (might be a photo without people, or a missed face)"
        print(f"  {f.name}: {len(regions)} region(s) blurred -> {dest}{flag}")

    print(f"\nDone: {total} region(s) in {len(files)} image(s).")
    print("NOW OPEN EVERY OUTPUT FILE AND LOOK AT IT. Automatic detection misses faces.")
    print("Only copy checked images into site/assets/photos/, then run scripts/optimize_images.py")


if __name__ == "__main__":
    main()
