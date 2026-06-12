import { Metadata } from "next";
import PaymentLedgerClient from "./PaymentLedgerClient";

export const metadata: Metadata = { title: "売掛元帳" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <PaymentLedgerClient />;
}
