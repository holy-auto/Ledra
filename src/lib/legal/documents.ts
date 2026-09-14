import { siteConfig } from "@/lib/marketing/config";

import documents from "./documents.json";

/**
 * 法務文書（利用規約・プライバシーポリシー）の本文。
 *
 * 本文の正は documents.json。Web の (marketing)/terms・privacy と、
 * モバイルアプリ（apps/mobile/src/constants/legalDocuments.json）が同じ内容を読む。
 * 文面を 2 箇所に書くと片方だけ古くなり、法務文書ではそれが実害になる。
 *
 * モバイルは API 越しではなく **同梱** している。サーバーの新エンドポイントに
 * 依存させると、アプリと Web のリリース時期がずれた瞬間に表示できなくなるため。
 * 2 つの JSON がズレていないことは apps/mobile の自己チェックが検証する。
 */

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  /** 末尾の問い合わせ先。メールアドレスだけリンクにする */
  | { type: "contact"; before: string; email: string; after?: string };

export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  /** 最終更新日 */
  updated: string;
  blocks: LegalBlock[];
}

export const LEGAL_SLUGS = ["terms", "privacy"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export function isLegalSlug(v: string): v is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(v);
}

export function getLegalDocument(slug: LegalSlug): LegalDocument {
  const doc = (documents as LegalDocument[]).find((d) => d.slug === slug);
  if (!doc) throw new Error(`unknown legal document: ${slug}`);
  // 問い合わせ先だけは環境設定を優先する（JSON には既定値が入っている）
  return {
    ...doc,
    blocks: doc.blocks.map((b) => (b.type === "contact" ? { ...b, email: siteConfig.contactEmail } : b)),
  };
}
