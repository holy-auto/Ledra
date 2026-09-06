/**
 * 証明書の無効化（active → void）の**単一の実装**。
 *
 * 2026-09-05 の代表判断で一本化した（DECISION_LOG 2026-09-05）。それまでは
 * 「取得 → void 済み短絡 → status 更新 → 監査記録」を5経路がそれぞれ再実装しており、
 * **実装がすでに食い違っていた**。
 *
 * | 経路 | 検索キー | 理由 | updated_at | 監査 |
 * |---|---|---|---|---|
 * | `api/certificates/void`           | public_id | 無し | 書く     | 証明書ログ |
 * | `api/admin/certificates/void`     | public_id | 無し | 書く     | 証明書ログ |
 * | `api/mobile/certificates/[id]/void` | id      | 必須 | **書かない** | テナントログのみ |
 * | `api/admin/certificates/status`   | public_id | 無し | 書く     | 証明書ログ |
 * | `admin/vehicles/[id]` Server Action | id + vehicle_id | 無し | 書く | vehicle_histories のみ |
 *
 * `updated_at` を書かない経路と、証明書ログに残らない経路があった。
 * ここに寄せることで、**どの入口から消しても同じ行が同じように残る**。
 *
 * ## 何をここに入れ、何を呼び出し側に残したか
 *
 * - **入れた**: テナント絞り込み・void 済みの短絡・`status`/`updated_at`/`meta.void_reason`
 *   の書き込み・証明書監査ログ。
 * - **残した**: 認証と `certificates:void` の権限判定（呼び出し側の `caller` の形が
 *   Web / モバイルで違う）、経路固有の追記（`vehicle_histories`・テナント監査ログ）、
 *   HTTP 応答の組み立て。
 *
 * ## Supabase クライアントを引数で受ける理由
 *
 * 経路によって service-role（`createTenantScopedAdmin`）とユーザースコープ（RLS 経由）が
 * 混在している。**どちらかに寄せると各経路の信頼境界が変わる**ので、ここでは統一しない。
 * ただし `tenant_id` の絞り込みは**このモジュールが必ず掛ける**ので、
 * どちらを渡しても他テナントの証明書には触れない。
 *
 * ponytail: 上限。RLS 側のポリシーは別 PR の対象。`certificates` の UPDATE は
 * PERMISSIVE ポリシー2本の OR で評価され、テナントメンバーなら誰でも通る
 * （2026-08-31 に viewer が無効化できていたのはこれが理由）。**実効的な守りは
 * 呼び出し側の `requirePermission(caller, "certificates:void")` 側にある。**
 */
import { logCertificateAction, type CertificateAuditType } from "@/lib/audit/certificateLog";

/** 無効化対象の指定。`public_id` か、`id`（必要なら車両で追加に絞る）。 */
export type CertificateSelector = { publicId: string } | { certificateId: string; vehicleId?: string };

export interface VoidCertificateInput {
  tenantId: string;
  userId?: string | null;
  selector: CertificateSelector;
  /** 取消理由。渡すと `meta.void_reason` に残す（既存 meta は保持）。 */
  reason?: string | null;
  /**
   * `active` 以外を拒否するか。既定は false（`draft` の取り消しも通す）。
   * モバイルは `active` のみを対象にしているので true を渡す。
   */
  requireActive?: boolean;
  /** 監査ログに残す IP / UA。`getRequestMeta(req)` の戻り値をそのまま渡せる。 */
  requestMeta?: { ip?: string | null; userAgent?: string | null };
  /** 監査ログの種別。既定は `certificate_voided`。 */
  auditType?: CertificateAuditType;
  /**
   * 監査ログの説明。省略すると `Public ID: <公開ID>`。
   *
   * **この行は公開証明書ページに出る。** 個人が特定できる値（担当者の uid・IP・氏名）を
   * 渡さないこと。`logCertificateAction` 側の既定はそれらを含むので、ここでは使わない。
   */
  description?: string | null;
}

export interface VoidedCertificate {
  id: string;
  publicId: string | null;
  vehicleId: string | null;
  status: string | null;
  meta: Record<string, unknown> | null;
}

export type VoidCertificateResult =
  | { ok: true; alreadyVoid: true; certificate: VoidedCertificate }
  | { ok: true; alreadyVoid: false; certificate: VoidedCertificate }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "not_active"; currentStatus: string }
  | { ok: false; kind: "update_failed"; error: unknown };

/** Supabase クライアントのうち、ここで使う部分だけの構造型。 */
type Db = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function applySelector(query: any, selector: CertificateSelector) {
  if ("publicId" in selector) return query.eq("public_id", selector.publicId);
  const q = query.eq("id", selector.certificateId);
  return selector.vehicleId ? q.eq("vehicle_id", selector.vehicleId) : q;
}

/**
 * 証明書を無効化する。認可は**呼び出し側**で済ませておくこと
 * （`requirePermission(caller, "certificates:void")`）。
 */
export async function voidCertificate(db: Db, input: VoidCertificateInput): Promise<VoidCertificateResult> {
  const { tenantId, selector } = input;

  const { data: cert, error: fetchErr } = await applySelector(
    db.from("certificates").select("id, public_id, vehicle_id, status, meta").eq("tenant_id", tenantId),
    selector,
  )
    .limit(1)
    .maybeSingle();

  if (fetchErr || !cert) return { ok: false, kind: "not_found" };

  const current: VoidedCertificate = {
    id: cert.id as string,
    publicId: (cert.public_id as string | null) ?? null,
    vehicleId: (cert.vehicle_id as string | null) ?? null,
    status: (cert.status as string | null) ?? null,
    meta: (cert.meta as Record<string, unknown> | null) ?? null,
  };

  const status = String(cert.status ?? "").toLowerCase();
  // **`requireActive` を短絡より先に見る。** 逆にすると、モバイルが
  // void 済みの証明書を無効化しようとしたとき 400 ではなく 200 が返り、
  // 呼び出し側が「成功した」として `void_reason` 付きの監査イベントを書いてしまう。
  // UPDATE は起きていないので、**裏付けの無い監査記録が1件残る**
  // （PR #1027 の `/code-review` 指摘）。元のモバイル実装は 400 を返していた。
  if (input.requireActive && status !== "active") {
    return { ok: false, kind: "not_active", currentStatus: status };
  }
  if (status === "void") return { ok: true, alreadyVoid: true, certificate: current };

  // 取消理由の専用列は certificates に無い（`void_reason` は part_installations 側）。
  // 既存の meta を潰さないよう読み込んでから重ねる。
  const patch: Record<string, unknown> = { status: "void", updated_at: new Date().toISOString() };
  if (input.reason) patch.meta = { ...(current.meta ?? {}), void_reason: input.reason };

  const { error: updateErr } = await applySelector(
    db.from("certificates").update(patch).eq("tenant_id", tenantId),
    selector,
  );
  if (updateErr) return { ok: false, kind: "update_failed", error: updateErr };

  // **await する。** `logCertificateAction` は自分で例外を握るので
  // （`Promise<void>` を返し、失敗しても throw しない）、await しても
  // 監査の失敗が無効化の失敗になることはない。
  // 一方 await しないと、Server Action から呼ばれたとき呼び出し側が直後に
  // `redirect()` するため、**サーバレス実行が insert の前に終了しうる**。
  // 一本化前の車両詳細は自前の insert を await していたので、これは
  // 一本化で持ち込んだ退行（Codex レビュー指摘）。
  //
  // `description` の既定は **`Public ID: …` だけ**にする。
  //
  // 一本化のとき既定を「証明書を無効化 (void)」にしたら、車両詳細が持っていた
  // `Public ID: …` が消えて、どの証明書を消したのか分からなくなった。
  // かといって `logCertificateAction` 側の既定に委ねてもいけない —— あちらは
  // `Public ID / User: <認証 uid> / IP: <スタッフの IP>` を組み立てるが、
  // **この行は公開証明書ページに出る**。`getPublicCertificateData` が
  // 車両の `vehicle_histories` を type で絞らず全部引き（`publicData.ts`）、
  // `UnifiedTimeline` が `description` をそのまま描画する。`/c/[public_id]` は
  // 未認証で開ける（middleware は無い）。スタッフの uid と IP が公開される。
  //
  // つまりここは**2つの既定の間**にしか正解が無い。`Public ID` は URL に既に
  // 出ている公開情報で、一本化前の車両詳細が書いていたのと同じ内容
  // （PR #1040 の `/code-review` 指摘）。
  if (current.publicId) {
    await logCertificateAction({
      type: input.auditType ?? "certificate_voided",
      tenantId,
      publicId: current.publicId,
      certificateId: current.id,
      vehicleId: current.vehicleId,
      userId: input.userId ?? null,
      description: input.description ?? `Public ID: ${current.publicId}`,
      ip: input.requestMeta?.ip ?? null,
      userAgent: input.requestMeta?.userAgent ?? null,
    });
  }

  return {
    ok: true,
    alreadyVoid: false,
    certificate: { ...current, status: "void", meta: (patch.meta as Record<string, unknown>) ?? current.meta },
  };
}
