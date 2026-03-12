export function PricingCards({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8 justify-center items-stretch max-w-4xl mx-auto">
      {children}
    </div>
  );
}
