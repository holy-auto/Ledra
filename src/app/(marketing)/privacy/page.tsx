import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/lib/marketing/config";
import { getLegalDocument, type LegalBlock } from "@/lib/legal/documents";

// 本文は src/lib/legal/documents.ts が単一定義源。
// モバイルアプリ（app/legal/[doc]）も同じ内容を /api/legal/privacy から読む。
const doc = getLegalDocument("privacy");

function Article({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24">
      <article className="prose prose-invert max-w-none">{children}</article>
    </div>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "h2") {
    return <h2 className="mb-3 mt-10 text-lg font-bold text-white">{block.text}</h2>;
  }
  if (block.type === "ul") {
    return (
      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-white">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "contact") {
    return (
      <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-white">
        {block.before}
        <a href={`mailto:${block.email}`} className="font-medium text-blue-400 hover:underline">
          {block.email}
        </a>
        {block.after}
      </p>
    );
  }
  return <p className="mb-4 text-sm leading-relaxed text-white">{block.text}</p>;
}

export default function PrivacyPage() {
  return (
    <Article>
      <h1 className="mb-2 text-3xl font-bold text-white">{doc.title}</h1>
      <p className="mb-10 text-sm text-white">最終更新日：{doc.updated}</p>
      {doc.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </Article>
  );
}

export const metadata: Metadata = {
  title: `プライバシーポリシー | ${siteConfig.siteName}`,
  description: "Ledraのプライバシーポリシーです。",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `プライバシーポリシー | ${siteConfig.siteName}`,
    description: "Ledraのプライバシーポリシーです。",
    url: `${siteConfig.siteUrl}/privacy`,
  },
  robots: { index: true, follow: false },
};
