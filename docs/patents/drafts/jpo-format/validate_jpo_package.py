#!/usr/bin/env python3
"""Validate generated JPO attachment packages before software import."""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
EXPECTED_FIGURES = {"01": 4, "06": 5, "07": 5}
EXPECTED_DOCUMENTS = {"明細書.html", "特許請求の範囲.html", "要約書.html", "図面.html"}
PROHIBITED = ("〔", "〕", "<<", "約330字", "約340字", "約350字", "charset=UTF-8", "<SCRIPT", "<STYLE", "<A ")


def decode_shift_jis(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError(f"UTF-8 BOMがあります: {path}")
    text = raw.decode("cp932")
    if "charset=Shift_JIS" not in text:
        raise ValueError(f"Shift_JISメタ指定がありません: {path}")
    return text


def validate_paragraphs(text: str, path: Path) -> None:
    table = str.maketrans("０１２３４５６７８９", "0123456789")
    found = [int(n.translate(table)) for n in re.findall(r"【([０-９]{4})】", text)]
    if found != list(range(1, len(found) + 1)):
        raise ValueError(f"段落番号が連番ではありません: {path}: {found}")


def validate_claims(text: str, path: Path) -> None:
    table = str.maketrans("０１２３４５６７８９", "0123456789")
    found = [int(n.translate(table)) for n in re.findall(r"【請求項([０-９]+)】", text)]
    if not found or found != list(range(1, len(found) + 1)):
        raise ValueError(f"請求項番号が連番ではありません: {path}: {found}")


def abstract_equivalent_length(text: str) -> float:
    match = re.search(r"<BODY>(.*?)</BODY>", text, flags=re.S | re.I)
    body = match.group(1) if match else text
    body = html.unescape(re.sub(r"<[^>]+>", "", body))
    body = body.replace("【書類名】要約書", "").replace("【要約】", "")
    body = re.sub(r"【(?:課題|解決手段|選択図)】", "", body)
    body = re.sub(r"\s+", "", body)
    return sum(0.5 if ord(ch) < 128 else 1.0 for ch in body)


def validate_abstract(text: str, path: Path) -> None:
    order = [text.find(marker) for marker in ("【要約】", "【課題】", "【解決手段】", "【選択図】")]
    if any(index < 0 for index in order) or order != sorted(order):
        raise ValueError(f"要約書の項目順が不正です: {path}")
    length = abstract_equivalent_length(text)
    if not 200 <= length <= 400:
        raise ValueError(f"要約が200～400字相当外です: {path}: {length}")


def validate_drawings(text: str, directory: Path, expected: int) -> None:
    figures = re.findall(r"【図([０-９]+)】", text)
    images = re.findall(r'<IMG SRC="([^"]+\.png)">', text)
    if len(figures) != expected or len(images) != expected:
        raise ValueError(f"図番号又は画像数が不正です: {directory}")
    for image_name in images:
        path = directory / image_name
        if not path.exists():
            raise ValueError(f"参照画像がありません: {path}")
        with Image.open(path) as image:
            colors = image.convert("RGB").getcolors(maxcolors=3)
            if colors is None or len(colors) > 2:
                raise ValueError(f"モノクロ二値ではありません: {path}")
            if image.width > 1338 or image.height > 2007:
                raise ValueError(f"200dpi上限寸法を超えています: {path}: {image.size}")


def validate_package(invention: str) -> None:
    directory = OUT / invention
    actual_documents = {path.name for path in directory.glob("*.html")}
    if actual_documents != EXPECTED_DOCUMENTS:
        raise ValueError(f"提出HTML構成が不正です: {directory}: {actual_documents}")
    for path in sorted(directory.glob("*.html")):
        text = decode_shift_jis(path)
        upper = text.upper()
        for token in PROHIBITED:
            if token.upper() in upper:
                raise ValueError(f"禁止又は未解決要素があります: {path}: {token}")
        if path.name == "明細書.html":
            validate_paragraphs(text, path)
        elif path.name == "特許請求の範囲.html":
            validate_claims(text, path)
        elif path.name == "要約書.html":
            validate_abstract(text, path)
        elif path.name == "図面.html":
            validate_drawings(text, directory, EXPECTED_FIGURES[invention])
    print(f"[{invention}] validation passed")


def main() -> int:
    try:
        for invention in ("06", "07", "01"):
            validate_package(invention)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print("all JPO attachment packages passed static validation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
