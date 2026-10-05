"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function TestCaseButton({ editId }: { editId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const res = await fetch("/api/evals/test-cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editId }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(json.error ?? "Could not create the test");
    toast.success("Test case created. Replay it from the table above.");
    router.refresh();
  }
  return <Button size="xs" variant="outline" onClick={create} disabled={busy}>Turn into test case</Button>;
}
