import { CheckCircle2, ClipboardList, Mail, NotebookPen } from "lucide-react";
import { SimulatedBadge } from "@/components/ghost/simulated-badge";
import { getDb } from "@/lib/db/client";
import { loadWorkflowViews } from "@/lib/db/views/workflows";
import { SyntheticBadge } from "@/components/ghost/synthetic-badge";
import { formatWhen } from "@/lib/format";

export const dynamic = "force-dynamic";

const ICON = { send_email: Mail, log_crm_activity: NotebookPen, create_crm_task: ClipboardList };

export default async function Crm({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  const views = await loadWorkflowViews(await getDb(), account ? { accountId: account } : {});
  const events = views.flatMap((w) => w.executions.map((e) => ({ w, e }))).sort((a, b) => b.e.executedAt.localeCompare(a.e.executedAt));
  const corrections = views.flatMap((w) => w.corrections.map((c) => ({ w, c })));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">CRM timeline <SimulatedBadge /></h1>
        <p className="text-sm text-muted-foreground">A read-only view of what Ghost wrote. Each entry is checked against the version a rep approved.</p>
      </div>
      {corrections.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Record changes</h2>
          {corrections.map(({ w, c }) => (
            <p key={`${w.id}-${c.label}`} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              <b>{w.accountName}</b> {w.synthetic && <SyntheticBadge />} <span>{c.label}</span>:
              <span className="text-muted-foreground line-through">{c.from}</span> → <b>{c.to}</b>
              <span className="text-muted-foreground">· confirmed by {w.decision?.userName}</span>
            </p>
          ))}
        </section>
      )}
      <section className="space-y-3" data-testid="crm-timeline">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Activity</h2>
        {events.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing executed yet. Approved follow-ups appear here.</p>
        )}
        {events.map(({ w, e }) => {
          const Icon = ICON[e.action];
          return (
            <article key={`${w.id}-${e.action}`} className="rounded-xl border bg-card p-4" data-action={e.action}>
              <header className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <b>{w.accountName}</b>
                {w.synthetic && <SyntheticBadge />}
                <span className="text-muted-foreground">{formatWhen(e.executedAt)}</span>
                <SimulatedBadge />
                <span className={e.hashMatches ? "text-xs text-emerald-700 dark:text-emerald-300" : "text-xs text-red-700"}>
                  {e.hashMatches ? "✓ matches approved version" : "✗ differs from approved version"}
                </span>
              </header>
              {e.payload.kind === "email" && (
                <div className="text-sm">
                  <p><span className="text-muted-foreground">To:</span> {e.payload.to}</p>
                  <p className="font-medium">{e.payload.subject}</p>
                  <p className="mt-1 whitespace-pre-line">{e.payload.body}</p>
                </div>
              )}
              {e.payload.kind === "note" && <p className="whitespace-pre-line text-sm">{e.payload.body}</p>}
              {e.payload.kind === "task" && <p className="text-sm">Task: <b>{e.payload.title}</b> · due {e.payload.dueDate}</p>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
