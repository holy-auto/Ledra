import { Metadata } from "next";
import StocktakeClient from "./StocktakeClient";

export const metadata: Metadata = { title: "在庫棚卸" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <StocktakeClient />;
}
