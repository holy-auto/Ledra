// C-M1 是正 (2026-09-08) / ユーザー決定事項: /c/[public_id]（公開証明書ページ）は
// 検索エンジン・AI クローラに索引させない。ルートレイアウトの既定を非索引に
// 反転した (src/app/layout.tsx) が、このページは実店舗の顧客に直接共有・
// 転送される最も露出しやすい公開面のため、ここでも明示して二重に固定する。
export const metadata = {
  robots: { index: false, follow: false },
};

export default function CLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-base p-4 text-primary">{children}</main>;
}
