import Link from "next/link";
import { Container } from "./Container";
import { BreadcrumbJsonLd } from "./JsonLd";

export type Crumb = { name: string; url: string };

/**
 * 下層ページ用パンくず。視覚ナビゲーションと BreadcrumbList JSON-LD を
 * 1 コンポーネントで同時に出す（両者のズレを構造的に防ぐ）。
 * `items` に「ホーム」は含めない — ここで先頭に自動付与する。
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ name: "ホーム", url: "/" }, ...items];
  return (
    <>
      <BreadcrumbJsonLd items={all} />
      <nav aria-label="パンくず" className="bg-[#060a12] border-b border-white/[0.04]">
        <Container>
          <ol className="flex flex-wrap items-center gap-1.5 py-3 text-xs text-white/70">
            {all.map((c, i) => {
              const last = i === all.length - 1;
              return (
                <li key={c.url} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden>/</span>}
                  {last ? (
                    <span aria-current="page" className="text-white">
                      {c.name}
                    </span>
                  ) : (
                    <Link href={c.url} className="hover:text-white transition-colors">
                      {c.name}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </Container>
      </nav>
    </>
  );
}
