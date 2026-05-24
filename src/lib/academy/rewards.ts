import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/sendEmail";

const REWARD_PER_LESSON = 500; // JPY per qualifying lesson
const QUALIFY_AVG = 4.0;
const QUALIFY_COUNT = 5;

function getStripe() {
  return getStripeClient();
}

export interface RewardRecord {
  id: string;
  tenant_id: string | null;
  author_user_id: string;
  period_month: string;
  qualifying_lessons: QualifyingLesson[];
  lesson_count: number;
  reward_per_lesson: number;
  total_amount_jpy: number;
  status: "pending" | "applied" | "skipped" | "failed";
  stripe_credit_id: string | null;
  applied_at: string | null;
  notes: string | null;
  created_at: string;
}

interface QualifyingLesson {
  id: string;
  title: string;
  rating_avg: number;
  rating_count: number;
}

type CalculateResult = { ok: true; inserted: number; skipped_existing: number } | { ok: false; reason: string };

type ApplyResult =
  | { ok: true; stripe_credit_id: string }
  | { ok: false; reason: "not_found" | "already_applied" | "no_stripe_customer" | "error"; detail?: string };

/**
 * 指定月の qualifying レッスン (rating_avg >= 4.0 && rating_count >= 5) を
 * (tenant_id, author_user_id) でグループ化して報酬レコードを insert する。
 * UNIQUE 制約で冪等: 既存レコードはスキップ。
 */
export async function calculateMonthlyRewards(periodMonth: string): Promise<CalculateResult> {
  const supabase = createServiceRoleAdmin("academy/rewards: 月次報酬集計");

  // published レッスンで qualifying 条件を満たすものを取得
  const { data: lessons, error } = await supabase
    .from("academy_lessons")
    .select("id, tenant_id, author_user_id, title, rating_avg, rating_count")
    .eq("status", "published")
    .gte("rating_avg", QUALIFY_AVG)
    .gte("rating_count", QUALIFY_COUNT)
    .not("author_user_id", "is", null);

  if (error) {
    logger.error("[rewards] Failed to fetch lessons", { error });
    return { ok: false, reason: error.message };
  }

  if (!lessons || lessons.length === 0) {
    return { ok: true, inserted: 0, skipped_existing: 0 };
  }

  // (tenant_id, author_user_id) でグループ化
  const grouped = new Map<string, { tenant_id: string | null; author_user_id: string; lessons: QualifyingLesson[] }>();
  for (const l of lessons) {
    const key = `${l.tenant_id ?? "null"}::${l.author_user_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        tenant_id: l.tenant_id as string | null,
        author_user_id: l.author_user_id as string,
        lessons: [],
      });
    }
    grouped.get(key)!.lessons.push({
      id: l.id as string,
      title: l.title as string,
      rating_avg: Number(l.rating_avg),
      rating_count: l.rating_count as number,
    });
  }

  let inserted = 0;
  let skipped_existing = 0;

  for (const group of grouped.values()) {
    const lessonCount = group.lessons.length;
    const totalAmount = lessonCount * REWARD_PER_LESSON;

    const { error: insertError } = await supabase
      .from("academy_creator_rewards")
      .insert({
        tenant_id: group.tenant_id,
        author_user_id: group.author_user_id,
        period_month: periodMonth,
        qualifying_lessons: group.lessons,
        lesson_count: lessonCount,
        reward_per_lesson: REWARD_PER_LESSON,
        total_amount_jpy: totalAmount,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      // UNIQUE 違反 = 既に集計済み
      if (insertError.code === "23505") {
        skipped_existing++;
      } else {
        logger.error("[rewards] Failed to insert reward", { error: insertError, author_user_id: group.author_user_id });
      }
      continue;
    }

    inserted++;

    // 著者にメール通知 (失敗しても集計は続行)
    await sendRewardNotificationEmail(group.author_user_id, {
      period_month: periodMonth,
      lesson_count: lessonCount,
      total_amount_jpy: totalAmount,
      qualifying_lessons: group.lessons,
    }).catch((e) => {
      logger.error("[rewards] Failed to send notification email", { error: e, author_user_id: group.author_user_id });
    });
  }

  logger.info("[rewards] calculateMonthlyRewards done", { periodMonth, inserted, skipped_existing });
  return { ok: true, inserted, skipped_existing };
}

/**
 * 報酬レコードに対して Stripe Customer Balance のクレジットを適用する。
 * テナントの stripe_customer_id がない場合は 'skipped' に更新して返す。
 */
export async function applyStripeCredit(rewardId: string): Promise<ApplyResult> {
  const supabase = createServiceRoleAdmin("academy/rewards: Stripe credit 適用");

  const { data: reward, error: fetchError } = await supabase
    .from("academy_creator_rewards")
    .select("id, tenant_id, author_user_id, period_month, lesson_count, total_amount_jpy, status")
    .eq("id", rewardId)
    .maybeSingle();

  if (fetchError || !reward) {
    return { ok: false, reason: "not_found" };
  }

  if (reward.status === "applied") {
    return { ok: false, reason: "already_applied" };
  }

  if (!reward.tenant_id) {
    // platform コンテンツ (tenant_id=null) はスキップ
    await supabase
      .from("academy_creator_rewards")
      .update({ status: "skipped", notes: "platform content: no tenant" })
      .eq("id", rewardId);
    return { ok: false, reason: "no_stripe_customer", detail: "platform content has no tenant" };
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("stripe_customer_id, name")
    .eq("id", reward.tenant_id as string)
    .maybeSingle();

  if (!tenant?.stripe_customer_id) {
    await supabase
      .from("academy_creator_rewards")
      .update({ status: "skipped", notes: "no stripe_customer_id" })
      .eq("id", rewardId);
    return { ok: false, reason: "no_stripe_customer" };
  }

  try {
    const stripe = getStripe();
    const txn = await stripe.customers.createBalanceTransaction(
      tenant.stripe_customer_id as string,
      {
        // JPY は最小通貨単位 = 1円 (cents 換算不要)
        amount: -(reward.total_amount_jpy as number),
        currency: "jpy",
        description: `Ledra Academy 報酬 ${reward.period_month} (${reward.lesson_count} レッスン)`,
        metadata: {
          reward_id: rewardId,
          author_user_id: reward.author_user_id as string,
          period_month: reward.period_month as string,
        },
      },
      { idempotencyKey: `academy-reward:${rewardId}` },
    );

    await supabase
      .from("academy_creator_rewards")
      .update({
        status: "applied",
        stripe_credit_id: txn.id,
        applied_at: new Date().toISOString(),
      })
      .eq("id", rewardId);

    logger.info("[rewards] stripe credit applied", { rewardId, txnId: txn.id });
    return { ok: true, stripe_credit_id: txn.id };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logger.error("[rewards] stripe createBalanceTransaction failed", { rewardId, detail });

    await supabase.from("academy_creator_rewards").update({ status: "failed", notes: detail }).eq("id", rewardId);

    return { ok: false, reason: "error", detail };
  }
}

async function sendRewardNotificationEmail(
  authorUserId: string,
  info: {
    period_month: string;
    lesson_count: number;
    total_amount_jpy: number;
    qualifying_lessons: QualifyingLesson[];
  },
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "noreply@ledra.co.jp";
  if (!apiKey) return;

  // auth.users からメールアドレスを取得
  const supabase = createServiceRoleAdmin("academy/rewards: 通知メール送信 (auth.users 参照)");
  const { data: userData } = await supabase.auth.admin.getUserById(authorUserId);
  const email = userData?.user?.email;
  if (!email) return;

  const [year, month] = info.period_month.split("-");
  const subject = `【Ledra Academy】${year}年${month}月の報酬が確定しました`;

  const lessonList = info.qualifying_lessons
    .map((l) => `  ・${l.title} (★${l.rating_avg.toFixed(1)} / ${l.rating_count}件)`)
    .join("\n");

  const text = [
    `${email} 様`,
    "",
    `${year}年${month}月の Ledra Academy 報酬が確定しました。`,
    "",
    `■ 対象レッスン (${info.lesson_count}件)`,
    lessonList,
    "",
    `■ 報酬額: ¥${info.total_amount_jpy.toLocaleString()}`,
    "",
    "翌月の請求から自動的に減額されます。",
    "ご不明な点は管理画面の「報酬履歴」からご確認ください。",
    "",
    "Ledra",
  ].join("\n");

  await sendEmail({ from, to: email, subject, text });
}
