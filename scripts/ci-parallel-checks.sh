#!/usr/bin/env bash
# CI の「Lint, Type Check & Unit Tests」が走らせる検査を、まとめて並列に走らせる。
# 実行: bash scripts/ci-parallel-checks.sh
#
# ## なぜ要るか
#
# **1. 失敗元がログから読み取れなかった。**
# 元の形は `cmd & PID=$!` を並べて `wait $PID || exit 1` で待つものだった。
# 6本の出力が行単位で混ざるうえ、**ログの末尾は失敗したチェックの出力とは限らない**。
# 2026-09-01 に実際に2回誤読しかけた（「lint の出力の直後に exit 1」と出るのに
# `npm run lint` 自体は 0 errors で、失敗元は別のチェックだった）。
# 生ログの配信元（Azure Blob）はこの環境のプロキシで遮断されており、GitHub の API も
# 末尾しか返さないため、切り分けにローカル再現が必要になっていた。
#
# 対策は3つとも「末尾を見れば分かる」に寄せてある。
#   - 出力をチェックごとの一時ファイルに分け、終わってから `::group::` で1本ずつ出す
#     （GitHub の UI で折りたためる＝どの出力がどのチェックのものか一目で分かる）
#   - 結果の表を最後に出す
#   - **失敗したチェックの出力だけを、いちばん最後にもう一度出す**
#     （API が末尾しか返さなくても、そこに失敗元が写る）
#
# 実測（2026-09-04、run 33877126257）: このステップの出力のあとに続く
# post-job cleanup は約28行。`get_job_logs` の `tail_lines` を 75 程度にすれば
# 結果の表まで確実に届く。失敗時はその手前に失敗元の出力が入る。
#
# **2. CI が何を走らせるかを、手元から1コマンドで再現できるようにする。**
# 「マイグレーションを検証した」と言って隣のスクリプトを走らせていたことがある
# （MISTAKE_LEDGER M-018）。CI と手元が**この配列1つ**を見ていれば、代用が起きない。
#
# 速度は落とさない（並列のまま）。
#
# ponytail: 上限。並列数は固定（配列の要素数ぶん同時に起動する）。
# チェックが増えて runner のメモリが足りなくなったら、ここにジョブ分割か
# 同時実行数の制限を入れる。今は6本で問題ない。
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# 表示名と実行コマンド。**CI はこの1箇所だけを見る。**
NAMES=(lint lint:migrations tsc test:coverage check:schema check:context-dates)
CMDS=(
  "npm run lint"
  "npm run lint:migrations"
  # Supabase のクエリ文字列は tsc も lint も中身を見ない。実スキーマの
  # スナップショットと突き合わせて、存在しない列・テーブルで落とす
  "npx tsc --noEmit"
  "npm run test:coverage"
  "npm run check:schema"
  # 事業ログ (docs/context/) の見出し日付が未来を指していないか。
  # 2026-09-03 に2日先の日付を4ファイルに書いた (MISTAKE_LEDGER M-011)。
  # DECISION_LOG の日付はその記録自体が唯一の出典で、誤ると検証手段が無い
  "npm run check:context-dates"
)

LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

PIDS=()
for i in "${!NAMES[@]}"; do
  bash -c "${CMDS[$i]}" >"$LOG_DIR/$i.log" 2>&1 &
  PIDS+=("$!")
done

STATUS=()
FAILED=()
for i in "${!NAMES[@]}"; do
  if wait "${PIDS[$i]}"; then
    STATUS+=("ok")
  else
    STATUS+=("FAILED")
    FAILED+=("${NAMES[$i]}")
  fi
done

# 出力は成功したものも含めて全部残す（混ざらない形で）。
# 元の形でも全部出ていたので、ここで捨てると検査の情報量が落ちる。
for i in "${!NAMES[@]}"; do
  printf '::group::%s [%s]\n' "${NAMES[$i]}" "${STATUS[$i]}"
  cat "$LOG_DIR/$i.log"
  printf '::endgroup::\n'
done

printf '\n=== 結果 ===\n'
for i in "${!NAMES[@]}"; do
  printf '  %-22s %s\n' "${NAMES[$i]}" "${STATUS[$i]}"
done

if ((${#FAILED[@]})); then
  printf '\n::error::失敗したチェック: %s\n' "${FAILED[*]}"
  # 末尾しか読めない環境のために、失敗したものだけをもう一度いちばん最後に出す。
  for i in "${!NAMES[@]}"; do
    [[ ${STATUS[$i]} == FAILED ]] || continue
    printf '\n----- %s の出力（末尾200行） -----\n' "${NAMES[$i]}"
    tail -n 200 "$LOG_DIR/$i.log"
  done
  exit 1
fi

printf '\nすべて通過しました。\n'
