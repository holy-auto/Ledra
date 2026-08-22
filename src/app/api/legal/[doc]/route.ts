import { NextResponse } from "next/server";

import { getLegalDocument, isLegalSlug } from "@/lib/legal/documents";

/**
 * 法務文書を JSON で返す公開エンドポイント。
 * モバイルアプリが規約・プライバシーポリシーをアプリ内で表示するために使う
 * （外部ブラウザに飛ばさない）。Web ページと同じ src/lib/legal/documents.ts を読む。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isLegalSlug(doc)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(getLegalDocument(doc), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
