"""Generate favicon and app icons from a source PNG.

Inputs:
  public/brand-logo.png  (1024x1024 preferred, will work at lower sizes)

Outputs:
  src/app/favicon.ico          — multi-size ICO (16, 32, 48)
  public/icon-192.png          — 192x192 PNG
  public/icon-512.png          — 512x512 PNG
  public/icon-maskable-512.png — 512x512 PNG with safe-zone padding
  public/apple-touch-icon.png  — 180x180 PNG (iOS home-screen)

Run with: python3 scripts/generate-favicons.py
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "brand-logo.png"
PUBLIC = ROOT / "public"
APP = ROOT / "src" / "app"

# Brand background used to pad the maskable icon.
# Matches the navy in the source artwork.
MASKABLE_BG = (10, 22, 40, 255)  # #0a1628


def load_source() -> Image.Image:
    if not SRC.exists():
        raise SystemExit(f"source not found: {SRC}")
    img = Image.open(SRC).convert("RGBA")
    if img.size[0] != img.size[1]:
        raise SystemExit(f"source must be square, got {img.size}")
    return img


def save_png(img: Image.Image, path: Path, size: int) -> None:
    out = img.resize((size, size), Image.LANCZOS)
    out.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({size}x{size})")


def save_ico(img: Image.Image, path: Path) -> None:
    sizes = [(16, 16), (32, 32), (48, 48)]
    img.save(path, format="ICO", sizes=sizes)
    print(f"wrote {path.relative_to(ROOT)} (multi-size {sizes})")


def save_maskable(img: Image.Image, path: Path, size: int = 512) -> None:
    # Maskable icons should keep important content inside the center 80%.
    # The source already centers the logo, so we letterbox on a brand-color
    # canvas to guarantee the safe zone regardless of host masking.
    canvas = Image.new("RGBA", (size, size), MASKABLE_BG)
    inner = int(size * 0.8)
    fg = img.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.alpha_composite(fg, (offset, offset))
    canvas.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({size}x{size}, maskable)")


def main() -> None:
    img = load_source()
    save_ico(img, APP / "favicon.ico")
    save_png(img, PUBLIC / "icon-192.png", 192)
    save_png(img, PUBLIC / "icon-512.png", 512)
    save_png(img, PUBLIC / "apple-touch-icon.png", 180)
    save_maskable(img, PUBLIC / "icon-maskable-512.png", 512)


if __name__ == "__main__":
    main()
