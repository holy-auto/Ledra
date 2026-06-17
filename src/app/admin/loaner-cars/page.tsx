import { Metadata } from "next";
import LoanerCarsClient from "./LoanerCarsClient";

export const metadata: Metadata = { title: "代車管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <LoanerCarsClient />;
}
