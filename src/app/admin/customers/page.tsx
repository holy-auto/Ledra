import { Suspense } from "react";
import CustomersClient from "./CustomersClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CustomersClient />
    </Suspense>
  );
}
