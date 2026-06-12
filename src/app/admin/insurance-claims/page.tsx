import { Metadata } from "next";
import InsuranceClaimsClient from "./InsuranceClaimsClient";

export const metadata: Metadata = { title: "保険協定" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <InsuranceClaimsClient />;
}
