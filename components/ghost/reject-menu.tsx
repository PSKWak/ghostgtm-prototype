"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const REASONS = [
  { id: "wrong_fact", label: "Wrong fact" }, { id: "wrong_action", label: "Wrong action" },
  { id: "too_risky", label: "Too risky" }, { id: "bad_timing", label: "Bad timing" },
] as const;

// Two clicks at most. For "Wrong fact" the rep names the fact, so the fix can go to the graph.
export function RejectMenu({ facts, busy, onReject }: {
  facts: { key: string; label: string }[]; busy: boolean; onReject: (reason: string, factKey?: string) => void;
}) {
  const [step, setStep] = useState<"closed" | "reason" | "fact">("closed");
  if (step === "closed") return <Button variant="ghost" onClick={() => setStep("reason")} disabled={busy}>Reject…</Button>;
  if (step === "fact") {
    return (
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Which fact is wrong?">
        <span className="text-sm text-muted-foreground">Which fact is wrong?</span>
        {facts.map((f) => <Button key={f.key} variant="destructive" size="sm" onClick={() => onReject("wrong_fact", f.key)} disabled={busy}>{f.label}</Button>)}
        <Button variant="ghost" size="sm" onClick={() => onReject("wrong_fact")} disabled={busy}>Not sure</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Reject reason">
      {REASONS.map((r) => (
        <Button key={r.id} variant="destructive" size="sm" disabled={busy}
          onClick={() => (r.id === "wrong_fact" && facts.length > 0 ? setStep("fact") : onReject(r.id))}>{r.label}</Button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setStep("closed")} disabled={busy}>Cancel</Button>
    </div>
  );
}
