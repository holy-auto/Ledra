import { Metadata } from "next";
import StaffShiftsClient from "./StaffShiftsClient";

export const metadata: Metadata = { title: "シフト管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <StaffShiftsClient />;
}
