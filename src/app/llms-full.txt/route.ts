import { siteConfig } from "@/lib/marketing/config";
import { PLANS } from "@/lib/marketing/pricing";

function buildBody(): string {
  const s = siteConfig;
  const plans = Object.values(PLANS)
    .map((p) => `  - ${p.name}: ${p.price}${p.unit}（${p.certLimit}）`)
    .join("\n");

  const featureLines = s.featureList.map((f) => `  - ${f}`).join("\n");

  return `# ${s.siteName}（${s.siteNameAlt}）

> ${s.siteTagline}

${s.siteDescription}

運営: 株式会社HOLY
URL: ${s.siteUrl}
問い合わせ: ${s.contactEmail}

## 対象ユーザー

- 自動車整備工場
- 鈑金塗装工場
- コーティング・PPF施工店
- 保険会社（損保）
- 代理店・ディーラー

## 主な機能

${featureLines}

## 料金プラン

${plans}

年払いで20%割引。先着100店舗は初期費用0円+月額1万円引き（スタンダード・プロ）。

## 機能詳細ページ

- [施工証明書](${s.siteUrl}/features/digital-certificate)
- [ブロックチェーン・アンカリング](${s.siteUrl}/features/blockchain-anchoring)
- [電子署名](${s.siteUrl}/features/digital-signature)
- [顧客ポータル](${s.siteUrl}/features/customer-portal)
- [保険会社ポータル](${s.siteUrl}/features/insurer-portal)
- [顧客360](${s.siteUrl}/features/customer-360)
- [施工タイムライン](${s.siteUrl}/features/timeline)
- [作業ワークフロー](${s.siteUrl}/features/job-workflow)
- [車検証OCR](${s.siteUrl}/features/vehicle-ocr)
- [NFCタグ](${s.siteUrl}/features/nfc)
- [膜厚レポート](${s.siteUrl}/features/thickness)
- [会計連携](${s.siteUrl}/features/accounting)
- [在庫管理](${s.siteUrl}/features/inventory)
- [アカデミー](${s.siteUrl}/features/academy)

## コンテンツ

- [ブログ](${s.siteUrl}/blog)
- [お知らせ](${s.siteUrl}/news)
- [事例](${s.siteUrl}/cases)
- [用語集](${s.siteUrl}/glossary)
- [創業ストーリー](${s.siteUrl}/story)
- [未来予想図（2030ビジョン）](${s.siteUrl}/vision)
- [正直な比較](${s.siteUrl}/honest-comparison)
- [透明性ダッシュボード](${s.siteUrl}/financial-transparency)

## キーワード

${s.keywords.join(", ")}
`;
}

export function GET() {
  return new Response(buildBody(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
