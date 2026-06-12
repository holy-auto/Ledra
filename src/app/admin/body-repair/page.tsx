import { Metadata } from "next";
import BodyRepairClient from "./BodyRepairClient";

export const metadata: Metadata = { title: "鈑金工程管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <BodyRepairClient />;
}
