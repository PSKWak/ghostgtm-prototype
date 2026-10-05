"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { WorkflowView } from "@/lib/db/views/workflows";
import { formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AcknowledgeDialog, type Challenged } from "./acknowledge-dialog";
import { EditableLetter, GenerationBadge, Letter } from "./card-parts";
import { ConfirmCorrections, type Proposal } from "./confirm-corrections";
import { DecisionSummary } from "./decision-summary";
import { JourneyBar } from "./journey-bar";
import { RedraftNotice } from "./redraft-notice";
import { RejectMenu } from "./reject-menu";
import { RiskBanner } from "./risk-banner";

type Problem = { claimId: string | null; sentence: string; reason: string };

export function ApprovalCard({ wf, highlight }: { wf: WorkflowView; highlight: boolean }) {
  const router = useRouter();
  const opened = useRef(Date.now());
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [challenged, setChallenged] = useState<Challenged[] | null>(null);
  const [confirmed, setConfirmed] = useState(false); // the rep already confirmed this round's corrections
  const [problems, setProblems] = useState<Problem[]>([]);
  const stale = wf.staleChanges.length > 0;
  const pending = wf.state === "awaiting_approval" && !stale;
  const claimEdits = Object.entries(edits)
    .filter(([id, s]) => s.trim() !== wf.claims.find((c) => c.id === id)?.sentence)
    .map(([id, sentence]) => ({ id, sentence }));
  const citedFacts = [...new Map(wf.claims.flatMap((c) => c.citations).map((c) => [c.factKey, { key: c.factKey, label: c.label }])).values()];

  async function post(path: string, body: object) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workflows/${wf.id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, reviewMs: Date.now() - opened.current }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      return json;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  // The server answers with the next thing the rep must settle, or "done".
  async function approve(confirmCorrections: boolean, acknowledgeChallenged = false) {
    const r = await post("approve", { claimEdits, confirmCorrections, acknowledgeChallenged });
    if (!r) return;
    if (r.kind === "stale") return router.refresh();
    if (r.kind === "fix") return setProblems(r.problems);
    if (r.kind === "confirm") return setProposals(r.proposals);
    if (r.kind === "acknowledge") {
      setConfirmed(confirmCorrections);
      setProposals(null);
      return setChallenged(r.challenged);
    }
    setProposals(null);
    setChallenged(null);
    setProblems([]);
    setEditing(false);
    const learned = claimEdits.length > 0 && confirmCorrections ? " · record corrected" : "";
    toast.success(r.state === "completed" ? `Sent to ${wf.recipient?.name ?? "the customer"} · logged in CRM${learned}` : `Workflow ${r.state}`);
    router.refresh();
  }

  async function reject(reason: string, factKey?: string) {
    if (await post("reject", { reason, factKey })) {
      toast.success("Rejected. Nothing was sent, and the reason was recorded.");
      router.refresh();
    }
  }

  return (
    <article id={wf.id} data-testid="approval-card" data-state={wf.state}
      className={cn("rounded-xl border bg-card p-4 shadow-sm transition-shadow", highlight && "ring-2 ring-primary/40")}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold">Ghost</span>{" "}
          <span className="text-sm text-muted-foreground">drafted a follow-up for <b className="text-foreground">{wf.accountName}</b>
            {wf.recipient && <> to {wf.recipient.name}, {wf.recipient.title}</>}</span>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {wf.generation && <GenerationBadge g={wf.generation} />}
          <time>{formatWhen(wf.createdAt)}</time>
        </span>
      </header>

      {wf.insight && <p className="mb-2 text-sm"><span className="font-medium">Ghost&apos;s read:</span> {wf.insight}</p>}
      <div className="rounded-lg border bg-background p-3 text-sm leading-relaxed">
        <p className="mb-2 font-medium">Subject: {wf.subject}</p>
        {editing ? <EditableLetter wf={wf} edits={edits} onChange={(id, s) => setEdits({ ...edits, [id]: s })} /> : <Letter claims={wf.claims} />}
        {!editing && wf.removedSentences.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Removed by the rep: {wf.removedSentences.map((s) => <span key={s} className="line-through">{s} </span>)}</p>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {!stale && <RiskBanner risk={wf.risk} />}
        {problems.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert">
            <p className="font-semibold">Fix these before sending:</p>
            <ul className="ml-4 list-disc">{problems.map((p) => <li key={`${p.claimId}-${p.reason}`}>&ldquo;{p.sentence}&rdquo;: {p.reason}</li>)}</ul>
          </div>
        )}
      </div>

      {stale && wf.state === "awaiting_approval" && (
        <RedraftNotice workflowId={wf.id} title="The record changed after this draft was written:" action="Redraft with the current record"
          lines={wf.staleChanges.map((c) => `${c.label} is now ${c.to} (was ${c.from})`)} />
      )}
      {wf.state === "blocked" && wf.heldSentences.length > 0 && (
        <RedraftNotice workflowId={wf.id} title="Ghost can redraft without what it held:" action="Redraft without these"
          lines={wf.heldSentences} />
      )}

      {pending && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => approve(false)} disabled={busy}>{editing && claimEdits.length > 0 ? "Approve edited & send" : "Approve & send"}</Button>
          {editing
            ? <Button variant="outline" onClick={() => { setEditing(false); setEdits({}); setProblems([]); }} disabled={busy}>Cancel edits</Button>
            : <Button variant="outline" onClick={() => setEditing(true)} disabled={busy}>Edit</Button>}
          <RejectMenu facts={citedFacts} busy={busy} onReject={reject} />
        </div>
      )}

      {!pending && !stale && <DecisionSummary wf={wf} />}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <JourneyBar steps={wf.journey} />
        {wf.executions.length > 0 && <Link href={`/crm?account=${wf.accountId}`} className="text-xs text-primary underline-offset-4 hover:underline">View in CRM →</Link>}
      </footer>

      <ConfirmCorrections proposals={proposals} account={wf.accountName} busy={busy}
        onCancel={() => setProposals(null)} onConfirm={() => approve(true)} />
      <AcknowledgeDialog challenged={challenged} busy={busy}
        onEdit={() => { setChallenged(null); setEditing(true); }} onSend={() => approve(confirmed, true)} />
    </article>
  );
}
