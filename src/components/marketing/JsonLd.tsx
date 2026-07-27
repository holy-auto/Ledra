/**
 * JSON-LD structured data for marketing pages.
 * Renders a <script type="application/ld+json"> tag.
 *
 * These are async server components so they can read the per-request CSP
 * nonce (set by src/proxy.ts) and attach it to the inline script. Without
 * the nonce, the strict CSP would block the tag.
 */

import { headers } from "next/headers";
import { siteConfig } from "@/lib/marketing/config";

async function getNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}

export async function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.siteName,
    alternateName: siteConfig.siteNameAlt,
    description: siteConfig.siteDescription,
    url: siteConfig.siteUrl,
    inLanguage: "ja",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "自動車整備・コーティング店向け施工履歴プラットフォーム",
    operatingSystem: "Web",
    // AI検索(GEO)が「何ができるか」「誰向けか」を事実ベースで拾えるように付与。
    keywords: siteConfig.keywords.join(", "),
    featureList: siteConfig.featureList,
    audience: {
      "@type": "BusinessAudience",
      audienceType: "自動車整備・鈑金塗装・コーティング・PPF施工店",
    },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "JPY",
      lowPrice: "9800",
      highPrice: "49800",
      offerCount: "3",
    },
    provider: {
      "@type": "Organization",
      name: "Ledra",
      url: siteConfig.siteUrl,
      email: siteConfig.contactEmail,
    },
  };

  const nonce = await getNonce();
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export async function WebSiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.siteName,
    url: siteConfig.siteUrl,
    description: siteConfig.siteDescription,
    inLanguage: "ja",
  };

  const nonce = await getNonce();
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

type FaqItem = { question: string; answer: string };

export async function FAQJsonLd({ items }: { items: FaqItem[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  const nonce = await getNonce();
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

type PlanOffer = { name: string; price: string; description: string };

export async function PricingJsonLd({ plans }: { plans: PlanOffer[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.siteName,
    url: siteConfig.siteUrl,
    applicationCategory: "BusinessApplication",
    offers: plans.map(({ name, description, price }) => ({
      "@type": "Offer",
      name,
      description,
      price: price.replace(/[¥,]/g, ""),
      priceCurrency: "JPY",
    })),
  };

  const nonce = await getNonce();
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

type ArticleJsonLdInput = {
  title: string;
  description?: string;
  slug: string;
  publishedAt?: string;
  imageUrl?: string;
};

/**
 * NewsArticle structured data for /news/[slug] press releases.
 * Organization-level JSON-LD is already emitted site-wide by the marketing
 * layout, so this only adds the article entity. `image` is optional and
 * omitted when absent (JSON.stringify drops undefined) — the social card is
 * handled separately by the route's opengraph-image.
 */
export async function ArticleJsonLd({ title, description, slug, publishedAt, imageUrl }: ArticleJsonLdInput) {
  const url = `${siteConfig.siteUrl}/news/${slug}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description,
    datePublished: publishedAt,
    dateModified: publishedAt,
    inLanguage: "ja",
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: imageUrl ? [imageUrl] : undefined,
    author: { "@type": "Organization", name: siteConfig.siteName, url: siteConfig.siteUrl },
    publisher: {
      "@type": "Organization",
      name: siteConfig.siteName,
      url: siteConfig.siteUrl,
      logo: { "@type": "ImageObject", url: `${siteConfig.siteUrl}/apple-touch-icon.png` },
    },
  };

  const nonce = await getNonce();
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

type DefinedTermInput = { term: string; definition: string; slug: string };

/**
 * 用語集の個別ページ用 DefinedTerm 構造化データ。
 * 用語集全体を inDefinedTermSet で束ね、Google に「これは用語集の一項目」
 * であることを伝える。
 */
export async function DefinedTermJsonLd({ term, definition, slug }: DefinedTermInput) {
  const data = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: term,
    description: definition,
    url: `${siteConfig.siteUrl}/glossary/${slug}`,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Ledra 用語集",
      url: `${siteConfig.siteUrl}/glossary`,
    },
  };

  const nonce = await getNonce();
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

type BreadcrumbItem = { name: string; url: string };

export async function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(({ name, url }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${siteConfig.siteUrl}${url}`,
    })),
  };

  const nonce = await getNonce();
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
