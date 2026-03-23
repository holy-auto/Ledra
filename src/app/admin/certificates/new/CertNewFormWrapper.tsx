"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCertAction } from "./actions";
import VehiclePickerSection from "./VehiclePickerSection";
import FilmThicknessSection from "./FilmThicknessSection";
import CoatingProductsSection from "./CoatingProductsSection";
import PpfCoverageSection from "./PpfCoverageSection";
import PhotoUploadSection, { type PhotoUploadHandle } from "./PhotoUploadSection";
import Button from "@/components/ui/Button";
import type { PlanTier } from "@/lib/billing/planFeatures";
import { PHOTO_LIMITS } from "@/lib/billing/planFeatures";

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

type FieldType = "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "checkbox";

type TemplateSchema = {
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

type Template = {
  id: string;
  name: string;
  schema_json: TemplateSchema | null;
};

type Props = {
  vehicles: Vehicle[];
  defaultVehicleId?: string;
  defaultCustomerId?: string;
  templates: Template[];
  selectedTemplate: Template | null;
  tenantLogoPath: string | null;
  planTier: PlanTier;
  tid: string;
  serviceType?: string; // "ppf" | "coating" | etc — derived from template category
};

const inputCls =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-neutral-700";
const sectionHeaderCls = "mb-4";
const sectionTagCls = "text-xs font-semibold tracking-[0.18em] text-neutral-500";
const sectionTitleCls = "mt-0.5 text-base font-semibold text-neutral-900";

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "FREE",
  starter: "STARTER",
  standard: "STANDARD",
  pro: "PRO",
};

export default function CertNewFormWrapper({
  vehicles,
  defaultVehicleId,
  defaultCustomerId,
  templates,
  selectedTemplate,
  tenantLogoPath,
  planTier,
  tid,
  serviceType,
}: Props) {
  const isPpf = serviceType === "ppf";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitStatus, setSubmitStatus] = useState<"active" | "draft">("active");
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const photoRef = useRef<PhotoUploadHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const maxPhotos = PHOTO_LIMITS[planTier];
  const planLabel = PLAN_LABELS[planTier];
  const schema = selectedTemplate?.schema_json ?? null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("status", submitStatus);

    const vehicleId = String(formData.get("vehicle_id") ?? "").trim();
    if (!vehicleId) {
      setError("車両を選択してください。証明書には車両の紐づけが必要です。");
      form.querySelector<HTMLElement>("[data-vehicle-picker]")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    const files = photoRef.current?.getFiles() ?? [];

    startTransition(async () => {
      const result = await createCertAction(formData);
      if (!result.ok) {
        setError(
          result.error === "vehicle_required"
            ? "車両を選択してください。"
            : result.error === "customer_name_required"
            ? "お客様名を入力してください。"
            : `エラー: ${result.error}`
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
          }
        } catch (e) {
          console.warn("photo upload error", e);
        }
      }

      router.push(`/admin/certificates/new/success?pid=${encodeURIComponent(public_id)}`);
    });
  };

  return (
    <>
      {/* ── テンプレート選択 ── */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3">
          <div className={sectionTagCls}>TEMPLATE</div>
          <div className="mt-1 text-base font-semibold text-neutral-900">テンプレートを選択</div>
        </div>
        <form action="/admin/certificates/new" method="get" className="flex gap-3 items-center">
          <select
            name="tid"
            defaultValue={tid}
            className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
          >
            {templates.length === 0 ? (
              <option value="">テンプレートがありません</option>
            ) : (
              templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))
            )}
          </select>
          <button
            type="submit"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 whitespace-nowrap"
          >
            選択
          </button>
        </form>
        {!tenantLogoPath && (
          <p className="mt-2 text-xs text-amber-600">
            ロゴ未設定 —{" "}
            <Link href="/admin/logo" className="underline">ロゴを設定する</Link>
          </p>
        )}
      </div>

      {/* ── メインフォーム ── */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-0"
      >
        <input type="hidden" name="template_id" value={selectedTemplate?.id ?? ""} />
        <input type="hidden" name="template_name" value={selectedTemplate?.name ?? ""} />
        {defaultCustomerId && <input type="hidden" name="customer_id" value={defaultCustomerId} />}
        {serviceType && <input type="hidden" name="service_type" value={serviceType} />}

        {/* ━━━ 1. 車種選択 ━━━ */}
        <section data-vehicle-picker className="pb-6">
          <VehiclePickerSection
            vehicles={defaultCustomerId
              ? vehicles.filter((v) => (v as Record<string, unknown>).customer_id === defaultCustomerId || !defaultVehicleId)
              : vehicles
            }
            defaultVehicleId={defaultVehicleId}
          />
        </section>

        {/* ━━━ 2. PPF施工範囲（PPFテンプレート時のみ） ━━━ */}
        {isPpf && (
          <section className="border-t border-neutral-100 py-6">
            <PpfCoverageSection />
          </section>
        )}

        {/* ━━━ 3. コーティング剤 / 使用フィルム ━━━ */}
        <section className="border-t border-neutral-100 py-6">
          <CoatingProductsSection serviceType={serviceType} />
        </section>

        {/* ━━━ 3. 有効期限・保証期間 ━━━ */}
        <section className="border-t border-neutral-100 py-6 space-y-4">
          <div className={sectionHeaderCls}>
            <div className={sectionTagCls}>EXPIRY & WARRANTY</div>
            <div className={sectionTitleCls}>有効期限・保証期間</div>
          </div>
          <label className={labelCls}>
            <span className={labelTextCls}>有効条件（テキスト）</span>
            <input
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
        <section className="border-t border-neutral-100 py-6">
          <PhotoUploadSection
            ref={photoRef}
            maxPhotos={maxPhotos}
            planLabel={planLabel}
          />
        </section>

        {/* ━━━ 5. 詳細な施工内容 ━━━ */}
        <section className="border-t border-neutral-100 py-6 space-y-4">
          <div className={sectionHeaderCls}>
            <div className={sectionTagCls}>WORK DETAILS</div>
            <div className={sectionTitleCls}>詳細な施工内容</div>
          </div>
          <label className={`${labelCls} block`}>
            <span className={labelTextCls}>施工内容（自由記述）</span>
            <textarea
              name="content_free_text"
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              rows={5}
              placeholder="施工内容の詳細を記入してください（下地処理、コーティング工程、仕上げ等）"
            />
          </label>
        </section>

        {/* ━━━ 6. 膜厚計測 ━━━ */}
        <section className="border-t border-neutral-100 py-6">
          <FilmThicknessSection />
        </section>

        {/* ━━━ 7. メンテナンス実施日 ━━━ */}
        <section className="border-t border-neutral-100 py-6 space-y-4">
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
        <section className="border-t border-neutral-100 py-6 space-y-4">
          <div className={sectionHeaderCls}>
            <div className={sectionTagCls}>WARRANTY EXCLUSIONS</div>
            <div className={sectionTitleCls}>保証除外内容</div>
          </div>
          <label className={`${labelCls} block`}>
            <span className={labelTextCls}>保証対象外となる条件・注意事項</span>
            <textarea
              name="warranty_exclusions"
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              rows={4}
              placeholder="例: 飛び石による損傷、経年劣化、不適切な洗車方法による損傷等"
            />
          </label>
        </section>

        {/* ━━━ 9. 備考欄 ━━━ */}
        <section className="border-t border-neutral-100 py-6 space-y-4">
          <div className={sectionHeaderCls}>
            <div className={sectionTagCls}>REMARKS</div>
            <div className={sectionTitleCls}>備考</div>
          </div>
          <label className={`${labelCls} block`}>
            <span className={labelTextCls}>備考・特記事項</span>
            <textarea
              name="remarks"
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              rows={3}
              placeholder="その他の特記事項があれば記入してください"
            />
          </label>
        </section>

        {/* テンプレート追加項目は廃止 — テンプレート選択のみ上部で行う */}

        {/* ── エラー ── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── アップロード進捗 ── */}
        {uploadProgress && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {uploadProgress}
          </div>
        )}

        {/* ── アクション ── */}
        <div className="border-t border-neutral-100 pt-6 flex flex-wrap gap-3 items-center">
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
            className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            キャンセル
          </Link>
          {isPending && (
            <span className="text-xs text-neutral-500">
              写真がある場合はアップロード完了までお待ちください
            </span>
          )}
        </div>
      </form>
    </>
  );
}
