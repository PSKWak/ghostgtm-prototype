import { AlertTriangle, CheckCircle2, GitCompare } from "lucide-react";
import type { FactRow } from "@/lib/db/views/facts";
import { SourceBadge } from "./source-badge";

const FLAG = {
  challenged: { icon: AlertTriangle, cls: "text-amber-700 dark:text-amber-300" },
  contested: { icon: GitCompare, cls: "text-amber-700 dark:text-amber-300" },
  corrected: { icon: CheckCircle2, cls: "text-emerald-700 dark:text-emerald-300" },
};

// Each fact shows the value Ghost will use, where it came from, and what it beat (rule 6).
export function FactBoard({ rows }: { rows: FactRow[] }) {
  return (
    <div className="divide-y rounded-xl border bg-card" data-testid="fact-board">
      {rows.map((r) => {
        const flag = r.flag && FLAG[r.flag.kind];
        return (
          <div key={r.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]" data-fact-key={r.key}>
            <div className="text-sm font-medium text-muted-foreground">{r.label}</div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium" data-testid={`fact-${r.key}`}>{r.current.value}</span>
                <SourceBadge source={r.current.source} />
                <span className="text-xs text-muted-foreground">{r.current.observedAt}</span>
                {r.flag && flag && <span className={`inline-flex items-center gap-1 text-xs font-medium ${flag.cls}`}><flag.icon className="size-3.5" aria-hidden />{r.flag.text}</span>}
              </div>
              {r.older.map((o) => (
                <div key={o.id} className="text-xs text-muted-foreground">
                  <span className="line-through">{o.value}</span> · <SourceBadge source={o.source} /> {o.observedAt} · {o.reason}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
