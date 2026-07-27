"use client";

import { useRouter } from "next/navigation";
import { TOUR_DONE_KEY } from "@/lib/onboarding";

export default function RestartTourButton() {
  const router = useRouter();

  function handleClick() {
    localStorage.removeItem(TOUR_DONE_KEY);
    router.push("/admin");
  }

  return (
    <button onClick={handleClick} className="btn-secondary">
      使い方ツアーを再表示
    </button>
  );
}
