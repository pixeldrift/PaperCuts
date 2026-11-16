"""Icon artwork for PaperCuts (flat colours only). Imported by build.py."""

TILE = "#2B2C37"
PAGE = "#F5F5FA"
FOLD = "#B9B1FF"
ACCENT = "#7A6CF6"
BG = "#17181C"


def ring(cx: float, cy: float, ro: float, ri: float) -> str:
    """Annulus as one even-odd path."""
    def circle(r: float) -> str:
        return f"M{cx - r} {cy}A{r} {r} 0 1 0 {cx + r} {cy}A{r} {r} 0 1 0 {cx - r} {cy}Z"
    return f'<path fill-rule="evenodd" d="{circle(ro)}{circle(ri)}"/>'


def art() -> str:
    """The film-page + scissors mark, drawn on a 512 grid and centred."""
    return f"""
  <defs>
    <g id="scis">
      <path d="M276 186L391.8 308.7L368.2 327.3Z"/>
      <path d="M272 306L382.7 303.3L377.3 332.7Z"/>
      <path d="M371.1 319.3L388.9 316.7L403.3 413L385.5 415.6Z"/>
      <path d="M374.1 324.8L385.9 311.2L423.7 343.6L411.9 357.2Z"/>
      {ring(436, 366, 30, 15)}
      {ring(398, 438, 30, 15)}
    </g>
  </defs>
  <g transform="translate(-44 -41)">
    <path d="M138 124H290L374 208V388H138Z" fill="{PAGE}"/>
    <path d="M290 124V208H374Z" fill="{FOLD}"/>
    <g fill="{TILE}">
      <rect x="156" y="158" width="30" height="38" rx="8"/>
      <rect x="156" y="216" width="30" height="38" rx="8"/>
      <rect x="156" y="274" width="30" height="38" rx="8"/>
      <rect x="156" y="332" width="30" height="38" rx="8"/>
    </g>
    <path d="M214 204V326L292 265Z" fill="{ACCENT}" stroke="{ACCENT}" stroke-width="14" stroke-linejoin="round"/>
    <use href="#scis" fill="{TILE}" stroke="{TILE}" stroke-width="20" stroke-linejoin="round"/>
    <use href="#scis" fill="#FFFFFF"/>
    <circle cx="380" cy="318" r="11" fill="{ACCENT}"/>
  </g>
"""


def icon_group(maskable: bool = False, full_bleed: bool = False, art_scale: float | None = None) -> str:
    """Tile + artwork as an SVG fragment on a 512 grid."""
    square = maskable or full_bleed
    scale = art_scale if art_scale is not None else (0.78 if maskable else 1.0)
    tile = (
        f'<rect width="512" height="512" fill="{TILE}"/>'
        if square
        else f'<rect width="512" height="512" rx="116" fill="{TILE}"/>'
    )
    body = art() if scale == 1.0 else f'<g transform="translate(256 256) scale({scale}) translate(-256 -256)">{art()}</g>'
    return tile + body


def icon_svg(maskable: bool = False, full_bleed: bool = False, art_scale: float | None = None) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        + icon_group(maskable, full_bleed, art_scale)
        + "</svg>\n"
    )
