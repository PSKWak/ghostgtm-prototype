import { Check, Circle, CircleDot, X } from "lucide-react";
import type { JourneyStep } from "@/lib/engine/journey";
import { cn } from "@/lib/utils";

const ICON = { done: Check, current: CircleDot, todo: Circle, stopped: X };
const TONE = {
  done: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  current: "text-amber-800 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  todo: "text-muted-foreground bg-background border-border",
  stopped: "text-red-700 bg-red-50 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
};

export function JourneyBar({ steps, compact = false }: { steps: JourneyStep[]; compact?: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Workflow journey">
      {steps.map((s, i) => {
        const Icon = ICON[s.status];
        return (
          <li key={s.key} className="flex items-center gap-1.5" data-step={s.key} data-status={s.status}>
            <span title={s.detail} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", TONE[s.status])}>
              <Icon className="size-3" aria-hidden />
              {s.label}
            </span>
            {!compact && i < steps.length - 1 && <span className="h-px w-3 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
