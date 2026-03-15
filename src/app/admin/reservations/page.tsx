import { Suspense } from "react";
import ReservationsClient from "./ReservationsClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReservationsClient />
    </Suspense>
  );
}
