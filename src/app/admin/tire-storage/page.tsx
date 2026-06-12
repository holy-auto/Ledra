import { Metadata } from "next";
import TireStorageClient from "./TireStorageClient";

export const metadata: Metadata = { title: "タイヤ保管" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <TireStorageClient />;
}
