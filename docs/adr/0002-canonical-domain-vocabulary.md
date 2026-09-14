# ADR-0002: 正準ドメイン語彙と「アドホック状態の禁止」

- Status: Accepted(2026-08-19, IMP-001)

## 背景

v2.0 は6つの独立した状態軸(JobState 12値 / StepState 8値 / Severity 5値 /
CertificateState 8値 / PaymentState 9値 / SyncState 5値)を定義する(§19, Appendix A)。
一方、稼働中の実装は別語彙(`reservations.status` 5値、`certificates.status` 4値、
`payments.status` 4値など、すべて text + CHECK)で動いている
(対応表: `docs/implementation/requirement-trace.md` §1)。

## 決定

1. v2.0 の正準語彙は `src/lib/domain/states.ts` を単一の定義源とする。
   ロケール別 UI ラベルは `src/lib/domain/labels.ts` に置き、
   **ドメインコードを変えずに翻訳を差し替えられる**構造にする。
2. **アドホック状態の禁止**: 新しいステータス文字列・状態軸・遷移を追加する変更は、
   `src/lib/domain/` の正準モジュールと `src/lib/domain/__tests__/` を同一 PR で
   更新しない限りマージしない(レビュールール。リポジトリ CLAUDE.md にも記載)。
3. 軸を混ぜない: 1つのカラム・1つの型に複数軸の値を混在させない
   (例: 支払い状態を JobState に足さない)。
4. **既存語彙の即時置き換えはしない**。稼働中の語彙は当面そのまま動かし、
   正準語彙への統一の要否・範囲(DB の CHECK まで揃えるか、TS 層マッピングで
   吸収するか)は状態機械を導入する IMP-015 で判断する。
5. 既存値→正準値のコード上のマッピングは**意図的に持たない**。対応が「部分/別方式」の
   軸(例: `completed` と VERIFIED は同義ではない)で誤った同一視を焼き込まないため。
   必要になった時点(IMP-015)で、遷移の意味論と合わせて導入する。
6. `PaymentState.UNKNOWN` は「結果不明」であり失敗ではない。UNKNOWN の間は
   再決済を発火させない(v2.0 §11.2-11.3)。この意味論の変更、および正準の状態軸・
   権限動詞の追加は、実装判断ではなくプロダクト判断であり、代表の明示的な承認なしに
   行わない。

## 影響

- 後続タスクは状態を型 `JobState` 等で受け、文字列リテラルの直書きをしない。
- UI 文言の変更は labels.ts の変更だけで完結する(コード・DB・イベント名に波及しない)。
- 収録ロケールは当面 ja/en。6言語化・翻訳キー化は IMP-011(labels.ts の
  ponytail コメント参照)。
