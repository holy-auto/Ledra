---
marp: true
paginate: true
size: 16:9
theme: default
class: invert
style: |
  section {
    background: #060a12;
    color: #f8fafc;
    font-family: 'Noto Sans JP', 'Hiragino Sans', 'Inter', sans-serif;
    padding: 60px 80px;
  }
  h1 {
    color: #0071e3;
    font-size: 48px;
    margin-bottom: 16px;
    border-bottom: 2px solid #0071e3;
    padding-bottom: 8px;
  }
  h2 {
    color: #94a3b8;
    font-size: 28px;
    margin-bottom: 24px;
    font-weight: 400;
  }
  h3 {
    color: #f59e0b;
    font-size: 22px;
  }
  strong { color: #f59e0b; }
  table {
    margin: 16px auto;
    font-size: 20px;
    border-collapse: collapse;
  }
  th { background: #0071e3; color: #fff; padding: 8px 12px; }
  td { padding: 8px 12px; border-bottom: 1px solid #1e293b; }
  ul, ol { font-size: 24px; line-height: 1.5; }
  li { margin-bottom: 8px; }
  blockquote {
    border-left: 4px solid #f59e0b;
    color: #cbd5e1;
    padding-left: 16px;
    font-size: 22px;
    font-style: italic;
  }
  code {
    background: #1e293b;
    color: #f59e0b;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 18px;
  }
  pre { background: #0f172a; font-size: 16px; }
  section.lead {
    justify-content: center;
    text-align: center;
  }
  section.lead h1 {
    font-size: 80px;
    border: none;
    color: #f8fafc;
  }
  section.lead h2 {
    color: #0071e3;
    font-size: 32px;
  }
  footer {
    color: #475569;
    font-size: 14px;
  }
  header {
    color: #475569;
    font-size: 14px;
  }
header: 'Ledra · 株式会社HOLY'
footer: '© 2026 株式会社HOLY'
---

<!--
==============================================================================
Ledra ピッチデック (汎用版 / VC 共通)
==============================================================================

このファイルは全 VC 共通の汎用ピッチデック・テンプレート (15 枚)。
HAKOBUNE のような固有 VC 向けに使う場合は、`pitch-deck-hakobune.md` のように
fork してから提出先別にカスタマイズすること。

▼ 編集ガイド
- `<XX>` `<◯◯>` `<提出先名>` のプレースホルダは経営判断で確定値に置換
- ブランドカラー: 背景 #060a12 / アクセント #0071e3 / セカンダリ #f59e0b
- フォント: Noto Sans JP (本文) / Inter (英数)
- 画像/グラフは Speaker Note 部分の指示に従ってデザイナーが追加

▼ プレビュー / 書き出し
- VS Code: Marp for VS Code 拡張で右上「Open Preview to the Side」
- CLI:
    npx @marp-team/marp-cli pitch-deck-master.md            (HTML)
    npx @marp-team/marp-cli pitch-deck-master.md --pptx     (PowerPoint)
    npx @marp-team/marp-cli pitch-deck-master.md --pdf      (PDF)

▼ 派生バージョンを作る時のフォーク手順
1. cp pitch-deck-master.md pitch-deck-<vcname>.md
2. 表紙 (slide 1) と最終スライドの "<提出先名>" を埋める
3. 該当 VC の投資テーゼに合わせてスライド #5 (Why Now) / #11 (GTM) /
   #14 (ロードマップ) / #15 (調達) を 1-3 ヶ所だけ手調整
4. (任意) スライドを追加・削除する場合は --- 区切りを編集

▼ 参考資料
- 構成根拠: docs/internal/vc-pitch-outline.md
- 提出パッケージ: docs/internal/vc-submission.md (ALL STAR SAAS 版)
                docs/internal/csp-fund-inquiry.md (CSP 版)
                docs/internal/theta-times-ventures-inquiry.md (Theta Times 版)
                docs/internal/hakobune-inquiry.md (HAKOBUNE 版)
- 数字根拠: docs/ledra-goals-strategy-2026-05.md
==============================================================================
-->

<!-- _class: lead -->

# Ledra

## 車の施工を、デジタルで証明する。

施工店 SaaS × 施工証明書ネットワーク

---

株式会社HOLY · 2026-05  
`<提出先名>` ご提案資料

<!--
[Speaker Note]
- 第一印象でブランドを握る
- 提出先名を埋めて提出文脈を握る
[Design]
- Ledra ロゴ (public/og/ledra-logo*.png) を中央上
- 背景に detailing_holy の施工写真を 20% 透過で重ねる
-->

---

# チーム

## 施工店オーナー出身の Founder が現場の痛みを起点に開発

**堀越 友輔** — 株式会社HOLY 代表取締役 / Founder & CEO
- 自動車ディテイリング店 **`detailing_holy`** を運営
- 「証明書が紙で残らない・後から検証できない」課題から Ledra を自社開発 → 外販
- プロダクト企画 / 開発 / 施工店オンボーディング / 損保折衝まで内製

**プロダクト・エンジニアリング** / **営業・CS** — `<氏名 / 採用予定>`

<!--
[Speaker Note]
- Founder の現場一次情報を強調
- 採用予定の役職は明示することで透明性 (盛らない)
[Design]
- 堀越の顔写真 + detailing_holy の店舗・施工写真3枚
-->

---

# 業界課題①  施工店の業務分散

## 紙・LINE・Excel で回り続けるレガシー垂直産業

- 1 件あたりの書類対応時間: **`<X>` 時間/月**
- 二重入力の発生回数: **`<Y>` 回/月**
- 顧客の **`<Z>` %** が自分の車の施工内容を覚えていない

> 真面目に施工する事業者ほど書類で消耗する

<!--
[Speaker Note]
- 課題の深さを数字で見せる
- <X>/<Y>/<Z> は実数で埋めてから提出
[Design]
- 紙の施工記録 / LINE スクショ / Excel 台帳 の写真を3枚並べる
-->

---

# 業界課題②  検証不能な施工事実

## 保険会社・中古車流通の "誰が・いつ・何を" が消える

- **保険会社**: 車両保険の不正コーティング請求 推定 `<億円規模>`
- **中古車流通**: 査定時の施工履歴ブレ、価格差 `<%>`
- **顧客**: 自分の車の施工内容を後から確認する手段が無い

施工事実が **業界横断で検証不能** = 信頼の取引コストが市場全体に乗っている

<!--
[Speaker Note]
- 流通レイヤの空白を提示
[Design]
- 施工店 → 保険会社 / 中古車市場 のフロー図 + 情報非対称
-->

---

# Why Now

## 車の履歴がデジタル化される、10 年に 1 度

| 軸 | 進行中の変化 |
|---|---|
| **制度** | SDV (Software Defined Vehicle) 化 / 車検 OBD 検査の電子化 |
| **保険** | 損保業界の不正請求対策強化 → 施工事実の検証ニーズが顕在化 |
| **中古車** | UCDA 等の透明性要請 → 査定根拠データの需要 |
| **技術** | Polygon (L2) のガス代低下で on-chain アンカリングが実用化 |

→ レガシー産業側 (施工店) から **履歴インフラ** に入る最後のタイミング

<!--
[Speaker Note]
- 4 軸同時進行 = 単独要因依存ではない強い Why Now
[Design]
- 4 軸を時系列タイムラインで描画
-->

---

# プロダクト概観

## 業務 SaaS と証明書ネットワークが地続きの 1 プロダクト

**4 ポータル + モバイルアプリ**

- **Admin** 施工店: 案件ワークスペース (予約→作業→証明書→請求→入金 を 1 画面に)
- **Agent** 代理店: 紹介・コミッション管理
- **Insurer** 保険会社: 検索・案件・分析
- **Customer** 顧客: 公開証明書ビュー (QR / URL)

**本番稼働済**: `400+` API · `130+` DB マイグレーション · `2,000+` テストケース  
iOS / Android アプリ + Stripe / Square / Polygon / CloudSign 連携

<!--
[Speaker Note]
- "業務 SaaS と証明書ネットワークが地続きの 1 プロダクト" がキーフレーズ
[Design]
- 4 ポータル図 + /admin/jobs/[id] 案件ワークスペースのスクショ
-->

---

# 施工証明書の差別化

## 発行して終わり、ではなく検証され続ける証明書

```
[施工完了]
   ↓ 写真 + 施工内容入力
[Ledra 証明書発行]
   ↓ 写真ハッシュ (SHA-256)
[Polygon アンカリング]
   ↓ 改ざん検知保証
[QR / URL で公開検証]
   ← 顧客・保険会社・中古車市場が参照
```

- **QR / 公開 URL** `/c/[public_id]` でブラウザから誰でも検証
- **Polygon on-chain アンカリング** で写真改ざんを検知
- **C2PA + NFC タグ連携** で物理車両 × デジタル証明書を結ぶ

<!--
[Speaker Note]
- 模倣困難性を技術で示す
[Design]
- 5 ステップを縦に流すフロー図
-->

---

# デモ

## 現場で動くプロダクト、業界横断で参照される証明書

**▶  5 分動画ダイジェスト**  https://ledra.co.jp/video

| シーン | 内容 |
|---|---|
| 1 | 施工店 Admin で証明書発行 (写真アップロード〜PDF 出力) |
| 2 | 顧客がスマホで QR から証明書を確認 |
| 3 | 保険会社 Insurer で車両検索 → 過去施工照会 |
| 4 | Polygon アンカリング検証 |

商談時にデモアカウントを発行可能 (insurer / agent)

<!--
[Speaker Note]
- 5 分動画をその場で 30 秒〜1 分流す
[Design]
- 動画 QR を左半分に大きく + 4 シーンスクショを右半分にタイル
-->

---

# ビジネスモデル

## サブスク + アドオン + 流通手数料 の 3 階建て

| 階層 | 24 ヶ月想定 ARR | 内訳 |
|---|---:|---|
| **店舗サブスク** | ¥6 億 | 1,400 店 × 平均 ARPU ¥35,000/月 (¥9,800〜¥49,800) |
| **保険会社 SaaS** | ¥3 億 | 3〜5 社 × ¥500 万〜¥1,000 万/月 |
| **流通手数料** | ¥1 億 | 中古車 / OEM の参照・データ提供フィー |
| **合計 ARR** | **¥10 億** | **24 ヶ月で達成** |

**アドオン**: ブランド証明書 ¥3,300〜 / 追加店舗 ¥4,980/店 / API 連携 / 導入伴走

<!--
[Speaker Note]
- 3 階建ての各層に根拠を明示 (docs/ledra-goals-strategy-2026-05.md)
[Design]
- 3 階建ての立体図 (店舗が基礎、保険が中層、流通が頂上)
-->

---

# 市場規模

## 整備 5.5 兆円市場の "履歴" レイヤを取りに行く

**TAM** 国内自動車整備 **5.5 兆円** (経産省 / 日整連)  
**SAM** コーティング・PPF・板金 + 整備全体 **約 9 万社**  
**ミクロ算定** 9 万社 × ARPU ¥35,000/月 ≒ **約 380 億**

**SOM (5 年) — 2 シナリオ提示**

| ケース | 加盟店舗数 | 合計 ARR | 取込みチャネル |
|---|---:|---:|---|
| **ベース** | 3,500 | **¥19 億** | 直販 + 代理店 + 損保 1-2 社 |
| **アップサイド** | **5,000** | **¥39 億** | + 損保指定工場必須化 + OEM 加盟店 + 海外 2 ヶ国 |

<!--
[Speaker Note]
- ミクロ算定で過大評価感を消し、SOM でベース/アップサイドの 2 シナリオ
- "誠実 + 野心" の両軸
[Design]
- TAM/SAM/SOM の同心円図 + ベース vs アップサイドの 2 本棒グラフ
-->

---

# GTM 戦略

## 業界の上流から圧力を作る

```
[直販]      detailing_holy ネットワーク + 業界イベント + LP
   ↓
[代理店]    Agent ポータル経由のパートナー獲得
   ↓
[流通プル]  損保会社 (Lighthouse 1 社集中)
            → 指定工場 ~500-1,000 店の自動取込み
            → OEM (Toyota Woven 等) 加盟店連携
            → 海外展開 (東南アジア・台湾)
```

- **Lighthouse 集中**: PoC 並走の罠を避け、**1 社の本番化に全資源投下**
- **業界の上流から圧力**: 「店舗を売る」のではなく「採用される構造」を作る

<!--
[Speaker Note]
- "1 社目に全部投下" のロジック
[Design]
- 3 段階の GTM ピラミッド + Lighthouse 集中を最上位
-->

---

# トラクション

## プロダクト本稼働 + 確度別パイプライン

**プロダクト稼働状態**  
4 ポータル + iOS/Android · `400+` API · `130+` migration · `2,000+` tests

**店舗数推移** (実績 6 ヶ月 → 計画 24 ヶ月 → 5 年)

`<二軸グラフを配置: 店舗数 (棒) + 合計 ARR (折れ線・ベース vs アップサイド)>`

**パイプライン (確度別)**

| 確度 | 案件 | フェーズ |
|---|---|---|
| 🟢 本番接続 | `<最新値>` 店 | 現在の課金収益 |
| 🟡 Lighthouse 候補 | **損保ジャパン** | PnP Japan Insurtech 経由で接点獲得中 |
| 🟠 PoC 仮説構築 | **Woven by Toyota** / 中古車流通 | NDA 前段階 |

<!--
[Speaker Note]
- 二軸グラフを主役にする
- 3 確度に分けて "PoC 並走の罠" を踏まないことを暗示
[Design]
- グラフはスライド中央 60% を占める大きさ
- パイプライン表は下部 30%
-->

---

# 競合マップ

## 業務 × 証明書 × 流通の "三重統合" は国内に存在しない

```
        業界横断ネットワーク
              ▲
              │
            Ledra ★
              │
紙の証明書    │    車整備 SaaS
              │  (Tekmetric 等)
              │
              ▼
        自前 PDF / Excel
←────────────────────────→
   業務 SaaS のみ      検証可能なデジタル証明書
```

**Ledra は業務 SaaS + デジタル証明書 + 流通レイヤの 3 つを統合する唯一の事業者**

<!--
[Speaker Note]
- 2 軸散布図でポジションを可視化
[Design]
- Ledra のマーカーは星型 + アクセントカラー
-->

---

# ロードマップ

## 24 ヶ月で履歴ネットワーク起動、5 年で取込みインフラに

| 期間 | マイルストーン |
|---|---|
| **M+6** | 保険会社 1 社 本番接続 |
| **M+12** | プレシリーズ A / 加盟 400 店 / 合計 ARR ¥2.3 億 |
| **M+24** | 加盟 1,400 店 / 合計 ARR ¥10 億 / OEM PoC 合意 |
| **M+60 (5 年)** | **ベース 3,500 店 ¥19 億 〜 アップサイド 5,000 店 ¥39 億** |

**5 年アップサイド成立条件** (このうち 2 つが動く前提)
1. 損保指定工場必須化 (+500〜1,000 店)
2. OEM 1 社加盟店連携 (+500〜2,000 店)
3. 海外 1〜2 ヶ国展開
4. 直販 + 代理店ベースで 3,500 店踏める CS/セールス組織

<!--
[Speaker Note]
- 5 年アップサイド = ベースと両建てで提示することで誠実 + 野心を担保
- 4 条件は最低 2 つでよい (リアル)
[Design]
- 横軸タイムライン (M+0 → M+60)
-->

---

# 調達希望

## シード 〜 プレシリーズ A

**ラウンド**   シード 〜 プレシリーズ A  
**希望調達額**   `<金額>` / バリュエーション `<目線>`  
**ラウンド構成**   リード: `<未定 / 候補>` / フォロワー: `<未定>`

**使途**
- 採用 `<%>`: BizDev / 施工店 CS / プロダクト EM
- 営業・GTM `<%>`: 保険会社本番接続加速 + 施工店獲得チャネル設計
- インフラ・プロダクト `<%>`: ISO27001 / SOC2 準備 / Polygon 本番運用

**想定 12 ヶ月後 KPI**
- 合計 ARR `<¥XX 億>` / 加盟店舗数 `<XX>` / 保険本番接続 1 社 + PoC 2-3 社

<!--
[Speaker Note]
- 提出先の投資ステージに応じてラウンド表記を調整
   - シード特化 VC → "シード (プレ A 視野)"
   - シード〜A 幅広 VC → "シード 〜 プレシリーズ A" (本文のまま)
   - 大型 VC → "プレシリーズ A 〜 シリーズ A"
[Design]
- 金額・使途・KPI をブロック分割で配置
-->

---

<!-- _class: lead -->

# ありがとうございました

## ご質問・お打ち合わせは下記まで

**株式会社HOLY** 代表取締役 堀越 友輔  
`<◯◯@ledra.co.jp>` · `<電話>`

🌐 https://ledra.co.jp  
🐦 https://x.com/detailing_holy  
🎬 https://ledra.co.jp/video

<!--
[Speaker Note]
- 連絡先を最後にもう一度
- デモ環境の即時発行も口頭で補足
[Design]
- 中央にロゴ + 連絡先 3 行
-->
