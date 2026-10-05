"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// A draft that can't be sent as-is gets one obvious way forward: a fresh draft.
export function RedraftNotice({ workflowId, title, lines, action }: { workflowId: string; title: string; lines: string[]; action: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function redraft() {
    setBusy(true);
    const res = await fetch(`/api/workflows/${workflowId}/redraft`, { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(json.error ?? "Could not redraft");
    toast.success(json.state === "blocked" ? "The new draft was held too. See why below." : "Fresh draft ready for review");
    router.push(`/slack?wf=${json.workflowId}#${json.workflowId}`);
    router.refresh();
  }
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed p-3 text-sm" data-testid="redraft-notice">
      <p className="font-medium">{title}</p>
      <ul className="ml-4 list-disc text-muted-foreground">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <Button size="sm" onClick={redraft} disabled={busy}><RefreshCw className="size-3.5" aria-hidden />{busy ? "Drafting…" : action}</Button>
    </div>
  );
}
