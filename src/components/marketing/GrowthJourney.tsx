import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";
import {
  getMarketingStats,
  SHOP_MILESTONES,
  CERT_MILESTONES,
  nextMilestone,
  progressTo,
  type Milestone,
} from "@/lib/marketing/stats";

/**
 * GrowthJourney — ゼロからの成長過程を、隠さず透明に見せるセクション。
 *
 * SmartHR の「シェアNo.1 / 70,000社」型の権威付けは、まだ Ledra には無い。
 * その不在を「ない」ではなく「いま何合目か」「次にどこを目指すか」として
 * 提示することで、先行導入の意味を訪問者と共有する。
 */

function formatDate(iso: string): string | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()) || d.getTime() === 0) return null;
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

function MilestoneTrack({
  current,
  list,
  unit,
  metric,
}: {
  current: number;
  list: Milestone[];
  unit: string;
  metric: "shop" | "cert";
}) {
  const next = nextMilestone(current, list, metric);
  const target = next?.[metric] ?? list[list.length - 1]?.[metric] ?? 1;
  const progress = progressTo(current, typeof target === "number" ? target : 1);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 md:p-8">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-white/70">いまの数字</div>
          <div className="mt-2 text-[2.25rem] md:text-[2.75rem] font-bold leading-none text-white tracking-tight">
            {current.toLocaleString()}
            <span className="ml-1 text-base font-medium text-white/70">{unit}</span>
          </div>
        </div>
        {next ? (
          <div className="text-right">
            <div className="text-xs font-medium uppercase tracking-widest text-blue-300/80">次のマイルストーン</div>
            <div className="mt-2 text-lg font-semibold text-blue-200">{next.label}</div>
          </div>
        ) : (
          <div className="text-right">
            <div className="text-xs font-medium uppercase tracking-widest text-blue-300/80">マイルストーン</div>
            <div className="mt-2 text-lg font-semibold text-blue-200">全達成</div>
          </div>
        )}
      </div>

      {/* progress bar */}
      <div className="mt-6">
        <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-blue-400 transition-[width]"
            style={{ width: `${Math.max(progress * 100, 2)}%` }}
          />
        </div>
        {next && <p className="mt-3 text-xs text-white/70 leading-relaxed">{next.caption}</p>}
      </div>

      {/* milestones list */}
      <ol className="mt-7 grid grid-cols-3 sm:grid-cols-6 gap-2">
        {list.map((m) => {
          const target = m[metric];
          const reached = typeof target === "number" && current >= target;
          const isNext = next && m.label === next.label;
          return (
            <li
              key={m.label}
              className={`text-center rounded-lg border px-2 py-2 text-[0.65rem] font-medium tracking-wide ${
                reached
                  ? "border-blue-500/40 bg-blue-500/[0.12] text-blue-200"
                  : isNext
                    ? "border-violet-400/40 bg-violet-500/[0.08] text-violet-200"
                    : "border-white/[0.08] bg-white/[0.02] text-white/85"
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-inherit">
                {reached && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {m.label}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export async function GrowthJourney() {
  const stats = await getMarketingStats();
  const fetchedDate = stats.isLive ? formatDate(stats.fetchedAt) : null;

  return (
    <Section bg="alt" id="growth">
      <SectionHeading
        title="ゼロから、業界の標準へ。"
        subtitle="Ledra は意図的に「最初の数字」を隠しません。いま何社が乗っているか、次にどこを目指しているかを率直に共有することで、先行パートナーと一緒に業界を作り直していきます。"
      />

      <ScrollReveal variant="fade-up">
        <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6">
          <MilestoneTrack current={stats.shopCount} list={SHOP_MILESTONES} unit="社" metric="shop" />
          <MilestoneTrack current={stats.certificateCount} list={CERT_MILESTONES} unit="件" metric="cert" />
        </div>
      </ScrollReveal>

      <ScrollReveal variant="fade-in" delay={150}>
        <div className="mx-auto mt-8 max-w-5xl flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-2">
            <span
              className={`block w-2 h-2 rounded-full ${stats.isLive ? "bg-emerald-400 animate-[pulse-soft_2s_ease-in-out_infinite]" : "bg-white/40"}`}
            />
            <span className="text-xs font-medium text-white/80">
              {stats.isLive ? "本番DBから直接集計" : "DBに到達できていません — フォールバック表示"}
            </span>
          </div>
          <span className="hidden sm:inline-block w-px h-4 bg-white/10" />
          <div className="text-xs text-white/85 leading-relaxed">
            直近30日: 新規{stats.shopsLast30Days.toLocaleString()}社 / 新規
            {stats.certificatesLast30Days.toLocaleString()}件
            {fetchedDate && (
              <>
                <span className="mx-2 text-white/40">·</span>
                <span className="text-white/85">{fetchedDate} 時点</span>
              </>
            )}
          </div>
        </div>
      </ScrollReveal>
    </Section>
  );
}
