import dynamic from "next/dynamic";

const CustomersClient = dynamic(() => import("./CustomersClient"), {
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  ),
});

export const revalidate = 0;

export default function Page() {
  return <CustomersClient />;
}
