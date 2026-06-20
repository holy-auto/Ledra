#!/usr/bin/env python3
"""Convert patent SVG drawings to JPO-compatible monochrome 1-bit PNG files."""
from __future__ import annotations

import glob
from pathlib import Path

import cairosvg
from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "jpo"
TARGET_CONTENT_WIDTH = 1240
MARGIN = 48
MAX_CANVAS_WIDTH = 1338   # 170 mm at 200 dpi
MAX_CANVAS_HEIGHT = 2007  # 255 mm at 200 dpi
THRESHOLD = 200
DPI = (200, 200)


def convert(svg_path: Path) -> Path:
    temp = OUT_DIR / f"{svg_path.stem}.tmp.png"
    output = OUT_DIR / f"{svg_path.stem}.png"
    cairosvg.svg2png(
        url=str(svg_path),
        write_to=str(temp),
        background_color="white",
        output_width=TARGET_CONTENT_WIDTH,
    )
    image = Image.open(temp).convert("L")
    max_inner_width = MAX_CANVAS_WIDTH - 2 * MARGIN
    max_inner_height = MAX_CANVAS_HEIGHT - 2 * MARGIN
    scale = min(1.0, max_inner_width / image.width, max_inner_height / image.height)
    if scale < 1.0:
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    image = ImageOps.expand(image, border=MARGIN, fill=255)
    binary = image.point(lambda value: 255 if value >= THRESHOLD else 0, mode="1")
    binary.save(output, "PNG", optimize=True, dpi=DPI)
    temp.unlink()
    return output


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.gif"):
        stale.unlink()
    for stale in OUT_DIR.glob("*.bmp"):
        stale.unlink()
    count = 0
    for name in sorted(glob.glob(str(HERE / "*.svg"))):
        output = convert(Path(name))
        with Image.open(output) as image:
            colors = image.convert("RGB").getcolors(maxcolors=3)
            if colors is None or len(colors) > 2:
                raise ValueError(f"二値画像ではありません: {output}")
            if image.width > MAX_CANVAS_WIDTH or image.height > MAX_CANVAS_HEIGHT:
                raise ValueError(f"JPO上限寸法を超えています: {output} {image.size}")
            print(f"{Path(name).name} -> {output.name} {image.size} 1-bit PNG")
        count += 1
    print(f"generated {count} JPO drawings")


if __name__ == "__main__":
    main()
