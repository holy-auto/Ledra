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
from PIL import Image

TARGET_WIDTH = 1400   # 代表値（px）。JPO最大寸法に合わせて要調整
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
        # 1) SVG -> PNG（白背景・目標幅）
        cairosvg.svg2png(url=svg, write_to=tmp_png,
                         background_color="white", output_width=TARGET_WIDTH)
        # 2) PNG -> 白黒1bit（線画はしきい値二値化でノイズを避ける）
        img = Image.open(tmp_png).convert("L")
        bw = img.point(lambda x: 255 if x >= THRESHOLD else 0, mode="1")
        gif_path = os.path.join(OUT_DIR, stem + ".gif")
        bmp_path = os.path.join(OUT_DIR, stem + ".bmp")
        bw.save(gif_path, "GIF")
        bw.save(bmp_path, "BMP")
        os.remove(tmp_png)
        count += 1
        print(f"{svg} -> {gif_path} / {bmp_path}  ({bw.size[0]}x{bw.size[1]} 1bit)")
    print(f"done: {count} figures -> {OUT_DIR}/ (GIF+BMP, 1bit)")

if __name__ == "__main__":
    main()
