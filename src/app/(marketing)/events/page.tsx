import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import { CTAButton } from "@/components/marketing/CTAButton";
import { listPublishedPosts } from "@/lib/marketing/site-content-posts";
import type { SiteContentType } from "@/lib/validations/site-content-post";

export const metadata = {
  title: "イベント・ウェビナー",
  description: "Ledra が主催・共催するイベント、ウェビナー、導入相談会の情報をお届けします。",
  alternates: { canonical: "/events" },
};

const TYPE_LABEL: Record<SiteContentType, string> = {
  blog: "ブログ",
  event: "イベント",
  webinar: "ウェビナー",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}年${Number(m)}月${Number(day)}日 ${hh}:${mm}`;
}

export default async function EventsPage() {
  const posts = await listPublishedPosts(["event", "webinar"], { limit: 60 });

  const nowIso = new Date().toISOString();
  const upcoming = posts
    .filter((p) => p.event_start_at && p.event_start_at >= nowIso)
    .sort((a, b) => (a.event_start_at ?? "").localeCompare(b.event_start_at ?? ""));
  const past = posts
    .filter((p) => !p.event_start_at || p.event_start_at < nowIso)
    .sort((a, b) => (b.event_start_at ?? "").localeCompare(a.event_start_at ?? ""));

  return (
    <>
      <PageHero
        badge="EVENTS"
        title="イベント・ウェビナー"
        subtitle="施工店・代理店・保険会社の実務者に向けたウェビナーや導入相談会を、順次開催してまいります。"
      />

      <Section>
        {upcoming.length === 0 && past.length === 0 ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-10 md:p-14 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20">
              COMING SOON
            </div>
            <h2 className="mt-6 text-2xl md:text-3xl font-bold text-white leading-tight">次回イベント、準備中です。</h2>
            <p className="mt-5 text-[0.938rem] md:text-base leading-[1.9] text-white/80 max-w-xl mx-auto">
              ウェビナー・導入相談会の開催日程が決まり次第、本ページとメルマガでご案内いたします。
              <br />
              個別のご相談ご希望の方は、お問い合わせよりご連絡ください。
            </p>
            <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
              <CTAButton variant="primary" href="/contact" trackLocation="events-coming-soon">
                個別相談を申し込む
              </CTAButton>
              <CTAButton variant="outline" href="/resources" trackLocation="events-coming-soon">
                資料ダウンロード
              </CTAButton>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-14">
            {upcoming.length > 0 && (
              <div>
                <h2 className="text-lg md:text-xl font-bold text-white">開催予定</h2>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {upcoming.map((p, i) => (
                    <ScrollReveal key={p.id} variant="fade-up" delay={i * 60}>
                      <article className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 md:p-8 hover:bg-white/[0.06] transition-colors">
                        <div className="flex flex-wrap items-center gap-2 text-[0.688rem] text-white/80">
                          <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 font-medium text-blue-200">
                            {TYPE_LABEL[p.type]}
                          </span>
                          {p.event_start_at && (
                            <time dateTime={p.event_start_at}>{formatDateTime(p.event_start_at)}</time>
                          )}
                        </div>
                        <h3 className="mt-4 text-[1.125rem] md:text-[1.25rem] font-bold text-white leading-[1.4]">
                          {p.title}
                        </h3>
                        {p.excerpt && <p className="mt-3 text-[0.938rem] leading-[1.75] text-white/80">{p.excerpt}</p>}
                        <dl className="mt-5 space-y-1.5 text-xs text-white/80">
                          {p.location && (
                            <div>
                              <dt className="inline text-white/75">会場：</dt>
                              <dd className="inline">{p.location}</dd>
                            </div>
                          )}
                          {p.capacity != null && (
                            <div>
                              <dt className="inline text-white/75">定員：</dt>
                              <dd className="inline">{p.capacity}名</dd>
                            </div>
                          )}
                        </dl>
                        {p.registration_url && (
                          <div className="mt-6">
                            <a
                              href={p.registration_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-300 hover:text-blue-200"
                            >
                              参加を申し込む →
                            </a>
                          </div>
                        )}
                      </article>
                    </ScrollReveal>
                  ))}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <h2 className="text-lg md:text-xl font-bold text-white">過去の開催</h2>
                <div className="mt-5 divide-y divide-white/[0.06]">
                  {past.map((p) => (
                    <div key={p.id} className="py-5">
                      <div className="flex flex-wrap items-center gap-2 text-[0.688rem] text-white/75">
                        <span className="inline-flex items-center rounded-full border border-white/[0.08] px-2 py-0.5 font-medium text-white/80">
                          {TYPE_LABEL[p.type]}
                        </span>
                        {p.event_start_at && (
                          <time dateTime={p.event_start_at}>{formatDateTime(p.event_start_at)}</time>
                        )}
                      </div>
                      <h3 className="mt-2 text-base font-bold text-white/90">{p.title}</h3>
                      {p.excerpt && <p className="mt-1.5 text-sm text-white/80 leading-relaxed">{p.excerpt}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      <CTABanner
        title="開催情報をいち早くお届けします"
        subtitle="フッターのメルマガ登録をお願いいたします。開催予定・録画アーカイブをご案内します。"
        primaryLabel="お問い合わせ"
        primaryHref="/contact"
        secondaryLabel="導入支援を見る"
        secondaryHref="/support"
      />
    </>
  );
}
