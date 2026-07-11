"use client";

import { useState } from "react";
import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";

/**
 * インタラクティブ・プロダクトツアー。
 *
 * 静止スクリーンショットではなく、訪問者自身が「証明書を発行してみる」を
 * 疑似操作で体験できる LP 内蔵デモ。実データもログインも不要——本物の
 * デモ環境 (/demo) より手前の、フリクションゼロの入口として置く。
 *
 * クライアントコンポーネントだが状態は useState のみ。新規依存なし。
 */

type VehicleId = "alphard" | "prius" | "nbox";
type MenuId = "coating" | "ppf" | "detail";

const VEHICLES: { id: VehicleId; label: string; sub: string }[] = [
  { id: "alphard", label: "ALPHARD", sub: "2023年式・黒" },
  { id: "prius", label: "PRIUS", sub: "2022年式・白" },
  { id: "nbox", label: "N-BOX", sub: "2024年式・銀" },
];

const MENUS: { id: MenuId; label: string; sub: string }[] = [
  { id: "coating", label: "ボディコーティング", sub: "ガラス系・5年保証" },
  { id: "ppf", label: "PPF（フィルム施工）", sub: "全面・7年保証" },
  { id: "detail", label: "ガラスコーティング", sub: "撥水仕様・3年保証" },
];

const STEP_LABELS = ["車両を選ぶ", "施工メニューを選ぶ", "内容を確認", "発行完了"];

function StepDots({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center justify-center gap-2" aria-label="ツアーの進行状況">
      {STEP_LABELS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-bold transition-colors ${
              i <= current ? "bg-blue-500 text-white" : "bg-white/[0.08] text-white/50"
            }`}
          >
            {i + 1}
          </span>
          {i < STEP_LABELS.length - 1 && (
            <span className={`h-px w-6 transition-colors ${i < current ? "bg-blue-500" : "bg-white/[0.12]"}`} />
          )}
        </li>
      ))}
    </ol>
  );
}

function ChoiceCard({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-white/[0.1] bg-white/[0.03] p-5 text-left transition-colors hover:border-blue-400/50 hover:bg-white/[0.06]"
    >
      <div className="text-sm font-bold text-white">{label}</div>
      <div className="mt-1 text-xs text-white/60">{sub}</div>
    </button>
  );
}

export function ProductTourSection() {
  const [step, setStep] = useState(0);
  const [vehicle, setVehicle] = useState<VehicleId | null>(null);
  const [menu, setMenu] = useState<MenuId | null>(null);

  const vehicleData = VEHICLES.find((v) => v.id === vehicle);
  const menuData = MENUS.find((m) => m.id === menu);

  function reset() {
    setStep(0);
    setVehicle(null);
    setMenu(null);
  }

  return (
    <Section bg="alt" id="product-tour">
      <SectionHeading
        title="4クリックで、証明書の発行を体験する。"
        subtitle="登録もログインも不要です。実際の操作感をそのままお試しいただけます。"
      />

      <div className="mx-auto max-w-3xl">
        <StepDots current={step} />

        <div className="rounded-2xl border border-white/[0.1] bg-gradient-to-br from-[#0a0f1a] to-[#0b111c] shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* window chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
            <span className="block h-2.5 w-2.5 rounded-full bg-rose-400/40" />
            <span className="block h-2.5 w-2.5 rounded-full bg-amber-400/40" />
            <span className="block h-2.5 w-2.5 rounded-full bg-emerald-400/40" />
            <span className="ml-3 text-[0.65rem] text-white/70 font-mono">admin.ledra.app / certificates / new</span>
          </div>

          <div className="p-6 md:p-9 min-h-[320px]">
            {step === 0 && (
              <div>
                <h3 className="text-sm font-bold text-white">Step 1 — どの車両ですか？</h3>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {VEHICLES.map((v) => (
                    <ChoiceCard
                      key={v.id}
                      label={v.label}
                      sub={v.sub}
                      onClick={() => {
                        setVehicle(v.id);
                        setStep(1);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h3 className="text-sm font-bold text-white">Step 2 — どの施工メニューですか？</h3>
                <div className="mt-5 grid grid-cols-1 gap-3">
                  {MENUS.map((m) => (
                    <ChoiceCard
                      key={m.id}
                      label={m.label}
                      sub={m.sub}
                      onClick={() => {
                        setMenu(m.id);
                        setStep(2);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {step === 2 && vehicleData && menuData && (
              <div>
                <h3 className="text-sm font-bold text-white">Step 3 — 内容を確認して発行</h3>
                <div className="mt-5 space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">車両</span>
                    <span className="font-medium text-white">{vehicleData.label}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">施工メニュー</span>
                    <span className="font-medium text-white">{menuData.label}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">保証</span>
                    <span className="font-medium text-white">{menuData.sub.split("・")[1]}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="mt-6 w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-3 text-sm font-medium text-white transition-all hover:from-blue-500 hover:to-blue-400"
                >
                  証明書を発行する
                </button>
              </div>
            )}

            {step === 3 && vehicleData && (
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-bold text-white">証明書を発行しました</h3>
                <p className="mt-1 text-xs text-white/60">
                  {vehicleData.label} の施工証明書 — ブロックチェーン記録済み
                </p>

                <div className="mx-auto mt-6 flex max-w-xs items-center gap-4 rounded-xl border border-white/[0.1] bg-white/[0.03] p-4 text-left">
                  <svg viewBox="0 0 64 64" className="h-14 w-14 shrink-0 text-white" aria-hidden>
                    <rect x="2" y="2" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" />
                    <rect x="44" y="2" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" />
                    <rect x="2" y="44" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" />
                    <rect x="8" y="8" width="6" height="6" fill="currentColor" />
                    <rect x="50" y="8" width="6" height="6" fill="currentColor" />
                    <rect x="8" y="50" width="6" height="6" fill="currentColor" />
                    <rect x="28" y="2" width="4" height="4" fill="currentColor" />
                    <rect x="28" y="28" width="8" height="8" fill="currentColor" />
                    <rect x="44" y="28" width="4" height="4" fill="currentColor" />
                    <rect x="28" y="44" width="4" height="4" fill="currentColor" />
                    <rect x="52" y="52" width="4" height="4" fill="currentColor" />
                    <rect x="44" y="44" width="4" height="4" fill="currentColor" />
                  </svg>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-white">ledra.app/v/8a4f...c2e1</p>
                    <p className="mt-1 text-[0.65rem] text-white/50">URLとQRで、そのまま共有できます</p>
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Link
                    href="/signup"
                    data-cta-location="product-tour"
                    data-cta-label="自分の証明書を作ってみる"
                    className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-sm font-medium text-[#060a12] transition-colors hover:bg-gray-100"
                  >
                    無料で自分の証明書を作ってみる
                  </Link>
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center justify-center rounded-lg border border-white/20 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white/40"
                  >
                    もう一度試す
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/50">
          ※ デモ用のモック画面です。データは送信・保存されません。
        </p>
      </div>
    </Section>
  );
}
