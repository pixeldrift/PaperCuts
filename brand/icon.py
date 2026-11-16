"""Icon artwork for PaperCuts (flat colours only). Imported by build.py."""

TILE = "#2B2C37"
PAGE = "#F5F5FA"
FOLD = "#B9B1FF"
ACCENT = "#7A6CF6"
BG = "#17181C"


def art() -> str:
    """
    The film-page + scissors mark, traced from the concept sketch.

    Drawn in the sketch's own coordinate space (~960x880) and scaled into the
    512 grid. The upper scissor blade is *negative space* cut through the page
    and the play button; the lower blade is white, outlined by a dark gap.
    """
    return f"""
  <g transform="translate(53 77) scale(.42)">
    <!-- paper / film strip -->
    <path fill="{PAGE}" d="M128 135L478 70Q503 65 520 84L664 238Q682 260 676 292L655 430L650 600Q648 660 610 705Q598 716 575 719L128 787Q65 792 65 725V200Q65 145 128 135Z"/>
    <!-- torn edge -->
    <path fill="none" stroke="{ACCENT}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"
          d="M458 70Q508 100 522 170Q530 232 562 255Q600 274 674 282"/>
    <!-- sprocket holes -->
    <g fill="{TILE}">
      <rect x="125" y="178" width="92" height="90" rx="20"/>
      <rect x="125" y="328" width="92" height="90" rx="20"/>
      <rect x="125" y="478" width="92" height="90" rx="20"/>
      <rect x="125" y="628" width="92" height="90" rx="20"/>
    </g>
    <!-- play -->
    <path fill="{ACCENT}" stroke="{ACCENT}" stroke-width="16" stroke-linejoin="round" d="M343 338V578L534 458Z"/>
    <!-- upper blade: negative space over the page and the play button -->
    <path fill="{TILE}" stroke="{TILE}" stroke-width="16" stroke-linejoin="round"
          d="M252 246L664 420L574 474L256 270Z"/>
    <!-- lower blade: dark gap, then the white blade -->
    <path fill="{TILE}" stroke="{TILE}" stroke-width="14" stroke-linejoin="round"
          d="M342 600L540 468L668 520L650 556L440 574Z"/>
    <path fill="#FFFFFF" d="M446 560L622 474L668 534L600 552Z"/>
    <!-- handles: stroked ellipses give an even ring; shanks join them to the pivot -->
    <g fill="none" stroke="#FFFFFF" stroke-linecap="round">
      <path stroke-width="72" d="M612 492L742 412"/>
      <path stroke-width="72" d="M612 506L730 590"/>
      <ellipse cx="806" cy="366" rx="76" ry="62" stroke-width="46" transform="rotate(-28 806 366)"/>
      <ellipse cx="800" cy="652" rx="78" ry="72" stroke-width="46" transform="rotate(12 800 652)"/>
    </g>
    <circle cx="628" cy="486" r="18" fill="{ACCENT}"/>
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
