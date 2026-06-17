import { Metadata } from "next";
import ContactSchedulesClient from "./ContactSchedulesClient";

export const metadata: Metadata = { title: "コンタクトスケジュール" };

export default function Page() {
  return <ContactSchedulesClient />;
}
