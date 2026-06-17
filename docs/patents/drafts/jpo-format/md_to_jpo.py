#!/usr/bin/env python3
"""
明細書 Markdown (drafts/明細書-XX.md) -> JPO電子出願向け HTML へ自動変換。

各 `## 【書類名】XXX` ごとに別HTML（明細書/特許請求の範囲/要約書/図面）を out/<inv>/ に出力。
- 段落番号 【0001】 は全角 【０００１】 に変換
- 見出し行（### 【...】 等）は 【...】<BR> として出力
- 本文行は先頭に全角空白を付け <BR> で終端
- Markdown 装飾（** ` [text](url)）と内部グルーピング（#### 〔...〕）・blockquote(>)・表(|)・mermaid は除去
- 図面は figures/jpo/*.gif を参照する HTML をテンプレ生成（mermaid は無視）

⚠️ 自動変換の下書き。**提出前に必ず目視確認**し、電子出願ソフトの文書チェックを通すこと。
   文字コードは取込時にソフト指定（従来Shift_JIS）へ。本出力はUTF-8。

使い方:  python3 md_to_jpo.py
"""
import os, re, glob, shutil, base64

HERE = os.path.dirname(os.path.abspath(__file__))
DRAFTS = os.path.dirname(HERE)               # .../drafts
OUT = os.path.join(HERE, "out")

Z = str.maketrans("0123456789", "０１２３４５６７８９")
FIGS = {
    "06": ["06-fig1-system", "06-fig2-genflow", "06-fig3-tree", "06-fig4-verify", "06-fig5-nonce"],
    "07": ["07-fig1-system", "07-fig2-gate", "07-fig3-provenance", "07-fig4-immutable", "07-fig5-serial"],
    "01": ["01-fig1-system", "01-fig2-flow", "01-fig3-digest", "01-fig4-verify"],
}

def strip_md(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
    return s.strip()

def html_wrap(title: str, body: str) -> str:
    return ('<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">\n'
            '<!-- 自動変換の下書き（md_to_jpo.py）。要目視確認・文書チェック。取込時は指定文字コードへ -->\n'
            f'<HTML>\n<HEAD>\n<META http-equiv="Content-Type" content="text/html; charset=UTF-8">\n'
            f'<TITLE>{title}</TITLE>\n</HEAD>\n<BODY>\n{body}</BODY>\n</HTML>\n')

def conv_text_doc(docname: str, lines: list) -> str:
    out = [f"【書類名】{docname}<BR>"]
    pending_title = False
    for raw in lines:
        line = raw.rstrip("\n")
        if not line.strip():
            continue
        if line.lstrip().startswith(">"):            # blockquote note
            continue
        if line.lstrip().startswith("|"):            # table
            continue
        m = re.match(r"^#{3,5}\s*【(.+?)】\s*(.*)$", line)
        if m:
            head, rest = m.group(1), strip_md(m.group(2))
            if head == "発明の名称":
                out.append("【発明の名称】" + (rest if rest else "<<次行>>") )
                pending_title = not rest
                if not pending_title:
                    out[-1] += "<BR>"
                continue
            out.append(f"【{head}】<BR>")
            continue
        if re.match(r"^#{3,5}\s*〔.+?〕\s*$", line):   # internal grouping -> drop
            continue
        if line.startswith("#"):                      # other md headers/h1 -> drop
            continue
        body = strip_md(line)
        if pending_title:                             # 発明の名称 の値（次行）
            out[-1] = out[-1].replace("<<次行>>", body) + "<BR>"
            pending_title = False
            continue
        if re.fullmatch(r"【\d{4}】", body):           # 段落番号 -> 全角
            out.append(body.translate(Z) + "<BR>")
            continue
        if not body.startswith("　"):
            body = "　" + body
        out.append(body + "<BR>")
    return "\n".join(out) + "\n"

def conv_figures(inv: str) -> str:
    out = ["【書類名】図面<BR>"]
    for i, stem in enumerate(FIGS.get(inv, []), start=1):
        out.append(f"【図{i}】".translate(Z) + "<BR>")   # 図番号ラベルのみ全角
        out.append(f'<img src="{stem}.gif" alt="fig{i}"><BR>')  # 同階層に同梱（パスは半角厳守）
    return "\n".join(out) + "\n"

def figures_preview_html(inv: str) -> str:
    """レビュー用の自己完結HTML。図GIFをbase64で埋め込むので、HTML単体を
    どこで開いても（GIF同梱なし・Web/モバイルのビューアでも）図が表示される。
    ⚠️ 提出用ではない。電子出願ソフトへは out/<inv>/図面.html（別ファイル参照）を取り込むこと。"""
    rows = []
    for i, stem in enumerate(FIGS.get(inv, []), start=1):
        src = os.path.join(DRAFTS, "figures", "jpo", stem + ".gif")
        if os.path.exists(src):
            with open(src, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
            img = f'<img src="data:image/gif;base64,{b64}" alt="fig{i}">'
        else:
            img = f'<p style="color:#b00">[欠落] {stem}.gif が未生成（figures/convert_to_jpo.py を実行）</p>'
        rows.append(f'<figure><figcaption>図{i}（{stem}）</figcaption>{img}</figure>')
    css = ("body{font-family:sans-serif;max-width:60em;margin:2em auto;}"
           "figure{margin:1.5em 0;border-top:1px solid #ccc;padding-top:1em;}"
           "figcaption{font-weight:bold;margin-bottom:.5em;}"
           "img{max-width:100%;border:1px solid #000;}")
    note = ("<p style=\"color:#555\">※ これは<b>レビュー用プレビュー</b>です（図を埋め込み）。"
            "電子出願ソフトには <code>図面.html</code>（別ファイル参照版）＋同梱GIFを取り込んでください。</p>")
    return (f'<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n'
            f'<title>図面プレビュー（発明{inv}）</title>\n<style>{css}</style>\n</head>\n<body>\n'
            f'<h1>図面プレビュー（発明{inv}）</h1>\n{note}\n' + "\n".join(rows) + '\n</body>\n</html>\n')

def process(md_path: str, inv: str):
    with open(md_path, encoding="utf-8") as f:
        text = f.read()
    # mermaid フェンス除去
    text = re.sub(r"```mermaid.*?```", "", text, flags=re.S)
    text = re.sub(r"```text.*?```", "", text, flags=re.S)
    lines = text.splitlines()
    # 書類セクションに分割
    docs, cur, name = {}, [], None
    for ln in lines:
        m = re.match(r"^##\s*【書類名】(.+?)\s*$", ln)
        if m:
            if name:
                docs[name] = cur
            name, cur = m.group(1).strip(), []
            continue
        if name:
            if ln.strip() == "---":
                continue
            cur.append(ln)
    if name:
        docs[name] = cur

    outdir = os.path.join(OUT, inv)
    os.makedirs(outdir, exist_ok=True)
    # 図GIFをパッケージ同梱（同階層参照のため）
    for stem in FIGS.get(inv, []):
        src = os.path.join(DRAFTS, "figures", "jpo", stem + ".gif")
        if os.path.exists(src):
            shutil.copy(src, os.path.join(outdir, stem + ".gif"))
    fname = {"明細書": "明細書.html", "特許請求の範囲": "特許請求の範囲.html",
             "要約書": "要約書.html", "図面": "図面.html"}
    made = []
    for dn, dl in docs.items():
        if dn == "図面":
            body = conv_figures(inv)
        else:
            body = conv_text_doc(dn, dl)
        path = os.path.join(outdir, fname.get(dn, dn + ".html"))
        with open(path, "w", encoding="utf-8") as f:
            f.write(html_wrap(dn, body))
        made.append(os.path.relpath(path, HERE))
    # 図面doc が md に無い場合も生成
    if "図面" not in docs:
        path = os.path.join(outdir, "図面.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(html_wrap("図面", conv_figures(inv)))
        made.append(os.path.relpath(path, HERE))
    # レビュー用：図を埋め込んだ自己完結プレビュー（単体で開いても図が表示される）
    ppath = os.path.join(outdir, "図面-プレビュー.html")
    with open(ppath, "w", encoding="utf-8") as f:
        f.write(figures_preview_html(inv))
    made.append(os.path.relpath(ppath, HERE))
    return made

def main():
    mapping = {
        "明細書-06-zkp選択的開示.md": "06",
        "明細書-07-確定ゲート.md": "07",
        "明細書-01-メタアンカー.md": "01",
    }
    for md, inv in mapping.items():
        p = os.path.join(DRAFTS, md)
        if os.path.exists(p):
            made = process(p, inv)
            print(f"[{inv}] {md} ->")
            for m in made:
                print("   ", m)
    print("done. ⚠️ 自動変換の下書き。目視確認＋電子出願ソフトの文書チェックを通すこと。")

if __name__ == "__main__":
    main()
