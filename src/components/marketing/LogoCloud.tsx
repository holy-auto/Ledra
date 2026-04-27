export function LogoCloud() {
  const placeholders = Array.from({ length: 6 }, (_, i) => i);

  return (
    <div className="mt-20 pt-16 border-t border-white/[0.05]">
      <p className="text-center text-xs text-white/75 font-medium uppercase tracking-widest mb-10">
        導入企業
      </p>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-x-12 gap-y-8 items-center max-w-3xl mx-auto">
        {placeholders.map((i) => (
          <div
            key={i}
            className="h-8 flex items-center justify-center opacity-20 hover:opacity-40 transition-opacity"
          >
            <div className="w-20 h-6 bg-white/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
