import { Metadata } from "next";
import OrganizationsClient from "./OrganizationsClient";

export const metadata: Metadata = { title: "組織管理" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <OrganizationsClient />;
}
