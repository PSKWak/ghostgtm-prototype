"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function RunExperimentButton({ name, label }: { name: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const res = await fetch("/api/experiments/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(json.error ?? "Run failed");
    toast.success(`${name}: ${json.rows} rows written`);
    router.refresh();
  }
  return <Button size="sm" variant="outline" onClick={run} disabled={busy}>{busy ? "Running…" : label}</Button>;
}
