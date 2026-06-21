#!/usr/bin/env python3
"""Convert patent SVG drawings to JPO-compatible monochrome 1-bit PNG files.

The renderer deliberately avoids CairoSVG's native Cairo DLL dependency on
Windows. SVG files are rendered by an installed Chromium-based browser
(Microsoft Edge, Google Chrome, Chromium), then normalized with Pillow.
"""
from __future__ import annotations

import glob
import os
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from html import escape
from pathlib import Path

from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "jpo"
TARGET_CONTENT_WIDTH = 1240
MARGIN = 48
MAX_CANVAS_WIDTH = 1338   # 170 mm at 200 dpi
MAX_CANVAS_HEIGHT = 2007  # 255 mm at 200 dpi
THRESHOLD = 200
DPI = (200, 200)


def find_browser() -> Path:
    """Return an installed Edge/Chrome/Chromium executable."""
    env_candidates = [os.environ.get("EDGE_PATH"), os.environ.get("CHROME_PATH")]
    path_candidates = [
        shutil.which("msedge"),
        shutil.which("chrome"),
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
    ]
    windows_candidates = [
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
    ]
    for candidate in [*env_candidates, *path_candidates, *windows_candidates]:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    raise FileNotFoundError(
        "SVG描画に使用するMicrosoft Edge/Google Chrome/Chromiumが見つかりません。"
        "通常のWindows 11ではEdgeが標準搭載されています。"
    )


def _number(value: str | None) -> float | None:
    if not value:
        return None
    match = re.match(r"\s*([0-9]+(?:\.[0-9]+)?)", value)
    return float(match.group(1)) if match else None


def svg_aspect_ratio(svg_path: Path) -> float:
    """Read an SVG aspect ratio, preferring viewBox over physical units."""
    root = ET.parse(svg_path).getroot()
    view_box = root.attrib.get("viewBox") or root.attrib.get("viewbox")
    if view_box:
        values = [float(value) for value in re.split(r"[\s,]+", view_box.strip())]
        if len(values) == 4 and values[2] > 0 and values[3] > 0:
            return values[2] / values[3]
    width = _number(root.attrib.get("width"))
    height = _number(root.attrib.get("height"))
    if width and height and width > 0 and height > 0:
        return width / height
    return 4 / 3


def render_svg(browser: Path, svg_path: Path, output: Path) -> None:
    """Render one SVG to a white-background PNG through a headless browser."""
    ratio = max(0.1, svg_aspect_ratio(svg_path))
    height = max(1, round(TARGET_CONTENT_WIDTH / ratio))
    max_inner_height = MAX_CANVAS_HEIGHT - 2 * MARGIN
    if height > max_inner_height:
        height = max_inner_height

    with tempfile.TemporaryDirectory(prefix="jpo-svg-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        html_path = temp_dir / "render.html"
        profile_path = temp_dir / "browser-profile"
        source_uri = escape(svg_path.resolve().as_uri(), quote=True)
        html_path.write_text(
            "<!doctype html><html><head><meta charset=\"utf-8\">"
            "<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden;}"
            f"body{{width:{TARGET_CONTENT_WIDTH}px;height:{height}px;}}"
            f"img{{display:block;width:{TARGET_CONTENT_WIDTH}px;height:{height}px;"
            "object-fit:contain;object-position:center center;}}</style></head>"
            f"<body><img src=\"{source_uri}\"></body></html>",
            encoding="utf-8",
        )

        base_args = [
            str(browser),
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--allow-file-access-from-files",
            "--force-device-scale-factor=1",
            "--virtual-time-budget=1000",
            f"--user-data-dir={profile_path}",
            f"--window-size={TARGET_CONTENT_WIDTH},{height}",
            f"--screenshot={output.resolve()}",
            html_path.resolve().as_uri(),
        ]

        errors: list[str] = []
        for headless_flag in ("--headless=new", "--headless"):
            result = subprocess.run(
                [base_args[0], headless_flag, *base_args[1:]],
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
            if result.returncode == 0 and output.is_file() and output.stat().st_size > 0:
                return
            errors.append((result.stderr or result.stdout or "unknown browser error").strip())
            output.unlink(missing_ok=True)

        raise RuntimeError(
            f"ブラウザによるSVG変換に失敗しました: {svg_path.name}\n" + "\n".join(errors)
        )


def convert(browser: Path, svg_path: Path) -> Path:
    temp = OUT_DIR / f"{svg_path.stem}.tmp.png"
    output = OUT_DIR / f"{svg_path.stem}.png"
    render_svg(browser, svg_path, temp)

    with Image.open(temp) as source:
        image = source.convert("L")
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
    temp.unlink(missing_ok=True)
    return output


def main() -> None:
    browser = find_browser()
    print(f"SVG renderer: {browser}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for pattern in ("*.gif", "*.bmp", "*.tmp.png"):
        for stale in OUT_DIR.glob(pattern):
            stale.unlink()
    count = 0
    for name in sorted(glob.glob(str(HERE / "*.svg"))):
        output = convert(browser, Path(name))
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
