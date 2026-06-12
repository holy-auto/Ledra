import { Metadata } from "next";
import CouponsClient from "./CouponsClient";

export const metadata: Metadata = { title: "クーポン管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <CouponsClient />;
}
