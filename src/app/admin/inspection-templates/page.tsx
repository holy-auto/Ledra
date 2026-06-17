import { Metadata } from "next";
import InspectionTemplatesClient from "./InspectionTemplatesClient";

export const metadata: Metadata = { title: "点検テンプレート" };

export default function Page() {
  return <InspectionTemplatesClient />;
}
