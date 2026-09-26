"""Draw HomeFinder's icon set from one list of shapes.

    ../.venv/Scripts/python.exe web/scripts/icons.py      (from the repo root)

A house in front of a snow-capped peak, on the app's blue: homes, cool
climates and mountains, which is what the tool is for.

The same geometry is written out as an SVG, which browsers that accept one
keep sharp at any size, and rasterised to the PNG and ICO sizes that phones,
older browsers and "add to home screen" still ask for. numpy and the standard
library only: a PNG is a few zlib-compressed rows and a CRC, and an ICO is a
small index in front of PNGs, so nothing needs installing.

Edit SHAPES and rerun; every file in web/public is regenerated from it.
"""
from __future__ import annotations

import json
import struct
import zlib
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "public"

# Design grid. Everything below is in these units.
V = 64

BLUE = "#1f6feb"      # the app's --accent
SKY = "#1f6feb"
RIDGE = "#8fb9ff"     # the far mountain, a paler blue so the house reads first
SNOW = "#ffffff"
WALL = "#ffffff"

# (kind, geometry, colour), painted in order. `tile` is the background; the
# rest is the glyph, which the maskable variant shrinks into the safe zone.
SHAPES = [
    ("tile", (0, 0, 64, 64, 14), SKY),
    # Two peaks, the left one taller. The flanks run on past the tile's edge,
    # along the same slopes, and are clipped to it: stopping them short left a
    # flat horizon line with the house floating beneath it, and running them
    # this far keeps them reaching the edge in the shrunken maskable icon too.
    ("poly", [(-12.05, 80), (22, 17), (31, 32), (41, 21), (78.5, 80)], RIDGE),
    # Snow on the tall peak, with a ragged lower edge so it reads as snow.
    ("poly", [(22, 17), (16.9, 26.4), (20.2, 24.6), (22.6, 26.8), (25.4, 24.4),
              (27.4, 25.4)], SNOW),
    # The house: roof, then walls standing on the bottom edge, then the door.
    ("poly", [(15, 40), (34, 24), (53, 40)], WALL),
    ("rect", (20, 38, 48, 80), WALL),
    ("rect", (30.5, 44.5, 37.5, 80), BLUE),
]


def _rgb(hex_colour: str) -> np.ndarray:
    h = hex_colour.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def _scaled(geo, kind: str, s: float):
    """Scale a glyph shape about the centre of the grid."""
    c = V / 2
    f = lambda x: c + (x - c) * s  # noqa: E731
    if kind == "poly":
        return [(f(x), f(y)) for x, y in geo]
    x0, y0, x1, y1 = geo
    return (f(x0), f(y0), f(x1), f(y1))


def _inside_poly(X, Y, pts):
    """Even-odd rule, vectorised over every sample at once."""
    inside = np.zeros(X.shape, dtype=bool)
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        crosses = (y1 > Y) != (y2 > Y)
        x_at = (x2 - x1) * (Y - y1) / ((y2 - y1) or 1e-12) + x1
        inside ^= crosses & (X < x_at)
    return inside


def _inside_rrect(X, Y, x0, y0, x1, y1, r):
    cx = np.clip(X, x0 + r, x1 - r)
    cy = np.clip(Y, y0 + r, y1 - r)
    return ((X - cx) ** 2 + (Y - cy) ** 2 <= r * r) & (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)


def render(size: int, *, rounded=True, glyph_scale=1.0, ss=8) -> np.ndarray:
    """RGBA uint8 image. Supersampled `ss` times per axis, then averaged in
    premultiplied alpha so the rounded corners fade to transparent cleanly."""
    n = size * ss
    c = (np.arange(n) + 0.5) / n * V
    X, Y = np.meshgrid(c, c)
    rgb = np.zeros((n, n, 3))
    alpha = np.zeros((n, n))
    tile = np.zeros((n, n), dtype=bool)
    for kind, geo, colour in SHAPES:
        if kind == "tile":
            x0, y0, x1, y1, r = geo
            tile = m = _inside_rrect(X, Y, x0, y0, x1, y1, r if rounded else 0)
        else:
            g = _scaled(geo, kind, glyph_scale)
            if kind == "poly":
                m = _inside_poly(X, Y, g)
            else:
                x0, y0, x1, y1 = g
                m = (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)
            m = m & tile  # nothing paints outside the rounded corners
        rgb[m] = _rgb(colour)
        alpha[m] = 1.0
    pre = rgb * alpha[..., None]
    pre = pre.reshape(size, ss, size, ss, 3).mean(axis=(1, 3))
    a = alpha.reshape(size, ss, size, ss).mean(axis=(1, 3))
    out = np.where(a[..., None] > 0, pre / np.maximum(a[..., None], 1e-9), 0)
    img = np.dstack([out, a])
    return np.clip(np.round(img * 255), 0, 255).astype(np.uint8)


def png_bytes(img: np.ndarray) -> bytes:
    h, w, _ = img.shape
    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def ico_bytes(pngs: list[tuple[int, bytes]]) -> bytes:
    """An ICO whose entries are PNGs, which every browser since IE Vista reads."""
    head = struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries, data = b"", b""
    for size, b in pngs:
        dim = size if size < 256 else 0
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(b), offset + len(data))
        data += b
    return head + entries + data


def svg_text() -> str:
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {V} {V}">']
    for kind, geo, colour in SHAPES:
        if kind == "tile":
            x0, y0, x1, y1, r = geo
            tile = (f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" '
                    f'rx="{r}"')
            # The glyph runs past the tile on purpose and is clipped to it.
            parts.append(f'<clipPath id="t">{tile}/></clipPath>')
            parts.append(f'{tile} fill="{colour}"/><g clip-path="url(#t)">')
        elif kind == "poly":
            pts = " ".join(f"{x:g},{y:g}" for x, y in geo)
            parts.append(f'<polygon points="{pts}" fill="{colour}"/>')
        else:
            x0, y0, x1, y1 = geo
            parts.append(f'<rect x="{x0:g}" y="{y0:g}" width="{x1 - x0:g}" '
                         f'height="{y1 - y0:g}" fill="{colour}"/>')
    parts.append("</g></svg>")
    return "".join(parts) + "\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "favicon.svg").write_text(svg_text(), encoding="utf-8")
    (OUT / "favicon.ico").write_bytes(
        ico_bytes([(s, png_bytes(render(s))) for s in (16, 32, 48)]))
    # iOS masks the corners itself and paints transparency black, so its icon
    # is a full square.
    (OUT / "apple-touch-icon.png").write_bytes(png_bytes(render(180, rounded=False)))
    (OUT / "icon-192.png").write_bytes(png_bytes(render(192)))
    (OUT / "icon-512.png").write_bytes(png_bytes(render(512)))
    # Android may crop an icon to a circle or a squircle. The maskable one
    # fills the square and keeps the glyph inside the central 80% it promises
    # never to crop.
    (OUT / "icon-maskable-512.png").write_bytes(
        png_bytes(render(512, rounded=False, glyph_scale=0.8)))
    manifest = {
        "name": "HomeFinder",
        "short_name": "HomeFinder",
        "description": "Find where to buy a home by climate, connections and price.",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#f7f7f5",
        "theme_color": BLUE,
        "icons": [
            {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png",
             "purpose": "maskable"},
        ],
    }
    (OUT / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for p in sorted(OUT.glob("*")):
        if p.is_file():
            print(f"{p.name:<24} {p.stat().st_size:>7,} bytes")


if __name__ == "__main__":
    main()
