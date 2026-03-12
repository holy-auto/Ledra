export function StatCard({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="text-center px-8">
      <div className="text-[2.75rem] md:text-[3.25rem] font-bold text-heading leading-tight tracking-tight">
        {value}
      </div>
      <div className="mt-2 text-sm text-muted font-medium">{label}</div>
    </div>
  );
}
