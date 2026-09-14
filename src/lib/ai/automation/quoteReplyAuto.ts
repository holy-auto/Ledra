/**
 * 受信メッセージ (価格問い合わせ) → 概算見積りを LINE で完全自動返信する IO 層。
 *
 * inboundAuto (LINE webhook の AI 抽出) から fire-and-forget で呼ばれる。
 * 「ヴェルファイアのコーティングいくら？」のような施工内容+車両が読み取れた
 * メッセージに対して、過去の請求実績を基に **概算金額をレンジ (〜幅) で**
 * 顧客の LINE へ即返信する。人の確認は挟まない (opt-in・既定 OFF)。
 *
 * quoteDraftAuto (見積ドラフトを起票してスタッフが確定→送付) とは別系統:
 *   - こちらは「概算・要来店」の但し書き付きレンジのみを返す (外向き確定ではない)
 *   - 正式・詳細な見積りは案内文で来店に誘導する (詳細見積りは来店対応)
 *   - 未紐付けの新規客にも返信する (customerId が null でも可)
 *
 * AI が使えない場合 (API キー未設定・タイムアウト等) も、過去実績ベースの
 * 決定的フォールバック概算で返信を続行する。概算の材料が皆無 (総額 0) の
 * ときだけ、金額を出さず来店案内文を返す。
 *
 * 安全ガード:
 *   - opt-in (quote.auto_reply_rough_estimate, 既定 OFF) + Standard プラン以上
 *   - LINE 受信 (lineUserId あり) のみ — push で返信する
 *   - intent が inquiry_only / new_reservation
 *
 * 施工内容/車両の一方または両方が読み取れなかった場合:
 *   - 原文に価格問い合わせらしいキーワード (見積/概算/いくら 等) があれば、
 *     金額は出さず不足情報 (車両・施工内容) を尋ね返す
 *   - キーワードも無ければ従来通り何もしない (無関係な問い合わせへの誤爆を避ける)
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { generateQuoteFromVehicle, extractInvoiceLines } from "@/lib/ai/quoteFromVehicle";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { sendCustomerLineText, sendCustomerLineButtons } from "@/lib/line/client";
import { buildFollowupButtons } from "@/lib/line/flow/messages";
import { categoryMatchesQuery } from "@/lib/line/flow/addonCandidates";
import { priceForVehicleSize, type SizePrices } from "@/lib/menu/sizePricing";
import { logger } from "@/lib/logger";
import { logAutoActionExecuted } from "@/lib/audit/aiAuditLog";
import { loadAiAutomationSettings, type AiAutomationSettings } from "./policy";
import { shouldAutoReplyRoughEstimate } from "./orchestrator";

const ENDPOINT = "/api/line/webhook#auto-quote-reply";
const TAX_RATE = 0.1;

/**
 * 価格問い合わせらしいと判断するキーワード。車両/施工内容が読み取れなかった
 * ときに「黙ってスキップ」か「不足情報を聞き返す」かを分けるための簡易判定。
 *
 * ponytail: 固定キーワードの正規表現なので、リストに無い言い回し (「どのくらい
 * する？」等) は拾えず黙ってスキップされる。src/lib/ai/inquiryClassify.ts の
 * buildDeterministicClassification と判定基準が重複してもいる。アップグレード
 * 経路: この判定を extractInboundReservation (inboundReservationExtract.ts) の
 * 抽出結果に intent とは別のブール値として持たせ、AI 自身に判定させる。
 */
const PRICE_INQUIRY_PATTERN = /見積|みつもり|概算|いくら|幾ら|金額|価格|料金|どのくらい|どれくらい/;

/**
 * 車種テキストから vehicle_size_master 経由で車両サイズ (size_class) を推定する。
 * テキストに含まれる車種名 (model) のうち最長一致のサイズ区分を返す。該当なしは null。
 * 未登録の新規客でも「アルファード」等の車種名から車両サイズを引くために使う。
 */
export function resolveSizeClassFromText(
  vehicleText: string,
  master: Array<{ maker: string | null; model: string | null; size_class: string | null }> | null,
): string | null {
  const haystack = (vehicleText ?? "").toLowerCase();
  if (!haystack.trim() || !master) return null;
  let best: { len: number; sizeClass: string | null } | null = null;
  for (const row of master) {
    const model = row.model?.trim();
    if (!model || model.length < 2) continue;
    if (!haystack.includes(model.toLowerCase())) continue;
    if (!best || model.length > best.len) best = { len: model.length, sizeClass: row.size_class };
  }
  return best?.sizeClass ?? null;
}

export interface MaybeAutoReplyRoughEstimateParams {
  tenantId: string;
  /** 既知顧客 ID。null (未紐付けの新規客) でも返信する。 */
  customerId: string | null;
  /** 返信先 LINE ユーザー ID。無ければ push できないので何もしない。 */
  lineUserId?: string | null;
  /** AI 抽出結果 (extractInboundReservation)。 */
  intent: string;
  service?: string;
  vehicleText?: string;
  /** 受信メッセージの原文。施工内容/車両が未抽出のとき、価格問い合わせらしいか
   * どうかの判定にのみ使う (キーワード一致のみ、AI 呼び出しはしない)。 */
  text?: string;
  /** 起票元の customer_messages.id (トレーサビリティ用)。 */
  messageId: string | null;
  channel?: string;
  /** 呼び出し元 (inboundAuto) が既にロード済みなら渡して二重読込を避ける。 */
  settings?: AiAutomationSettings;
  tenant?: { plan_tier: string | null; is_active: boolean | null };
  /**
   * 概算返信の末尾に「正式なお見積り / スタッフ相談」誘導ボタンを添えるか。
   * 呼び出し元 (inboundAuto) が会話フロー opt-in と進行中フロー有無を見て決める
   * (ナレッジ自動返信の attachButtons と同じ判断)。true のとき締めの文面も LINE 継続前提に揃う。
   */
  attachButtons?: boolean;
}

/** 施工内容/車両の一方または両方が読み取れなかったとき、不足情報を尋ねる返信文。 */
export function buildMissingInfoMessage(input: { hasService: boolean; hasVehicle: boolean }): string {
  const asks: string[] = [];
  if (!input.hasVehicle) asks.push("お車の情報 (メーカー・車種・年式)");
  if (!input.hasService) asks.push("ご希望の施工内容");
  return [
    "【お見積りについて】",
    "概算のお見積りをお出ししたいのですが、下記を教えていただけますでしょうか。",
    "",
    ...asks.map((a) => `◯ ${a}`),
    "",
    "分かる範囲で構いませんので、返信をお願いいたします。",
  ].join("\n");
}

/**
 * 税込総額 ±15% を ¥1,000 単位に丸めた概算レンジ。
 * 概算であることを示す「幅」を持たせ、来店時の詳細見積りとの差分クレームを避ける。
 */
export function roughEstimateRange(totalInclTax: number): { low: number; high: number } {
  const low = Math.max(0, Math.floor((totalInclTax * 0.85) / 1000) * 1000);
  const high = Math.ceil((totalInclTax * 1.15) / 1000) * 1000;
  return { low, high };
}

/** 概算レンジ / 来店案内の返信本文を組み立てる。total<=0 なら金額なしで来店案内。 */
export function buildRoughEstimateMessage(input: {
  service: string;
  vehicleText: string;
  totalInclTax: number;
  /**
   * この直後に「正式なお見積りをお願いしたい」等の LINE 誘導ボタンを添えるか。
   * true のときは締めの文面も LINE で続けられる旨に揃える（概算=来店のみ、という
   * 従来の締めと、ボタン先の「LINEで正式見積り」フローとの文面矛盾を無くす）。
   */
  canContinueOnLine?: boolean;
}): string {
  const head = ["◯ 内容: " + input.service, "◯ お車: " + input.vehicleText];
  // 締めの案内。ボタン誘導があるときは「LINEで正式見積りへ続けられる」旨に揃える。
  const closing = input.canContinueOnLine
    ? "正式なお見積りは、下のボタンからLINEで承ります（車検証のお写真でより正確にお出しできます）。ご来店でも承ります。"
    : "正式・詳細なお見積りはご来店時に承ります。ご予約お待ちしております。";
  if (input.totalInclTax > 0) {
    const { low, high } = roughEstimateRange(input.totalInclTax);
    return [
      "【概算お見積り】",
      ...head,
      `◯ 概算金額: ¥${low.toLocaleString("ja-JP")}〜¥${high.toLocaleString("ja-JP")}（税込）`,
      "",
      "※上記は過去実績に基づく概算です。お車の状態により変動します。",
      `※${closing}`,
    ].join("\n");
  }
  // 金額を出せないケース。ボタンで LINE 継続するときは「お車を拝見して＝来店前提」の一文が
  // closing (LINEで承ります) と矛盾するため出さない。ボタン無し時のみ従来の来店前提文を残す。
  const noAmount = ["【お見積りについて】", ...head, ""];
  if (!input.canContinueOnLine) noAmount.push("お見積りはお車を拝見してのご案内になります。");
  noAmount.push(closing);
  return noAmount.join("\n");
}

/**
 * 受信メッセージに概算見積りを LINE で自動返信する。失敗しても投げない。
 * 返り値は「このメッセージに返信を送ったか」— 呼び出し側 (inboundAuto) が
 * ナレッジ自動返信との二重返信を防ぐために使う。
 */
export async function maybeAutoReplyRoughEstimate(params: MaybeAutoReplyRoughEstimateParams): Promise<boolean> {
  const { tenantId, customerId } = params;
  // 送信成功後に後続処理 (監査ログ等) が投げても「返信済み」を正しく報告する
  // (catch で false を返すと呼び出し側の二重返信ガードが破れるため)。
  let replied = false;
  try {
    const lineUserId = params.lineUserId?.trim();
    if (!lineUserId) return false; // push 返信先が無い (LINE 以外) なら何もしない
    if (params.intent !== "inquiry_only" && params.intent !== "new_reservation") return false;

    const settings = params.settings ?? (await loadAiAutomationSettings(tenantId));
    if (!shouldAutoReplyRoughEstimate(settings)) return false;

    const admin = createServiceRoleAdmin("AI auto-reply rough estimate — LINE webhook lacks auth session");
    const tenant =
      params.tenant ??
      (await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single()).data ??
      null;
    if (!tenant || tenant.is_active === false) return false;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_invoice_quote")) return false;

    const service = params.service?.trim();
    const vehicleText = params.vehicleText?.trim();
    if (!service || !vehicleText) {
      // AI 抽出が施工内容/車両を取り損ねても、原文が価格問い合わせらしければ
      // 黙ってスキップせず不足情報を聞き返す。キーワードが無ければ従来通り何もしない
      // (無関係な問い合わせに車両情報を尋ね返すのを避けるため)。
      if (!PRICE_INQUIRY_PATTERN.test(params.text ?? "")) return false;
      const askBody = buildMissingInfoMessage({ hasService: !!service, hasVehicle: !!vehicleText });
      const asked = await sendCustomerLineText({ tenantId, customerId: customerId ?? null, lineUserId, body: askBody });
      if (!asked) {
        logger.warn("[quoteReplyAuto] missing-info reply delivery failed", { tenantId, lineUserId });
        return false;
      }
      replied = true;
      await logAutoActionExecuted({
        tenantId,
        actionKey: "quote.auto_reply_rough_estimate",
        resource: { kind: "line_user", id: lineUserId },
        detail: {
          channel: params.channel ?? "line",
          customer_id: customerId,
          source_message_id: params.messageId,
          missing_info: true,
          has_service: !!service,
          has_vehicle: !!vehicleText,
        },
      });
      return true;
    }

    // 顧客名・登録車両は既知顧客のときだけ引く。未紐付けの新規客は車両テキストと
    // テナント全体の過去請求実績だけで概算する (精度は落ちるが返信はできる)。
    const [customerRes, vehiclesRes, invoicesRes, menuRes, sizeMasterRes] = await Promise.all([
      customerId
        ? admin.from("customers").select("name").eq("id", customerId).eq("tenant_id", tenantId).maybeSingle()
        : Promise.resolve({ data: null }),
      customerId
        ? admin
            .from("vehicles")
            .select("maker, model, size_class, plate_display")
            .eq("tenant_id", tenantId)
            .eq("customer_id", customerId)
            .limit(5)
        : Promise.resolve({ data: [] }),
      admin
        .from("invoices")
        .select("items_json, total")
        .eq("tenant_id", tenantId)
        .order("issued_at", { ascending: false })
        .limit(20),
      admin
        .from("menu_items")
        .select("name, unit_price, category_large, size_axis, size_prices")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(100),
      // 全車種マスタ (全テナント共有)。未登録車の問い合わせでも車両サイズ (size_class) を
      // 車種テキストから引けるようにする。サイズ別価格メニューの価格解決に使う。
      admin.from("vehicle_size_master").select("maker, model, size_class").limit(5000),
    ]);
    const customer = customerRes.data as { name?: string | null } | null;

    // 登録車両とテキスト照合。マッチすればサイズ係数込みで精度が上がる。
    const haystack = vehicleText.toLowerCase();
    const matched = (
      (vehiclesRes.data as Array<{
        maker: string | null;
        model: string | null;
        size_class: string | null;
        plate_display: string | null;
      }> | null) ?? []
    ).find((v) =>
      [v.maker, v.model, v.plate_display]
        .filter((t): t is string => !!t && t.trim().length >= 2)
        .some((t) => haystack.includes(t.toLowerCase())),
    );
    // size_class は「登録車両 → 全車種マスタ(テキスト一致)」の順で解決する。未登録の新規客でも
    // 車種名から車両サイズを引ければ、サイズ別価格メニューと車両サイズ係数が効く。
    const sizeClassFromMaster = resolveSizeClassFromText(vehicleText, sizeMasterRes.data);
    const vehicle = matched
      ? { maker: matched.maker, model: matched.model, size_class: matched.size_class ?? sizeClassFromMaster }
      : { maker: null, model: vehicleText, size_class: sizeClassFromMaster };

    const pastInvoices = ((invoicesRes.data as Array<{ items_json: unknown; total: number | null }> | null) ?? [])
      .map((r) => extractInvoiceLines(r.items_json, r.total))
      .filter((inv) => inv.items.length > 0)
      .slice(0, 5);

    // 品目マスタ (menu_items) をカテゴリ一致で絞り込み、登録価格があれば過去請求からの
    // 推測より優先して概算の土台にする (fetchAddonRecommendations と同じ「登録メニュー
    // 優先・過去実績はフォールバック」パターン、カテゴリ一致判定は categoryMatchesQuery を共有)。
    //
    // 概算見積りは自動でそのまま顧客に届く (人の確認なし) ため、以下の2点は
    // fetchAddonRecommendations (提案止まりで実害が小さい) より慎重に扱う:
    //   1. 単価未設定 (unit_price が 0/未入力) の品目はマッチさせない。登録単価が無い品目は
    //      quoteFromVehicle.ts の medianUnitPriceFor フォールバックが品目名と請求書の摘要
    //      文言の完全一致を要求するためほぼ一致せず ¥0 になり、金額が無言で過小になる。
    //   2. service は「ガラスコーティング, ホイール撥水」のようにカンマ区切りで複数の施工内容
    //      を表すことがある (inboundReservationExtract.ts の抽出仕様)。一部の内容にしか
    //      一致する品目が無い場合に baseMenu を使うと、表示上は全内容分の金額に見えて実際は
    //      一部しか値付けされていない概算になる。全ての内容に品目が見つかった場合のみ使う。
    const menuItems =
      (menuRes.data as Array<{
        name: string;
        unit_price: number | null;
        category_large: string | null;
        size_axis: string | null;
        size_prices: SizePrices | null;
      }> | null) ?? [];
    // 各品目の「この車両に適用する税抜価格」を解決する:
    //   - size_axis='vehicle_size' … 車両サイズ(size_class)に対応する登録価格。size_adjusted=true
    //     (車両サイズ係数は quoteFromVehicle 側で二重に掛けない)。size_class 不明/該当段なしは対象外。
    //   - size_axis='wheel_size'   … ホイールインチが自動概算では不明のため今フェーズは対象外
    //     (別PRで「インチを聞き返す」会話フローで対応)。
    //   - それ以外 … 従来どおり単一単価 (unit_price>0)。
    const pricedMenuItems = menuItems
      .map((m) => {
        if (m.size_axis === "vehicle_size" && m.size_prices) {
          const p = priceForVehicleSize(m.size_prices, vehicle.size_class);
          return p != null ? { name: m.name, category_large: m.category_large, price: p, size_adjusted: true } : null;
        }
        if (m.size_axis === "wheel_size") return null;
        return typeof m.unit_price === "number" && m.unit_price > 0
          ? { name: m.name, category_large: m.category_large, price: m.unit_price, size_adjusted: false }
          : null;
      })
      .filter((m): m is { name: string; category_large: string | null; price: number; size_adjusted: boolean } => !!m);
    const serviceSegments = service
      .split(/[、,\/・]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const segments = serviceSegments.length > 0 ? serviceSegments : [service.trim()];
    const matchedMenu = pricedMenuItems.filter((m) =>
      segments.some((seg) => categoryMatchesQuery(m.category_large, seg)),
    );
    const allSegmentsCovered = segments.every((seg) =>
      matchedMenu.some((m) => categoryMatchesQuery(m.category_large, seg)),
    );
    const baseMenu =
      allSegmentsCovered && matchedMenu.length > 0
        ? matchedMenu.slice(0, 5).map((m) => ({ name: m.name, default_price: m.price, size_adjusted: m.size_adjusted }))
        : undefined;

    const usage = startAiRouteUsage(ENDPOINT);
    const quote = await generateQuoteFromVehicle(
      {
        vehicle,
        customerName: customer?.name ?? null,
        serviceCategory: service,
        baseMenu,
        pastInvoices,
      },
      { model: fastModelForPlanTier(tenant.plan_tier) },
    );

    // 概算の材料が皆無 (総額 0) なら金額を出さず来店案内を返す。それ以外は概算レンジを返す。
    const totalInclTax = Math.round(quote.total * (1 + TAX_RATE));
    // ボタン誘導を添えるときは締めの文面も「LINEで正式見積りへ続けられる」に揃える
    // (概算=来店のみ、という従来の締めとの矛盾を無くす=文面整合)。
    const canContinueOnLine = params.attachButtons ?? false;
    const body = buildRoughEstimateMessage({ service, vehicleText, totalInclTax, canContinueOnLine });

    // 誘導ボタン付き (会話フロー opt-in・進行中フロー無し) は、概算の直後に「正式なお見積りを
    // お願いしたい」(→見積りフロー開始)・「スタッフに相談」を出して LINE 内で先へ進める。
    // 「概算だけで終わらせない」導線 (従来は maybeStartQuoteFlow が担っていたが概算送信後は
    // 文面矛盾でスキップされていた) を、文面を揃えたボタンで置き換える。
    const delivered = canContinueOnLine
      ? await sendCustomerLineButtons({
          tenantId,
          customerId: customerId ?? null,
          lineUserId,
          text: body,
          buttons: buildFollowupButtons(),
        })
      : await sendCustomerLineText({
          tenantId,
          customerId: customerId ?? null,
          lineUserId,
          body,
        });
    if (!delivered) {
      usage.record({ tenantId, outcome: "error", meta: { auto: true, committed: false } });
      return false;
    }
    replied = true;

    await logAutoActionExecuted({
      tenantId,
      actionKey: "quote.auto_reply_rough_estimate",
      resource: { kind: "line_user", id: lineUserId },
      detail: {
        channel: params.channel ?? "line",
        customer_id: customerId,
        source_message_id: params.messageId,
        missing_info: false,
        confidence: quote.confidence,
        total_incl_tax: totalInclTax,
        has_amount: totalInclTax > 0,
      },
    });

    usage.record({
      tenantId,
      outcome: quote.ai ? "ok" : "error",
      confidence: quote.confidence,
      meta: { auto: true, committed: true, ai: quote.ai, total_incl_tax: totalInclTax },
    });
    return true;
  } catch (e) {
    logger.warn("[quoteReplyAuto] maybeAutoReplyRoughEstimate threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return replied;
  }
}
