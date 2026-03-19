import dynamic from "next/dynamic";

const StoresClient = dynamic(() => import("./StoresClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});

export default function StoresPage() {
  return <StoresClient />;
}
