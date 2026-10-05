import Link from "next/link";
import { DraftButton } from "@/components/ghost/draft-button";
import { FactBoard } from "@/components/ghost/fact-board";
import { JourneyBar } from "@/components/ghost/journey-bar";
import { getDb } from "@/lib/db/client";
import { loadAccounts, loadFactBoard, loadLatestCall } from "@/lib/db/views/facts";
import { loadWorkflowViews } from "@/lib/db/views/workflows";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Workspace({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const db = await getDb();
  const accounts = await loadAccounts(db);
  const { account: requested } = await searchParams;
  const account = accounts.find((a) => a.id === requested) ?? accounts[0];
  if (!account) return <p>No accounts. Use Reset demo.</p>;
  const [facts, call, workflows] = await Promise.all([loadFactBoard(db, account.id), loadLatestCall(db, account.id), loadWorkflowViews(db, { accountId: account.id })]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Accounts">
        {accounts.map((a) => (
          <Link key={a.id} href={`/workspace?account=${a.id}`} role="tab" aria-selected={a.id === account.id}
            className={cn("rounded-lg border px-3 py-1.5 text-sm", a.id === account.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {a.name}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
            <p className="text-sm text-muted-foreground">{account.scenario}</p>
          </div>
          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">What Ghost knows, and why</h2>
          <FactBoard rows={facts} />
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Call ended {call?.date ?? "recently"}</p>
            <p className="mb-3 font-medium">Send the follow-up while it&apos;s fresh.</p>
            <DraftButton accountId={account.id} accountName={account.name} />
            {call && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Call transcript ({call.transcript.length} lines)</summary>
                <ul className="mt-2 space-y-1.5">
                  {call.transcript.map((l) => <li key={l.ts}><span className="font-mono text-xs text-muted-foreground">{l.ts}</span> <b>{l.speaker}:</b> {l.text}</li>)}
                </ul>
              </details>
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Follow-ups</h2>
            {workflows.length === 0 && <p className="text-sm text-muted-foreground">None yet. Draft one to start the journey.</p>}
            {workflows.map((w) => (
              <Link key={w.id} href={`/slack?wf=${w.id}#${w.id}`} className="block space-y-2 rounded-xl border bg-card p-3 hover:bg-muted/40">
                <p className="truncate text-sm font-medium">{w.subject}</p>
                <JourneyBar steps={w.journey} compact />
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
