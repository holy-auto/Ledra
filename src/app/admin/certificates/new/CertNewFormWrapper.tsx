"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCertAction } from "./actions";
import VehiclePickerSection from "./VehiclePickerSection";
import FilmThicknessSection from "./FilmThicknessSection";
import PhotoUploadSection, { type PhotoUploadHandle } from "./PhotoUploadSection";
import type { PlanTier } from "@/lib/billing/planFeatures";
import { PHOTO_LIMITS } from "@/lib/billing/planFeatures";

type Vehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_name: string | null;
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
  templates: Template[];
  selectedTemplate: Template | null;
  tenantLogoPath: string | null;
  planTier: PlanTier;
  tid: string;
};

const inputCls =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-neutral-700";

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "FREE",
  starter: "STARTER",
  standard: "STANDARD",
  pro: "PRO",
};

export default function CertNewFormWrapper({
  vehicles,
  defaultVehicleId,
  templates,
  selectedTemplate,
  tenantLogoPath,
  planTier,
  tid,
}: Props) {
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

    // Client-side validation: vehicle required
    // Inject current submit status
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
      // Step 1: Create certificate
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

      // Step 2: Upload photos (if any)
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
            // Don't block — cert was created, just skip photos
          } else {
            setUploadProgress(`写真 ${uploadJson.uploaded} 枚をアップロードしました`);
          }
        } catch (e) {
          console.warn("photo upload error", e);
        }
      }

      // Step 3: Navigate to success
      router.push(`/admin/certificates/new/success?pid=${encodeURIComponent(public_id)}`);
    });
  };

  return (
    <>
      {/* Template selector */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3">
          <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">TEMPLATE</div>
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
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
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
        {!tenantLogoPath ? (
          <p className="mt-2 text-xs text-amber-600">
            ロゴ未設定 —{" "}
            <Link href="/admin/logo" className="underline">
              ロゴを設定する
            </Link>
          </p>
        ) : null}
      </div>

      {/* Main form */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6"
      >
        <input type="hidden" name="template_id" value={selectedTemplate?.id ?? ""} />
        <input type="hidden" name="template_name" value={selectedTemplate?.name ?? ""} />

        {/* Vehicle picker + basic info */}
        <div data-vehicle-picker>
          <VehiclePickerSection
            vehicles={vehicles}
            defaultVehicleId={defaultVehicleId}
          />
        </div>

        {/* Template fields */}
        {schema ? (
          <div className="border-t border-neutral-100 pt-6 space-y-5">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">TEMPLATE FIELDS</div>
              <div className="mt-1 text-base font-semibold text-neutral-900">テンプレート項目</div>
            </div>

            {schema.sections.map((sec) => (
              <div key={sec.title} className="rounded-xl border border-neutral-200 p-4 space-y-4">
                <div className="text-sm font-semibold text-neutral-800">{sec.title}</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {sec.fields.map((f) => {
                    const name = `f__${f.key}`;

                    if (f.type === "checkbox") {
                      return (
                        <label key={f.key} className="flex items-center gap-2.5 text-sm text-neutral-700">
                          <input type="checkbox" name={name} className="h-4 w-4 rounded border-neutral-300" />
                          <span>{f.label}</span>
                        </label>
                      );
                    }
                    if (f.type === "select") {
                      return (
                        <div key={f.key} className={labelCls}>
                          <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                          <select name={name} className={inputCls} required={!!f.required}>
                            <option value="">選択してください</option>
                            {(f.options ?? []).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    if (f.type === "multiselect") {
                      return (
                        <div key={f.key} className={`${labelCls} sm:col-span-2`}>
                          <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                          <select name={name} multiple className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm h-28 focus:outline-none focus:ring-2 focus:ring-neutral-400" required={!!f.required}>
                            {(f.options ?? []).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          <p className="text-[11px] text-neutral-500">Ctrl / Shift で複数選択</p>
                        </div>
                      );
                    }
                    if (f.type === "textarea") {
                      return (
                        <div key={f.key} className={`${labelCls} sm:col-span-2`}>
                          <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                          <textarea name={name} className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" rows={3} required={!!f.required} />
                        </div>
                      );
                    }
                    if (f.type === "number") {
                      return (
                        <div key={f.key} className={labelCls}>
                          <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                          <input type="number" name={name} className={inputCls} required={!!f.required} />
                        </div>
                      );
                    }
                    if (f.type === "date") {
                      return (
                        <div key={f.key} className={labelCls}>
                          <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                          <input type="date" name={name} className={inputCls} required={!!f.required} />
                        </div>
                      );
                    }
                    return (
                      <div key={f.key} className={labelCls}>
                        <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                        <input name={name} className={inputCls} required={!!f.required} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Free text & conditions */}
        <div className="border-t border-neutral-100 pt-6 space-y-4">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CONTENT</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">自由記述・条件</div>
          </div>
          <label className={`${labelCls} block`}>
            <span className={labelTextCls}>施工内容（自由記述）</span>
            <textarea
              name="content_free_text"
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              rows={4}
              placeholder="施工内容の詳細を記入してください"
            />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>有効条件（テキスト）</span>
            <input
              name="expiry_value"
              className={inputCls}
              placeholder="半年ごとにメンテ推奨 など"
            />
          </label>
        </div>

        {/* Film thickness */}
        <FilmThicknessSection />

        {/* Photo upload */}
        <PhotoUploadSection
          ref={photoRef}
          maxPhotos={maxPhotos}
          planLabel={planLabel}
        />

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Upload progress */}
        {uploadProgress && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {uploadProgress}
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-neutral-100 pt-6 flex flex-wrap gap-3 items-center">
          <button
            type="submit"
            disabled={isPending}
            onClick={() => setSubmitStatus("active")}
            className="btn-primary disabled:opacity-50"
          >
            {isPending && submitStatus === "active" ? "処理中…" : "証明書を発行する"}
          </button>
          <button
            type="submit"
            disabled={isPending}
            onClick={() => setSubmitStatus("draft")}
            className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            {isPending && submitStatus === "draft" ? "保存中…" : "下書き保存"}
          </button>
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
