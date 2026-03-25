import { ScrollReveal } from "./ScrollReveal";

const fullFields = [
  { label: "車両", value: "Toyota Alphard 2024" },
  { label: "施工日", value: "2025.03.15" },
  { label: "施工内容", value: "ボディコーティング" },
  { label: "保証期間", value: "5年間" },
];

const compactFields = [
  { label: "車両", value: "Toyota Alphard 2024" },
  { label: "施工日", value: "2025.03.15" },
  { label: "使用材料", value: "GYEON Q² One" },
  { label: "保証期間", value: "5年間" },
];

export function CertificatePreview({
  variant = "full",
  caption,
}: {
  variant?: "full" | "compact";
  caption?: string;
}) {
  const fields = variant === "full" ? fullFields : compactFields;

  return (
    <ScrollReveal variant="fade-up" delay={100}>
      <div className="max-w-2xl mx-auto">
        <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] ${variant === "full" ? "p-8 md:p-12" : "p-8 md:p-10"}`}>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-white/40 uppercase tracking-widest">施工証明書</div>
                <div className="mt-1 text-lg font-bold text-white">
                  {variant === "full" ? "CARTRUST Certificate" : "ボディコーティング施工証明"}
                </div>
              </div>
              {variant === "full" ? (
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-blue-400">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  <span className="text-xs font-medium text-green-400">有効</span>
                </div>
              )}
            </div>
            <div className="h-px bg-white/[0.06]" />
            <div className="grid grid-cols-2 gap-4 text-sm">
              {fields.map((f) => (
                <div key={f.label}>
                  <div className="text-white/40">{f.label}</div>
                  <div className="mt-1 text-white/70">{f.value}</div>
                </div>
              ))}
            </div>
            <div className="h-px bg-white/[0.06]" />
            {variant === "full" ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-green-400">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="text-sm text-green-400/80">改ざん防止により真正性を担保</div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-xs text-white/40">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-blue-400">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                CARTRUST認証 · 改ざん防止済み
              </div>
            )}
          </div>
        </div>
        {caption && (
          <p className="mt-6 text-center text-sm text-white/40">{caption}</p>
        )}
      </div>
    </ScrollReveal>
  );
}
