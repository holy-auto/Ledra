/**
 * LINE ユーザー × 顧客の「紐づけ」を 1 箇所に集約するヘルパ。
 *
 * 紐づけが成立する経路は複数ある:
 *   1. 受信箱からスタッフが手動で紐づけ (`/api/admin/messages/[key]/link`)
 *   2. 顧客が連携コードを LINE 送信 (`tryConsumeLineLinkCode`)
 *   3. 新規顧客の登録フォーム (intake) 完了 (`submitAndProcessIntake` / `approveIntake`)
 *
 * いずれの経路でも「紐づけ完了時にやるべきこと」は同じなので、ここに集約する:
 *   a. customers.line_user_id をセット (未設定 / 同一のときのみ)
 *   b. 同じ line_user_id を持つ customer_id=NULL の customer_messages を backfill
 *      (友だち追加直後など未紐づけで溜まっていた過去スレッドを顧客に集約)
 *   c. 過去のやり取りを AI 解析して予約候補化する一括取り込みジョブを enqueue
 *      (fire-and-forget。opt-in テナントのみ実体が動く)
 *   d. マイページ (証明書・施工履歴・予約の閲覧口) の URL を LINE で案内
 *      (fire-and-forget。連携直後にしか送らないので 1 顧客 1 通)
 *
 * webhook / 自動経路には auth セッションが無いため service-role で書き込む。
 * tenant_id は呼び出し元から厳密に渡される値のみを使う。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { enqueueLineHistoryImport } from "@/lib/qstash/publish";

export interface LinkLineUserResult {
  ok: boolean;
  /** backfill された (customer_id を埋めた) メッセージ件数。 */
  backfilled: number;
}

/**
 * 連携完了時に顧客へ送る「マイページのご案内」本文を組み立てる。
 *
 * URL には単回使用のログイントークンを載せるため、**email を持たない顧客でもそのまま
 * マイページに入れる** (メール宛 OTP を経由しない)。トークンは LINE の 1:1 トークにしか
 * 流さない前提なので、呼び出し側はグループへの配信をしないこと。
 *
 * APP_URL 未設定 / tenant slug 不明のときは null を返して送信を見送る
 * (壊れたリンクを顧客へ送らないため)。
 */
export async function buildPortalWelcomeText(tenantId: string, customerId: string): Promise<string | null> {
  // linkPrompt.getBaseUrl と同じフォールバック順。片方だけ設定された環境で、
  // 連携案内だけ無言で止まるのを防ぐ。
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    ""
  ).trim();
  if (!base) {
    logger.warn("[linkCustomer] portal welcome skipped — APP_URL 未設定", { tenantId });
    return null;
  }

  const admin = createServiceRoleAdmin("LINE 連携完了時のマイページ案内 — 店舗名の解決");
  const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const shopName = String(tenant?.name ?? "").trim();
  if (!shopName) {
    logger.warn("[linkCustomer] portal welcome skipped — tenant が引けない", { tenantId });
    return null;
  }

  const { issuePortalLoginToken } = await import("@/lib/customerPortalLineLogin");
  const token = await issuePortalLoginToken(tenantId, customerId);

  const origin = (base.startsWith("http") ? base : `https://${base}`).replace(/\/+$/, "");
  return [
    `【${shopName} マイページのご案内】`,
    "施工証明書・施工履歴・ご予約はこちらからご確認いただけます。",
    `${origin}/my/line?t=${token}`,
    "",
    "※ このリンクはお客様専用です。有効期限が切れたら「マイページ」とこのトークに送ってください。",
  ].join("\n");
}

/**
 * line_user_id を顧客に紐づけ、過去メッセージを backfill し、履歴取り込みを enqueue し、
 * マイページ URL を案内する。
 *
 * @param setLineUserId customers.line_user_id を更新するか (既定 true)。受信箱の link
 *   ルートのように呼び出し側で既に更新済みの場合は false を渡して二重更新を避ける。
 * @param suppressPortalMessage マイページ案内のプッシュ送信を抑止するか (既定 false)。
 *   連携コード経路のように呼び出し側が**無料の応答メッセージ**へ同梱できる場合に true。
 *   (LINE 公式アカウントはプッシュが従量課金・応答メッセージは無料)
 */
export async function linkLineUserToCustomer(params: {
  tenantId: string;
  customerId: string;
  lineUserId: string;
  setLineUserId?: boolean;
  suppressPortalMessage?: boolean;
}): Promise<LinkLineUserResult> {
  const { tenantId, customerId, lineUserId } = params;
  const setLineUserId = params.setLineUserId !== false;

  const admin = createServiceRoleAdmin(
    "LINE 顧客紐づけ — line_user_id セット + 過去メッセージ backfill (webhook / intake は auth セッション無し)",
  );

  // 既に同じ line_user_id で連携済みだったか。再連携で案内を二重に送らないための印。
  let alreadyLinked = false;

  // a. customers.line_user_id をセット (まだ別ユーザーが付いていない場合のみ)。
  if (setLineUserId) {
    // 既に **別の** line_user_id が紐づいている顧客は上書きしない。
    // (重複 intake / 転送された登録 URL 等で既存の LINE 宛先を奪わないため)
    const { data: current } = await admin
      .from("customers")
      .select("line_user_id")
      .eq("id", customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const existingLineUserId = (current?.line_user_id as string | null) ?? null;
    if (existingLineUserId && existingLineUserId !== lineUserId) {
      logger.warn("[linkCustomer] target already linked to a different line_user_id — skip", {
        tenantId,
        customerId,
      });
      return { ok: false, backfilled: 0 };
    }
    alreadyLinked = existingLineUserId === lineUserId;
    if (!existingLineUserId) {
      const { error: upErr } = await admin
        .from("customers")
        .update({ line_user_id: lineUserId, updated_at: new Date().toISOString() })
        .eq("id", customerId)
        .eq("tenant_id", tenantId)
        // 競合時の上書き防止: NULL のときだけセットする。
        .is("line_user_id", null);
      if (upErr) {
        logger.warn("[linkCustomer] set line_user_id failed", { tenantId, customerId, err: upErr.message });
        return { ok: false, backfilled: 0 };
      }
    }
  }

  // b. 未紐づけメッセージを backfill。
  let backfilled = 0;
  try {
    const { error: bfErr, count } = await admin
      .from("customer_messages")
      .update({ customer_id: customerId }, { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("line_user_id", lineUserId)
      .is("customer_id", null);
    if (bfErr) {
      logger.warn("[linkCustomer] backfill failed", { tenantId, customerId, err: bfErr.message });
    } else {
      backfilled = count ?? 0;
    }
  } catch (e) {
    logger.warn("[linkCustomer] backfill threw", {
      tenantId,
      customerId,
      err: e instanceof Error ? e.message : String(e),
    });
  }

  // c. 履歴一括取り込みを enqueue (fire-and-forget)。opt-in テナントのみジョブ側で実体が動く。
  try {
    await enqueueLineHistoryImport({ tenant_id: tenantId, customer_id: customerId, line_user_id: lineUserId });
  } catch (e) {
    logger.warn("[linkCustomer] enqueue history import failed", {
      tenantId,
      customerId,
      err: e instanceof Error ? e.message : String(e),
    });
  }

  // d. マイページ案内を送る (fire-and-forget)。client.ts は本モジュールを (linkCode 経由で)
  //    動的に読むため、循環参照を避けてこちらも動的 import する。
  //    既に同じ LINE ユーザーで連携済みなら送らない (再連携での二重送信・二重課金を防ぐ)。
  if (!params.suppressPortalMessage && !alreadyLinked) {
    try {
      const body = await buildPortalWelcomeText(tenantId, customerId);
      if (body) {
        const { sendCustomerLineText } = await import("@/lib/line/client");
        await sendCustomerLineText({ tenantId, customerId, lineUserId, body });
      }
    } catch (e) {
      logger.warn("[linkCustomer] portal welcome send failed", {
        tenantId,
        customerId,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { ok: true, backfilled };
}
