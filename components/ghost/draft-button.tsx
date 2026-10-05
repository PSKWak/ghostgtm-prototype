"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DraftButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function draft() {
    setBusy(true);
    const res = await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(json.error ?? "Could not draft");
    toast.success(json.state === "blocked" ? `Ghost held the ${accountName} draft. See why in Slack.` : `Draft for ${accountName} is waiting in Slack`);
    router.push(`/slack?wf=${json.workflowId}#${json.workflowId}`);
  }
  return (
    <Button onClick={draft} disabled={busy} size="lg">
      <Sparkles className="size-4" aria-hidden />{busy ? "Drafting…" : "Draft follow-up"}
    </Button>
  );
}
