import { Metadata } from "next";
import PartInstallClient from "./PartInstallClient";

export const metadata: Metadata = { title: "装着記録" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <PartInstallClient />;
}
