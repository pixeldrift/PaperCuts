#!/usr/bin/env python3
"""
Build the shipped app icons + top-bar wordmark from the concept raster
(brand/source/concept.jpg).  Requires: pip install pillow numpy

    python3 brand/make_icons.py

The vector retrace of the mark lives in brand/icon.py + brand/build.py
(outputs to brand/vector/) for when we want crisp, resolution-independent art.
"""
import os
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "brand", "source", "concept.jpg")

# measured from the concept image (500x538)
TILE_BOX = (96, 91, 398, 376)        # the app tile, incl. rounded corners
WORD_BOX = (70, 396, 440, 480)       # "PaperCuts"
BG = np.array([30, 30, 38], float)   # backdrop colour


def out(rel: str) -> str:
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def sharpen(im: Image.Image) -> Image.Image:
    return im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))


def main():
    im = Image.open(SRC).convert("RGB")
    x0, y0, x1, y1 = TILE_BOX
    h = y1 - y0
    cx = (x0 + x1) // 2

    # ── "any" icon: centred square of the tile with clean rounded corners
    sq = im.crop((cx - h // 2, y0, cx + h // 2, y1))
    mask = Image.new("L", (sq.width * 4, sq.height * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, mask.width - 1, mask.height - 1), radius=int(h * 0.2 * 4), fill=255)
    mask = mask.resize(sq.size, Image.LANCZOS)
    rounded = sq.convert("RGBA")
    rounded.putalpha(mask)

    def save_any(size: int, rel: str):
        big = rounded.resize((size, size), Image.LANCZOS)
        big = Image.merge("RGBA", (*sharpen(big.convert("RGB")).split(), big.getchannel("A")))
        big.save(out(rel))

    save_any(512, "public/icons/icon-512.png")
    save_any(192, "public/icons/icon-192.png")
    save_any(32, "public/icons/favicon-32.png")

    # ── full-bleed square (maskable / iOS): crop inside the rounded corners, then
    #    extend the tile's own edge colours outwards so the art sits in the safe zone
    inset = int(h * 0.2 * (1 - 0.7071)) + 2
    core = np.asarray(im.crop((cx - h // 2 + inset, y0 + inset, cx + h // 2 - inset, y1 - inset)).convert("RGB"))
    pad = int(core.shape[0] * 0.14)
    full = np.pad(core, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
    full_im = Image.fromarray(full)
    # soften the replicated border so it blends rather than streaks
    blurred = full_im.filter(ImageFilter.GaussianBlur(pad / 2))
    m = Image.new("L", full_im.size, 255)
    ImageDraw.Draw(m).rectangle((pad, pad, full_im.width - pad, full_im.height - pad), fill=0)
    full_im = Image.composite(blurred, full_im, m.filter(ImageFilter.GaussianBlur(pad / 6)))
    sharpen(full_im.resize((512, 512), Image.LANCZOS)).save(out("public/icons/icon-maskable-512.png"))
    sharpen(full_im.resize((180, 180), Image.LANCZOS)).save(out("public/icons/apple-touch-icon.png"))

    # ── wordmark with a transparent background (for the top bar)
    wm = np.asarray(im.crop(WORD_BOX)).astype(float)
    white = np.array([245, 245, 250], float)
    purple = np.array([100, 94, 224], float)  # "Cuts"
    # Each pixel is bg blended with either white or purple. Solve alpha for both and
    # keep whichever reconstructs the pixel better.
    alphas, resids = [], []
    for fg in (white, purple):
        v = fg - BG
        al = np.clip(((wm - BG) @ v) / (v @ v), 0, 1)
        alphas.append(al)
        resids.append(np.linalg.norm(wm - (BG + al[..., None] * v), axis=2))
    use_purple = resids[1] < resids[0]
    alpha = np.where(use_purple, alphas[1], alphas[0])
    rgb = np.where(use_purple[..., None], purple, white)
    rgba = np.dstack([rgb, alpha * 255])
    wm_img = Image.fromarray(np.round(rgba).astype(np.uint8), "RGBA")
    bbox = wm_img.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    wm_img = wm_img.crop(bbox)
    wm_img.save(out("public/brand/wordmark.png"))

    # ── previews
    for name, bg in (("dark", (23, 24, 28)), ("light", (255, 255, 255))):
        canvas = Image.new("RGB", (wm_img.width + 80, wm_img.height + 80), bg)
        canvas.paste(wm_img, (40, 40), wm_img)
        canvas.save(out(f"brand/preview/wordmark-{name}.png"))
    print("done")


if __name__ == "__main__":
    main()
