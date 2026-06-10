import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/format";
import DeliveryNoteUpload from "./DeliveryNoteUpload";

/**
 * 装着詳細ドリルダウン（運用監査）。
 *
 * 1件の装着について、内容・証拠・確定署名・アンカー・検知(findings)を一覧する。
 * 設計: docs/parts-installation-integrity-design.md
 */

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  installed: "装着済み（未確定）",
  customer_verified: "確定済み（完全凍結）",
  disputed: "係争中",
  voided: "取消済み",
};

const RULE_LABEL: Record<string, string> = {
  serial_reused: "シリアル使い回し",
  photo_duplicate: "写真の使い回し",
  qty_mismatch: "数量不一致",
  three_way_mismatch: "三方照合不一致",
  context_mismatch: "文脈不一致",
  deepfake: "ディープフェイク疑い",
  photo_edited: "写真加工の疑い",
  timestamp_anomaly: "撮影時刻の異常",
};

function yen(n: number | null): string {
  return n == null ? "—" : `¥${n.toLocaleString("ja-JP")}`;
}

type Installation = {
  id: string;
  part_name: string;
  gtin: string | null;
  lot_code: string | null;
  part_kind: string;
  quantity: number;
  unit: string;
  amount_jpy: number | null;
  status: string;
  required_assurance: string;
  content_hash: string | null;
  vehicle_id: string | null;
  customer_id: string | null;
  installed_at: string;
  customer_verified_at: string | null;
  void_reason: string | null;
};

export default async function PartInstallationDetail({ params }: { params: Promise<{ installationId: string }> }) {
  const { installationId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/admin/parts-integrity/${installationId}`);

  // RLS でテナント越えは自動遮断
  const { data: inst } = await supabase
    .from("part_installations")
    .select(
      "id, part_name, gtin, lot_code, part_kind, quantity, unit, amount_jpy, status, required_assurance, content_hash, vehicle_id, customer_id, installed_at, customer_verified_at, void_reason",
    )
    .eq("id", installationId)
    .maybeSingle<Installation>();
  if (!inst) notFound();

  const [evidenceRes, sigRes, anchorRes, findingsRes] = await Promise.all([
    supabase
      .from("part_installation_evidence")
      .select("id, kind, sha256, authenticity_grade, created_at")
      .eq("installation_id", installationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("part_confirmation_signatures")
      .select("status, channel, assurance, signed_at, tsa_authority, tsa_timestamp_at, public_key_fingerprint")
      .eq("installation_id", installationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("part_installation_anchors")
      .select("polygon_tx_hash, polygon_network, anchored_at")
      .eq("installation_id", installationId)
      .maybeSingle(),
    supabase
      .from("part_integrity_findings")
      .select("id, rule, severity, detail, status, created_at")
      .eq("installation_id", installationId)
      .order("created_at", { ascending: false }),
  ]);

  const evidence = evidenceRes.data ?? [];
  const sig = sigRes.data;
  const anchor = anchorRes.data;
  const findings = findingsRes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        tag="部品インテグリティ"
        title={inst.part_name}
        description="装着レコードの内容・証拠・確定署名・アンカー・検知結果。"
        actions={
          <Link href="/admin/parts-integrity" className="btn-secondary">
            監査一覧へ
          </Link>
        }
      />

      {/* 基本情報 */}
      <section className="rounded-lg border border-border-default p-4">
        <h2 className="mb-3 font-semibold text-primary">装着内容</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <Field label="状態" value={STATUS_LABEL[inst.status] ?? inst.status} />
          <Field label="種別" value={inst.part_kind} />
          <Field label="必要保証グレード" value={inst.required_assurance} />
          <Field label="数量" value={`${inst.quantity} ${inst.unit}`} />
          <Field label="金額（税込）" value={yen(inst.amount_jpy)} />
          <Field label="GTIN" value={inst.gtin ?? "—"} />
          <Field label="ロット" value={inst.lot_code ?? "—"} />
          <Field label="装着日時" value={formatDateTime(inst.installed_at)} />
          <Field
            label="確定日時"
            value={inst.customer_verified_at ? formatDateTime(inst.customer_verified_at) : "未確定"}
          />
        </dl>
        {inst.content_hash && (
          <p className="mt-3 break-all text-xs text-secondary">content_hash: {inst.content_hash}</p>
        )}
        {inst.void_reason && <p className="mt-2 text-sm text-red-600">取消理由: {inst.void_reason}</p>}
      </section>

      {/* 確定署名 */}
      <section className="rounded-lg border border-border-default p-4">
        <h2 className="mb-3 font-semibold text-primary">確定署名（顧客本人）</h2>
        {sig ? (
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <Field label="状態" value={sig.status} />
            <Field label="チャンネル" value={sig.channel ?? "—"} />
            <Field label="保証グレード" value={sig.assurance ?? "—"} />
            <Field label="署名日時" value={sig.signed_at ? formatDateTime(sig.signed_at) : "—"} />
            <Field label="TSA" value={sig.tsa_authority ?? "（未付与）"} />
            <Field
              label="TSAタイムスタンプ"
              value={sig.tsa_timestamp_at ? formatDateTime(sig.tsa_timestamp_at) : "—"}
            />
          </dl>
        ) : (
          <p className="text-sm text-secondary">確定署名はまだありません。</p>
        )}
      </section>

      {/* アンカー */}
      <section className="rounded-lg border border-border-default p-4">
        <h2 className="mb-3 font-semibold text-primary">ブロックチェーンアンカー</h2>
        {anchor?.polygon_tx_hash ? (
          <p className="break-all text-sm text-primary">
            {anchor.polygon_network}: {anchor.polygon_tx_hash}
            <span className="ml-2 text-secondary">
              （{anchor.anchored_at ? formatDateTime(anchor.anchored_at) : ""}）
            </span>
          </p>
        ) : (
          <p className="text-sm text-secondary">
            個別アンカーなし（高額/シリアル品のみ対象。車両メタアンカーは別途）。
          </p>
        )}
      </section>

      {/* 証拠 */}
      <section className="rounded-lg border border-border-default p-4">
        <h2 className="mb-3 font-semibold text-primary">証拠（{evidence.length}件・追記専用）</h2>
        {inst.status !== "customer_verified" && inst.status !== "voided" && (
          <div className="mb-4 border-b border-border-subtle pb-4">
            <DeliveryNoteUpload installationId={installationId} />
          </div>
        )}
        {evidence.length === 0 ? (
          <p className="text-sm text-secondary">証拠は登録されていません。</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {evidence.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 text-primary">
                <span className="font-medium">{e.kind}</span>
                <span className="text-secondary">grade: {e.authenticity_grade}</span>
                {e.sha256 && <span className="break-all text-xs text-secondary">sha256: {e.sha256.slice(0, 16)}…</span>}
                <span className="text-secondary">{formatDateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 検知 */}
      <section className="rounded-lg border border-border-default p-4">
        <h2 className="mb-3 font-semibold text-primary">検知（{findings.length}件）</h2>
        {findings.length === 0 ? (
          <p className="text-sm text-secondary">検知はありません。</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {findings.map((f) => (
              <li key={f.id} className="text-primary">
                <span
                  className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${
                    f.severity === "critical"
                      ? "bg-red-100 text-red-700"
                      : f.severity === "warning"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {RULE_LABEL[f.rule] ?? f.rule}
                </span>
                <span className="text-secondary">{f.status}</span>
                <span className="ml-2 text-secondary">{formatDateTime(f.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-secondary">{label}</dt>
      <dd className="font-medium text-primary">{value}</dd>
    </div>
  );
}
