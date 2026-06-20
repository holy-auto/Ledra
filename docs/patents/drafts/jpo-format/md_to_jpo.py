#!/usr/bin/env python3
"""JPO electronic filing package generator.

Converts patent draft Markdown into import-ready Shift_JIS HTML documents and
copies monochrome PNG drawings into ``jpo-format/out/<invention>/``.

Generated output contains only the four attachment documents used by the
Internet Application Software: specification, claims, abstract, and drawings.
The patent application form itself is prepared separately in the software.
"""
from __future__ import annotations

import html
import re
import shutil
from pathlib import Path
from typing import Iterable

HERE = Path(__file__).resolve().parent
DRAFTS = HERE.parent
OUT = HERE / "out"
REVIEW = HERE / "review"
FIGURE_SOURCE = DRAFTS / "figures" / "jpo"

FULLWIDTH_DIGITS = str.maketrans("0123456789", "０１２３４５６７８９")
UNSUPPORTED_TRANSLATION = str.maketrans({
    "—": "－",
    "–": "－",
    "‑": "－",
    "−": "－",
    " ": "　",
})

FIGURES = {
    "01": ["01-fig1-system", "01-fig2-flow", "01-fig3-digest", "01-fig4-verify"],
    "06": ["06-fig1-system", "06-fig2-genflow", "06-fig3-tree", "06-fig4-verify", "06-fig5-nonce"],
    "07": ["07-fig1-system", "07-fig2-gate", "07-fig3-provenance", "07-fig4-immutable", "07-fig5-serial"],
}

SOURCES = {
    "01": "明細書-01-メタアンカー.md",
    "06": "明細書-06-zkp選択的開示.md",
    "07": "明細書-07-確定ゲート.md",
}

OUTPUT_NAMES = {
    "明細書": "明細書.html",
    "特許請求の範囲": "特許請求の範囲.html",
    "要約書": "要約書.html",
    "図面": "図面.html",
}


def normalize_text(value: str) -> str:
    value = value.translate(UNSUPPORTED_TRANSLATION)
    value = re.sub(r"\*\*(.+?)\*\*", r"\1", value)
    value = re.sub(r"`([^`]+)`", r"\1", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = value.strip()
    try:
        value.encode("cp932")
    except UnicodeEncodeError as exc:
        bad = value[exc.start : exc.end]
        raise ValueError(f"Shift_JISで表現できない文字があります: {bad!r} / {value}") from exc
    return value


def esc(value: str) -> str:
    return html.escape(normalize_text(value), quote=False)


def fullwidth_number(value: str) -> str:
    return value.translate(FULLWIDTH_DIGITS)


def html_document(title: str, body_lines: Iterable[str]) -> bytes:
    lines = [
        '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">',
        "<HTML>",
        "<HEAD>",
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=Shift_JIS">',
        f"<TITLE>{esc(title)}</TITLE>",
        "</HEAD>",
        "<BODY>",
        *body_lines,
        "</BODY>",
        "</HTML>",
        "",
    ]
    return "\r\n".join(lines).encode("cp932")


def split_documents(text: str) -> dict[str, list[str]]:
    text = re.sub(r"```(?:mermaid|text).*?```", "", text, flags=re.S)
    docs: dict[str, list[str]] = {}
    current_name: str | None = None
    current_lines: list[str] = []
    for line in text.splitlines():
        match = re.match(r"^##\s*【書類名】(.+?)\s*$", line)
        if match:
            if current_name is not None:
                docs[current_name] = current_lines
            current_name = match.group(1).strip()
            current_lines = []
            continue
        if current_name is not None and line.strip() != "---":
            current_lines.append(line)
    if current_name is not None:
        docs[current_name] = current_lines
    return docs


def meaningful_lines(lines: Iterable[str]) -> list[str]:
    result: list[str] = []
    for raw in lines:
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith(">"):
            continue
        if line.lstrip().startswith("|"):
            continue
        result.append(line)
    return result


def specification_lines(lines: list[str]) -> list[str]:
    out = ["【書類名】明細書<BR>"]
    pending_title = False
    for line in meaningful_lines(lines):
        heading = re.match(r"^#{3,5}\s*【(.+?)】\s*(.*)$", line)
        if heading:
            marker = normalize_text(heading.group(1))
            suffix = normalize_text(heading.group(2)) if heading.group(2).strip() else ""
            if marker == "発明の名称":
                if suffix:
                    out.append(f"【発明の名称】{esc(suffix)}<BR>")
                else:
                    pending_title = True
                continue
            out.append(f"【{esc(marker)}】<BR>")
            continue
        if re.match(r"^#{3,5}\s*〔.+?〕\s*$", line) or line.startswith("#"):
            continue

        value = normalize_text(line)
        if pending_title:
            out.append(f"【発明の名称】{esc(value)}<BR>")
            pending_title = False
            continue
        paragraph = re.fullmatch(r"【(\d{4})】", value)
        if paragraph:
            out.append(f"【{fullwidth_number(paragraph.group(1))}】<BR>")
            continue
        if re.match(r"^【(?:特許文献|非特許文献|図)[0-9０-９]+】", value):
            marked = re.sub(
                r"^【(特許文献|非特許文献|図)([0-9０-９]+)】",
                lambda m: f"【{m.group(1)}{fullwidth_number(m.group(2))}】",
                value,
            )
            out.append(f"{esc(marked)}<BR>")
        else:
            out.append(f"　{esc(value)}<BR>")
    return out


def claims_lines(lines: list[str]) -> list[str]:
    out = ["【書類名】特許請求の範囲<BR>"]
    current_claim: int | None = None
    for line in meaningful_lines(lines):
        heading = re.match(r"^#{3,5}\s*【請求項([0-9０-９]+)】\s*$", line)
        if heading:
            digits = heading.group(1).translate(str.maketrans("０１２３４５６７８９", "0123456789"))
            current_claim = int(digits)
            out.append(f"【請求項{fullwidth_number(str(current_claim))}】<BR>")
            continue
        if line.startswith("#"):
            continue
        if current_claim is None:
            continue
        out.append(f"　{esc(line)}<BR>")
    return out


def section_values(lines: list[str]) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in meaningful_lines(lines):
        heading = re.match(r"^#{3,5}\s*【(.+?)】\s*$", line)
        if heading:
            current = normalize_text(heading.group(1))
            sections[current] = []
            continue
        if line.startswith("#") or current is None:
            continue
        sections[current].append(normalize_text(line))
    return {key: "".join(values) for key, values in sections.items()}


def abstract_lines(lines: list[str]) -> list[str]:
    sections = section_values(lines)
    problem = sections.get("課題", "")
    solution = re.sub(r"（約[0-9０-９]+字）\s*$", "", sections.get("解決手段", ""))
    selected = sections.get("選択図", "").replace(" ", "").replace("　", "")
    selected = fullwidth_number(selected)
    return [
        "【書類名】要約書<BR>",
        "【要約】<BR>",
        f"【課題】{esc(problem)}<BR>",
        f"【解決手段】{esc(solution)}<BR>",
        f"【選択図】{esc(selected)}<BR>",
    ]


def drawing_lines(invention: str) -> list[str]:
    out = ["【書類名】図面<BR>"]
    for index, stem in enumerate(FIGURES[invention], start=1):
        out.append(f"【図{fullwidth_number(str(index))}】<BR>")
        out.append(f'<IMG SRC="{stem}.png"><BR>')
    return out


def preview_html(invention: str) -> str:
    figures = []
    for index, stem in enumerate(FIGURES[invention], start=1):
        figures.append(f"<h2>図{index}</h2><img src=\"../../figures/jpo/{stem}.png\" alt=\"図{index}\">")
    return "\n".join([
        "<!doctype html>",
        '<html lang="ja"><head><meta charset="utf-8">',
        f"<title>発明{invention} 図面レビュー</title>",
        "<style>body{font-family:sans-serif;max-width:1100px;margin:2rem auto}img{max-width:100%;border:1px solid #999}</style>",
        "</head><body>",
        f"<h1>発明{invention} 図面レビュー（提出不可）</h1>",
        *figures,
        "</body></html>",
        "",
    ])


def generate_one(invention: str, source_name: str) -> None:
    source_path = DRAFTS / source_name
    docs = split_documents(source_path.read_text(encoding="utf-8"))
    required = {"明細書", "特許請求の範囲", "要約書"}
    missing = required - docs.keys()
    if missing:
        raise ValueError(f"{source_name}: 必須書類セクションがありません: {sorted(missing)}")

    target = OUT / invention
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)

    generated = {
        "明細書": specification_lines(docs["明細書"]),
        "特許請求の範囲": claims_lines(docs["特許請求の範囲"]),
        "要約書": abstract_lines(docs["要約書"]),
        "図面": drawing_lines(invention),
    }
    for doc_name, lines in generated.items():
        (target / OUTPUT_NAMES[doc_name]).write_bytes(html_document(doc_name, lines))

    for stem in FIGURES[invention]:
        src = FIGURE_SOURCE / f"{stem}.png"
        if not src.exists():
            raise FileNotFoundError(f"提出図がありません: {src}")
        shutil.copy2(src, target / src.name)

    review_dir = REVIEW / invention
    review_dir.mkdir(parents=True, exist_ok=True)
    (review_dir / "図面-プレビュー.html").write_text(preview_html(invention), encoding="utf-8", newline="\n")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)
    for invention in ("06", "07", "01"):
        generate_one(invention, SOURCES[invention])
        print(f"[{invention}] Shift_JIS HTML + 1-bit PNG package generated")


if __name__ == "__main__":
    main()
