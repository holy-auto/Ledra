export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-primary/[0.08] text-primary text-[0.8125rem] font-medium px-4 py-1.5 rounded-full border border-primary/10">
      {children}
    </span>
  );
}
