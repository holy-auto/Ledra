import { siteConfig } from "@/lib/marketing/config";

const body = `# ${siteConfig.siteName}

> ${siteConfig.siteTagline}

${siteConfig.siteDescription}

## Links

- [機能一覧](${siteConfig.siteUrl}/features)
- [料金プラン](${siteConfig.siteUrl}/pricing)
- [施工店の方へ](${siteConfig.siteUrl}/for-shops)
- [保険会社の方へ](${siteConfig.siteUrl}/for-insurers)
- [代理店の方へ](${siteConfig.siteUrl}/for-agents)
- [FAQ](${siteConfig.siteUrl}/faq)
- [用語集](${siteConfig.siteUrl}/glossary)
- [ブログ](${siteConfig.siteUrl}/blog)
- [お知らせ](${siteConfig.siteUrl}/news)
- [事例](${siteConfig.siteUrl}/cases)
- [お問い合わせ](${siteConfig.siteUrl}/contact)
- [詳細版: llms-full.txt](${siteConfig.siteUrl}/llms-full.txt)
`;

export function GET() {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
