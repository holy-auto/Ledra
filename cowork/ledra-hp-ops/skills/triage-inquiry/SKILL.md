---
name: triage-inquiry
description: >
  Triage inbound contact-form inquiries for Ledra and prepare first-reply DRAFTS
  for human review. Use when the user asks to "問い合わせを仕分けて",
  "問い合わせに返信案を作って", "お問い合わせを対応して", "コンタクトを振り分けて",
  or wants help responding to messages from the Ledra contact form. Inquiries arrive by
  email to info@ledra.co.jp (via Resend) and as Slack notifications. This skill
  classifies, routes, and writes a reply DRAFT in Gmail — it never sends email.
---

Ledra の問い合わせを**仕分け**し、**一次返信の下書き**を用意するスキルです。
**メールは送信しません**（Gmail の下書きまで）。社外への自動送信・自動投稿は一切しない。

## 問い合わせの届き方（前提）

- フォーム `src/app/api/contact/route.ts` が送信を受け、**`info@ledra.co.jp`**（`CONTACT_TO_EMAIL`）にメール送信＋**Slack 通知**する。
- メール件名: `[Ledra] お問い合わせ: <種別>（<お名前>）`
- 本文に含まれる項目: お名前 / メール / 会社名(任意) / 種別(category) / お問い合わせ内容。
- フォームは経路が分かれている（`/contact/shops`・`/contact/insurers`・`/contact/agents`・一般 `/contact`）。**種別(category) が一次の振り分け根拠**。

## 手順

1. **対象を集める**: Gmail で未対応の問い合わせ（`info@ledra.co.jp` 宛、件名 `[Ledra] お問い合わせ:`）を取得。Slack 通知から拾ってもよい。処理済みは `cowork/triaged` ラベルで除外。
2. **分類する**: 種別(category) ＋本文から、読者セグメントと用件を判定（`references/routing-and-templates.md` の分類表）。
   - セグメント例: 施工店 / 保険会社(損保) / 代理店 / BtoB発注 / 採用 / 取材・メディア / 営業(売り込み) / その他。
   - 緊急度・脈の強さ（具体的な導入検討 vs 一般質問）も見立てる。
3. **担当へのルーティング**を決める（`references/routing-and-templates.md` ＋ `docs/brand-contacts.md` を参照）。誰に渡すべきかを下書き/要約に明記。
4. **一次返信の下書きを作る**（Gmail drafts）:
   - 該当セグメントのテンプレ（`references/routing-and-templates.md`）をベースに、相手の用件に合わせて調整。
   - 宛名・差出（Ledra）・次アクション（日程候補/資料/担当者名）を入れる。**確約や見積金額は書かない**（人が判断）。
   - 不明点があれば「下書き内に <要確認> として残す」。勝手に埋めない。
5. **報告**: 「○件を分類、内訳と各下書きリンク、人に確認してほしい点」を簡潔にまとめる。**送信は人**。

## 分類・返信の原則

- **送信しない / 自動で約束しない**：金額・納期・契約条件・法的見解は下書きに書かず、人へエスカレーション。
- **個人情報の取り扱い**：問い合わせ本文・氏名・連絡先を、記事や公開物・社外チャンネルに出さない。社内共有に留める。
- **営業メール/スパム**は「営業」に分類し、返信下書きは作らない（人が判断）。
- **取材・行政・大口/損保からの重要問い合わせ**は最優先フラグを立て、要約を添えて担当へ。
- 返信トーンは丁寧・簡潔・誠実（過剰な営業色を出さない）。

## やってはいけないこと

- メール送信、顧客への自動 Slack 返信、SNS 返信。
- 問い合わせ内容を公開物・社外へ転記する。
- 価格/契約/法務の確約を下書きに書く（必ず <要確認> として人へ）。
