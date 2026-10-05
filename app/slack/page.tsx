import Link from "next/link";
import { ApprovalCard } from "@/components/ghost/approval-card";
import { getDb } from "@/lib/db/client";
import { loadWorkflowViews } from "@/lib/db/views/workflows";

export const dynamic = "force-dynamic";

export default async function Slack({ searchParams }: { searchParams: Promise<{ wf?: string }> }) {
  const { wf: focus } = await searchParams;
  const all = await loadWorkflowViews(await getDb());
  const pending = all.filter((w) => w.state === "awaiting_approval");
  const done = all.filter((w) => w.state !== "awaiting_approval");

  return (
    <div className="grid gap-6 md:grid-cols-[13rem_1fr]">
      <aside className="hidden rounded-xl bg-[#3f0e40] p-3 text-sm text-white/80 md:block">
        <p className="mb-3 font-semibold text-white">Acme Revenue</p>
        <p className="rounded bg-white/15 px-2 py-1 font-medium text-white">
          # ghost-approvals {pending.length > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs">{pending.length}</span>}
        </p>
        <p className="px-2 py-1"># deals</p>
        <p className="px-2 py-1"># customer-success</p>
      </aside>
      <section className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold"># ghost-approvals</h1>
          <p className="text-sm text-muted-foreground">Nothing leaves Ghost until a rep approves it here.</p>
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Needs you ({pending.length})</h2>
          {pending.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              All caught up. <Link className="text-primary underline-offset-4 hover:underline" href="/workspace">Draft a follow-up</Link> to see one here.
            </p>
          )}
          {pending.map((w) => <ApprovalCard key={w.id} wf={w} highlight={w.id === focus} />)}
        </div>
        {done.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Earlier</h2>
            {done.map((w) => <ApprovalCard key={w.id} wf={w} highlight={w.id === focus} />)}
          </div>
        )}
      </section>
    </div>
  );
}
