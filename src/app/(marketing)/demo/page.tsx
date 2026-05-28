import Link from "next/link";
import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTAButton } from "@/components/marketing/CTAButton";
import { DemoCredentialsCard } from "@/components/marketing/DemoCredentialsCard";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";

export const metadata = {
  title: "デモ環境を試す",
  description:
    "Ledra のデモアカウントで実際の管理画面を操作できます。サンプルの証明書・車両・顧客データが用意されています。",
};

const SAMPLE_DATA = [
  {
    label: "証明書",
    count: "16件",
    description: "施工証明書の一覧・詳細・PDFプレビュー",
  },
  {
    label: "車両",
    count: "10台",
    description: "各車両のサービス履歴タイムライン",
  },
  {
    label: "顧客",
    count: "8名",
    description: "顧客360°ビュー、施工履歴",
  },
];

const HIGHLIGHTS = [
  {
    title: "/admin",
    description: "ダッシュボード（KPI / 30日の推移チャート）",
  },
  {
    title: "/admin/certificates",
    description: "証明書一覧（LEDRA-DEMO-0001〜0016）",
  },
  {
    title: "/admin/vehicles",
    description: "車両一覧と詳細タイムライン",
  },
  {
    title: "/admin/customers",
    description: "顧客一覧と顧客 360° ビュー",
  },
];

export default function DemoPage() {
  return (
    <>
      <PageHero
        badge="DEMO"
        title="デモ環境で実際の画面を操作"
        subtitle="ボタンを押すだけで自動ログインし、実際の管理画面とサンプルデータをそのままご覧いただけます。"
      />

      <Section>
        <div className="mx-auto max-w-3xl">
          <ScrollReveal variant="fade-up">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <CTAButton variant="primary" href="/demo/enter" trackLocation="demo-page" trackLabel="demo-enter">
                ワンクリックでデモを見る
              </CTAButton>
              <CTAButton variant="white-outline" href="/signup" trackLocation="demo-page" trackLabel="demo-signup">
                自分のアカウントを作る
              </CTAButton>
            </div>
          </ScrollReveal>

          <ScrollReveal variant="fade-up" delay={100}>
            <DemoCredentialsCard email={DEMO_EMAIL} password={DEMO_PASSWORD} />
          </ScrollReveal>

          <ScrollReveal variant="fade-up" delay={150}>
            <p className="mt-4 text-center text-xs text-white/60">
              手動でログインしたい場合は{" "}
              <Link href="/login" className="underline underline-offset-2 hover:text-white">
                /login
              </Link>{" "}
              から上記の認証情報をご利用ください。
            </p>
          </ScrollReveal>

          <ScrollReveal variant="fade-up" delay={250}>
            <div className="mt-10 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-sm leading-relaxed text-amber-100">
              <div className="mb-1 flex items-center gap-2 font-semibold text-amber-200">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                デモ環境は読み取り専用です
              </div>
              <p>
                証明書の発行・編集・削除など、データを変更する操作はサーバー側でブロックされます。
                実際に運用したい場合は{" "}
                <Link href="/signup" className="font-medium text-amber-200 underline underline-offset-2">
                  新規アカウントの作成
                </Link>{" "}
                をご利用ください。
              </p>
            </div>
          </ScrollReveal>
        </div>
      </Section>

      <Section bg="alt">
        <div className="mx-auto max-w-5xl">
          <ScrollReveal variant="fade-up">
            <h2 className="text-center text-2xl md:text-3xl font-bold text-white">サンプルデータの内容</h2>
            <p className="mt-3 text-center text-sm text-white">
              ログイン直後から実データに近いボリュームのサンプルが入っています
            </p>
          </ScrollReveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {SAMPLE_DATA.map((item, i) => (
              <ScrollReveal key={item.label} variant="fade-up" delay={100 + i * 80}>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 text-center">
                  <div className="text-3xl font-bold text-blue-300">{item.count}</div>
                  <div className="mt-1 text-sm font-medium text-white">{item.label}</div>
                  <div className="mt-2 text-xs leading-relaxed text-white">{item.description}</div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal variant="fade-up" delay={300}>
            <div className="mt-12">
              <h3 className="text-center text-lg font-semibold text-white">ログイン後に見られる画面</h3>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {HIGHLIGHTS.map((row) => (
                  <li
                    key={row.title}
                    className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-black/30 px-4 py-3"
                  >
                    <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                    <div>
                      <code className="font-mono text-sm text-white">{row.title}</code>
                      <div className="text-xs text-white">{row.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
        </div>
      </Section>
    </>
  );
}
