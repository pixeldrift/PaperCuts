#!/usr/bin/env python3
"""
Generate PaperCuts brand SVGs (flat colours, text converted to outlines).

    pip install fonttools brotli uharfbuzz
    python3 brand/build.py            # default pairing
    python3 brand/build.py instrument # try another pairing (see PAIRS)

Then `node brand/render.cjs` (needs playwright) rasterises the PNGs.
"""
import os, re, sys, urllib.request
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
import uharfbuzz as hb

sys.path.insert(0, os.path.dirname(__file__))
from icon import ACCENT, BG, icon_group, icon_svg  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "brand", ".fonts")
UA = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1"

# family, google css spec, variable-axis values to pin
PAIRS = {
    "fraunces": {  # default: editorial serif + sharp grotesk
        "paper": ("Fraunces", "opsz,wght@144,600", {"opsz": 144, "wght": 600}),
        "cuts": ("Space Grotesk", "wght@700", {"wght": 700}),
    },
    "instrument": {
        "paper": ("Instrument Serif", "", {}),
        "cuts": ("Bricolage Grotesque", "opsz,wght@96,800", {"opsz": 96, "wght": 800}),
    },
    "dmserif": {
        "paper": ("DM Serif Display", "", {}),
        "cuts": ("Outfit", "wght@700", {"wght": 700}),
    },
}

COLORS = {  # (paper word, cuts word)
    "dark": ("#F5F5FA", ACCENT),  # for dark backgrounds
    "light": ("#2B2C37", "#6A5AEB"),  # for light backgrounds
}


def font_file(family: str, spec: str, axes: dict) -> str:
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, re.sub(r"\W+", "_", f"{family}_{spec}") + ".ttf")
    if os.path.exists(out):
        return out
    q = family.replace(" ", "+") + (":" + spec if spec else "")
    req = urllib.request.Request(f"https://fonts.googleapis.com/css2?family={q}", headers={"User-Agent": UA})
    url = re.search(r"url\((https://[^)]+\.ttf)\)", urllib.request.urlopen(req).read().decode()).group(1)
    raw = out + ".raw"
    with urllib.request.urlopen(url) as r, open(raw, "wb") as f:
        f.write(r.read())
    font = TTFont(raw)
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, axes)
    font.save(out)
    os.remove(raw)
    return out


class Run:
    """Shaped, outlined text: SVG path data plus its bounds."""

    def __init__(self, path: str, text: str, size: float, x: float = 0.0, tracking: float = 0.0):
        font = TTFont(path)
        gs, order, upem = font.getGlyphSet(), font.getGlyphOrder(), font["head"].unitsPerEm
        hbf = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(hbf, buf, {"kern": True, "liga": False})
        k = size / upem
        pen = SVGPathPen(gs)
        bounds = BoundsPen(gs)
        cx = x
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            name = order[info.codepoint]
            m = (k, 0, 0, -k, cx + pos.x_offset * k, -pos.y_offset * k)
            gs[name].draw(TransformPen(pen, m))
            gs[name].draw(TransformPen(bounds, m))
            cx += pos.x_advance * k + tracking
        self.d, self.bounds, self.end = pen.getCommands(), bounds.bounds, cx - tracking


def wordmark(pair: dict, theme: str, size: float = 200.0):
    """Returns (svg-group, width, top, bottom) with the baseline at y=0."""
    paper, cuts = pair["paper"], pair["cuts"]
    a = Run(font_file(*paper), "Paper", size, 0, tracking=-size * 0.005)
    b = Run(font_file(*cuts), "Cuts", size * 0.97, a.end + size * 0.01, tracking=-size * 0.01)
    pc, cc = COLORS[theme]
    group = f'<path fill="{pc}" d="{a.d}"/><path fill="{cc}" d="{b.d}"/>'
    left = min(a.bounds[0], b.bounds[0])
    top = min(a.bounds[1], b.bounds[1])
    bottom = max(a.bounds[3], b.bounds[3])
    return group, left, b.bounds[2], top, bottom


def write(rel: str, text: str):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)
    print("wrote", rel)


def main(name: str = "fraunces"):
    pair = PAIRS[name]
    pad = 8
    for theme in ("dark", "light"):
        g, x0, x1, top, bottom = wordmark(pair, theme)
        w, h = x1 - x0 + 2 * pad, bottom - top + 2 * pad
        vb = f"{x0 - pad:.1f} {top - pad:.1f} {w:.1f} {h:.1f}"
        write(
            f"public/brand/wordmark-{theme}.svg",
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="PaperCuts">{g}</svg>\n',
        )

        # horizontal lockup: icon + wordmark
        icon = 190
        scale = icon * 0.46 / (bottom - top - 40)  # wordmark visual height ≈ 46% of icon
        gap = icon * 0.2
        ww = (x1 - x0) * scale
        W, H = icon + gap + ww + 2 * pad, icon + 2 * pad
        mid = (top + bottom) / 2
        ty = pad + icon / 2 - mid * scale
        write(
            f"brand/logo-horizontal-{theme}.svg",
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.1f} {H:.1f}">'
            f'<g transform="translate({pad} {pad}) scale({icon / 512:.5f})">{icon_group()}</g>'
            f'<g transform="translate({pad + icon + gap - x0 * scale:.2f} {ty:.2f}) scale({scale:.5f})">{g}</g></svg>\n',
        )

        # stacked lockup (like the concept): icon above wordmark
        icon = 360
        ws = icon * 1.55 / (x1 - x0)
        W = icon * 1.55 + 2 * pad * 3
        gap = icon * 0.12
        wh = (bottom - top) * ws
        H = icon + gap + wh + 2 * pad * 3
        write(
            f"brand/logo-stacked-{theme}.svg",
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.1f} {H:.1f}">'
            f'<g transform="translate({(W - icon) / 2:.1f} {pad * 3}) scale({icon / 512:.5f})">{icon_group()}</g>'
            f'<g transform="translate({pad * 3 - x0 * ws:.2f} {pad * 3 + icon + gap - top * ws:.2f}) scale({ws:.5f})">{g}</g></svg>\n',
        )

    # app icons
    write("public/icons/icon.svg", icon_svg())
    write("public/icons/icon-maskable.svg", icon_svg(maskable=True))
    write("public/icons/apple-touch-icon.svg", icon_svg(full_bleed=True, art_scale=0.86))
    write("public/favicon.svg", icon_svg())
    print("pairing:", name)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "fraunces")
