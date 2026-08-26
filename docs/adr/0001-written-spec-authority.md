# ADR-0001: 文章仕様がモックアップに優先する

- Status: Accepted(2026-08-19, IMP-001)

## 背景

`Ledra UI/UX & Development Specification v2.0` には画像生成モックアップが添付されるが、
モックアップにはラベルやフローの表現差・誤記が含まれ得る。仕様書自身が
「本書の文章仕様を実装上の正とする」と宣言している(v2.0 冒頭 Document authority)。

## 決定

1. 実装上の正は常に v2.0 の**文章仕様**。画像モックアップは参考情報であり、
   状態・権限・証跡・支払い・証明書・アクセシビリティ・ローカライズの規則を
   上書きしない。
2. モックアップと文章仕様が矛盾する場合、文章仕様に従い、必要なら
   `docs/implementation/requirement-trace.md` に差分を記録する。
3. 仕様にない画面・状態を追加する場合は、v2.0 の State Machine / Design System /
   Permission model / Event model との整合を確認してから追加する(v2.0 末尾
   Document completion rule)。

## 影響

- 「モックにあるから」はレビューで実装根拠として認めない。
- 例: 生体認証の「任意」表記のモックは不採用(v2.0 §15.1 は内部スタッフ原則必須)。
