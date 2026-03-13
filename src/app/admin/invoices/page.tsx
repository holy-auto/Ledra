import { Suspense } from "react";
import InvoicesClient from "./InvoicesClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InvoicesClient />
    </Suspense>
  );
}
