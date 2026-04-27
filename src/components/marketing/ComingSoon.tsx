import Link from "next/link";
import { Container } from "./Container";

export function ComingSoon({
  title = "準備中",
  message = "このページは現在準備中です。サービス公開までもう少しお待ちください。",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <section className="relative bg-[#060a12] min-h-[60vh] flex items-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[30%] left-[40%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[150px]" />
      </div>
      <Container className="relative text-center py-28">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 mb-8">
          COMING SOON
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
          {title}
        </h1>
        <p className="mt-5 text-base text-white/80 max-w-md mx-auto leading-relaxed">
          {message}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center text-sm font-medium px-6 py-3 rounded-lg border border-white/20 text-white hover:bg-white/10 transition-colors"
          >
            トップページに戻る
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center text-sm font-medium px-6 py-3 rounded-lg bg-white/[0.08] text-white hover:bg-white/[0.12] transition-colors"
          >
            お問い合わせ
          </Link>
        </div>
      </Container>
    </section>
  );
}
