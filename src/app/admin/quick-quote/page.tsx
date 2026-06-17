import { Metadata } from "next";
import QuickQuoteClient from "./QuickQuoteClient";

export const metadata: Metadata = { title: "概算見積" };

export default function Page() {
  return <QuickQuoteClient />;
}
