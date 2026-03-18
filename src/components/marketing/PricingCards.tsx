export function PricingCards({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-5 items-stretch max-w-6xl mx-auto">
      {children}
    </div>
  );
}
