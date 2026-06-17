#!/usr/bin/env python3
"""
figures/*.svg → JPO提出向け 白黒(1bit) GIF/BMP 一括変換。

JPO電子出願の図面は「白黒の線画」で、形式は GIF/BMP、寸法・解像度に上限がある。
本スクリプトは編集マスタ(SVG)から、白黒1bitの GIF と BMP を figures/jpo/ に出力する。

⚠️ 目標幅・しきい値は代表値。提出前に必ず最新の電子出願ソフト仕様（画像形式・最大寸法・
   解像度）で検証し、必要なら TARGET_WIDTH / THRESHOLD を調整すること。

使い方:
    pip install cairosvg pillow
    python3 convert_to_jpo.py
"""
import glob
import os
import cairosvg
from PIL import Image, ImageOps

# JPO図面向けの寸法最適化（A4作図領域に収まり縮小後も判読可能な代表値。要・最新仕様確認）
TARGET_WIDTH = 1240   # 図の内容幅(px)。A4横使用幅≒165mm @ ~190dpi 相当
MARGIN = 48           # 余白(px)。図面には周囲マージンが必要
MAX_HEIGHT = 1900     # 高さ上限(px)。A4縦使用高 ≒ 245mm @ ~190dpi 相当。超過時は縮小
THRESHOLD = 200       # L(0-255) をこの値で二値化（線画向け・ディザ無し）
OUT_DIR = "jpo"

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    os.chdir(here)
    os.makedirs(OUT_DIR, exist_ok=True)
    count = 0
    for svg in sorted(glob.glob("*.svg")):
        stem = svg[:-4]
        tmp_png = os.path.join(OUT_DIR, stem + ".tmp.png")
        # 1) SVG -> PNG（白背景・内容幅 TARGET_WIDTH）
        cairosvg.svg2png(url=svg, write_to=tmp_png,
                         background_color="white", output_width=TARGET_WIDTH)
        img = Image.open(tmp_png).convert("L")
        # 2) 高さ上限を超える縦長図は等比縮小して収める
        max_inner_h = MAX_HEIGHT - 2 * MARGIN
        if img.height > max_inner_h:
            scale = max_inner_h / img.height
            img = img.resize((max(1, int(img.width * scale)), max_inner_h), Image.LANCZOS)
        # 3) 周囲に白余白を付与（図面マージン）
        img = ImageOps.expand(img, border=MARGIN, fill=255)
        # 4) 白黒1bitへ二値化（線画はしきい値・ディザ無し）
        bw = img.point(lambda x: 255 if x >= THRESHOLD else 0, mode="1")
        gif_path = os.path.join(OUT_DIR, stem + ".gif")
        bmp_path = os.path.join(OUT_DIR, stem + ".bmp")
        bw.save(gif_path, "GIF")
        bw.save(bmp_path, "BMP")
        os.remove(tmp_png)
        count += 1
        print(f"{svg} -> {gif_path} / {bmp_path}  ({bw.size[0]}x{bw.size[1]} 1bit, 余白{MARGIN}px)")
    print(f"done: {count} figures -> {OUT_DIR}/ (GIF+BMP, 1bit, 幅{TARGET_WIDTH}px+余白, 高さ上限{MAX_HEIGHT}px)")

if __name__ == "__main__":
    main()
