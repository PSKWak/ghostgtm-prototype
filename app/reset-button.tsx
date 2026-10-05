"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ResetButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true);
    const res = await fetch("/api/demo/reset", { method: "POST" });
    setBusy(false);
    if (res.ok) toast.success("Demo reset to the post-call starting point");
    else toast.error("Reset failed");
    router.push("/workspace");
    router.refresh();
  }
  return <Button variant="outline" size="sm" onClick={reset} disabled={busy}>{busy ? "Resetting…" : "Reset demo"}</Button>;
}
