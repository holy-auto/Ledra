import { Metadata } from "next";
import ServiceRemindersClient from "./ServiceRemindersClient";

export const metadata: Metadata = { title: "整備提案・交換管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <ServiceRemindersClient />;
}
