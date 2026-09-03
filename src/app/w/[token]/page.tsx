import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { formatDate } from "@/lib/format";
import { getServiceTypeLabel } from "@/lib/certificates/serviceTypeLabel";
import { resolveStaffPortfolio } from "@/lib/staff/portfolioLink";

/**
 * 職人が自分の施工実績を確認するページ（読み取り専用・ログイン不要）。
 *
 * 外注職人はログインアカウントを持たない設計なので、テナントが発行したトークン付き
 * URL だけが本人の確認手段になる。失効条件（token / link.is_active /
 * staff_members.is_active）は resolveStaffPortfolio 側。
 *
 * 顧客 PII はここに出さない。リンクは退職後も手元に残りうるため、恒久的な顧客名簿に
 * しない。車両や施工内容は公開証明書 /c/[public_id] へ送る。
 */
export const dynamic = "force-dynamic";

// 個人に配る URL なので検索エンジンには載せない。
export const metadata: Metadata = {
  title: "施工実績 — Ledra",
  robots: { index: false, follow: false },
};

export default async function StaffPortfolioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portfolio = await resolveStaffPortfolio(token);
  // 無効・失効・存在しないトークンはすべて 404（理由を出し分けない）。
  if (!portfolio) notFound();

  return (
    <main className="mx-auto max-w-2xl p-6 font-sans">
      <div className="rounded-3xl border border-border-default bg-surface p-6 shadow-sm">
        <div className="text-sm font-semibold text-accent">Ledra</div>
        <h1 className="mt-2 text-2xl font-bold text-primary">{portfolio.staff_name} さんの施工実績</h1>
        <p className="mt-2 text-sm leading-6 text-secondary">
          {portfolio.shop_name} で記録された施工です。全 {portfolio.certificates.length} 件。
        </p>

        {portfolio.certificates.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border-default px-4 py-6 text-center text-sm text-muted">
            まだ施工証明が記録されていません。
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {portfolio.certificates.map((cert) => (
              <li key={cert.public_id}>
                <a
                  href={`/c/${cert.public_id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border-default px-4 py-3 text-sm hover:bg-surface-hover"
                >
                  <span className="font-medium text-primary">{getServiceTypeLabel(cert.service_type)}</span>
                  <span className="shrink-0 text-muted">{formatDate(cert.created_at)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 text-xs leading-6 text-muted">
          このページはお客様の情報を含みません。各施工の詳細は証明書を開いてご確認ください。
          <br />
          リンクは発行元の店舗がいつでも無効にできます。
        </div>
      </div>
    </main>
  );
}
