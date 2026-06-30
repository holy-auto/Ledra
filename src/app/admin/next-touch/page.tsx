import { Metadata } from "next";
import NextTouchClient from "./NextTouchClient";

export const metadata: Metadata = { title: "次の接触" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <NextTouchClient />;
}
