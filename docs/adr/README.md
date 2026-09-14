# ADR(Architecture Decision Records)

v2.0 実装(IMP-001〜)で後続タスクが違反してはならないアーキテクチャ決定の記録。
各 ADR は「Status / 背景 / 決定 / 影響」の4部構成。決定を覆す場合は新しい ADR で
上書きし(Superseded)、既存 ADR は削除しない。

| #                                                | タイトル                                   | Status   |
| ------------------------------------------------ | ------------------------------------------ | -------- |
| [0001](./0001-written-spec-authority.md)         | 文章仕様がモックアップに優先する           | Accepted |
| [0002](./0002-canonical-domain-vocabulary.md)    | 正準ドメイン語彙と「アドホック状態の禁止」 | Accepted |
| [0003](./0003-immutable-append-only-evidence.md) | 証跡は不変・追記のみ                       | Accepted |
| [0004](./0004-versioned-corrections.md)          | 訂正は上書きではなく版の追加               | Accepted |
| [0005](./0005-backend-certificate-gate.md)       | Certificate Gate はバックエンド単一判定    | Accepted |
| [0006](./0006-vehicle-customer-separation.md)    | 車両 identity と顧客 PII の分離            | Accepted |

関連文書: [current-architecture.md](../implementation/current-architecture.md)(現状)/
[requirement-trace.md](../implementation/requirement-trace.md)(v2.0 要件との対応)
