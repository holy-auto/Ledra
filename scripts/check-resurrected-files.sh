#!/usr/bin/env bash
# 削除済みファイルの「サイレント復活」検出。
#
# 背景（docs/context/DECISION_LOG.md 2026-08-29 参照）: 古いスタック PR を main へ
# マージすると、main 側で「追加してから削除」が完結しているファイルは、
# 3-way マージが衝突として検出せずそのまま復活することがある
# （#935・#936・#937 で計3回発生）。
#
# 過去2版の検出方法はどちらも不十分だった:
#   - merge-base 基準の削除一覧: 追加も削除も比較区間の中で完結したケースを
#     拾えない。
#   - `git log --diff-filter=D origin/main -- <file>` で main の履歴を辿る方法:
#     main が squash マージを使う場合、1本のスタック PR の中で完結した
#     「追加してから削除」は squash 後の main の履歴に一切残らないため、
#     やはり拾えない（#937 でこの版が実際に外れることを確認済み）。
#
# 今回の方法は main の履歴を一切見ない。「作業ツリーにあって origin/main の
# tip に無いファイル」のうち、「今回マージしているスタック PR 自身のコミットが
# 触っていないもの」だけを復活の疑いとして報告する。PR 自身が意図して追加した
# ファイルは ORIG_BASE..PR_TIP の diff に出るので誤検知しない。
#
# 使い方: 各スタック PR を main へマージし、コンフリクトを解決した直後・
# コミット前に実行する。
#   bash scripts/check-resurrected-files.sh <ORIG_BASE> <PR_TIP>
#   ORIG_BASE: このスタック PR の分岐元コミット（PR 自身の最初のコミットの親）
#   PR_TIP:    マージ前のこの PR ブランチの先頭コミット
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "使い方: bash scripts/check-resurrected-files.sh <ORIG_BASE> <PR_TIP>" >&2
  exit 2
fi
ORIG_BASE="$1"
PR_TIP="$2"

only_local=$(comm -23 <(git ls-files | sort) <(git ls-tree -r --name-only origin/main | sort) || true)

if [ -z "$only_local" ]; then
  echo "check-resurrected-files: OK（作業ツリー限定のファイルなし）"
  exit 0
fi

own_files=$(git diff --name-only "$ORIG_BASE" "$PR_TIP" || true)

found=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! grep -qxF "$f" <<< "$own_files"; then
    echo "⚠ 復活の疑い: $f （main に無く、この PR 自身のコミットも触っていない）"
    found=1
  fi
done <<< "$only_local"

if [ "$found" = "1" ]; then
  echo "check-resurrected-files: 復活ファイルあり。内容を確認し、不要なら git rm すること。"
  exit 1
fi

echo "check-resurrected-files: OK（作業ツリー限定のファイルは全てこの PR 自身が追加したもの）"
