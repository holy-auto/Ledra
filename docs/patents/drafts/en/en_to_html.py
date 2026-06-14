#!/usr/bin/env python3
"""
英文明細書 (spec-06/07/01.en.md) -> PCT/外国出願向け HTML へ変換。

各発明について out-en/<inv>/ に description.html / claims.html / abstract.html / drawings.html
を生成し、図GIF（figures/jpo/*.gif）を同梱（FIG.1..N）。

⚠️ Western(PCT)書式の読みやすいHTML。各国/PCTの正式様式・段落番号方式・クレーム形式は
   各国代理人/WIPO規則で要確認。JPの【書類名】形式とは別物。

使い方:  python3 en_to_html.py
"""
import os, re, glob, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
DRAFTS = os.path.dirname(HERE)
FIGDIR = os.path.join(DRAFTS, "figures", "jpo")
OUT = os.path.join(HERE, "out-en")

FIGS = {
    "06": ["06-fig1-system", "06-fig2-genflow", "06-fig3-tree", "06-fig4-verify", "06-fig5-nonce"],
    "07": ["07-fig1-system", "07-fig2-gate", "07-fig3-provenance", "07-fig4-immutable", "07-fig5-serial"],
    "01": ["01-fig1-system", "01-fig2-flow", "01-fig3-digest", "01-fig4-verify"],
}
CSS = ("body{font-family:'Times New Roman',serif;max-width:46em;margin:2em auto;line-height:1.6;}"
       "h1{font-size:1.3em;} h2{font-size:1.1em;border-bottom:1px solid #ccc;padding-bottom:2px;}"
       "h3,h4{font-size:1em;} p{margin:.5em 0;} .pn{color:#444;} .claim{margin:.6em 0;}"
       "img{max-width:100%;border:1px solid #000;} figure{margin:1.5em 0;}")

def inline(s: str) -> str:
    s = s.strip()
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s

def para(line: str) -> str:
    m = re.match(r"^\[(\d{4})\]\s*(.*)$", line)
    if m:
        return f'<p><span class="pn">[{m.group(1)}]</span> {inline(m.group(2))}</p>'
    return f"<p>{inline(line)}</p>"

def wrap(title: str, body: str) -> str:
    return ("<!DOCTYPE html>\n<!-- en_to_html.py 生成・PCT向け下書き。各国様式は要確認 -->\n"
            f'<html lang="en"><head><meta charset="UTF-8"><title>{title}</title>'
            f"<style>{CSS}</style></head>\n<body>\n{body}</body></html>\n")

def render_block(lines, h_base=2):
    out = []
    for raw in lines:
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith(">") or line.strip() == "---":
            continue
        m = re.match(r"^(#{2,5})\s+(.*)$", line)
        if m:
            lvl = min(6, h_base + (len(m.group(1)) - 2))
            out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            continue
        out.append(para(line))
    return "\n".join(out)

def render_claims(lines):
    out, buf = [], []
    def flush():
        if buf:
            out.append(f'<p class="claim">{inline(" ".join(buf))}</p>')
            buf.clear()
    for raw in lines:
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith(">") or line.strip() == "---":
            continue
        if re.match(r"^\*\*\d+\.\*\*", line):   # 新しいクレーム
            flush()
            buf.append(line)
        else:
            buf.append(line)
    flush()
    return "\n".join(out)

def drawings(inv):
    figs = FIGS.get(inv, [])
    parts = ["<h2>Drawings</h2>"]
    for i, stem in enumerate(figs, 1):
        parts.append(f'<figure><figcaption>FIG. {i}</figcaption>'
                     f'<img src="{stem}.gif" alt="FIG. {i}"></figure>')
    return "\n".join(parts)

def process(md, inv):
    text = open(md, encoding="utf-8").read()
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    lines = text.splitlines()
    # セクション分割（## 見出し単位）
    secs, cur, name = [], [], None
    for ln in lines:
        m = re.match(r"^##\s+(.*)$", ln)
        if m and not ln.startswith("###"):
            if name is not None:
                secs.append((name, cur))
            name, cur = m.group(1).strip(), []
        elif name is not None:
            cur.append(ln)
    if name is not None:
        secs.append((name, cur))

    desc, claims, abstract, title = [], None, None, ""
    for nm, body in secs:
        low = nm.lower()
        if low == "claims":
            claims = body
        elif low == "abstract":
            abstract = body
        elif low.startswith("title of the invention"):
            for b in body:
                if b.strip():
                    title = inline(b)
                    break
            desc.append(("## " + nm, body))
        else:
            desc.append(("## " + nm, body))

    outdir = os.path.join(OUT, inv)
    os.makedirs(outdir, exist_ok=True)
    for stem in FIGS.get(inv, []):
        src = os.path.join(FIGDIR, stem + ".gif")
        if os.path.exists(src):
            shutil.copy(src, os.path.join(outdir, stem + ".gif"))

    # description.html
    dbody = [f"<h1>{title}</h1>"] if title else []
    for hd, body in desc:
        dbody.append(render_block([hd] + body))
    open(os.path.join(outdir, "description.html"), "w", encoding="utf-8").write(
        wrap("Description", "\n".join(dbody)))
    # claims.html
    if claims is not None:
        open(os.path.join(outdir, "claims.html"), "w", encoding="utf-8").write(
            wrap("Claims", "<h2>Claims</h2>\n" + render_claims(claims)))
    # abstract.html
    if abstract is not None:
        open(os.path.join(outdir, "abstract.html"), "w", encoding="utf-8").write(
            wrap("Abstract", "<h2>Abstract</h2>\n" + render_block(abstract)))
    # drawings.html
    open(os.path.join(outdir, "drawings.html"), "w", encoding="utf-8").write(
        wrap("Drawings", drawings(inv)))
    print(f"[{inv}] -> out-en/{inv}/ (description/claims/abstract/drawings + {len(FIGS.get(inv,[]))} GIF)")

def main():
    mp = {"spec-06-zkp.en.md": "06", "spec-07-gate.en.md": "07", "spec-01-meta-anchor.en.md": "01"}
    for md, inv in mp.items():
        p = os.path.join(HERE, md)
        if os.path.exists(p):
            process(p, inv)
    print("done. ⚠️ PCT向け下書き。各国/PCTの正式様式・クレーム形式は代理人/WIPO規則で要確認。")

if __name__ == "__main__":
    main()
