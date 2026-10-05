import { Textarea } from "@/components/ui/textarea";
import type { WorkflowView } from "@/lib/db/views/workflows";
import { splitLetter } from "@/lib/engine/letter";
import { cn } from "@/lib/utils";
import { ClaimLine } from "./claim-line";

export function EditableLetter({ wf, edits, onChange }: { wf: WorkflowView; edits: Record<string, string>; onChange: (id: string, s: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Edit any sentence. Clear one to remove it.</p>
      {wf.claims.map((c) => {
        if (!c.factual) return <p key={c.id} className="text-muted-foreground">{c.sentence}</p>;
        const value = edits[c.id] ?? c.sentence;
        const removed = value.trim() === "";
        return (
          <Textarea key={c.id} aria-label={`Edit sentence ${c.id}`} data-claim-edit={c.id} rows={2} value={value}
            placeholder="This sentence will be removed" onChange={(e) => onChange(c.id, e.target.value)}
            className={cn(removed && "border-red-300 bg-red-50/50 dark:bg-red-950/30", !removed && value !== c.sentence && "border-amber-400 bg-amber-50/50 dark:bg-amber-950/30")} />
        );
      })}
    </div>
  );
}

export function Letter({ claims }: { claims: WorkflowView["claims"] }) {
  const parts = splitLetter(claims);
  return (
    <div className="space-y-2">
      {[parts.greeting, parts.body, parts.signoff].filter((p) => p.length > 0).map((p) => (
        <p key={p[0]!.id}>{p.map((c) => <ClaimLine key={c.id} claim={c} />)}</p>
      ))}
    </div>
  );
}

// Says how this draft was produced, so a fallback is never mistaken for a live draft.
export function GenerationBadge({ g }: { g: NonNullable<WorkflowView["generation"]> }) {
  const label = g.mode === "live" ? (g.attempts > 1 ? "Live · fixed on retry" : "Live") : g.mode === "cached" ? "Cached draft (live failed)" : "Template";
  return <span title={`${g.promptVersion} · ${g.model} · ${g.attempts} attempt(s)`} className="rounded border px-1.5 py-0.5" data-testid="generation-badge">{label}</span>;
}
