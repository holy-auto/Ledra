import { Metadata } from "next";
import CustomerRanksClient from "./CustomerRanksClient";

export const metadata: Metadata = { title: "顧客ランク" };

export default function Page() {
  return <CustomerRanksClient />;
}
