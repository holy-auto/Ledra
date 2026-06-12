import { Metadata } from "next";
import PartsOrdersClient from "./PartsOrdersClient";

export const metadata: Metadata = { title: "部品発注" };

export default function Page() {
  return <PartsOrdersClient />;
}
