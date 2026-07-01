"use client";

import { useMemo, useRef, useState, useTransition, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCertAction } from "./actions";
import { enqueueOrFetch } from "@/lib/outbox/enqueueOrFetch";
import { enqueueOrFetchMultipart } from "@/lib/outbox/enqueueOrFetchMultipart";
import { certCreateJsonSchema, formDataToCertJson } from "@/lib/certificates/createCertificateApi";
import CertPackagePicker from "./CertPackagePicker";
import VehiclePickerSection from "./VehiclePickerSection";
import FilmThicknessSection from "./FilmThicknessSection";
import CoatingProductsSection from "./CoatingProductsSection";
import PpfCoverageSection from "./PpfCoverageSection";
import MaintenanceDetailsSection from "./MaintenanceDetailsSection";
import BodyRepairDetailsSection from "./BodyRepairDetailsSection";
import PhotoUploadSection, { type PhotoUploadHandle } from "./PhotoUploadSection";
import ManufacturerTemplatePicker from "./ManufacturerTemplatePicker";
import Button from "@/components/ui/Button";
import HelpTooltip from "@/components/ui/HelpTooltip";
import type { PlanTier } from "@/lib/billing/planFeatures";
import { PHOTO_LIMITS, canUseFeature } from "@/lib/billing/planFeatures";

// AI panels are heavy, opt-in features that are collapsed by default.
// Defer their JS to keep initial INP on /admin/certificates/new low.
const AiDraftPanel = dynamic(() => import("./AiDraftPanel"), {
  ssr: false,
  loading: () => null,
});
const AiQualityPanel = dynamic(() => import("./AiQualityPanel"), {
  ssr: false,
  loading: () => null,
});
// 音声メモ → ドラフト整形。Web Speech API はクライアント側でしか動かないので
// SSR を無効化し、必要になったときにだけロードする。
const VoiceMemoPanel = dynamic(() => import("./VoiceMemoPanel"), {
  ssr: false,
  loading: () => null,
});

type Vehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  vin_code?: string | null;
  customer_id?: string | null;
  customer?: { id: string; name: string } | null;
};

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "checkbox";

export type TemplateSchema = {
  version: number;
  sections: Array<{
    title: string;
    fields: Array<{
      key: string;
      label: string;
      type: FieldType;
      options?: string[];
      required?: boolean;
    }>;
  }>;
};

export type Template = {
  id: string;
  name: string;
  schema_json: TemplateSchema | null;
  category?: string | null;
};

type Props = {
  vehicles: Vehicle[];
  customers?: Customer[];
  defaultVehicleId?: string;
  defaultCustomerId?: string;
  defaultReservationId?: string;
  templates: Template[];
  selectedTemplate: Template | null;
  tenantLogoPath: string | null;
  planTier: PlanTier;
  tid: string;
  serviceType?: string; // "ppf" | "coating" | etc — derived from template category
  defaultWarrantyExclusions?: string;
};

const inputCls =
  "w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-secondary";
const sectionHeaderCls = "mb-4";
const sectionTagCls = "text-xs font-semibold tracking-[0.18em] text-muted";
const sectionTitleCls = "mt-0.5 text-base font-semibold text-primary";

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "FREE",
  starter: "STARTER",
  standard: "STANDARD",
  pro: "PRO",
};

export default function CertNewFormWrapper({
  vehicles,
  customers = [],
  defaultVehicleId,
  defaultCustomerId,
  defaultReservationId,
  templates,
  selectedTemplate,
  tenantLogoPath,
  planTier,
  tid,
  serviceType,
  defaultWarrantyExclusions,
}: Props) {
  const isPpf = serviceType === "ppf";
  const isMaintenance = serviceType === "maintenance";
  const isBodyRepair = serviceType === "body_repair";
  const isCoatingOrPpf = !isMaintenance && !isBodyRepair;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitStatus, setSubmitStatus] = useState<"active" | "draft">("active");
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultSaveMsg, setDefaultSaveMsg] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [gateBlock, setGateBlock] = useState<{ reason: string; details: string[] } | null>(null);
  const photoRef = useRef<PhotoUploadHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const warrantyRef = useRef<HTMLTextAreaElement>(null);

  const maxPhotos = PHOTO_LIMITS[planTier];
  const planLabel = PLAN_LABELS[planTier];
  const schema = selectedTemplate?.schema_json ?? null;
  const canAiDraft = canUseFeature(planTier, "ai_draft");
  const canAiQuality = canUseFeature(planTier, "ai_quality");

  // フォームマウント時に 1 度だけ idempotency-key を発行する。
  // 同じフォームを誤って 2 回 submit しても、サーバ側で 2 回目はリプレイになる。
  // Outbox 経由で送信される時も同じ key が使われ、二重発行を防ぐ。
  const idempotencyKey = useMemo(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `cert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }, []);

  // AI下書き適用時にフォームフィールドを自動入力する
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(defaultVehicleId);
  const [draftApplied, setDraftApplied] = useState(false);

  // 前回証明書データ（車両選択時に取得）
  type LastCert = {
    public_id: string;
    created_at: string;
    service_type: string | null;
    expiry_value: string | null;
    warranty_exclusions: string | null;
    customer_name: string | null;
  };
  const [lastCert, setLastCert] = useState<LastCert | null>(null);
  const [lastCertDismissed, setLastCertDismissed] = useState(false);
  const expiryValueRef = useRef<HTMLInputElement>(null);

  const handleVehicleChange = useCallback(async (vehicleId: string | undefined) => {
    setSelectedVehicleId(vehicleId);
    setLastCert(null);
    setLastCertDismissed(false);
    if (!vehicleId) return;
    try {
      const res = await fetch(`/api/admin/vehicles/${encodeURIComponent(vehicleId)}/last-cert`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.found) setLastCert(json.cert as LastCert);
    } catch {
      // 取得失敗は無視（必須機能ではない）
    }
  }, []);

  const applyLastCert = () => {
    if (!lastCert) return;
    if (lastCert.expiry_value && expiryValueRef.current && !expiryValueRef.current.value) {
      expiryValueRef.current.value = lastCert.expiry_value;
    }
    if (lastCert.warranty_exclusions && warrantyRef.current && !warrantyRef.current.value) {
      warrantyRef.current.value = lastCert.warranty_exclusions;
    }
    setLastCertDismissed(true);
  };

  const handleAiDraftApply = useCallback((draft: { title: string; description: string; cautions: string }) => {
    if (!formRef.current) return;
    const form = formRef.current;
    // 施工内容フィールドへ自動入力
    const contentField = form.querySelector<HTMLTextAreaElement>("textarea[name='content_free_text']");
    if (contentField) {
      contentField.value = `${draft.title}\n\n${draft.description}${draft.cautions ? `\n\n【注意事項】\n${draft.cautions}` : ""}`;
    }
    setDraftApplied(true);
    setTimeout(() => setDraftApplied(false), 3000);
  }, []);

  /**
   * フォームの全 string フィールドをルール監査用の Record に変換する。
   * 写真や status などは除外。
   */
  const collectFieldValues = (formData: FormData): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value !== "string") continue;
      if (key === "status" || key === "template_id" || key === "template_name" || key === "quality_fields_json")
        continue;
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
    }
    return out;
  };

  /**
   * 発行前ゲート: ルールベースで必須写真・必須項目・error 警告を判定。
   * Vision を呼ばないため軽量。レスポンスの gate.action を返す。
   */
  type GateOutcome =
    | { action: "block"; reason: string; details: string[] }
    | { action: "warn"; warnings: string[] }
    | { action: "pass" };
  const runPrecheckGate = async (formData: FormData): Promise<GateOutcome> => {
    if (!canAiQuality || !serviceType) return { action: "pass" };
    try {
      const res = await fetch("/api/admin/certificates/ai-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: serviceType,
          photo_count: photoRef.current?.getFiles().length ?? 0,
          field_values: collectFieldValues(formData),
          precheck: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.gate) return { action: "pass" };
      const gate = json.gate as
        | { action: "block"; reason: string; missingFields: string[]; missingPhotos: string[]; errors: string[] }
        | { action: "warn"; warnings: string[] }
        | { action: "pass" };
      if (gate.action === "block") {
        const details = [
          ...gate.missingPhotos.map((p) => `写真不足: ${p}`),
          ...gate.missingFields.map((f) => `項目不足: ${f}`),
          ...gate.errors,
        ];
        return { action: "block", reason: gate.reason, details };
      }
      if (gate.action === "warn") return { action: "warn", warnings: gate.warnings };
      return { action: "pass" };
    } catch {
      // ゲート呼び出しに失敗した場合は発行を妨げない (フェイルオープン)
      return { action: "pass" };
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setGateBlock(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("status", submitStatus);
    // 品質監査用のフラットな field_values スナップショット (発行前ゲートと同一の入力) を
    // 作成リクエストに載せ、アップロード時の自動品質監査が誤検知なく再現できるようにする。
    // オンライン (createCertAction) / オフライン (formDataToCertJson) 両経路で round-trip する。
    formData.set("quality_fields_json", JSON.stringify(collectFieldValues(formData)));

    const vehicleId = String(formData.get("vehicle_id") ?? "").trim();
    const vehicleMaker = String(formData.get("vehicle_maker") ?? "").trim();
    const vehicleModelVal = String(formData.get("model") ?? "").trim();
    if (!vehicleId && !vehicleMaker && !vehicleModelVal) {
      setError("車両情報を入力してください。マスタから選択、またはメーカー・車種を手入力してください。");
      form.querySelector<HTMLElement>("[data-vehicle-picker]")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    const attachedFiles = photoRef.current?.getFiles() ?? [];

    // 写真添付必須ルール (全テナント一律): 発行には施工写真が 1 枚以上必要。
    // 写真ゼロのときは発行をブロックし、写真追加か「下書き保存」へ誘導する。
    if (submitStatus === "active" && attachedFiles.length === 0) {
      setGateBlock({
        reason: "施工写真が添付されていません",
        details: ["発行には施工写真が1枚以上必要です。写真を追加するか、「下書き保存」で保存してください。"],
      });
      form.querySelector<HTMLElement>("[data-ai-quality-panel]")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    // 発行前ゲート (下書き保存はスキップ)
    if (submitStatus === "active") {
      const gate = await runPrecheckGate(formData);
      if (gate.action === "block") {
        setGateBlock({ reason: gate.reason, details: gate.details });
        form.querySelector<HTMLElement>("[data-ai-quality-panel]")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        return;
      }
      if (gate.action === "warn") {
        const proceed = window.confirm(
          `品質チェックで ${gate.warnings.length} 件の推奨修正があります:\n\n${gate.warnings
            .slice(0, 5)
            .map((w) => `・${w}`)
            .join("\n")}${gate.warnings.length > 5 ? "\n…" : ""}\n\nこのまま発行しますか？`,
        );
        if (!proceed) return;
      }
    }

    const files = attachedFiles;

    // オフライン経路: 文字情報 + 写真の両方を outbox に enqueue する。
    // 写真は cert_idempotency_key を multipart field に乗せて、復帰後に
    // 同 key で cert の public_id を逆引きしてアップロードされる
    // (lookupCertByIdempotencyKey via /api/certificates/images/upload)。
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const jsonPayload = formDataToCertJson(formData);
      const parsed = certCreateJsonSchema.safeParse(jsonPayload);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "入力内容に不備があります");
        return;
      }
      try {
        // 1) 証明書本体 (cert_idempotency_key と同一の idempotency-key で重複防止)
        await enqueueOrFetch({
          url: "/api/admin/certificates",
          method: "POST",
          body: parsed.data,
          label: `証明書発行 (オフライン): ${parsed.data.customer_name}`,
          kind: "certificate_create",
          idempotencyKey,
        });
        // 2) 写真群 (1 枚 1 enqueue。drainOutbox が順次送信)
        for (const file of files) {
          await enqueueOrFetchMultipart({
            url: "/api/certificates/images/upload",
            fields: { cert_idempotency_key: idempotencyKey },
            files: [{ fieldName: "photos", file }],
            label: `証明書写真 (オフライン): ${file.name}`,
            kind: "certificate_image_upload",
          });
        }
        // 3) 発行 (active 化) は写真アップロード後に行う必要があるため、最後に
        //    activate-by-key を enqueue する。outbox は順次送信するので、
        //    写真アップロード完了後に走り、サーバ側で写真有無を再検証する。
        //    「下書き保存」のときは active 化しない。
        if (submitStatus === "active") {
          await enqueueOrFetch({
            url: "/api/certificates/activate-by-key",
            method: "POST",
            body: { cert_idempotency_key: idempotencyKey },
            label: `証明書を発行 (オフライン): ${parsed.data.customer_name}`,
            kind: "certificate_activate",
          });
        }
        setError(null);
        const note =
          submitStatus === "active"
            ? `📡 オフラインのため証明書 + 写真 ${files.length} 枚をキューに保存しました。通信復帰後に「写真アップロード → 発行」まで自動実行されます。`
            : `📡 オフラインで下書き保存しました（写真 ${files.length} 枚）。通信復帰後に自動同期されます。`;
        setUploadProgress(note);
        return;
      } catch (e) {
        setError(`オフライン保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }

    startTransition(async () => {
      const result = await createCertAction(formData);
      if (!result.ok) {
        const errCode = "error" in result ? result.error : "unknown";
        setError(
          errCode === "vehicle_required"
            ? "車両情報を入力してください（マスタ選択またはメーカー・車種を手入力）。"
            : errCode === "customer_name_required"
              ? "お客様名を入力してください。"
              : `エラー: ${errCode}`,
        );
        return;
      }

      const { public_id } = result;

      if (files.length > 0) {
        setUploadProgress(`写真をアップロード中 (0/${files.length})…`);
        try {
          const photoForm = new FormData();
          photoForm.append("public_id", public_id);
          files.forEach((f) => photoForm.append("photos", f));
          const uploadRes = await fetch("/api/certificates/images/upload", {
            method: "POST",
            body: photoForm,
          });
          const uploadJson = await uploadRes.json();
          if (!uploadRes.ok) {
            console.warn("photo upload failed", uploadJson);
          } else {
            setUploadProgress(`写真 ${uploadJson.uploaded} 枚をアップロードしました`);

            // Phase 2: 注釈付きの写真があれば、対応する画像 ID を引いて
            // 注釈を保存し、焼き込みもキックする。
            // 紐付けはアップロード順 index で行う (ファイル名重複に強い)。
            const annotations = photoRef.current?.getAnnotations() ?? [];
            const uploadedImages: { id: string; file_name: string | null; upload_index?: number }[] = Array.isArray(
              uploadJson?.images,
            )
              ? uploadJson.images
              : [];
            if (annotations.length > 0 && uploadedImages.length > 0) {
              setUploadProgress("写真の注釈を保存中…");
              await Promise.all(
                annotations.map(async (entry) => {
                  const match = uploadedImages.find((img) => img.upload_index === entry.uploadIndex);
                  if (!match) return;
                  try {
                    const putRes = await fetch(`/api/certificates/images/${encodeURIComponent(match.id)}/annotations`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ annotations: entry.doc }),
                    });
                    if (!putRes.ok) {
                      console.warn("[markup] annotations PUT failed", await putRes.text());
                      return;
                    }
                    // 焼き込みはユーザー体験を遅らせないよう fire-and-forget。
                    fetch(`/api/certificates/images/${encodeURIComponent(match.id)}/render`, {
                      method: "POST",
                    }).catch((e) => console.warn("[markup] render failed", e));
                  } catch (e) {
                    console.warn("[markup] annotation post error", e);
                  }
                }),
              );
            }
          }
        } catch (e) {
          console.warn("photo upload error", e);
        }
      }

      // 発行 (active 化): 証明書は draft で作成済み。写真アップロード後に
      // status ルートで active 化する。サーバ側で写真有無を再検証するため、
      // 写真アップロードが失敗していればここでブロックされる (下書きのまま)。
      if (submitStatus === "active") {
        setUploadProgress("証明書を発行中…");
        try {
          const actRes = await fetch("/api/admin/certificates/status", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_id, status: "active" }),
          });
          if (!actRes.ok) {
            const actJson = await actRes.json().catch(() => ({}));
            setError(
              (actJson as { error?: string }).error ??
                "発行に失敗しました。写真が正しくアップロードされているか確認してください（下書きとして保存されています）。",
            );
            setUploadProgress(null);
            return;
          }
        } catch (e) {
          setError(`発行に失敗しました（下書きとして保存されています）: ${e instanceof Error ? e.message : String(e)}`);
          setUploadProgress(null);
          return;
        }
      }

      router.push(`/admin/certificates/new/success?pid=${encodeURIComponent(public_id)}`);
    });
  };

  const handleSaveWarrantyDefault = async () => {
    const text = warrantyRef.current?.value ?? "";
    setSavingDefault(true);
    setDefaultSaveMsg(null);
    try {
      const res = await fetch("/api/admin/settings/defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_warranty_exclusions: text }),
      });
      if (res.ok) {
        setDefaultSaveMsg("デフォルトとして保存しました");
      } else {
        setDefaultSaveMsg("保存に失敗しました");
      }
    } catch {
      setDefaultSaveMsg("保存に失敗しました");
    } finally {
      setSavingDefault(false);
      setTimeout(() => setDefaultSaveMsg(null), 3000);
    }
  };

  return (
    <>
      {/* ── テンプレート選択 ── */}
      <div className="glass-card p-5">
        <div className="mb-3">
          <div className={sectionTagCls}>TEMPLATE</div>
          <div className="mt-1 text-base font-semibold text-primary">テンプレートを選択</div>
        </div>
        <form action="/admin/certificates/new" method="get" className="flex gap-3 items-center">
          {/* テンプレ切替の GET で案件コンテキスト（車両/顧客/予約）を引き継ぐ。
              これが無いと案件発行→テンプレ変更で reservation_id 等が落ち、職人名の
              解決が車両全体のフォールバックに退化してしまう。 */}
          {defaultVehicleId && <input type="hidden" name="vehicle_id" value={defaultVehicleId} />}
          {defaultCustomerId && <input type="hidden" name="customer_id" value={defaultCustomerId} />}
          {defaultReservationId && <input type="hidden" name="reservation_id" value={defaultReservationId} />}
          <select name="tid" defaultValue={tid} className={`flex-1 ${inputCls}`}>
            {templates.length === 0 ? (
              <option value="">テンプレートがありません</option>
            ) : (
              templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            )}
          </select>
          <button
            type="submit"
            className="rounded-xl border border-border-default bg-surface px-4 py-2.5 text-sm font-medium text-primary hover:bg-surface-hover whitespace-nowrap"
          >
            選択
          </button>
        </form>
        {!tenantLogoPath && (
          <p className="mt-2 text-xs text-warning-text">
            ロゴ未設定 —{" "}
            <Link href="/admin/logo" className="underline">
              ロゴを設定する
            </Link>
          </p>
        )}
      </div>

      {/* ── メインフォーム ── */}
      <form ref={formRef} onSubmit={handleSubmit} className="glass-card p-6 space-y-0">
        <input type="hidden" name="template_id" value={selectedTemplate?.id ?? ""} />
        <input type="hidden" name="template_name" value={selectedTemplate?.name ?? ""} />
        {/* customer_id は VehiclePickerSection が単一の hidden フィールドとして送出する。
            ここで defaultCustomerId を二重に出すと formData.get("customer_id") が
            先頭の初期値を返し、プルダウン/検索で別の顧客に変更しても反映されない。
            defaultCustomerId は VehiclePickerSection に渡して初期選択させる。 */}
        {defaultReservationId && <input type="hidden" name="reservation_id" value={defaultReservationId} />}
        {serviceType && <input type="hidden" name="service_type" value={serviceType} />}

        {/* ━━━ 0a. メーカー指定デザイン（認定施工店のみ表示） ━━━ */}
        <section className="pb-6">
          <ManufacturerTemplatePicker serviceType={serviceType} />
        </section>

        {/* ━━━ 0. 施工パッケージ ━━━ */}
        <section className="pb-6">
          <CertPackagePicker templates={templates} currentTemplateId={tid} />
        </section>

        {/* ━━━ 1. 車種選択 ━━━ */}
        <section data-vehicle-picker className="pb-6">
          <VehiclePickerSection
            vehicles={
              defaultCustomerId
                ? vehicles.filter(
                    (v) => (v as Record<string, unknown>).customer_id === defaultCustomerId || !defaultVehicleId,
                  )
                : vehicles
            }
            customers={customers}
            defaultVehicleId={defaultVehicleId}
            defaultCustomerId={defaultCustomerId}
            onVehicleChange={handleVehicleChange}
          />

          {/* 前回証明書からの引き継ぎバナー */}
          {lastCert && !lastCertDismissed && (
            <div className="mt-3 rounded-xl border border-accent/20 bg-accent-dim px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-accent">前回の施工内容から引き継ぎますか？</span>
                  <span className="ml-2 text-xs text-muted">
                    {new Date(lastCert.created_at).toLocaleDateString("ja-JP")}
                    {lastCert.service_type ? ` · ${lastCert.service_type}` : ""}
                    {lastCert.customer_name ? ` · ${lastCert.customer_name}` : ""}
                  </span>
                  <ul className="mt-1 text-xs text-muted space-y-0.5">
                    {lastCert.expiry_value && <li>・有効条件: {lastCert.expiry_value}</li>}
                    {lastCert.warranty_exclusions && (
                      <li className="truncate">
                        ・保証除外: {lastCert.warranty_exclusions.slice(0, 60)}
                        {lastCert.warranty_exclusions.length > 60 ? "…" : ""}
                      </li>
                    )}
                  </ul>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={applyLastCert}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                  >
                    引き継ぐ
                  </button>
                  <button
                    type="button"
                    onClick={() => setLastCertDismissed(true)}
                    className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-hover"
                  >
                    スキップ
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ━━━ 2. PPF施工範囲（PPFテンプレート時のみ） ━━━ */}
        {isPpf && (
          <section className="border-t border-border-subtle py-6">
            <PpfCoverageSection />
          </section>
        )}

        {/* ━━━ 2b. 整備内容（整備テンプレート時のみ） ━━━ */}
        {isMaintenance && (
          <section className="border-t border-border-subtle py-6">
            <MaintenanceDetailsSection />
          </section>
        )}

        {/* ━━━ 2c. 鈑金塗装内容（鈑金塗装テンプレート時のみ） ━━━ */}
        {isBodyRepair && (
          <section className="border-t border-border-subtle py-6">
            <BodyRepairDetailsSection />
          </section>
        )}

        {/* ━━━ 3. コーティング剤 / 使用フィルム（コーティング・PPF時のみ） ━━━ */}
        {isCoatingOrPpf && (
          <section className="border-t border-border-subtle py-6">
            <CoatingProductsSection serviceType={serviceType} />
          </section>
        )}

        {/* ━━━ 3. 有効期限・保証期間 ━━━ */}
        <section className="border-t border-border-subtle py-6 space-y-4">
          <div className={sectionHeaderCls}>
            <div className={sectionTagCls}>EXPIRY & WARRANTY</div>
            <div className={`${sectionTitleCls} flex items-center gap-1.5`}>
              有効期限・保証期間
              <HelpTooltip>
                証明書PDFと公開ページに表示されます。「半年ごとにメンテ推奨」など条件文と、年月日の有効期限・保証終了日を別々に設定できます。空欄でも発行可能。
              </HelpTooltip>
            </div>
          </div>
          <label className={labelCls}>
            <span className={labelTextCls}>有効条件（テキスト）</span>
            <input
              ref={expiryValueRef}
              name="expiry_value"
              className={inputCls}
              placeholder="半年ごとにメンテ推奨 など"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              <span className={labelTextCls}>有効期限</span>
              <input type="date" name="expiry_date" className={inputCls} />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>保証期間（終了日）</span>
              <input type="date" name="warranty_period_end" className={inputCls} />
            </label>
          </div>
        </section>

        {/* ━━━ 4. 施工写真 ━━━ */}
        <section className="border-t border-border-subtle py-6 space-y-4">
          <div className="flex items-center gap-1.5 -mb-2">
            <span className="text-xs font-semibold tracking-[0.18em] text-muted">PHOTOS</span>
            <HelpTooltip>
              施工前後の写真をアップロードします。証明書の信頼性確保のため、発行には施工写真が1枚以上必須です（写真がない場合は下書き保存のみ可能）。プランごとに枚数上限が異なります。
            </HelpTooltip>
          </div>
          <PhotoUploadSection
            ref={photoRef}
            maxPhotos={maxPhotos}
            planLabel={planLabel}
            onCountChange={setPhotoCount}
          />

          {/* Phase 3: 動画 / Before-After は短時間で UI に staging できないため、
              発行後の編集ページ (/admin/certificates/[public_id]) で追加する導線にする。 */}
          <div className="rounded-xl border border-border-subtle bg-inset px-4 py-3 text-xs text-muted">
            動画 / Before-After は証明書を作成後、編集ページの「動画 / Before-After」セクションから追加できます。
          </div>

          {/* AI品質チェックパネル */}
          {canAiQuality && serviceType && (
            <div data-ai-quality-panel>
              <AiQualityPanel category={serviceType} photoCount={photoCount} formRef={formRef} />
            </div>
          )}

          {/* 発行前ゲートでブロックされた場合のエラー表示 */}
          {gateBlock && (
            <div className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-400">
              <p className="font-semibold">発行できません: {gateBlock.reason}</p>
              {gateBlock.details.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs space-y-0.5">
                  {gateBlock.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs opacity-80">必要項目を満たすか、「下書き保存」で保存してください。</p>
            </div>
          )}
        </section>

        {/* ━━━ 5. 詳細な施工内容 ━━━ */}
        <section className="border-t border-border-subtle py-6 space-y-4">
          <div className={sectionHeaderCls}>
            <div className={sectionTagCls}>WORK DETAILS</div>
            <div className={`${sectionTitleCls} flex items-center gap-1.5`}>
              詳細な施工内容
              <HelpTooltip>
                自由記述の施工メモです。Standard 以上では音声入力や AI
                下書き生成も使えます。証明書PDFには簡潔に印字されるため、長すぎる場合は要点をまとめて。
              </HelpTooltip>
            </div>
          </div>

          {/* AI下書き生成パネル（Standard以上） */}
          {canAiDraft && (
            <AiDraftPanel vehicleId={selectedVehicleId} templateCategory={serviceType} onApply={handleAiDraftApply} />
          )}

          {/* 音声メモパネル（Standard以上）— マイクで喋った内容を AI が整形してフォームへ */}
          {canAiDraft && <VoiceMemoPanel serviceType={serviceType} onApply={handleAiDraftApply} />}

          {/* AI下書き適用通知 */}
          {draftApplied && (
            <div className="rounded-xl border border-success/30 bg-success-dim px-3 py-2 text-xs text-success-text">
              ✅ AI下書きをフォームに適用しました。内容を確認・編集してください。
            </div>
          )}

          <label className={`${labelCls} block`}>
            <span className={labelTextCls}>施工内容（自由記述）</span>
            <textarea
              name="content_free_text"
              className={inputCls}
              rows={5}
              placeholder="施工内容の詳細を記入してください（下地処理、コーティング工程、仕上げ等）"
            />
          </label>
        </section>

        {/* ━━━ 6. 膜厚計測 ━━━ */}
        <section className="border-t border-border-subtle py-6">
          <FilmThicknessSection />
        </section>

        {/* ━━━ 7. メンテナンス実施日 ━━━ */}
        <section className="border-t border-border-subtle py-6 space-y-4">
          <div className={sectionHeaderCls}>
            <div className={sectionTagCls}>MAINTENANCE</div>
            <div className={sectionTitleCls}>メンテナンス実施日</div>
          </div>
          <label className={labelCls}>
            <span className={labelTextCls}>実施日</span>
            <input type="date" name="maintenance_date" className={inputCls} />
          </label>
        </section>

        {/* ━━━ 8. 保証除外内容 ━━━ */}
        <section className="border-t border-border-subtle py-6 space-y-4">
          <div className={sectionHeaderCls}>
            <div className={sectionTagCls}>WARRANTY EXCLUSIONS</div>
            <div className={`${sectionTitleCls} flex items-center gap-1.5`}>
              保証除外内容
              <HelpTooltip>
                保証の対象外になる条件を明記する欄です。トラブル防止のために重要。一度入力した内容は店舗のデフォルトとして保存・流用できます。
              </HelpTooltip>
            </div>
          </div>
          <label className={`${labelCls} block`}>
            <span className={labelTextCls}>保証対象外となる条件・注意事項</span>
            <textarea
              ref={warrantyRef}
              name="warranty_exclusions"
              className={inputCls}
              rows={4}
              defaultValue={defaultWarrantyExclusions ?? ""}
              placeholder="例: 飛び石による損傷、経年劣化、不適切な洗車方法による損傷等"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveWarrantyDefault}
              disabled={savingDefault}
              className="rounded-xl border border-border-default bg-surface px-4 py-2 text-xs font-medium text-primary hover:bg-surface-hover disabled:opacity-50"
            >
              {savingDefault ? "保存中…" : "デフォルトとして保存"}
            </button>
            {defaultSaveMsg && (
              <span className={`text-xs ${defaultSaveMsg.includes("失敗") ? "text-danger" : "text-accent"}`}>
                {defaultSaveMsg}
              </span>
            )}
          </div>
        </section>

        {/* ━━━ 9. 備考欄 ━━━ */}
        <section className="border-t border-border-subtle py-6 space-y-4">
          <div className={sectionHeaderCls}>
            <div className={sectionTagCls}>REMARKS</div>
            <div className={sectionTitleCls}>備考</div>
          </div>
          <label className={`${labelCls} block`}>
            <span className={labelTextCls}>備考・特記事項</span>
            <textarea
              name="remarks"
              className={inputCls}
              rows={3}
              placeholder="その他の特記事項があれば記入してください"
            />
          </label>
        </section>

        {/* テンプレート追加項目は廃止 — テンプレート選択のみ上部で行う */}

        {/* ── エラー ── */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-danger">{error}</div>
        )}

        {/* ── アップロード進捗 ── */}
        {uploadProgress && (
          <div className="rounded-xl border border-accent/20 bg-accent-dim px-4 py-3 text-sm text-accent">
            {uploadProgress}
          </div>
        )}

        {/* ── アクション ── */}
        <div className="border-t border-border-subtle pt-6 flex flex-wrap gap-3 items-center">
          <Button
            type="submit"
            loading={isPending && submitStatus === "active"}
            disabled={isPending}
            onClick={() => setSubmitStatus("active")}
          >
            証明書を発行する
          </Button>
          <Button
            type="submit"
            variant="secondary"
            loading={isPending && submitStatus === "draft"}
            disabled={isPending}
            onClick={() => setSubmitStatus("draft")}
          >
            下書き保存
          </Button>
          <Link
            href="/admin/certificates"
            className="rounded-xl border border-border-default bg-surface px-5 py-2.5 text-sm font-medium text-primary hover:bg-surface-hover"
          >
            キャンセル
          </Link>
          {isPending && <span className="text-xs text-muted">写真がある場合はアップロード完了までお待ちください</span>}
        </div>
      </form>
    </>
  );
}
