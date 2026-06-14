#!/usr/bin/env python3
"""
明細書の段落番号 通し整合チェッカー。

- 和文明細書 drafts/明細書-*.md      … 【0001】【0002】… の連番
- 英文明細書 drafts/en/spec-*.en.md  … [0001][0002]… の連番

各ファイルについて、開始が0001か／連番に欠番・重複・順序逆転がないかを検査して報告する。
出願前のQA用。終了コードは異常があれば1。
"""
import os, re, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def numbers(text, pat):
    return [int(m.group(1)) for m in re.finditer(pat, text)]

def check(path, pat):
    nums = numbers(open(path, encoding="utf-8").read(), pat)
    name = os.path.relpath(path, HERE)
    if not nums:
        print(f"⚠️  {name}: 段落番号なし")
        return False
    issues = []
    if nums[0] != 1:
        issues.append(f"開始が[{nums[0]:04d}]（0001でない）")
    seen, dup = set(), set()
    for n in nums:
        if n in seen:
            dup.add(n)
        seen.add(n)
    if dup:
        issues.append("重複: " + ",".join(f"{d:04d}" for d in sorted(dup)))
    if nums != sorted(nums):
        issues.append("順序逆転あり")
    full = set(range(nums[0], nums[-1] + 1))
    gaps = sorted(full - set(nums))
    if gaps:
        issues.append("欠番: " + ",".join(f"{g:04d}" for g in gaps))
    if issues:
        print(f"❌ {name}: {len(nums)}件 [{nums[0]:04d}-{nums[-1]:04d}] / " + " ; ".join(issues))
        return False
    print(f"✅ {name}: {len(nums)}件 連番OK [{nums[0]:04d}-{nums[-1]:04d}]")
    return True

def main():
    ok = True
    for p in sorted(glob.glob(os.path.join(HERE, "明細書-*.md"))):
        ok &= check(p, r"【(\d{4})】")
    for p in sorted(glob.glob(os.path.join(HERE, "en", "spec-*.en.md"))):
        ok &= check(p, r"\[(\d{4})\]")
    print("---")
    print("結果: 全件連番OK" if ok else "結果: 要修正あり（上記❌）")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
