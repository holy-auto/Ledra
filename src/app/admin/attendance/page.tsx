import { Metadata } from "next";
import AttendanceClient from "./AttendanceClient";

export const metadata: Metadata = { title: "勤怠管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <AttendanceClient />;
}
