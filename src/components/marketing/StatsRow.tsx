export function StatsRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row justify-center gap-12 md:gap-20">
      {children}
    </div>
  );
}
