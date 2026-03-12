import { Suspense } from "react";
import MembersClient from "./MembersClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MembersClient />
    </Suspense>
  );
}
